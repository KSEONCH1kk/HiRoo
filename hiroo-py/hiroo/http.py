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

    # ── Guild helpers ──────────────────────────────────────────────────

    async def get_guild_channels(self, guild_id: str) -> list[dict]:
        return await self.request("GET", f"/api/servers/{guild_id}/channels")

    async def create_channel(
        self,
        guild_id: str,
        name: str,
        *,
        type: str = "text",
        topic: str | None = None,
        is_private: bool = False,
        parent_id: str | None = None,
        position: int = 0,
    ) -> dict:
        """Create a channel in a server. `parent_id` points to a category
        channel to nest the new channel inside. Valid `type` values:
        `text`, `voice`, `announcement`, `category`, `forum`. Requires the
        bot to have MANAGE_CHANNELS in the guild."""
        body = {
            "name": name, "type": type, "is_private": is_private, "position": position,
        }
        if topic is not None:
            body["topic"] = topic
        if parent_id is not None:
            body["parent_id"] = parent_id
        return await self.request("POST", f"/api/servers/{guild_id}/channels", json=body)

    async def update_channel(self, guild_id: str, channel_id: str, **fields) -> dict:
        return await self.request(
            "PATCH", f"/api/servers/{guild_id}/channels/{channel_id}", json=fields,
        )

    async def delete_channel(self, guild_id: str, channel_id: str) -> None:
        await self.request("DELETE", f"/api/servers/{guild_id}/channels/{channel_id}")

    async def get_guilds(self) -> list[dict]:
        return await self.request("GET", "/api/servers")

    # ── Messages ───────────────────────────────────────────────────────

    async def edit_message(self, channel_id: str, message_id: str, content: str) -> dict:
        return await self.request(
            "PATCH", f"/api/channels/{channel_id}/messages/{message_id}",
            json={"content": content},
        )

    async def delete_message(self, channel_id: str, message_id: str) -> None:
        await self.request("DELETE", f"/api/channels/{channel_id}/messages/{message_id}")

    async def edit_dm_message(self, dm_id: str, message_id: str, content: str) -> dict:
        return await self.request(
            "PATCH", f"/api/dms/{dm_id}/messages/{message_id}",
            json={"content": content},
        )

    async def delete_dm_message(self, dm_id: str, message_id: str) -> None:
        await self.request("DELETE", f"/api/dms/{dm_id}/messages/{message_id}")

    async def add_reaction(self, channel_id: str, message_id: str, emoji: str) -> None:
        await self.request(
            "POST", f"/api/channels/{channel_id}/messages/{message_id}/reactions",
            json={"emoji": emoji},
        )

    async def remove_reaction(self, channel_id: str, message_id: str, emoji: str) -> None:
        await self.request(
            "DELETE", f"/api/channels/{channel_id}/messages/{message_id}/reactions",
            params={"emoji": emoji},
        )

    async def pin_message(self, channel_id: str, message_id: str) -> dict:
        return await self.request(
            "PUT", f"/api/channels/{channel_id}/messages/{message_id}/pin",
        )

    async def unpin_message(self, channel_id: str, message_id: str) -> dict:
        return await self.request(
            "DELETE", f"/api/channels/{channel_id}/messages/{message_id}/pin",
        )

    async def list_pinned(self, channel_id: str) -> list[dict]:
        return await self.request("GET", f"/api/channels/{channel_id}/messages/pinned")

    async def pin_dm_message(self, dm_id: str, message_id: str) -> dict:
        return await self.request("PUT", f"/api/dms/{dm_id}/messages/{message_id}/pin")

    async def unpin_dm_message(self, dm_id: str, message_id: str) -> dict:
        return await self.request("DELETE", f"/api/dms/{dm_id}/messages/{message_id}/pin")

    async def list_dm_pinned(self, dm_id: str) -> list[dict]:
        return await self.request("GET", f"/api/dms/{dm_id}/pinned")

    # ── Moderation ─────────────────────────────────────────────────────

    async def kick_member(self, guild_id: str, user_id: str) -> None:
        await self.request("DELETE", f"/api/servers/{guild_id}/members/{user_id}")

    async def ban_member(self, guild_id: str, user_id: str, reason: str | None = None) -> dict:
        body: dict = {"user_id": user_id}
        if reason is not None:
            body["reason"] = reason
        return await self.request("POST", f"/api/servers/{guild_id}/bans", json=body)

    async def unban_member(self, guild_id: str, user_id: str) -> None:
        await self.request("DELETE", f"/api/servers/{guild_id}/bans/{user_id}")

    async def list_bans(self, guild_id: str) -> list[dict]:
        return await self.request("GET", f"/api/servers/{guild_id}/bans")

    async def set_timeout(
        self, guild_id: str, user_id: str, duration_seconds: int, reason: str | None = None,
    ) -> dict:
        body: dict = {"duration_seconds": duration_seconds}
        if reason is not None:
            body["reason"] = reason
        return await self.request(
            "PUT", f"/api/servers/{guild_id}/members/{user_id}/timeout", json=body,
        )

    async def clear_timeout(self, guild_id: str, user_id: str) -> None:
        await self.request("DELETE", f"/api/servers/{guild_id}/members/{user_id}/timeout")

    async def update_member(
        self, guild_id: str, user_id: str, *, nickname: str | None = None, role: str | None = None,
    ) -> dict:
        body: dict = {}
        if nickname is not None:
            body["nickname"] = nickname
        if role is not None:
            body["role"] = role
        return await self.request(
            "PATCH", f"/api/servers/{guild_id}/members/{user_id}", json=body,
        )

    # ── Roles ──────────────────────────────────────────────────────────

    async def list_roles(self, guild_id: str) -> list[dict]:
        return await self.request("GET", f"/api/servers/{guild_id}/roles")

    async def create_role(
        self, guild_id: str, name: str, *,
        color: str | None = None, permissions: int = 0,
        hoist: bool = False, mentionable: bool = True,
    ) -> dict:
        body: dict = {
            "name": name, "permissions": permissions,
            "hoist": hoist, "mentionable": mentionable,
        }
        if color is not None:
            body["color"] = color
        return await self.request("POST", f"/api/servers/{guild_id}/roles", json=body)

    async def update_role(self, guild_id: str, role_id: str, **fields) -> dict:
        return await self.request(
            "PATCH", f"/api/servers/{guild_id}/roles/{role_id}", json=fields,
        )

    async def delete_role(self, guild_id: str, role_id: str) -> None:
        await self.request("DELETE", f"/api/servers/{guild_id}/roles/{role_id}")

    async def get_member_roles(self, guild_id: str, user_id: str) -> list[str]:
        return await self.request(
            "GET", f"/api/servers/{guild_id}/roles/members/{user_id}",
        )

    async def set_member_roles(
        self, guild_id: str, user_id: str, role_ids: list[str],
    ) -> list[str]:
        return await self.request(
            "PUT", f"/api/servers/{guild_id}/roles/members/{user_id}",
            json={"role_ids": role_ids},
        )
