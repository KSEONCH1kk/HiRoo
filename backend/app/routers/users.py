import os
import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, get_current_active_user
from app.core.config import settings
from app.core.rate_limit import limiter, LIMIT_API
from app.models.user import User
from app.schemas.user import UserPublic, UserResponse, UserUpdate, UserStatusUpdate
from app.services.badges import compute_badges
from pydantic import BaseModel, Field


def _with_badges(user: User, badges: list[str]) -> dict:
    """Turn an ORM user into a dict enriched with a `badges` list so Pydantic
    can validate it against UserPublic/UserResponse without us mutating the
    SQLAlchemy object."""
    data = {c.name: getattr(user, c.name) for c in user.__table__.columns}
    data["badges"] = badges
    return data

router = APIRouter(prefix="/api/users", tags=["users"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    badges = await compute_badges(current_user, db)
    return _with_badges(current_user, badges)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.custom_status is not None:
        current_user.custom_status = body.custom_status
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.patch("/me/status", response_model=UserResponse)
async def update_status(
    body: UserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    current_user.status = body.status
    await db.flush()

    # Broadcast presence update to friends
    from app.services.websocket_service import manager
    await manager.send_to_user(str(current_user.id), {
        "event": "presence_update",
        "data": {"user_id": str(current_user.id), "status": body.status},
    })
    return current_user


@router.post("/me/avatar", response_model=UserResponse)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported image type")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 8 MB)")

    upload_dir = Path(settings.UPLOAD_DIR) / "avatars"
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    filename = f"{current_user.id}.{ext}"
    dest = upload_dir / filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    current_user.avatar_url = f"/uploads/avatars/{filename}"
    await db.flush()
    await db.refresh(current_user)
    return current_user


class PublicKeyUpdate(BaseModel):
    public_key: str = Field(..., min_length=8, max_length=128)
    signing_public_key: str | None = Field(None, min_length=8, max_length=128)


@router.post("/me/key", response_model=UserResponse)
async def set_my_public_key(
    body: PublicKeyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    current_user.public_key = body.public_key
    if body.signing_public_key is not None:
        current_user.signing_public_key = body.signing_public_key
    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    badges = await compute_badges(user, db)
    return _with_badges(user, badges)
