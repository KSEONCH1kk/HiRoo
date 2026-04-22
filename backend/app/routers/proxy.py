"""Media proxy for YouTube: per-quality HLS streaming for fast startup.

Architecture
------------
* /yt/sign  — client requests this with a Bearer token. For every available
              quality we mint a short-lived signed stream URL. Split formats
              (1080p+, most modern YouTube videos above 360p) go through HLS;
              progressive formats stream the raw mp4 directly.
* /yt       — progressive mp4 pass-through with full Range support (seek).
* /yt/hls/{job}/index.m3u8  — HLS master playlist. The first request kicks off
              ffmpeg which writes .ts segments to a temp dir. As soon as the
              first segment exists (~2s) the playlist is returned and hls.js
              starts playing. ffmpeg keeps producing segments while playback
              is underway, so there's no "wait for full remux" delay.
* /yt/hls/{job}/{seg}.ts    — serves an individual segment (waiting briefly
              if ffmpeg hasn't produced it yet).

Jobs are keyed by hash(url, fmt) so the same video/quality is shared across
users. Abandoned jobs are cleaned up by TTL.
"""
from __future__ import annotations

import asyncio
import hmac
import hashlib
import logging
import os
import re
import shutil
import tempfile
import time
import urllib.parse
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from app.core.config import settings
from app.core.deps import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/api/proxy", tags=["proxy"])
log = logging.getLogger("hiroo.proxy")

YT_HOST_RE = re.compile(
    r"^(https?://)?(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)(/|$)",
    re.IGNORECASE,
)

_SIG_TTL = 4 * 3600

_UPSTREAM_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_UPSTREAM_HEADERS = {
    "User-Agent": _UPSTREAM_UA,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

_TARGET_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144]
_LABELS = {2160: "2160p", 1440: "1440p", 1080: "1080p", 720: "720p",
           480: "480p", 360: "360p", 240: "240p", 144: "144p"}

HLS_ROOT = Path(tempfile.gettempdir()) / "hiroo-hls"
HLS_ROOT.mkdir(parents=True, exist_ok=True)
HLS_SEGMENT_SECONDS = 4
HLS_JOB_TTL = 2 * 3600  # idle jobs die after 2h

# Optional YouTube cookies (Netscape format). If present, yt-dlp uses them to
# bypass the "Sign in to confirm you're not a bot" check. Mount read-only at
# this path via docker-compose — we copy it to a writable tmp file because
# yt-dlp tries to persist refreshed cookies back to disk on shutdown.
_COOKIES_SRC = Path("/app/secrets/yt-cookies.txt")
_COOKIES_RW = Path(tempfile.gettempdir()) / "yt-cookies-rw.txt"


def _prepare_cookiefile() -> Optional[str]:
    if not _COOKIES_SRC.exists():
        return None
    try:
        # Re-copy if the source changed or the writable copy is missing.
        if not _COOKIES_RW.exists() or _COOKIES_RW.stat().st_mtime < _COOKIES_SRC.stat().st_mtime:
            shutil.copyfile(_COOKIES_SRC, _COOKIES_RW)
            os.chmod(_COOKIES_RW, 0o600)
        return str(_COOKIES_RW)
    except Exception as e:
        log.warning("couldn't prepare yt-dlp cookiefile: %s", e)
        return None


def _ydl_base_opts() -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        # Fetch YouTube's n-sig challenge solver from the ejs repo on GitHub.
        # Required by modern yt-dlp (2025+) to get non-image formats from YouTube.
        "ejs_remote_components": ["ejs:github"],
        # Try multiple player clients — "mweb" and "tv_simply" often pass
        # the bot-check without cookies where "default" fails.
        "extractor_args": {
            "youtube": {
                "player_client": ["default", "mweb", "tv_simply"],
            },
        },
    }
    cf = _prepare_cookiefile()
    if cf:
        opts["cookiefile"] = cf
    return opts


# ── Signing ──────────────────────────────────────────────────────────────

