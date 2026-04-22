"""Thin async HTTP wrapper over aiohttp for the HiRoo REST API."""
from __future__ import annotations

import asyncio
from typing import Any, List, Optional

import aiohttp

from .errors import HTTPError


class HTTPClient:
    def __init__(self, token: str, base_url: str):
        # Tokens are stored verbatim. For bots, `Authorization: Bot xxx` is
        # accepted by our API; for OAuth2 users, `Authorization: Bearer xxx`.
        self.token = token
        self.base_url = base_url.rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None

    @property
    def auth_header(self) -> str:
        if self.token.lower().startswith(("bot ", "bearer ")):
            return self.token
        return f"Bot {self.token}"

    async def _ensure(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"Authorization": self.auth_header, "User-Agent": "hiroo.py/0.1"}
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def request(self, method: str, path: str, *, json: Any = None, params: dict | None = None) -> Any:
        s = await self._ensure()
        url = self.base_url + path
        async with s.request(method, url, json=json, params=params) as r:
            if r.status == 204:
                return None
            try:
                data = await r.json()
            except aiohttp.ContentTypeError:
                data = await r.text()
            if r.status >= 400:
                raise HTTPError(r.status, data)
            return data

    # ── Convenience ────────────────────────────────────────────────────

    async def send_message(self, *, channel_id: Optional[str], dm_id: Optional[str], content: str = "",
                           embeds: list | None = None, components: list | None = None,
                           reply_to_id: Optional[str] = None) -> dict:
        body: dict = {"content": content}
        if embeds:
            body["embeds"] = [e.to_dict() if hasattr(e, "to_dict") else e for e in embeds]
        if components:
            body["components"] = [c.to_dict() if hasattr(c, "to_dict") else c for c in components]
        if reply_to_id:
            body["reply_to_id"] = reply_to_id
        if channel_id:
            return await self.request("POST", f"/api/channels/{channel_id}/messages", json=body)
        if dm_id:
            return await self.request("POST", f"/api/dms/{dm_id}/messages", json=body)
        raise ValueError("Either channel_id or dm_id required")

    async def register_command(self, application_id: str, *, type: str, name: str, description: str,
                               options: list | None = None, guild_id: str | None = None) -> dict:
        body = {
            "type": type, "name": name, "description": description,
            "options": options or [], "guild_id": guild_id,
        }
        return await self.request(
            "POST", f"/api/commands/applications/{application_id}/commands", json=body,
        )
