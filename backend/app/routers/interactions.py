"""Message component interactions (buttons, select menus) + command
interactions from the slash-picker.

Lifecycle:
  1. Frontend sends POST /api/interactions — user clicked a component or
     invoked /command. We persist an Interaction row, dispatch INTERACTION_CREATE
     to the owning bot(s), and immediately return. Frontend then optionally
     polls or listens via the user's WS for INTERACTION_RESPONSE.
  2. Bot calls POST /api/interactions/{id}/callback within ~3 seconds. The
     callback specifies a response type (message, edit, defer).
  3. Bot may call POST /api/interactions/{id}/followup for additional messages
     after deferring.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_active_user
from app.models.application import Application, Bot, BotCommand
from app.models.interaction import Interaction
from app.models.user import User
from app.services.app_tokens import hash_secret
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/interactions", tags=["interactions"])


# ── Payloads ──────────────────────────────────────────────────────────────

class InteractionCreate(BaseModel):
    # "component" for buttons/selects, "command" for slash-picker invocations.
    type: str
    custom_id: Optional[str] = None
    command_id: Optional[uuid.UUID] = None
    command_name: Optional[str] = None
    channel_id: Optional[uuid.UUID] = None
    dm_id: Optional[uuid.UUID] = None
    message_id: Optional[uuid.UUID] = None
    guild_id: Optional[uuid.UUID] = None
    values: list[str] | None = None          # select menu selections
    options: dict[str, Any] | None = None    # command args
    application_id: Optional[uuid.UUID] = None  # explicit for components when custom_id not globally unique


class InteractionCallback(BaseModel):
    # 4=message, 5=defer (shows "thinking"), 6=update message
    type: int
    content: str | None = None
    embeds: list[dict] | None = None
    components: list[dict] | None = None
    ephemeral: bool = False


class InteractionFollowup(BaseModel):
    content: str | None = None
    embeds: list[dict] | None = None
    components: list[dict] | None = None


# ── Helpers ───────────────────────────────────────────────────────────────

async def _resolve_app(payload: InteractionCreate, db: AsyncSession) -> Application:
    """Figure out which application owns this interaction."""
    if payload.command_id is not None:
        cr = await db.execute(select(BotCommand).where(BotCommand.id == payload.command_id))
        cmd = cr.scalar_one_or_none()
        if not cmd:
            raise HTTPException(404, "Command not found")
        ar = await db.execute(select(Application).where(Application.id == cmd.application_id))
        return ar.scalar_one()

    if payload.application_id:
        ar = await db.execute(select(Application).where(Application.id == payload.application_id))
        app = ar.scalar_one_or_none()
        if app:
            return app

    if payload.type == "command" and payload.command_name and payload.guild_id:
        # Resolve by name + guild (global or guild-scoped).
        cr = await db.execute(
            select(BotCommand).where(
                BotCommand.name == payload.command_name,
                BotCommand.type == "slash",
            )
        )
        cmd = cr.scalar_one_or_none()
        if cmd:
            ar = await db.execute(select(Application).where(Application.id == cmd.application_id))
            return ar.scalar_one()

    raise HTTPException(400, "Не удалось определить приложение для interaction")


async def _bot_user_id(app_id: uuid.UUID, db: AsyncSession) -> Optional[uuid.UUID]:
    br = await db.execute(select(Bot).where(Bot.application_id == app_id))
    bot = br.scalar_one_or_none()
    return bot.user_id if bot else None


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("")
async def create_interaction(
    body: InteractionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    app = await _resolve_app(body, db)

    interaction = Interaction(
        application_id=app.id,
        user_id=current_user.id,
        channel_id=body.channel_id,
        dm_id=body.dm_id,
        message_id=body.message_id,
        guild_id=body.guild_id,
        type=body.type,
        custom_id=body.custom_id,
        command_name=body.command_name,
        data={
            "values": body.values or [],
            "options": body.options or {},
        },
        token=secrets.token_urlsafe(32),
    )
    db.add(interaction)
    await db.flush()
    await db.refresh(interaction)

    # Dispatch to the bot(s) associated with the app.
    from app.routers.bot_gateway import dispatch_to_bot
    bot_user_id = await _bot_user_id(app.id, db)
    if bot_user_id is not None:
        await dispatch_to_bot(bot_user_id, "interaction_create", {
            "id": str(interaction.id),
            "application_id": str(app.id),
            "type": interaction.type,
            "token": interaction.token,
            "custom_id": interaction.custom_id,
            "command_name": interaction.command_name,
            "user": {
                "id": str(current_user.id),
                "username": current_user.username,
                "display_name": current_user.display_name,
                "avatar_url": current_user.avatar_url,
            },
            "channel_id": str(interaction.channel_id) if interaction.channel_id else None,
            "dm_id": str(interaction.dm_id) if interaction.dm_id else None,
            "message_id": str(interaction.message_id) if interaction.message_id else None,
            "guild_id": str(interaction.guild_id) if interaction.guild_id else None,
            "data": interaction.data,
        }, guild_id=interaction.guild_id)

    return {
        "id": str(interaction.id),
        # Short-lived token used ONLY on the frontend side to correlate the
        # eventual response that will arrive via the user's WS.
        "correlation_id": interaction.token[:16],
    }


async def _authenticate_bot(request: Request, db: AsyncSession) -> Bot:
    authz = request.headers.get("authorization", "")
    if not authz.lower().startswith("bot "):
        raise HTTPException(401, "Bot token required")
    raw = authz[4:].strip()
    br = await db.execute(select(Bot).where(Bot.token_hash == hash_secret(raw)))
    bot = br.scalar_one_or_none()
    if not bot:
        raise HTTPException(401, "Invalid bot token")
    return bot


async def _deliver_response(interaction: Interaction, body: InteractionCallback, db: AsyncSession) -> dict:
    """Translate a bot callback into a real message or message edit, and notify
    the invoking user + channel."""
    from app.models.message import Message
    from app.models.dm import DMMessage
    from app.models.channel import Channel

    # Defer (type=5): just mark responded; bot will send followup later.
    if body.type == 5:
        interaction.responded = True
        await db.flush()
        await manager.send_to_user(str(interaction.user_id), {
            "event": "interaction_deferred",
            "data": {"id": str(interaction.id)},
        })
        return {"ok": True, "deferred": True}

    # Update (type=6): edit the source message with new content/components.
    if body.type == 6 and interaction.message_id and interaction.channel_id:
        mr = await db.execute(select(Message).where(Message.id == interaction.message_id))
        msg = mr.scalar_one_or_none()
        if msg:
            if body.content is not None:
                msg.content = body.content
            # TODO: persist components on message for update; minimal version
            # just rebroadcasts the event with the new components.
            await db.flush()
            await manager.broadcast_to_server(str(msg.server_id) if hasattr(msg, "server_id") else "", {
                "event": "message_update",
                "data": {
                    "id": str(msg.id),
                    "content": msg.content,
                    "components": body.components or [],
                },
            })
        interaction.responded = True
        await db.flush()
        return {"ok": True, "updated": True}

    # Message (type=4): create a new message as the bot user.
    if body.type == 4:
        bot_user_id = await _bot_user_id(interaction.application_id, db)
        if bot_user_id is None:
            raise HTTPException(400, "Application has no bot")

        if interaction.channel_id:
            cr = await db.execute(select(Channel).where(Channel.id == interaction.channel_id))
            ch = cr.scalar_one_or_none()
            if not ch:
                raise HTTPException(404, "Channel not found")
            msg = Message(
                channel_id=ch.id,
                author_id=bot_user_id,
                content=body.content or "",
                embeds=body.embeds,
            )
            db.add(msg)
            await db.flush()
            await db.refresh(msg)
            # Broadcast to server members.
            ur = await db.execute(select(User).where(User.id == bot_user_id))
            author = ur.scalar_one()
            await manager.broadcast_to_server(str(ch.server_id), {
                "event": "message_create",
                "data": {
                    "id": str(msg.id),
                    "channel_id": str(ch.id),
                    "server_id": str(ch.server_id),
                    "author_id": str(bot_user_id),
                    "content": msg.content,
                    "embeds": body.embeds or [],
                    "components": body.components or [],
                    "created_at": msg.created_at.isoformat(),
                    "author": {
                        "id": str(author.id),
                        "username": author.username,
                        "display_name": author.display_name,
                        "avatar_url": author.avatar_url,
                        "bot": True,
                    },
                },
            })
        elif interaction.dm_id:
            dmsg = DMMessage(
                dm_id=interaction.dm_id,
                author_id=bot_user_id,
                content=body.content or "",
            )
            db.add(dmsg)
            await db.flush()
        interaction.responded = True
        await db.flush()
        return {"ok": True}

    raise HTTPException(400, "Unknown callback type")


@router.post("/{interaction_id}/callback")
async def interaction_callback(
    interaction_id: uuid.UUID,
    body: InteractionCallback,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    bot = await _authenticate_bot(request, db)
    r = await db.execute(select(Interaction).where(Interaction.id == interaction_id))
    inter = r.scalar_one_or_none()
    if not inter or inter.application_id != bot.application_id:
        raise HTTPException(404, "Interaction not found")
    if inter.responded:
        raise HTTPException(409, "Interaction already responded")
    return await _deliver_response(inter, body, db)


@router.post("/{interaction_id}/followup")
async def interaction_followup(
    interaction_id: uuid.UUID,
    body: InteractionFollowup,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    bot = await _authenticate_bot(request, db)
    r = await db.execute(select(Interaction).where(Interaction.id == interaction_id))
    inter = r.scalar_one_or_none()
    if not inter or inter.application_id != bot.application_id:
        raise HTTPException(404, "Interaction not found")
    if not inter.responded:
        raise HTTPException(409, "Interaction hasn't been deferred yet")
    return await _deliver_response(inter, InteractionCallback(
        type=4, content=body.content, embeds=body.embeds, components=body.components,
    ), db)
