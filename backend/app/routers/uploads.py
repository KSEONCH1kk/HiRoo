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

# Blocked for safety: anything that a browser could execute inline if served statically.
BLOCKED_CONTENT_TYPES = {
    "text/html", "application/xhtml+xml", "image/svg+xml",
    "application/x-msdownload", "application/x-sh",
}
BLOCKED_EXTENSIONS = {
    ".html", ".htm", ".xhtml", ".svg",
    ".exe", ".bat", ".cmd", ".ps1", ".msi", ".sh", ".com", ".scr",
}

MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024  # 100 MB


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
    original = file.filename or "file"
    ext_lower = ""
    if "." in original:
        ext_lower = "." + original.rsplit(".", 1)[-1].lower()

    if (file.content_type or "").lower() in BLOCKED_CONTENT_TYPES or ext_lower in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Этот тип файла запрещён")

    content = await file.read()
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 100 МБ)")
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    upload_dir = Path(settings.UPLOAD_DIR) / "attachments" / str(current_user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_stem = "".join(c for c in original if c.isalnum() or c in "._-")[:80] or "file"
    stem_part = safe_stem
    ext_part = ""
    if "." in safe_stem:
        stem_part, ext_raw = safe_stem.rsplit(".", 1)
        ext_part = "." + ext_raw.lower()
    unique_id = uuid.uuid4().hex[:12]
    stored_name = f"{stem_part}-{unique_id}{ext_part}"
    dest = upload_dir / stored_name

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return UploadResponse(
        url=f"/uploads/attachments/{current_user.id}/{stored_name}",
        filename=original,
        content_type=file.content_type or "application/octet-stream",
        size=len(content),
    )
