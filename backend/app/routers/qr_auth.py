"""QR-code cross-device login.

Desktop flow:
  1. POST /api/auth/qr/start            → {code, expires_at}
  2. Render QR with full approve URL containing code
  3. Poll GET /api/auth/qr/status?code=…  every 2s
  4. When status == "approved", server returns access_token,
     sets refresh_token cookie, and deletes the code (one-shot).

Mobile flow (already authenticated):
  1. Scan QR, extract code from URL
  2. POST /api/auth/qr/approve {code}   with Bearer auth
  3. Server marks code approved, mints tokens bound to mobile user.

State lives in Redis with 120s TTL:
  qr:<code>    = JSON {status, user_id?, access_token?, refresh_token?, ip, ua}
"""
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db, get_redis, get_current_active_user
from app.core.rate_limit import limiter, LIMIT_AUTH
from app.core.security import create_access_token, create_refresh_token
from app.models.session import Session as UserSession
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/api/auth/qr", tags=["qr-auth"])

QR_TTL_SECONDS = 120
QR_CODE_BYTES = 24  # 48 hex chars — collision-resistant


def _hash_token(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def _client_meta(request: Request) -> tuple[str, str]:
    xff = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    ip = xff or (request.client.host if request.client else "")
    ua = (request.headers.get("user-agent") or "")[:400]
    return ip, ua


class QrStartResponse(BaseModel):
    code: str
    expires_at: datetime
    approve_url: str


class QrApproveBody(BaseModel):
    code: str = Field(..., min_length=8, max_length=128)


class QrStatusResponse(BaseModel):
    status: str  # "pending" | "approved" | "expired"
    access_token: str | None = None
    user: UserResponse | None = None


class QrApproveResponse(BaseModel):
    ok: bool
    message: str = "Устройство авторизовано"


def _public_base_url() -> str:
    # CORS_ORIGINS is a JSON list; pick the first HTTPS one for display.
    for o in settings.CORS_ORIGINS:
        if o.startswith("https://"):
            return o.rstrip("/")
    return "https://hiroo.intave.tech"


@router.post("/start", response_model=QrStartResponse)
@limiter.limit(LIMIT_AUTH)
async def qr_start(
    request: Request,
    redis: aioredis.Redis = Depends(get_redis),
):
    """Create a new pending QR login code. Public — no auth needed."""
    code = secrets.token_urlsafe(QR_CODE_BYTES)
    ip, ua = _client_meta(request)
    state = {
        "status": "pending",
        "ip": ip,
        "ua": ua,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis.setex(f"qr:{code}", QR_TTL_SECONDS, json.dumps(state))
    return QrStartResponse(
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=QR_TTL_SECONDS),
        approve_url=f"{_public_base_url()}/qr/approve?code={code}",
    )


@router.post("/approve", response_model=QrApproveResponse)
async def qr_approve(
    body: QrApproveBody,
    request: Request,
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Mobile side: confirm a scanned code and mint tokens for the desktop."""
    raw = await redis.get(f"qr:{body.code}")
    if not raw:
        raise HTTPException(status_code=404, detail="QR-код не найден или истёк")
    try:
        state = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Повреждённое состояние QR-кода")
    if state.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Код уже использован")

    access_token = create_access_token({"sub": str(current_user.id)})
    refresh_token = create_refresh_token({"sub": str(current_user.id)})

    # Desktop's IP/UA were recorded on /start — use them for the session row
    # when it's actually consumed from /status.
    state.update({
        "status": "approved",
        "user_id": str(current_user.id),
        "access_token": access_token,
        "refresh_token": refresh_token,
        "approved_at": datetime.now(timezone.utc).isoformat(),
    })
    await redis.setex(f"qr:{body.code}", QR_TTL_SECONDS, json.dumps(state))

    return QrApproveResponse(ok=True)


@router.get("/status", response_model=QrStatusResponse)
async def qr_status(
    code: str,
    request: Request,
    response: Response,
    redis: aioredis.Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    """Desktop poll: returns pending until mobile approves, then returns
    tokens once and deletes the code."""
    raw = await redis.get(f"qr:{code}")
    if not raw:
        return QrStatusResponse(status="expired")
    try:
        state = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
    except Exception:
        return QrStatusResponse(status="expired")

    if state.get("status") == "pending":
        return QrStatusResponse(status="pending")

    if state.get("status") != "approved":
        return QrStatusResponse(status="expired")

    # Approved — consume the code immediately so it's one-shot.
    await redis.delete(f"qr:{code}")

    from sqlalchemy import select
    ur = await db.execute(select(User).where(User.id == state["user_id"]))
    user = ur.scalar_one_or_none()
    if not user:
        return QrStatusResponse(status="expired")

    refresh_token = state["refresh_token"]
    access_token = state["access_token"]

    # Register a real session row so /settings/devices lists it with the
    # desktop's IP/UA (captured on /start).
    ip = state.get("ip") or None
    ua = state.get("ua") or None
    sess = UserSession(
        user_id=user.id,
        refresh_token_hash=_hash_token(refresh_token),
        ip=ip, user_agent=ua,
    )
    db.add(sess)
    await db.flush()

    user.status = "online"
    await db.flush()

    response.set_cookie(
        "refresh_token", refresh_token,
        httponly=True, secure=settings.is_production,
        samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )

    return QrStatusResponse(
        status="approved",
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )
