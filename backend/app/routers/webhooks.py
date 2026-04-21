import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from app.core.deps import (
    get_db, get_current_active_user, require_server_member, require_permission,
)
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.message import Message
from app.models.webhook import Webhook, new_token
from app.models.role import Permissions
from app.schemas.message import MessageResponse, Embed
from app.services.websocket_service import manager


channel_router = APIRouter(prefix="/api/servers/{server_id}/channels/{channel_id}/webhooks", tags=["webhooks"])
public_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    avatar_url: str | None = Field(None, max_length=255)


class WebhookUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    avatar_url: str | None = Field(None, max_length=255)


class WebhookResponse(BaseModel):
    id: uuid.UUID
    channel_id: uuid.UUID
    server_id: uuid.UUID
    name: str
    avatar_url: str | None
    token: str
    url: str  # full incoming URL
    created_by: uuid.UUID | None
    created_at: datetime


class WebhookPublicPost(BaseModel):
    content: str = Field("", max_length=4000)
    username: str | None = Field(None, max_length=80)
    avatar_url: str | None = Field(None, max_length=255)
    embeds: list[Embed] | None = Field(None, max_length=10)


def _to_response(w: Webhook) -> WebhookResponse:
    return WebhookResponse(
        id=w.id,
        channel_id=w.channel_id,
        server_id=w.server_id,
        name=w.name,
        avatar_url=w.avatar_url,
        token=w.token,
        url=f"/api/webhooks/{w.id}/{w.token}",
        created_by=w.created_by,
        created_at=w.created_at,
    )


async def _ensure_channel(server_id: uuid.UUID, channel_id: uuid.UUID, db: AsyncSession) -> Channel:
    res = await db.execute(
        select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id)
    )
    ch = res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if ch.type != "text" and ch.type != "announcement":
        raise HTTPException(status_code=400, detail="Webhook можно создать только для текстового канала")
    return ch


@channel_router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    await _ensure_channel(server_id, channel_id, db)
    res = await db.execute(
        select(Webhook).where(Webhook.channel_id == channel_id).order_by(Webhook.created_at.desc())
    )
    return [_to_response(w) for w in res.scalars().all()]


@channel_router.post("", response_model=WebhookResponse, status_code=201)
async def create_webhook(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    await _ensure_channel(server_id, channel_id, db)
    wh = Webhook(
        channel_id=channel_id,
        server_id=server_id,
        name=body.name.strip(),
        avatar_url=body.avatar_url,
        created_by=current_user.id,
    )
    db.add(wh)
    await db.flush()
    return _to_response(wh)


@channel_router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    webhook_id: uuid.UUID,
    body: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    res = await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id, Webhook.channel_id == channel_id,
            Webhook.server_id == server_id,
        )
    )
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook не найден")
    if body.name is not None:
        wh.name = body.name.strip()
    if body.avatar_url is not None:
        wh.avatar_url = body.avatar_url or None
    await db.flush()
    return _to_response(wh)


@channel_router.post("/{webhook_id}/regenerate", response_model=WebhookResponse)
async def regenerate_webhook_token(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    res = await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id, Webhook.channel_id == channel_id,
            Webhook.server_id == server_id,
        )
    )
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook не найден")
    wh.token = new_token()
    await db.flush()
    return _to_response(wh)


@channel_router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_CHANNELS)),
):
    res = await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id, Webhook.channel_id == channel_id,
            Webhook.server_id == server_id,
        )
    )
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook не найден")
    await db.delete(wh)


# ── Public incoming endpoint (no auth) ─────────────────────

@public_router.post("/{webhook_id}/{token}", status_code=204)
async def post_via_webhook(
    webhook_id: uuid.UUID,
    token: str,
    body: WebhookPublicPost,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Webhook).where(Webhook.id == webhook_id, Webhook.token == token)
    )
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook не найден")

    display_name = (body.username or wh.name)[:80]
    avatar = (body.avatar_url or wh.avatar_url)
    if avatar and len(avatar) > 255:
        avatar = avatar[:255]

    if not body.content and not body.embeds:
        raise HTTPException(status_code=400, detail="content или embeds обязательны")

    embeds_json = None
    if body.embeds:
        embeds_json = [e.model_dump(mode="json", exclude_none=True) for e in body.embeds]

    msg = Message(
        channel_id=wh.channel_id,
        author_id=None,
        content=body.content or "",
        webhook_id=wh.id,
        webhook_name=display_name,
        webhook_avatar_url=avatar,
        embeds=embeds_json,
    )
    db.add(msg)
    await db.flush()

    loaded = await db.execute(
        select(Message)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .where(Message.id == msg.id)
    )
    msg = loaded.scalar_one()

    # Import inside function to avoid circular imports at module load
    from app.routers.messages import _build_response
    resp = _build_response(msg, uuid.UUID(int=0))
    payload = resp.model_dump(mode="json")
    payload["server_id"] = str(wh.server_id)

    await manager.broadcast_to_server(str(wh.server_id), {
        "event": "message_create",
        "data": payload,
    })
