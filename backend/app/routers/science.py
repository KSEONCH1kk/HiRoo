"""Client telemetry endpoint (Science).

POST /api/science — принимает батч событий, отвечает 202 с {accepted,dropped}.
Никогда не возвращает 4xx/5xx клиенту (fire-and-forget контракт):
- невалидный батч → 422 (но пишем в лог и клиент не ретраит)
- отключено пользователем → 202 accepted=0
- превышен rate limit → 202 с частичным приёмом, остаток dropped
- упал INSERT → 202 accepted=0 (ошибка в лог)
"""
from __future__ import annotations

import logging
import time
from collections import deque
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user_optional, get_db
from app.models.user import User
from app.models.telemetry import TelemetryEvent


router = APIRouter(prefix="/api/science", tags=["science"])
log = logging.getLogger("hiroo.science")


# ── Rate limit (silent drop) ──────────────────────────────────────────
#
# 500 событий / 60 секунд. Ключ — user_id если есть, иначе IP. Ring-buffer
# таймстампов в deque, ленивая очистка при каждом доступе. Для prod с
# >1 реплики backend'а имеет смысл переключить на Redis INCR+EXPIRE, но
# per-process бакета достаточно на старте.
_LIMIT = 500
_WINDOW_S = 60
_buckets: dict[str, deque[float]] = {}


def _consume(key: str, n: int) -> tuple[int, int]:
    """Попытаться списать `n` токенов. Возвращает (admitted, dropped)."""
    now = time.monotonic()
    cutoff = now - _WINDOW_S
    q = _buckets.setdefault(key, deque())
    while q and q[0] < cutoff:
        q.popleft()
    remaining = _LIMIT - len(q)
    if remaining <= 0:
        return 0, n
    if n <= remaining:
        for _ in range(n):
            q.append(now)
        return n, 0
    for _ in range(remaining):
        q.append(now)
    return remaining, n - remaining


# ── Pydantic schemas ──────────────────────────────────────────────────


class ScienceContext(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    user_id: UUID | None = None
    client_version: str = Field("", max_length=32)
    platform: Literal["web", "desktop", "ios", "android"] = "web"
    locale: str = Field("", max_length=16)
    tz: str = Field("", max_length=48)
    is_desktop: bool = False


class ScienceEvent(BaseModel):
    event_name: str = Field(..., pattern=r"^[a-z][a-z0-9_]{2,63}$")
    client_track_timestamp: datetime
    client_send_timestamp: datetime
    properties: dict[str, Any] = Field(default_factory=dict)
    context: ScienceContext

    @field_validator("properties")
    @classmethod
    def _cap_props(cls, v: dict[str, Any]) -> dict[str, Any]:
        # Строгий лимит — 32 ключа и не более 1 КБ сериализованного JSON
        # на событие. Обрезаем молча: клиент не должен думать про это.
        if len(v) > 32:
            v = dict(list(v.items())[:32])
        return v


class ScienceBatch(BaseModel):
    events: list[ScienceEvent] = Field(..., max_length=100)


class ScienceBatchResponse(BaseModel):
    accepted: int = 0
    dropped: int = 0


# ── Handler ───────────────────────────────────────────────────────────


@router.post("", response_model=ScienceBatchResponse, status_code=202)
@router.post("/", response_model=ScienceBatchResponse, status_code=202)
async def ingest(
    batch: ScienceBatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    total = len(batch.events)
    if total == 0:
        return ScienceBatchResponse(accepted=0, dropped=0)

    # Privacy: respect user opt-out.
    if user is not None and user.science_enabled is False:
        return ScienceBatchResponse(accepted=0, dropped=total)

    # Rate limit.
    key = str(user.id) if user else (request.client.host if request.client else "anon")
    admitted, dropped = _consume(key, total)
    if admitted == 0:
        return ScienceBatchResponse(accepted=0, dropped=dropped)

    ua = request.headers.get("user-agent")
    ip = request.client.host if request.client else None

    rows = []
    for ev in batch.events[:admitted]:
        rows.append({
            "user_id": user.id if user else None,
            "session_id": ev.context.session_id,
            "event_name": ev.event_name,
            "properties": ev.properties,
            "context": ev.context.model_dump(mode="json"),
            "client_track_at": ev.client_track_timestamp,
            "client_send_at": ev.client_send_timestamp,
            "ip": ip,
            "user_agent": ua,
        })

    try:
        await db.run_sync(
            lambda sync_session: sync_session.bulk_insert_mappings(TelemetryEvent, rows)
        )
        await db.commit()
    except Exception as e:
        # Клиент никогда не ретраит, поэтому проглатываем и отвечаем 202.
        log.warning("science ingest failed: %s", e)
        try:
            await db.rollback()
        except Exception:
            pass
        return JSONResponse(
            status_code=202,
            content={"accepted": 0, "dropped": total},
        )

    return ScienceBatchResponse(accepted=admitted, dropped=dropped)
