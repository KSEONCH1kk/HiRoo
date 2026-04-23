import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.core.deps import get_db, get_current_active_user, require_server_member, require_permission, compute_permissions
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.role import Permissions, Role
from app.models.channel_permission import ChannelRolePermission
from app.schemas.channel import ChannelCreate, ChannelUpdate, ChannelResponse, ChannelReorderItem
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/servers/{server_id}/channels", tags=["channels"])


@router.get("/", response_model=list[ChannelResponse])
async def list_channels(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _: ServerMember = Depends(require_server_member),
):
    result = await db.execute(
        select(Channel)
        .where(Channel.server_id == server_id)
        .order_by(Channel.position)
    )
    all_channels = list(result.scalars().all())
    # Filter by READ_MESSAGES per-channel (respecting overrides)
    visible: list[Channel] = []
    for ch in all_channels:
        perms = await compute_permissions(server_id, current_user.id, db, channel_id=ch.id)
        if (perms & Permissions.READ_MESSAGES) == Permissions.READ_MESSAGES:
            visible.append(ch)
    return visible


@router.post("/", response_model=ChannelResponse, status_code=201)
async def create_channel(
    server_id: uuid.UUID,
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    # Validate parent: must be a category in the same server, and the new
    # channel itself must not be a category (no nested categories).
    parent_id = body.parent_id
    if parent_id is not None:
        pres = await db.execute(select(Channel).where(Channel.id == parent_id))
        parent = pres.scalar_one_or_none()
        if not parent or parent.server_id != server_id or parent.type != "category":
            raise HTTPException(status_code=400, detail="Неверный parent_id")
        if body.type == "category":
            raise HTTPException(status_code=400, detail="Категории не могут быть вложенными")

    channel = Channel(
        server_id=server_id,
        name=body.name,
        type=body.type,
        topic=body.topic,
        is_private=body.is_private,
        position=body.position,
        parent_id=parent_id,
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)

    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "channel_create",
        target_channel_id=channel.id,
        extra={"name": channel.name, "type": channel.type},
    )

    await manager.broadcast_to_server(str(server_id), {
        "event": "channel_create",
        "data": ChannelResponse.model_validate(channel).model_dump(mode="json"),
    })
    return channel


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    body: ChannelUpdate,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    result = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    if body.name is not None:
        channel.name = body.name
    if body.topic is not None:
        channel.topic = body.topic
    if body.slowmode_seconds is not None:
        channel.slowmode_seconds = body.slowmode_seconds
    if "parent_id" in body.model_fields_set:
        if body.parent_id is None:
            channel.parent_id = None
        else:
            pr = await db.execute(select(Channel).where(Channel.id == body.parent_id))
            parent = pr.scalar_one_or_none()
            if not parent or parent.server_id != server_id or parent.type != "category":
                raise HTTPException(status_code=400, detail="Неверный parent_id")
            if channel.type == "category":
                raise HTTPException(status_code=400, detail="Категории не могут быть вложенными")
            channel.parent_id = parent.id
    await db.flush()
    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "channel_update",
        target_channel_id=channel.id,
        extra=body.model_dump(exclude_none=True, exclude_unset=True, mode="json"),
    )
    await manager.broadcast_to_server(str(server_id), {
        "event": "channel_update",
        "data": ChannelResponse.model_validate(channel).model_dump(mode="json"),
    })
    return channel


