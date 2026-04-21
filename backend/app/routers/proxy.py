"""Media proxy: streams YouTube video through the server to bypass client-side
throttling/blocking. Used by the !pr <url> message command in the frontend.

Auth model: the client first calls /api/proxy/yt/sign with its normal Bearer
token to mint a short-lived HMAC signature for one specific URL. The streaming
and info endpoints accept only that signature — the JWT itself never appears
in query strings (and therefore not in nginx access logs, browser history, or
Referer headers)."""
from __future__ import annotations

import asyncio
import hmac
import hashlib
import re
import time
import urllib.parse
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.deps import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

# Accept only canonical YouTube hosts.
YT_HOST_RE = re.compile(
    r"^(https?://)?(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)(/|$)",
    re.IGNORECASE,
)

_SIG_TTL = 4 * 3600  # 4 hours — long enough for a full movie re-watch

_YDL_OPTS = {
    "format": "best[ext=mp4][vcodec^=avc1][acodec!=none]/best[ext=mp4]/best",
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
    "socket_timeout": 15,
}

_UPSTREAM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _sign(url: str, exp: int, uid: str) -> str:
    """HMAC-SHA256 signature binding (url, expiry, user). Hex-encoded."""
    msg = f"{url}|{exp}|{uid}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def _verify_sig(url: str, exp: int, uid: str, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    expected = _sign(url, exp, uid)
    try:
        return hmac.compare_digest(expected, sig)
    except Exception:
        return False


def _require_signed(
    url: str,
    exp: Optional[int],
    uid: Optional[str],
    sig: Optional[str],
) -> None:
    if not (exp and uid and sig):
        raise HTTPException(status_code=401, detail="Отсутствует подпись")
    if not _verify_sig(url, exp, uid, sig):
        raise HTTPException(status_code=401, detail="Недействительная или просроченная подпись")


async def _extract_stream_url(yt_url: str) -> tuple[str, str]:
    """Returns (direct_media_url, title)."""
    import yt_dlp

    loop = asyncio.get_running_loop()

    def _run() -> dict:
        with yt_dlp.YoutubeDL(_YDL_OPTS) as ydl:
            return ydl.extract_info(yt_url, download=False)

    try:
        info = await loop.run_in_executor(None, _run)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"yt-dlp: {e}") from e

    direct = info.get("url")
    if not direct:
        formats = info.get("formats") or []
        pick = None
        for f in formats:
            if f.get("vcodec") and f.get("vcodec") != "none" and f.get("acodec") and f.get("acodec") != "none":
                pick = f
                break
        direct = (pick or {}).get("url")
    if not direct:
        raise HTTPException(status_code=502, detail="Нет прямой ссылки на поток")
    return direct, info.get("title") or ""


@router.get("/yt/sign")
async def sign_yt_url(
    url: str = Query(..., min_length=8, max_length=512),
    current_user: User = Depends(get_current_active_user),
):
    """Mint short-lived signed URLs for a specific YouTube link.

    The returned URLs can be dropped into <video src> / fetch() without exposing
    the caller's JWT. They are valid for _SIG_TTL seconds and bound to the
    requesting user (so bans propagate as soon as existing sigs expire)."""
    if not YT_HOST_RE.match(url):
        raise HTTPException(status_code=400, detail="Разрешены только ссылки YouTube")

    exp = int(time.time()) + _SIG_TTL
    uid = str(current_user.id)
    sig = _sign(url, exp, uid)
    qs = urllib.parse.urlencode({"url": url, "exp": exp, "uid": uid, "sig": sig})
    return {
        "stream_url": f"/api/proxy/yt?{qs}",
        "info_url": f"/api/proxy/yt/info?{qs}",
        "expires_at": exp,
    }


@router.get("/yt")
async def proxy_yt(
    request: Request,
    url: str = Query(..., min_length=8, max_length=512),
    exp: Optional[int] = Query(None),
    uid: Optional[str] = Query(None, max_length=64),
    sig: Optional[str] = Query(None, max_length=128),
):
    _require_signed(url, exp, uid, sig)

    if not YT_HOST_RE.match(url):
        raise HTTPException(status_code=400, detail="Разрешены только ссылки YouTube")

    stream_url, _title = await _extract_stream_url(url)

    headers = dict(_UPSTREAM_HEADERS)
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=None, follow_redirects=True)
    try:
        req = client.build_request("GET", stream_url, headers=headers)
        upstream = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"upstream: {e}") from e

    passthrough = {}
    for h in (
        "content-type", "content-length", "content-range",
        "accept-ranges", "etag", "last-modified",
    ):
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

    return StreamingResponse(
        iter_body(),
        status_code=upstream.status_code,
        headers=passthrough,
    )


@router.get("/yt/info")
async def proxy_yt_info(
    url: str = Query(..., min_length=8, max_length=512),
    exp: Optional[int] = Query(None),
    uid: Optional[str] = Query(None, max_length=64),
    sig: Optional[str] = Query(None, max_length=128),
):
    _require_signed(url, exp, uid, sig)
    if not YT_HOST_RE.match(url):
        raise HTTPException(status_code=400, detail="Разрешены только ссылки YouTube")

    import yt_dlp
    loop = asyncio.get_running_loop()
    opts = {**_YDL_OPTS}
    opts.pop("format", None)

    def _run() -> dict:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        info = await loop.run_in_executor(None, _run)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"yt-dlp: {e}") from e

    return {
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
    }
