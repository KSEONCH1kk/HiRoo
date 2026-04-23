"""Emits welcome messages when a user joins a server.

Inserted as regular Message rows with type='system_welcome' so they
appear in the channel history and get broadcast to connected clients via
the existing message WS path. Rendering is handled on the frontend.

Message templates use {name} for the display name (or username fallback).
The placeholder is preserved verbatim in storage so if the user renames
themselves later the welcome can optionally be re-rendered client-side;
we just store the resolved name at join-time today.
"""
from __future__ import annotations
import random
import uuid
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.channel import Channel
from app.models.message import Message
from app.models.server import Server
from app.models.user import User
from app.schemas.message import MessageResponse
from app.schemas.user import UserPublic
from app.services.websocket_service import manager


# Stored as raw template strings — {name} is filled with display_name or
# username at insertion time. Feel free to extend.
WELCOME_TEMPLATES: list[str] = [
    "{name} запрыгнул на сервер. Надеемся, он с пиццей 🍕",
    "Встречайте, {name} — только что появился в дверях!",
    "{name} присоединился. Кто-нибудь, налейте чайку ☕",
    "Ого, {name} тут! Скорее здоровайтесь.",
    "{name} только что расчехлил клавиатуру и вошёл на сервер.",
    "Барабанная дробь… и вот уже {name} среди нас!",
    "{name} прибыл. Шампанского? 🥂",
    "Кажется, {name} открыл правильную дверь. Добро пожаловать!",
    "Новый боец в отряде: {name} заходит в игру.",
    "{name} ввалился на сервер. Пусть никто не пострадает.",
    "Глядите, кто пришёл! Это {name}!",
    "Вау, {name} присоединился. День становится лучше.",
    "{name} здесь. Поменяйте атмосферу, пожалуйста.",
    "Эй! {name} уже с нами. Кто покажет ему каналы?",
    "{name} вышел из тени. Привет!",
    "{name} залетел на огонёк 🔥",
    "Пристегните ремни: {name} на борту.",
    "Тсс… {name} только что телепортировался на сервер.",
]


def pick_welcome(name: str) -> str:
    return random.choice(WELCOME_TEMPLATES).format(name=name)


async def emit_welcome_message(
    db: AsyncSession, server: Server, user: User,
) -> None:
    """Insert a welcome message into server.system_channel_id if configured
    and welcome_enabled is true. Broadcasts via WS on success.

    Silently no-ops if the channel is missing / was deleted / type !=
    text (no point posting into a voice channel) — we don't want a failing
    welcome message to break the join flow."""
    if not server.welcome_enabled or not server.system_channel_id:
        return

    ch_res = await db.execute(select(Channel).where(Channel.id == server.system_channel_id))
    channel = ch_res.scalar_one_or_none()
    if not channel or channel.server_id != server.id:
        return
    if channel.type not in ("text", "announcement"):
        return

    display = user.display_name or user.username or "Кто-то"
    content = pick_welcome(display)

    msg = Message(
        channel_id=channel.id,
        author_id=user.id,
        type="system_welcome",
        content=content,
    )
    db.add(msg)
    await db.flush()
    # Reload with author for the broadcast payload.
    ar = await db.execute(
        select(Message)
        .options(selectinload(Message.author))
        .where(Message.id == msg.id)
    )
    stored = ar.scalar_one()

    payload = {
        "id": str(stored.id),
        "channel_id": str(stored.channel_id),
        "author_id": str(stored.author_id) if stored.author_id else None,
        "type": "system_welcome",
        "content": stored.content,
        "reply_to_id": None,
        "reply_to": None,
        "edited_at": None,
        "is_deleted": False,
        "created_at": stored.created_at.isoformat() if stored.created_at else None,
        "author": UserPublic.model_validate(stored.author).model_dump(mode="json") if stored.author else None,
        "reactions": [],
        "embeds": None,
        "components": None,
    }
    try:
        await manager.broadcast_to_server(str(server.id), {
            "event": "message_create",
            "data": payload,
        })
    except Exception:
        # WS failure is non-fatal for the join flow.
        pass
