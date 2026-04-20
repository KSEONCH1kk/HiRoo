import uuid
import aiofiles
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.config import settings as app_settings

from app.core.deps import get_db, get_current_active_user, require_server_member, require_server_admin, require_permission, compute_permissions
from app.models.role import Permissions
from app.core.security import generate_invite_code
from app.core.rate_limit import limiter, LIMIT_API
from app.models.user import User
from app.models.server import Server, ServerMember
from app.schemas.server import (
    ServerCreate, ServerUpdate, ServerResponse,
    ServerMemberResponse, ServerMemberUpdate, InviteResponse,
)
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/servers", tags=["servers"])


@router.get("/discover", response_model=list[ServerResponse])
async def discover_servers(
    q: str | None = None,
    limit: int = 24,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    limit = min(max(1, limit), 100)
    stmt = (
        select(Server, func.count(ServerMember.user_id).label("count"))
        .outerjoin(ServerMember, ServerMember.server_id == Server.id)
        .where(Server.is_discoverable == True)
        .group_by(Server.id)
        .order_by(func.count(ServerMember.user_id).desc(), Server.created_at.desc())
        .limit(limit)
    )
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Server.name).like(like) | func.lower(func.coalesce(Server.description, "")).like(like))
    result = await db.execute(stmt)
    return [_server_response(s, c) for s, c in result.all()]


@router.get("", response_model=list[ServerResponse])
@router.get("/", response_model=list[ServerResponse], include_in_schema=False)
async def list_my_servers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(ServerMember.server_id).where(ServerMember.user_id == current_user.id)
    )
    server_ids = [r[0] for r in result.all()]
    if not server_ids:
        return []
    srv_result = await db.execute(
        select(Server, func.count(ServerMember.user_id))
        .join(ServerMember, ServerMember.server_id == Server.id)
        .where(Server.id.in_(server_ids))
        .group_by(Server.id)
        .order_by(Server.created_at.asc())
    )
    return [_server_response(s, count) for s, count in srv_result.all()]


@router.post("", response_model=ServerResponse, status_code=201)
@router.post("/", response_model=ServerResponse, status_code=201, include_in_schema=False)
async def create_server(
    body: ServerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    server = Server(
        name=body.name,
        description=body.description,
        owner_id=current_user.id,
        invite_code=generate_invite_code(),
    )
    db.add(server)
    await db.flush()

    # Add owner as member
    member = ServerMember(server_id=server.id, user_id=current_user.id, role="owner")
    db.add(member)

    manager.join_server(str(server.id), str(current_user.id))

    # Create default channels
    from app.models.channel import Channel
    for i, (name, ctype) in enumerate([("общий-чат", "text"), ("Главная комната", "voice")]):
        db.add(Channel(server_id=server.id, name=name, type=ctype, position=i))

    await db.flush()
    await db.refresh(server)
    return _server_response(server, 1)


@router.get("/join/{invite_code}", response_model=ServerResponse)
async def join_server(
    invite_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Server).where(Server.invite_code == invite_code))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    if server.invite_expires_at and server.invite_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite link has expired")

    existing = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server.id, ServerMember.user_id == current_user.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already a member")

    member = ServerMember(server_id=server.id, user_id=current_user.id, role="member")
    db.add(member)
    await db.flush()

    # Subscribe this user's active WS sessions to the server's broadcast room
    manager.join_server(str(server.id), str(current_user.id))

    count = await _member_count(db, server.id)
    await manager.broadcast_to_server(str(server.id), {
        "event": "member_join",
        "data": {"server_id": str(server.id), "user_id": str(current_user.id)},
    })
    manager.join_server(str(server.id), str(current_user.id))
    return _server_response(server, count)


@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    member: ServerMember = Depends(require_server_member),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    count = await _member_count(db, server.id)
    return _server_response(server, count)