def _sign(payload: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _make_sig(url: str, fmt: str, exp: int, uid: str) -> str:
    return _sign(f"{url}|{fmt}|{exp}|{uid}")


def _verify_sig(url: str, fmt: str, exp: int, uid: str, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    try:
        return hmac.compare_digest(_make_sig(url, fmt, exp, uid), sig)
    except Exception:
        return False


def _require_signed(url: str, fmt: str, exp: Optional[int], uid: Optional[str], sig: Optional[str]) -> None:
    if not (exp and uid and sig):
        raise HTTPException(status_code=401, detail="Отсутствует подпись")
    if not _verify_sig(url, fmt, exp, uid, sig):
        raise HTTPException(status_code=401, detail="Недействительная или просроченная подпись")


# ── yt-dlp helpers ───────────────────────────────────────────────────────

async def _run_ydl(opts: dict, url: str) -> dict:
    import yt_dlp
    loop = asyncio.get_running_loop()

    def _run() -> dict:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        return await loop.run_in_executor(None, _run)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"yt-dlp: {e}") from e


def _pick_qualities(info: dict) -> list[dict]:
    formats = info.get("formats") or []
    by_height: dict[int, dict] = {}
    for f in formats:
        h = f.get("height")
        ext = f.get("ext")
        vcodec = (f.get("vcodec") or "").lower()
        if not h or ext == "mhtml":
            continue
        if vcodec in ("", "none"):
            continue
        target = min((t for t in _TARGET_HEIGHTS if t >= h), default=h)
        cur = by_height.get(target)
        score = (
            1 if vcodec.startswith("avc1") else 0,
            1 if ext == "mp4" else 0,
            1 if f.get("acodec") and f.get("acodec") != "none" else 0,
            f.get("tbr") or 0,
        )
        if cur is None or score > cur["_score"]:
            by_height[target] = {**f, "_score": score}

    out: list[dict] = []
    for h in _TARGET_HEIGHTS:
        if h in by_height:
            f = by_height[h]
            out.append({
                "height": h,
                "label": _LABELS[h],
                "format_id": f["format_id"],
                "progressive": bool(f.get("acodec") and f.get("acodec") != "none"),
            })
    return out


def _split_urls(info: dict) -> tuple[Optional[str], Optional[str]]:
    reqs = info.get("requested_formats") or []
    if reqs:
        video_url: Optional[str] = None
        audio_url: Optional[str] = None
        for f in reqs:
            if f.get("vcodec") and f.get("vcodec") != "none" and video_url is None:
                video_url = f.get("url")
            elif f.get("acodec") and f.get("acodec") != "none" and audio_url is None:
                audio_url = f.get("url")
        return video_url, audio_url
    return info.get("url"), None


# ── HLS jobs ─────────────────────────────────────────────────────────────

class HlsJob:
    __slots__ = ("id", "url", "fmt", "dir", "proc", "starter", "error",
                 "finished", "created_at", "last_access")

    def __init__(self, job_id: str, url: str, fmt: str) -> None:
        self.id = job_id
        self.url = url
        self.fmt = fmt
        self.dir = HLS_ROOT / job_id
        self.proc: Optional[asyncio.subprocess.Process] = None
        self.starter: Optional[asyncio.Task] = None
        self.error: Optional[str] = None
        self.finished = False
        self.created_at = time.time()
        self.last_access = self.created_at


_hls_jobs: dict[str, HlsJob] = {}


def _job_id(url: str, fmt: str) -> str:
    return hashlib.sha256(f"{url}|{fmt}".encode("utf-8")).hexdigest()[:32]


def _gc_hls_jobs() -> None:
    now = time.time()
    for jid, job in list(_hls_jobs.items()):
        if now - job.last_access <= HLS_JOB_TTL:
            continue
        # Kill ffmpeg if still running.
        proc = job.proc
        if proc is not None and proc.returncode is None:
            try: proc.kill()
            except Exception: pass
        try:
            shutil.rmtree(job.dir, ignore_errors=True)
        except Exception:
            pass
        _hls_jobs.pop(jid, None)


async def _start_ffmpeg(job: HlsJob) -> None:
    """Re-extract the given format from YouTube and launch ffmpeg producing
    HLS segments under job.dir. Runs in the background while the playlist
    request returns."""
    job.dir.mkdir(parents=True, exist_ok=True)

    ydl_opts = {
        **_ydl_base_opts(),
        "format": f"{job.fmt}+bestaudio[ext=m4a]/{job.fmt}+bestaudio/{job.fmt}",
    }
    info = await _run_ydl(ydl_opts, job.url)
    video_url, audio_url = _split_urls(info)
    if not video_url:
        raise HTTPException(status_code=502, detail="Не нашли видеопоток")

    args: list[str] = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-user_agent", _UPSTREAM_UA,
        "-i", video_url,
    ]
    if audio_url:
        args += ["-user_agent", _UPSTREAM_UA, "-i", audio_url]
    args += ["-c", "copy", "-map", "0:v:0"]
    if audio_url:
        args += ["-map", "1:a:0"]
    args += [
        "-f", "hls",
        "-hls_time", str(HLS_SEGMENT_SECONDS),
        "-hls_playlist_type", "event",
        "-hls_list_size", "0",
        "-hls_flags", "independent_segments",
        "-hls_segment_filename", str(job.dir / "seg_%05d.ts"),
        str(job.dir / "index.m3u8"),
    ]

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    job.proc = proc

    async def _monitor():
        _, stderr = await proc.communicate()
        job.finished = True
        if proc.returncode not in (0, None):
            job.error = (stderr or b"").decode(errors="replace")[:400]
            log.warning("ffmpeg %s exit=%s err=%s", job.id, proc.returncode, job.error)

    asyncio.create_task(_monitor())


