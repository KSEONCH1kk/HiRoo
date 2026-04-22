"""Server soundboard — short audio clips (≤ 30s) that members can trigger
in voice rooms. Playback is peer-driven: the client sends a WS
`soundboard_play` event, backend fans out `soundboard_play_remote` to
everyone else in the same room with a URL; receivers fetch+play it locally.
Server never mixes audio.

Permission model:
  USE_SOUNDBOARD    — trigger sounds in a voice channel (default on)
  UPLOAD_SOUNDBOARD — add new sounds
  MANAGE_SOUNDBOARD — delete/edit any sound regardless of uploader
"""
from __future__ import annotations
import asyncio
import json
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import (
    get_db, get_current_active_user, require_server_member,
    require_permission, compute_permissions,
)
from app.models.role import Permissions
from app.models.server import Server, ServerMember
from app.models.soundboard import SoundboardSound
from app.models.user import User

router = APIRouter(prefix="/api/servers/{server_id}/sounds", tags=["soundboard"])
me_router = APIRouter(prefix="/api/me", tags=["soundboard"])

# Server-side validation knobs. Client-side also pre-checks to fail fast.
MAX_FILE_BYTES = 1 * 1024 * 1024          # 1 MB
MAX_DURATION_MS = 30_000                  # 30 seconds
ALLOWED_EXTS = {".mp3", ".ogg", ".opus", ".wav", ".webm", ".m4a", ".aac"}
ALLOWED_MIMES = {
    "audio/mpeg", "audio/mp3",
    "audio/ogg", "audio/opus",
    "audio/wav", "audio/x-wav", "audio/wave",
    "audio/webm",
    "audio/mp4", "audio/aac", "audio/x-m4a",
}


class SoundOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    server_id: uuid.UUID
    name: str
    emoji: str | None = None
    uploader_id: uuid.UUID | None = None
    duration_ms: int = 0
    created_at: Any = None
    url: str = ""


def _public_url(sound: SoundboardSound) -> str:
    # Files live under /uploads/soundboard/<server>/<file> — StaticFiles
    # mount in main.py serves them at /uploads/*.
    return f"/uploads/{sound.file_path}"


def _to_out(sound: SoundboardSound) -> SoundOut:
    out = SoundOut.model_validate(sound)
    out.url = _public_url(sound)
    return out


async def _probe_duration_ms(path: Path) -> int | None:
    """Use ffprobe (bundled with ffmpeg in the backend image) to read duration
    in ms. Returns None if probing fails; caller should reject the upload."""
    def _sync() -> int | None:
        try:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries",
                    "format=duration", "-of", "json", str(path),
                ],
                capture_output=True, timeout=10, check=False,
            )
            if result.returncode != 0:
                return None
            data = json.loads(result.stdout.decode("utf-8", "ignore"))
            dur = float(data.get("format", {}).get("duration", "0"))
            return int(dur * 1000)
        except Exception:
            return None
    return await asyncio.get_running_loop().run_in_executor(None, _sync)


# ── List sounds on a server ────────────────────────────────────────────

@router.get("", response_model=list[SoundOut])
@router.get("/", response_model=list[SoundOut], include_in_schema=False)
async def list_server_sounds(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_server_member),
):
    res = await db.execute(
        select(SoundboardSound)
        .where(SoundboardSound.server_id == server_id)
        .order_by(SoundboardSound.created_at.desc())
    )
    return [_to_out(s) for s in res.scalars()]


# ── Upload ─────────────────────────────────────────────────────────────

