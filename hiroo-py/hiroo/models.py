from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, List, Optional

if TYPE_CHECKING:
    from .client import Bot


@dataclass
class User:
    id: str
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bot: bool = False
    _raw: dict = field(default_factory=dict, repr=False)


@dataclass
class Guild:
    id: str
    name: str
    icon_url: Optional[str] = None
    owner_id: Optional[str] = None
    _raw: dict = field(default_factory=dict, repr=False)


@dataclass
class Channel:
    id: str
    type: str
    name: Optional[str] = None
    server_id: Optional[str] = None
    _raw: dict = field(default_factory=dict, repr=False)


@dataclass
class Message:
    id: str
    channel_id: Optional[str]
    dm_id: Optional[str]
    author: Optional[User]
    content: str
    created_at: str
    _bot: Optional["Bot"] = field(default=None, repr=False)
    _raw: dict = field(default_factory=dict, repr=False)

    async def reply(self, content: str = "", *, embed=None, components=None):
        assert self._bot is not None
        return await self._bot.http.send_message(
            channel_id=self.channel_id,
            dm_id=self.dm_id,
            content=content,
            embeds=[embed] if embed else None,
            components=components,
            reply_to_id=self.id,
        )