async def _ensure_job_started(job: HlsJob) -> None:
    if job.proc is not None:
        return
    if job.starter is None:
        job.starter = asyncio.create_task(_start_ffmpeg(job))
    try:
        # Shield so request cancellation doesn't abort ffmpeg startup.
        await asyncio.shield(job.starter)
    except asyncio.CancelledError:
        raise
    except Exception:
        # Let the next request retry — don't remember the failure.
        if job.proc is None:
            job.starter = None
        raise


async def _wait_for(path: Path, timeout: float) -> bool:
    deadline = time.time() + timeout
    while not path.exists():
        if time.time() > deadline:
            return False
        await asyncio.sleep(0.1)
    return True


async def _wait_for_ready_segment(job: HlsJob, path: Path, timeout: float) -> bool:
    """A segment is 'ready' when its next neighbour has started OR ffmpeg has
    finished (meaning this is the last segment)."""
    if not await _wait_for(path, timeout):
        return False
    # Detect end-of-write: another seg appears, or the proc is done.
    m = re.match(r"seg_(\d+)\.ts$", path.name)
    if not m:
        return True
    n = int(m.group(1))
    next_path = job.dir / f"seg_{n + 1:05d}.ts"
    deadline = time.time() + timeout
    while not next_path.exists() and not job.finished:
        if time.time() > deadline:
            break
        await asyncio.sleep(0.1)
    return True


# ── /sign ────────────────────────────────────────────────────────────────

@router.get("/yt/sign")
async def sign_yt_url(
    url: str = Query(..., min_length=8, max_length=512),
    current_user: User = Depends(get_current_active_user),
):
    if not YT_HOST_RE.match(url):
        raise HTTPException(status_code=400, detail="Разрешены только ссылки YouTube")

    info = await _run_ydl(_ydl_base_opts(), url)
    qualities = _pick_qualities(info)
    if not qualities:
        raise HTTPException(status_code=502, detail="Не нашли подходящих форматов")

    _gc_hls_jobs()
    exp = int(time.time()) + _SIG_TTL
    uid = str(current_user.id)

    items: list[dict] = []
    for q in qualities:
        fmt = q["format_id"]
        if q["progressive"]:
            sig = _make_sig(url, fmt, exp, uid)
            qs = urllib.parse.urlencode({"url": url, "fmt": fmt, "exp": exp, "uid": uid, "sig": sig})
            stream_url = f"/api/proxy/yt?{qs}"
            kind = "mp4"
        else:
            jid = _job_id(url, fmt)
            job = _hls_jobs.get(jid)
            if job is None:
                job = HlsJob(jid, url, fmt)
                _hls_jobs[jid] = job
            job.last_access = time.time()
            stream_url = f"/api/proxy/yt/hls/{jid}/index.m3u8"
            kind = "hls"
        items.append({
            "label": q["label"],
            "height": q["height"],
            "progressive": q["progressive"],
            "kind": kind,
            "stream_url": stream_url,
        })

    info_sig = _make_sig(url, "info", exp, uid)
    info_qs = urllib.parse.urlencode({"url": url, "fmt": "info", "exp": exp, "uid": uid, "sig": info_sig})

    return {
        "qualities": items,
        "info_url": f"/api/proxy/yt/info?{info_qs}",
        "expires_at": exp,
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
    }


# ── Progressive mp4 passthrough ──────────────────────────────────────────

