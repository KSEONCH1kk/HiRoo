import uuid
import aiofiles
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from pydantic import BaseModel

from app.core.deps import get_current_active_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.models.user import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm",
    "application/pdf",
    "text/plain",
    "application/zip",
}

MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  # 25 MB


class UploadResponse(BaseModel):
    url: str
    filename: str
    content_type: str
    size: int


@router.post("/attachment", response_model=UploadResponse)
@limiter.limit("30/minute")
async def upload_attachment(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=415, detail=f"Неподдерживаемый тип файла: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 25 МБ)")
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    upload_dir = Path(settings.UPLOAD_DIR) / "attachments" / str(current_user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    original = file.filename or "file"
    safe_name = "".join(c for c in original if c.isalnum() or c in "._-")[:80] or "file"
    ext = ""
    if "." in safe_name:
        safe_name, ext = safe_name.rsplit(".", 1)
        ext = "." + ext.lower()
    unique_id = uuid.uuid4().hex[:12]
    stored_name = f"{safe_name}-{unique_id}{ext}"
    dest = upload_dir / stored_name

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return UploadResponse(
        url=f"/uploads/attachments/{current_user.id}/{stored_name}",
        filename=original,
        content_type=file.content_type,
        size=len(content),
    )
