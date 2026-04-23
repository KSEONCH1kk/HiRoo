"""Tiny helper to insert audit-log entries from routers.

Call `audit_log(db, server_id, actor_id, "channel_create", channel_id=ch.id)`
etc. — the helper absorbs its own exceptions so a failing audit never
breaks the actual action (logs a warning instead).
"""
from __future__ import annotations
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.services.websocket_service import manager

log = logging.getLogger("hiroo.audit")


async def audit_log(
    db: AsyncSession,
    server_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    *,
    target_user_id: uuid.UUID | None = None,
    target_channel_id: uuid.UUID | None = None,
    target_role_id: uuid.UUID | None = None,
    reason: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    try:
        entry = AuditLog(
            server_id=server_id,
            actor_id=actor_id,
            action=action,
            target_user_id=target_user_id,
            target_channel_id=target_channel_id,
            target_role_id=target_role_id,
            reason=(reason[:500] if reason else None),
            extra=extra,
        )
        db.add(entry)
        # Flush but don't commit — caller's transaction owns commit.
        await db.flush()
        await db.refresh(entry)
    except Exception:
        log.exception("audit_log insert failed (action=%s, server=%s)", action, server_id)
        return

    # Fan-out so open admin panels refresh their audit-log view in real time.
    # Non-fatal if the WS layer is unhappy.
    try:
        await manager.broadcast_to_server(str(server_id), {
            "event": "audit_log_create",
            "data": {
                "id": str(entry.id),
                "server_id": str(server_id),
                "actor_id": str(entry.actor_id) if entry.actor_id else None,
                "action": entry.action,
                "target_user_id": str(entry.target_user_id) if entry.target_user_id else None,
                "target_channel_id": str(entry.target_channel_id) if entry.target_channel_id else None,
                "target_role_id": str(entry.target_role_id) if entry.target_role_id else None,
                "reason": entry.reason,
                "extra": entry.extra,
                "created_at": entry.created_at.isoformat() if entry.created_at else None,
            },
        })
    except Exception:
        log.exception("audit_log broadcast failed")