@router.get("/yt")
async def proxy_yt(
    request: Request,
    url: str = Query(..., min_length=8, max_length=512),
    fmt: str = Query(..., min_length=1, max_length=64),
    exp: Optional[int] = Query(None),
    uid: Optional[str] = Query(None, max_length=64),
    sig: Optional[str] = Query(None, max_length=128),
):
    _require_signed(url, fmt, exp, uid, sig)
    if not YT_HOST_RE.match(url):
        raise HTTPException(status_code=400, detail="Разрешены только ссылки YouTube")

    ydl_opts = {**_ydl_base_opts(), "format": fmt}
    info = await _run_ydl(ydl_opts, url)
    direct = info.get("url")
    if not direct or info.get("acodec") in (None, "none"):
        raise HTTPException(status_code=400, detail="Формат не progressive — используйте HLS")

    headers = dict(_UPSTREAM_HEADERS)
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=None, follow_redirects=True)
    try:
        req = client.build_request("GET", direct, headers=headers)
        upstream = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"upstream: {e}") from e

    passthrough = {}
    for h in ("content-type", "content-length", "content-range",
              "accept-ranges", "etag", "last-modified"):
        if h in upstream.headers:
            passthrough[h] = upstream.headers[h]
    passthrough.setdefault("accept-ranges", "bytes")
    passthrough["cache-control"] = "private, max-age=0, must-revalidate"

    async def iter_body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            try: await upstream.aclose()
            except Exception: pass
            try: await client.aclose()
            except Exception: pass

    return StreamingResponse(iter_body(), status_code=upstream.status_code, headers=passthrough)


# ── HLS ──────────────────────────────────────────────────────────────────

_JOB_ID_RE = re.compile(r"^[a-f0-9]{32}$")
_SEG_RE = re.compile(r"^seg_\d{5,6}\.ts$")


@router.get("/yt/hls/{job_id}/index.m3u8")
async def hls_playlist(job_id: str):
    if not _JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=404)
    job = _hls_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job unknown or expired")
    if time.time() - job.created_at > _SIG_TTL:
        raise HTTPException(status_code=410, detail="Ссылка истекла")
    job.last_access = time.time()

    try:
        await _ensure_job_started(job)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ремукс не запустился: {e}") from e

    pl = job.dir / "index.m3u8"
    # Wait up to 20s for ffmpeg to write the playlist + at least one segment.
    if not await _wait_for(pl, 20):
        if job.error:
            raise HTTPException(status_code=502, detail=f"ffmpeg: {job.error}")
        raise HTTPException(status_code=504, detail="Playlist не готов")

    # Need at least one segment before returning playlist, otherwise hls.js
    # will error out with "no level/segments".
    first_seg = job.dir / "seg_00000.ts"
    await _wait_for(first_seg, 20)

    text = pl.read_text(encoding="utf-8")
    return Response(
        content=text,
        media_type="application/vnd.apple.mpegurl",
        headers={"cache-control": "no-cache"},
    )


@router.get("/yt/hls/{job_id}/{segment}")
async def hls_segment(job_id: str, segment: str):
    if not _JOB_ID_RE.match(job_id) or not _SEG_RE.match(segment):
        raise HTTPException(status_code=404)
    job = _hls_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job unknown or expired")
    if time.time() - job.created_at > _SIG_TTL:
        raise HTTPException(status_code=410, detail="Ссылка истекла")
    job.last_access = time.time()

    seg_path = job.dir / segment
    if not await _wait_for_ready_segment(job, seg_path, 30):
        if job.error:
            raise HTTPException(status_code=502, detail=f"ffmpeg: {job.error}")
        raise HTTPException(status_code=504, detail="Сегмент не готов")

    return FileResponse(
        seg_path,
        media_type="video/MP2T",
        headers={"cache-control": "public, max-age=3600"},
    )


# ── Metadata ─────────────────────────────────────────────────────────────

@router.get("/yt/info")
async def proxy_yt_info(
    url: str = Query(..., min_length=8, max_length=512),
    fmt: str = Query("info", max_length=64),
    exp: Optional[int] = Query(None),
    uid: Optional[str] = Query(None, max_length=64),
    sig: Optional[str] = Query(None, max_length=128),
):
    _require_signed(url, fmt, exp, uid, sig)
    if not YT_HOST_RE.match(url):
        raise HTTPException(status_code=400, detail="Разрешены только ссылки YouTube")

    info = await _run_ydl(_ydl_base_opts(), url)
    return {
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
    }
