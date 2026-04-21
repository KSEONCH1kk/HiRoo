import ipaddress
import re
import socket
import time
from html.parser import HTMLParser
from urllib.parse import urlparse, urljoin

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/api", tags=["unfurl"])


class UnfurlResponse(BaseModel):
    url: str
    resolved_url: str
    title: str | None = None
    description: str | None = None
    image: str | None = None
    site_name: str | None = None
    kind: str = "link"  # "link" | "image" | "video" | "audio"


MAX_BYTES = 1_500_000
TIMEOUT = 6.0
USER_AGENT = "HiRooBot/1.0 (+https://hiroo.intave.tech)"

IMG_EXT = re.compile(r"\.(png|jpe?g|gif|webp|avif|bmp)(\?.*)?$", re.I)
VIDEO_EXT = re.compile(r"\.(mp4|webm|mov)(\?.*)?$", re.I)
AUDIO_EXT = re.compile(r"\.(mp3|ogg|wav|m4a|flac)(\?.*)?$", re.I)


def _is_internal_ip(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return True
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                return True
        except ValueError:
            continue
    return False


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title: str | None = None
        self.og_title: str | None = None
        self.og_description: str | None = None
        self.og_image: str | None = None
        self.og_site_name: str | None = None
        self.description: str | None = None
        self._in_title = False
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title":
            self._in_title = True
            self._buf = []
        elif tag == "meta":
            prop = (attr_dict.get("property") or attr_dict.get("name") or "").lower()
            content = attr_dict.get("content") or ""
            if not content:
                return
            if prop == "og:title":
                self.og_title = content.strip()[:300]
            elif prop == "og:description":
                self.og_description = content.strip()[:600]
            elif prop == "og:image":
                self.og_image = content.strip()[:800]
            elif prop == "og:site_name":
                self.og_site_name = content.strip()[:200]
            elif prop == "twitter:image" and not self.og_image:
                self.og_image = content.strip()[:800]
            elif prop == "description" and not self.description:
                self.description = content.strip()[:600]

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._in_title:
            self.title = ("".join(self._buf)).strip()[:300] or None
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._buf.append(data)


# Simple in-process cache: url -> (timestamp, response_dict)
_CACHE: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 600  # 10 minutes
_CACHE_MAX = 512


def _cache_get(url: str) -> dict | None:
    entry = _CACHE.get(url)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > CACHE_TTL:
        _CACHE.pop(url, None)
        return None
    return data


def _cache_set(url: str, data: dict) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        # drop oldest
        oldest = min(_CACHE.items(), key=lambda it: it[1][0])
        _CACHE.pop(oldest[0], None)
    _CACHE[url] = (time.time(), data)


async def _fetch(url: str) -> tuple[str | None, str, str, dict[str, str]]:
    """Returns (html_text_or_None, final_url, content_type, headers)."""
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=TIMEOUT,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9,ru;q=0.8"},
        max_redirects=5,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "").lower()
        # Only consume body for HTML
        if "text/html" in ctype or "application/xhtml" in ctype:
            content = resp.content[:MAX_BYTES]
            try:
                text = content.decode(resp.encoding or "utf-8", errors="replace")
            except Exception:
                text = content.decode("utf-8", errors="replace")
            return text, str(resp.url), ctype, dict(resp.headers)
        return None, str(resp.url), ctype, dict(resp.headers)


@router.get("/unfurl", response_model=UnfurlResponse)
async def unfurl(
    url: str = Query(..., max_length=2000),
    _: User = Depends(get_current_active_user),
):
    cached = _cache_get(url)
    if cached:
        return cached

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Только HTTP(S) ссылки")
    host = parsed.hostname or ""
    if not host or _is_internal_ip(host):
        raise HTTPException(status_code=400, detail="Недопустимый хост")

    # Fast path: direct media by extension
    low = parsed.path.lower()
    if IMG_EXT.search(low):
        data = UnfurlResponse(url=url, resolved_url=url, image=url, kind="image").model_dump()
        _cache_set(url, data)
        return data
    if VIDEO_EXT.search(low):
        data = UnfurlResponse(url=url, resolved_url=url, kind="video").model_dump()
        _cache_set(url, data)
        return data
    if AUDIO_EXT.search(low):
        data = UnfurlResponse(url=url, resolved_url=url, kind="audio").model_dump()
        _cache_set(url, data)
        return data

    try:
        html, final_url, ctype, _headers = await _fetch(url)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Не удалось загрузить страницу")

    resolved_host = urlparse(final_url).hostname or host
    if _is_internal_ip(resolved_host):
        raise HTTPException(status_code=400, detail="Недопустимый хост")

    if html is None:
        # Non-HTML: infer kind from content-type
        kind = "link"
        if ctype.startswith("image/"):
            kind = "image"
        elif ctype.startswith("video/"):
            kind = "video"
        elif ctype.startswith("audio/"):
            kind = "audio"
        data = UnfurlResponse(
            url=url, resolved_url=final_url,
            image=final_url if kind == "image" else None,
            kind=kind,
        ).model_dump()
        _cache_set(url, data)
        return data

    parser = _MetaParser()
    try:
        parser.feed(html)
    except Exception:
        pass

    title = parser.og_title or parser.title
    description = parser.og_description or parser.description
    image = parser.og_image
    if image:
        image = urljoin(final_url, image)
    site_name = parser.og_site_name or resolved_host

    data = UnfurlResponse(
        url=url, resolved_url=final_url,
        title=title, description=description, image=image, site_name=site_name,
        kind="link",
    ).model_dump()
    _cache_set(url, data)
    return data
