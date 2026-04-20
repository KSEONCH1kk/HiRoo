import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, get_current_active_user, require_server_member, require_permission
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.role import Permissions
from app.schemas.channel import ChannelCreate, ChannelUpdate, ChannelResponse
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/servers/{server_id}/channels", tags=["channels"])


@router.get("/", response_model=list[ChannelResponse])
async def list_channels(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_server_member),
):
    result = await db.execute(
        select(Channel)
        .where(Channel.server_id == server_id)
        .order_by(Channel.position)
    )
    return result.scalars().all()


@router.post("/", response_model=ChannelResponse, status_code=201)
async def create_channel(
    server_id: uuid.UUID,
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    channel = Channel(
        server_id=server_id,
        name=body.name,
        type=body.type,
        topic=body.topic,
        is_private=body.is_private,
        position=body.position,
    )
    db.add(channel)
    await db.flush()
    await db.refresh(channel)

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
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
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
    await db.flush()
    return channel


@router.post("/reorder", status_code=204)
async def reorder_channels(
    server_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    result = await db.execute(
        select(Channel).where(Channel.server_id == server_id, Channel.id.in_(ordered_ids))
    )
    channels_map = {c.id: c for c in result.scalars().all()}
    for pos, cid in enumerate(ordered_ids):
        ch = channels_map.get(cid)
        if ch:
            ch.position = pos
    await db.flush()


@router.delete("/{channel_id}", status_code=204)
async def delete_channel(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    result = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id)
    )
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    await db.delete(channel)