@router.post("", response_model=SoundOut, status_code=201)
@router.post("/", response_model=SoundOut, status_code=201, include_in_schema=False)
async def upload_sound(
    server_id: uuid.UUID,
    file: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=32),
    emoji: str | None = Form(None, max_length=8),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Permission — UPLOAD_SOUNDBOARD or MANAGE_SOUNDBOARD or ADMIN.
    perms = await compute_permissions(server_id, current_user.id, db)
    can_upload = bool(
        (perms & Permissions.UPLOAD_SOUNDBOARD)
        or (perms & Permissions.MANAGE_SOUNDBOARD)
        or (perms & Permissions.ADMIN)
    )
    if not can_upload:
        raise HTTPException(status_code=403, detail="Нет права загружать звуки")

    # Basic file validation.
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Поддерживаются: mp3, ogg, wav, webm, m4a")
    if file.content_type and file.content_type.lower() not in ALLOWED_MIMES:
        # Browsers can be sloppy about mime so don't block on this alone,
        # but reject obvious non-audio.
        if not file.content_type.lower().startswith("audio/"):
            raise HTTPException(status_code=400, detail="Ожидается аудиофайл")

    # Write to disk in chunks so a malicious client can't exhaust memory.
    srv_dir = Path(settings.UPLOAD_DIR) / "soundboard" / str(server_id)
    srv_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex[:14]}{ext}"
    dest = srv_dir / stored_name
    total = 0
    try:
        async with aiofiles.open(dest, "wb") as out:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_FILE_BYTES:
                    await out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="Файл больше 1 МБ")
                await out.write(chunk)
    except HTTPException:
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Ошибка сохранения файла")

    # Probe actual duration with ffprobe — reject anything longer than 30s.
    duration = await _probe_duration_ms(dest)
    if duration is None:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Не удалось прочитать аудиофайл")
    if duration > MAX_DURATION_MS:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Длительность больше 30 секунд")

    rel_path = f"soundboard/{server_id}/{stored_name}"
    sound = SoundboardSound(
        server_id=server_id,
        name=name.strip(),
        emoji=(emoji or None),
        uploader_id=current_user.id,
        file_path=rel_path,
        duration_ms=duration,
    )
    db.add(sound)
    await db.flush()
    await db.refresh(sound)
    return _to_out(sound)


# ── Delete ────────────────────────────────────────────────────────────

@router.delete("/{sound_id}", status_code=204)
async def delete_sound(
    server_id: uuid.UUID,
    sound_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(
        select(SoundboardSound).where(
            SoundboardSound.id == sound_id,
            SoundboardSound.server_id == server_id,
        )
    )
    sound = res.scalar_one_or_none()
    if not sound:
        raise HTTPException(status_code=404, detail="Звук не найден")

    perms = await compute_permissions(server_id, current_user.id, db)
    is_uploader = sound.uploader_id == current_user.id
    can_manage = bool(
        (perms & Permissions.MANAGE_SOUNDBOARD) or (perms & Permissions.ADMIN)
    )
    if not (is_uploader or can_manage):
        raise HTTPException(status_code=403, detail="Нельзя удалять чужие звуки")

    # Best-effort filesystem cleanup.
    try:
        fs = Path(settings.UPLOAD_DIR) / sound.file_path
        fs.unlink(missing_ok=True)
    except Exception:
        pass

    await db.delete(sound)


# ── Rename (optional) ─────────────────────────────────────────────────

class SoundUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=32)
    emoji: str | None = Field(None, max_length=8)


@router.patch("/{sound_id}", response_model=SoundOut)
async def update_sound(
    server_id: uuid.UUID,
    sound_id: uuid.UUID,
    body: SoundUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(
        select(SoundboardSound).where(
            SoundboardSound.id == sound_id,
            SoundboardSound.server_id == server_id,
        )
    )
    sound = res.scalar_one_or_none()
    if not sound:
        raise HTTPException(status_code=404, detail="Звук не найден")

    perms = await compute_permissions(server_id, current_user.id, db)
    is_uploader = sound.uploader_id == current_user.id
    can_manage = bool(
        (perms & Permissions.MANAGE_SOUNDBOARD) or (perms & Permissions.ADMIN)
    )
    if not (is_uploader or can_manage):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    if body.name is not None:
        sound.name = body.name.strip()
    if body.emoji is not None:
        sound.emoji = body.emoji.strip() or None
    await db.flush()
    await db.refresh(sound)
    return _to_out(sound)


# ── Aggregate across all servers the caller belongs to ────────────────

@me_router.get("/sounds", response_model=list[SoundOut])
async def list_my_sounds(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Every soundboard sound from every server the caller is a member of.
    The voice-call SoundboardModal uses this to populate its grid once and
    re-use across channels/DMs."""
    subq = select(ServerMember.server_id).where(ServerMember.user_id == current_user.id)
    res = await db.execute(
        select(SoundboardSound)
        .where(SoundboardSound.server_id.in_(subq))
        .order_by(SoundboardSound.created_at.desc())
    )
    return [_to_out(s) for s in res.scalars()]
