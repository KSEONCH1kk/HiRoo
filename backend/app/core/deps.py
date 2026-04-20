import uuid
from typing import AsyncGenerator, Callable
import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.security import verify_access_token
from app.core.config import settings
from app.models.user import User
from app.models.server import Server, ServerMember
from app.models.role import Role, MemberRole, Permissions

bearer_scheme = HTTPBearer(auto_error=False)
_redis_pool: aioredis.Redis | None = None


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_pool


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> User:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    if not credentials:
        raise exc

    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        raise exc

    # Check blacklist
    if await redis.get(f"blacklist:{token}"):
        raise exc

    user_id = payload.get("sub")
    if not user_id:
        raise exc

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise exc
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account banned")
    return current_user


async def require_server_member(
    server_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ServerMember:
    result = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this server")
    return member


async def require_server_admin(
    server_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ServerMember:
    result = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return member


async def compute_permissions(
    server_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """Compute effective permission bitmask for a user on a server."""
    # Check if owner
    owner_result = await db.execute(
        select(Server.owner_id).where(Server.id == server_id)
    )
    owner_id = owner_result.scalar_one_or_none()
    if owner_id == user_id:
        return Permissions.ADMIN

    # Check base flat role
    member_result = await db.execute(
        select(ServerMember.role).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )
    flat_role = member_result.scalar_one_or_none()
    if flat_role is None:
        return 0
    if flat_role == "admin":
        return Permissions.ADMIN

    # Collect role permissions
    perms_result = await db.execute(
        select(Role.permissions, Role.is_everyone)
        .outerjoin(MemberRole, MemberRole.role_id == Role.id)
        .where(
            Role.server_id == server_id,
            (Role.is_everyone == True) | ((MemberRole.user_id == user_id) & (MemberRole.server_id == server_id))
        )
    )
    bitmap = 0
    any_role_found = False
    for perms, is_everyone in perms_result.all():
        any_role_found = True
        bitmap |= perms or 0

    # If no roles exist on this server yet, fall back to sensible default
    if not any_role_found:
        bitmap = Permissions.DEFAULT

    return bitmap


def require_permission(permission: int) -> Callable:
    """FastAPI dependency factory: ensure member has a given permission bit."""
    async def checker(
        server_id: uuid.UUID,
        current_user: User = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> ServerMember:
        member_result = await db.execute(
            select(ServerMember).where(
                ServerMember.server_id == server_id,
                ServerMember.user_id == current_user.id,
            )
        )
        member = member_result.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Не участник сервера")

        perms = await compute_permissions(server_id, current_user.id, db)
        if (perms & permission) != permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав для этого действия",
            )
        return member
    return checker
