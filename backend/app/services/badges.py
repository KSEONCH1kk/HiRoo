"""Compute the list of badge identifiers for a user.

Badges are short opaque strings that the frontend maps to UI chips. Keeping
them as strings (not objects) means we can add visuals on the client without
another API round trip.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.server import Server
from app.models.user import User

# Users whose created_at is earlier than or equal to the 100th user on the
# platform are considered "early". We cache the threshold for a few minutes
# so profile lookups don't re-scan the users table on every request.
_EARLY_USER_RANK = 100
_EARLY_CACHE_TTL = 300  # seconds
_early_cache: dict = {"ts": 0.0, "threshold": None}


async def _early_threshold(db: AsyncSession) -> Optional[datetime]:
    now = time.time()
    if now - _early_cache["ts"] < _EARLY_CACHE_TTL:
        return _early_cache["threshold"]
    # One cheap query using the created_at index.
    res = await db.execute(
        select(User.created_at)
        .order_by(User.created_at.asc())
        .offset(_EARLY_USER_RANK - 1)
        .limit(1)
    )
    row = res.scalar_one_or_none()
    _early_cache["threshold"] = row
    _early_cache["ts"] = now
    return row


async def compute_badges(user: User, db: AsyncSession) -> list[str]:
    badges: list[str] = []

    # Bot-specific capability badges take precedence in display order.
    if getattr(user, "is_bot", False):
        badges.append("bot")
        from app.models.application import Application, Bot
        ar = await db.execute(
            select(Application).join(Bot, Bot.application_id == Application.id)
            .where(Bot.user_id == user.id)
        )
        app = ar.scalar_one_or_none()
        if app:
            if app.supports_commands:
                badges.append("bot_supports_commands")
            if app.supports_voice:
                badges.append("bot_supports_voice")
            if app.is_verified:
                badges.append("bot_verified")
        return badges

    if getattr(user, "is_platform_admin", False):
        badges.append("platform_admin")

    if user.is_verified:
        badges.append("verified")

    # Server owner: any server where this user is owner.
    res = await db.execute(
        select(func.count(Server.id)).where(Server.owner_id == user.id)
    )
    if (res.scalar() or 0) > 0:
        badges.append("server_owner")

    # Early user: within the first _EARLY_USER_RANK sign-ups.
    threshold = await _early_threshold(db)
    if threshold is None or user.created_at <= threshold:
        badges.append("early_user")

    return badges
