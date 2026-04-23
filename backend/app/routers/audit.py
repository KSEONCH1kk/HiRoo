"""Read-only audit log endpoint for server admins (MANAGE_SERVER)."""
from __future__ import annotations
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_permission
from app.models.audit import AuditLog
from app.models.role import Permissions
from app.models.server import ServerMember

router = APIRouter(prefix="/api/servers/{server_id}/audit-log", tags=["audit"])


class AuditEntry(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    target_user_id: uuid.UUID | None = None
    target_channel_id: uuid.UUID | None = None
    target_role_id: uuid.UUID | None = None
    reason: str | None = None
    extra: dict | None = None
    created_at: datetime


class AuditPage(BaseModel):
    entries: list[AuditEntry]
    next_cursor: str | None = None


@router.get("", response_model=AuditPage)
@router.get("/", response_model=AuditPage, include_in_schema=False)
async def list_audit(
    server_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    before: datetime | None = Query(None, description="ISO8601 timestamp cursor"),
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    stmt = (
        select(AuditLog)
        .where(AuditLog.server_id == server_id)
        .order_by(desc(AuditLog.created_at))
        .limit(limit + 1)
    )
    if before:
        stmt = stmt.where(AuditLog.created_at < before)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    rs = await db.execute(stmt)
    rows = list(rs.scalars())
    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = rows[-1].created_at.isoformat()
    return AuditPage(
        entries=[AuditEntry.model_validate(r) for r in rows],
        next_cursor=next_cursor,
    )