@router.post("/reorder", status_code=204)
async def reorder_channels(
    server_id: uuid.UUID,
    items: list[ChannelReorderItem],
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    """Bulk update channel positions + parent assignments. Each item carries
    the target position and optional parent_id — used by the sidebar
    drag-and-drop UI to rewire channels in a single request.

    Rejects: parent_id pointing to a non-category or to a channel on a
    different server; making a category itself a child."""
    ids = [i.id for i in items]
    result = await db.execute(
        select(Channel).where(Channel.server_id == server_id, Channel.id.in_(ids))
    )
    channels_map = {c.id: c for c in result.scalars().all()}

    # Preload any parent IDs to validate types in one query.
    parent_ids = {i.parent_id for i in items if i.parent_id is not None}
    parents_map: dict = {}
    if parent_ids:
        pr = await db.execute(
            select(Channel).where(Channel.server_id == server_id, Channel.id.in_(parent_ids))
        )
        parents_map = {c.id: c for c in pr.scalars().all()}

    for item in items:
        ch = channels_map.get(item.id)
        if not ch:
            continue
        ch.position = item.position
        if item.parent_id is None:
            ch.parent_id = None
        else:
            p = parents_map.get(item.parent_id)
            if not p or p.type != "category":
                raise HTTPException(status_code=400, detail="Неверный parent_id")
            if ch.type == "category":
                raise HTTPException(status_code=400, detail="Категории не могут быть вложенными")
            ch.parent_id = p.id

    await db.flush()
    await manager.broadcast_to_server(str(server_id), {
        "event": "channel_reorder",
        "data": {
            "server_id": str(server_id),
            "items": [
                {"id": str(i.id), "position": i.position,
                 "parent_id": str(i.parent_id) if i.parent_id else None}
                for i in items
            ],
        },
    })


@router.delete("/{channel_id}", status_code=204)
async def delete_channel(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    result = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    ch_name = channel.name
    ch_type = channel.type
    await db.delete(channel)
    from app.services.audit import audit_log
    await audit_log(
        db, server_id, admin.user_id, "channel_delete",
        extra={"name": ch_name, "type": ch_type, "channel_id": str(channel_id)},
    )
    await manager.broadcast_to_server(str(server_id), {
        "event": "channel_delete",
        "data": {"server_id": str(server_id), "channel_id": str(channel_id)},
    })


# ── Channel permission overrides ─────────────────────────────

class ChannelRolePermissionItem(BaseModel):
    role_id: uuid.UUID
    allow: int
    deny: int


class ChannelRolePermissionUpdate(BaseModel):
    allow: int = Field(0, ge=0)
    deny: int = Field(0, ge=0)


async def _ensure_channel(server_id: uuid.UUID, channel_id: uuid.UUID, db: AsyncSession) -> Channel:
    res = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id)
    )
    ch = res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    return ch


@router.get("/{channel_id}/permissions", response_model=list[ChannelRolePermissionItem])
async def list_channel_overrides(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_server_member),
):
    await _ensure_channel(server_id, channel_id, db)
    res = await db.execute(
        select(ChannelRolePermission).where(ChannelRolePermission.channel_id == channel_id)
    )
    return [
        ChannelRolePermissionItem(role_id=p.role_id, allow=p.allow or 0, deny=p.deny or 0)
        for p in res.scalars().all()
    ]


@router.put("/{channel_id}/permissions/{role_id}", response_model=ChannelRolePermissionItem)
async def upsert_channel_override(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    role_id: uuid.UUID,
    body: ChannelRolePermissionUpdate,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    await _ensure_channel(server_id, channel_id, db)
    r_res = await db.execute(select(Role).where(Role.id == role_id, Role.server_id == server_id))
    if not r_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Роль не найдена")

    # No overlapping bits in allow & deny
    both = body.allow & body.deny
    if both:
        raise HTTPException(status_code=400, detail="Одно право не может быть одновременно разрешено и запрещено")

    res = await db.execute(
        select(ChannelRolePermission).where(
            ChannelRolePermission.channel_id == channel_id,
            ChannelRolePermission.role_id == role_id,
        )
    )
    override = res.scalar_one_or_none()
    if override:
        override.allow = body.allow
        override.deny = body.deny
    else:
        override = ChannelRolePermission(
            channel_id=channel_id, role_id=role_id,
            allow=body.allow, deny=body.deny,
        )
        db.add(override)
    await db.flush()

    await manager.broadcast_to_server(str(server_id), {
        "event": "channel_permissions_update",
        "data": {"channel_id": str(channel_id), "role_id": str(role_id), "allow": body.allow, "deny": body.deny},
    })

    return ChannelRolePermissionItem(role_id=role_id, allow=body.allow, deny=body.deny)


@router.delete("/{channel_id}/permissions/{role_id}", status_code=204)
async def delete_channel_override(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_ROLES)),
):
    await _ensure_channel(server_id, channel_id, db)
    res = await db.execute(
        select(ChannelRolePermission).where(
            ChannelRolePermission.channel_id == channel_id,
            ChannelRolePermission.role_id == role_id,
        )
    )
    override = res.scalar_one_or_none()
    if override:
        await db.delete(override)
        await db.flush()
        await manager.broadcast_to_server(str(server_id), {
            "event": "channel_permissions_delete",
            "data": {"channel_id": str(channel_id), "role_id": str(role_id)},
        })
