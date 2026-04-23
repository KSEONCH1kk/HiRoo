"""Moderation helpers — timeouts and automod checks.

Timeout semantics: a non-null `ServerMember.timeout_until` in the future
blocks message sends, voice connects, and forum posts/replies for that
member. Expired timeouts aren't auto-cleared — `is_timed_out` interprets
them as "no timeout" and callers should clear lazily via `clear_expired`.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
import re
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.server import Server, ServerMember


MENTION_RE = re.compile(r"<@!?([0-9a-fA-F-]{10,})>|@\w+")


def is_timed_out(member: ServerMember | None) -> datetime | None:
    """Return the expiry timestamp if this member is currently timed out,
    otherwise None."""
    if not member or not member.timeout_until:
        return None
    now = datetime.now(timezone.utc)
    until = member.timeout_until
    if until.tzinfo is None:  # legacy rows without timezone
        until = until.replace(tzinfo=timezone.utc)
    return until if until > now else None


async def get_member(
    db: AsyncSession, server_id: uuid.UUID, user_id: uuid.UUID,
) -> ServerMember | None:
    r = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )
    return r.scalar_one_or_none()


async def ensure_not_timed_out(
    db: AsyncSession, server_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    m = await get_member(db, server_id, user_id)
    until = is_timed_out(m)
    if until:
        remaining = int((until - datetime.now(timezone.utc)).total_seconds())
        mins = max(1, remaining // 60)
        raise HTTPException(
            status_code=403,
            detail=f"У вас тайм-аут ещё {mins} мин.",
        )


# ── AutoMod ─────────────────────────────────────────────────────────────


def check_automod(server: Server, content: str) -> dict | None:
    """Returns {"reason": str, "action": "delete" | "timeout"} if the
    message violates AutoMod, otherwise None."""
    if not server.auto_mod_enabled:
        return None
    txt = (content or "").lower()
    words = server.auto_mod_words or []
    for w in words:
        if not w:
            continue
        if w.strip().lower() in txt:
            return {"reason": f"запрещённое слово: {w}",
                    "action": server.auto_mod_action or "delete"}
    threshold = int(server.auto_mod_mention_threshold or 0)
    if threshold > 0:
        # Very loose mention count — matches both <@uuid> Discord-style and
        # plain @word patterns, which is what our client actually sends.
        mention_count = len(MENTION_RE.findall(content or ""))
        if mention_count >= threshold:
            return {"reason": f"спам упоминаниями ({mention_count})",
                    "action": server.auto_mod_action or "delete"}
    return None


async def apply_timeout(
    db: AsyncSession, server_id: uuid.UUID, user_id: uuid.UUID,
    duration_seconds: int, reason: str | None = None,
) -> ServerMember:
    m = await get_member(db, server_id, user_id)
    if not m:
        raise HTTPException(status_code=404, detail="Участник не найден")
    m.timeout_until = datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)
    m.timeout_reason = (reason or "")[:500] or None
    await db.flush()
    return m
