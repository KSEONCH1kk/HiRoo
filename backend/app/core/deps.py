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
from app.models.channel_permission import ChannelRolePermission

bearer_scheme = HTTPBearer(auto_error=False)


def _is_bot_scheme(raw: str) -> bool:
    return raw.lower().startswith("bot ") or (len(raw) > 40 and raw.count(".") == 2 and not raw.startswith("ey"))


async def _auth_bot(raw: str, db: AsyncSession) -> User | None:
    """If `raw` is a bot token (either `Bot xxx` or a bare token produced by
    `generate_bot_token`), return the bot user; else None."""
    from app.models.application import Bot
    from app.services.app_tokens import hash_secret
    token = raw[4:].strip() if raw.lower().startswith("bot ") else raw
    if not token:
        return None
    res = await db.execute(select(Bot).where(Bot.token_hash == hash_secret(token)))
    bot = res.scalar_one_or_none()
    if not bot:
        return None
    ur = await db.execute(select(User).where(User.id == bot.user_id))
    return ur.scalar_one_or_none()
_redis_pool: aioredis.Redis | None = None


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_pool


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> User:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    # Accept `Authorization: Bot <token>` for bot users. HTTPBearer only
    # recognizes "Bearer", so we probe the raw header as well.
    raw_header = request.headers.get("authorization", "")
    if raw_header.lower().startswith("bot "):
        bot_user = await _auth_bot(raw_header, db)
        if bot_user is None:
            raise exc
        return bot_user

    if not credentials:
        raise exc

    token = credentials.credentials

    # Try JWT first.
    payload = verify_access_token(token)
    if payload:
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

    # Fall back to bot token passed via "Bearer" by misconfigured clients.
    bot_user = await _auth_bot(token, db)
    if bot_user is not None:
        return bot_user

    raise exc


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account banned")
    return current_user


async def get_current_human_user(current_user: User = Depends(get_current_active_user)) -> User:
    """То же, что active_user, но отказывает bot-токенам. Использовать на
    эндпоинтах, которые касаются личного аккаунта живого человека: смена
    пароля/email, друзья, сессии, устройства, QR-логин, телеметрия opt-out."""
    if current_user.is_bot:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bot accounts cannot perform this action",
        )
    return current_user


async def get_current_user_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> User | None:
    """Как `get_current_user`, но проглатывает 401 и возвращает None.
    Для эндпоинтов, где auth опционален (Science: анонимные события тоже
    валидны, просто без user_id)."""
    if not credentials and not request.headers.get("authorization", "").lower().startswith("bot "):
        return None
    try:
        return await get_current_user(request, credentials, db, redis)
    except HTTPException:
        return None


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
    channel_id: uuid.UUID | None = None,
) -> int:
    """Compute effective permission bitmask for a user on a server (optionally a specific channel)."""
    # Check if owner — full admin, overrides everything
    owner_result = await db.execute(
        select(Server.owner_id).where(Server.id == server_id)
    )
    owner_id = owner_result.scalar_one_or_none()
    if owner_id == user_id:
        return Permissions.ADMIN

    # Legacy flat role (from ServerMember.role). "admin" still means full permissions.
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

    # Collect server-level role permissions
    perms_result = await db.execute(
        select(Role.id, Role.permissions, Role.is_everyone)
        .outerjoin(MemberRole, MemberRole.role_id == Role.id)
        .where(
            Role.server_id == server_id,
            (Role.is_everyone == True) | ((MemberRole.user_id == user_id) & (MemberRole.server_id == server_id))
        )
    )
    user_role_ids: list[uuid.UUID] = []
    everyone_role_id: uuid.UUID | None = None
    bitmap = 0
    any_role_found = False
    for role_id, perms, is_everyone in perms_result.all():
        any_role_found = True
        bitmap |= perms or 0
        if is_everyone:
            everyone_role_id = role_id
        else:
            user_role_ids.append(role_id)

    if not any_role_found:
        bitmap = Permissions.DEFAULT

    # Apply per-channel overrides (Discord-style)
    if channel_id is not None:
        relevant_role_ids = [rid for rid in [everyone_role_id, *user_role_ids] if rid is not None]
        if relevant_role_ids:
            ov_res = await db.execute(
                select(ChannelRolePermission.role_id, ChannelRolePermission.allow, ChannelRolePermission.deny)
                .where(
                    ChannelRolePermission.channel_id == channel_id,
                    ChannelRolePermission.role_id.in_(relevant_role_ids),
                )
            )
            overrides = {rid: (allow or 0, deny or 0) for rid, allow, deny in ov_res.all()}
            # 1. @everyone override first
            if everyone_role_id and everyone_role_id in overrides:
                a, d = overrides[everyone_role_id]
                bitmap = (bitmap & ~d) | a
            # 2. Accumulate user-role overrides, then apply as one step
            accum_allow = 0
            accum_deny = 0
            for rid in user_role_ids:
                if rid in overrides:
                    a, d = overrides[rid]
                    accum_allow |= a
                    accum_deny |= d
            bitmap = (bitmap & ~accum_deny) | accum_allow

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