@router.patch("/{server_id}", response_model=ServerResponse)
async def update_server(
    server_id: uuid.UUID,
    body: ServerUpdate,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if body.name is not None:
        server.name = body.name
    if body.description is not None:
        server.description = body.description
    if body.is_discoverable is not None:
        server.is_discoverable = body.is_discoverable
    await db.flush()
    count = await _member_count(db, server.id)
    return _server_response(server, count)


@router.delete("/{server_id}", status_code=204)
async def delete_server(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this server")
    await db.delete(server)


@router.post("/{server_id}/leave", status_code=204)
async def leave_server(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    member: ServerMember = Depends(require_server_member),
):
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="Owner must transfer ownership before leaving")
    await db.delete(member)
    await manager.broadcast_to_server(str(server_id), {
        "event": "member_leave",
        "data": {"server_id": str(server_id), "user_id": str(current_user.id)},
    })


@router.get("/{server_id}/members", response_model=list[ServerMemberResponse])
async def list_members(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_server_member),
):
    result = await db.execute(
        select(ServerMember)
        .options(selectinload(ServerMember.user))
        .where(ServerMember.server_id == server_id)
    )
    members = result.scalars().all()

    # Load role_ids for all members in one query
    from app.models.role import MemberRole
    roles_result = await db.execute(
        select(MemberRole.user_id, MemberRole.role_id).where(MemberRole.server_id == server_id)
    )
    roles_by_user: dict[uuid.UUID, list[uuid.UUID]] = {}
    for uid, rid in roles_result.all():
        roles_by_user.setdefault(uid, []).append(rid)

    responses = []
    for m in members:
        resp = ServerMemberResponse.model_validate(m)
        resp.role_ids = roles_by_user.get(m.user_id, [])
        responses.append(resp)
    return responses


@router.patch("/{server_id}/members/{user_id}", response_model=ServerMemberResponse)
async def update_member(
    server_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ServerMemberUpdate,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    result = await db.execute(
        select(ServerMember).where(ServerMember.server_id == server_id, ServerMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if body.role is not None:
        member.role = body.role
    if body.nickname is not None:
        member.nickname = body.nickname
    await db.flush()
    return member


@router.delete("/{server_id}/members/{user_id}", status_code=204)
async def kick_member(
    server_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.KICK_MEMBERS)),
):
    if admin.user_id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя исключить самого себя")
    result = await db.execute(
        select(ServerMember).where(ServerMember.server_id == server_id, ServerMember.user_id == user_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Участник не найден")
    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Нельзя исключить владельца сервера")
    await db.delete(target)
    await manager.broadcast_to_server(str(server_id), {
        "event": "member_kick",
        "data": {"server_id": str(server_id), "user_id": str(user_id)},
    })


ALLOWED_ICON_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_ICON_BYTES = 5 * 1024 * 1024


@router.post("/{server_id}/icon", response_model=ServerResponse)
async def upload_server_icon(
    server_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    if file.content_type not in ALLOWED_ICON_TYPES:
        raise HTTPException(status_code=415, detail="Поддерживаются только изображения")
    content = await file.read()
    if len(content) > MAX_ICON_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 5 МБ")
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден")

    upload_dir = Path(app_settings.UPLOAD_DIR) / "server-icons"
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = "jpg"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{server_id}.{ext}"
    dest = upload_dir / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    server.icon_url = f"/uploads/server-icons/{filename}"
    await db.flush()
    count = await _member_count(db, server.id)
    return _server_response(server, count)


@router.delete("/{server_id}/icon", response_model=ServerResponse)
async def delete_server_icon(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден")
    server.icon_url = None
    await db.flush()
    count = await _member_count(db, server.id)
    return _server_response(server, count)


@router.get("/{server_id}/me/permissions")
async def my_permissions(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _: ServerMember = Depends(require_server_member),
):
    perms = await compute_permissions(server_id, current_user.id, db)
    return {"permissions": perms}


@router.post("/{server_id}/invite", response_model=InviteResponse)
async def regenerate_invite(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    result = await db.execute(select(Server).where(Server.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    server.invite_code = generate_invite_code()
    await db.flush()
    return InviteResponse(invite_code=server.invite_code, expires_at=server.invite_expires_at)


# helpers
def _server_response(server: Server, count: int) -> ServerResponse:
    r = ServerResponse.model_validate(server)
    r.member_count = count
    return r


async def _member_count(db: AsyncSession, server_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).where(ServerMember.server_id == server_id)
    )
    return result.scalar() or 0
