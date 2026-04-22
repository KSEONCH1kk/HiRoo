"""Mobile-specific endpoints: device token registration, update manifest."""
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_active_user
from app.models.device import DeviceToken
from app.models.user import User

router = APIRouter(prefix="/api/mobile", tags=["mobile"])


# ── Device tokens ────────────────────────────────────────────────────────

class DeviceTokenBody(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)
    platform: str = Field(..., pattern=r"^(android|ios|web)$")


@router.post("/device-token")
async def register_device_token(
    body: DeviceTokenBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Idempotent. If the same token already exists, just refresh last_used_at
    and move its owner — tokens are globally unique, a device can belong to
    only one account at a time."""
    res = await db.execute(select(DeviceToken).where(DeviceToken.token == body.token))
    existing = res.scalar_one_or_none()
    if existing:
        existing.user_id = current_user.id
        existing.platform = body.platform
        existing.last_used_at = datetime.now(timezone.utc)
    else:
        db.add(DeviceToken(
            user_id=current_user.id,
            token=body.token,
            platform=body.platform,
        ))
    await db.flush()
    return {"ok": True}


@router.delete("/device-token")
async def delete_device_token(
    body: DeviceTokenBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(
        select(DeviceToken).where(
            DeviceToken.token == body.token,
            DeviceToken.user_id == current_user.id,
        )
    )
    tok = res.scalar_one_or_none()
    if tok:
        await db.delete(tok)
        await db.flush()
    return {"ok": True}


# ── Update manifest ──────────────────────────────────────────────────────

class LatestResponse(BaseModel):
    version: str
    android_version_code: int = 1
    apk_url: str = ""
    notes: str = ""
    mandatory: bool = False


@router.get("/latest", response_model=LatestResponse)
async def latest_version():
    return LatestResponse(
        version=os.getenv("HIROO_MOBILE_VERSION", "1.0.0"),
        android_version_code=int(os.getenv("HIROO_MOBILE_VERSION_CODE", "1")),
        apk_url=os.getenv("HIROO_MOBILE_APK_URL", ""),
        notes=os.getenv("HIROO_MOBILE_NOTES", ""),
        mandatory=os.getenv("HIROO_MOBILE_MANDATORY", "").lower() in ("1", "true", "yes"),
    )
