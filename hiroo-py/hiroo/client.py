"""Top-level Bot class: event dispatch, command registry, shard manager."""
from __future__ import annotations

import asyncio
import inspect
import logging
import signal
from typing import Any, Callable, Dict, List, Optional

import aiohttp

from .gateway import GatewayClient
from .http import HTTPClient
from .intents import Intents
from .models import Message, User

log = logging.getLogger("hiroo.bot")


class CommandContext:
    """Passed to slash command / interaction handlers."""
    def __init__(self, bot: "Bot", *, message: Message | None = None,
                 interaction: dict | None = None, args: dict | None = None):
        self.bot = bot
        self.message = message
        self.interaction = interaction
        self.args = args or {}
        if interaction:
            self.channel_id = interaction.get("channel_id")
            self.dm_id = interaction.get("dm_id")
            self.interaction_id = interaction.get("id")
        elif message:
            self.channel_id = message.channel_id
            self.dm_id = message.dm_id
            self.interaction_id = None
        else:
            self.channel_id = self.dm_id = self.interaction_id = None

    @property
    def author(self) -> Optional[User]:
        if self.message:
            return self.message.author
        if self.interaction:
            u = self.interaction.get("user") or {}
            return User(
                id=u.get("id", ""), username=u.get("username", ""),
                display_name=u.get("display_name"), avatar_url=u.get("avatar_url"),
                bot=u.get("bot", False), _raw=u,
            )
        return None

    async def respond(self, content: str = "", *, embed=None, components=None, ephemeral: bool = False) -> dict:
        """For interactions — uses the interaction callback endpoint.
        For plain messages — just sends a message in the source channel."""
        if self.interaction_id:
            body = {
                "type": 4, "content": content, "ephemeral": ephemeral,
            }
            if embed:
                body["embeds"] = [embed.to_dict() if hasattr(embed, "to_dict") else embed]
            if components:
                body["components"] = [c.to_dict() if hasattr(c, "to_dict") else c for c in components]
            return await self.bot.http.request(
                "POST", f"/api/interactions/{self.interaction_id}/callback", json=body,
            )
        return await self.bot.http.send_message(
            channel_id=self.channel_id, dm_id=self.dm_id,
            content=content,
            embeds=[embed] if embed else None,
            components=components,
        )

    async def defer(self) -> None:
        if not self.interaction_id:
            return
        await self.bot.http.request(
            "POST", f"/api/interactions/{self.interaction_id}/callback", json={"type": 5},
        )

    async def followup(self, content: str = "", *, embed=None, components=None) -> dict:
        if not self.interaction_id:
            return await self.respond(content, embed=embed, components=components)
        body = {"content": content}
        if embed:
            body["embeds"] = [embed.to_dict() if hasattr(embed, "to_dict") else embed]
        if components:
            body["components"] = [c.to_dict() if hasattr(c, "to_dict") else c for c in components]
        return await self.bot.http.request(
            "POST", f"/api/interactions/{self.interaction_id}/followup", json=body,
        )


TYPE_MAP = {str: 3, int: 4, bool: 5, float: 10}


class Bot:
    """Main entry point. Create one, register handlers, call .run(token)."""

    def __init__(
        self,
        *,
        intents: Intents | int | None = None,
        base_url: str = "https://hiroo.intave.tech",
        application_id: Optional[str] = None,
        shard_count: Optional[int] = None,
    ):
        self.intents = int(intents) if intents is not None else int(Intents.default())
        self.base_url = base_url
        self.application_id = application_id
        self.shard_count = shard_count or 1
        self.user: Optional[User] = None
        self.http = HTTPClient(token="", base_url=base_url)

        self._event_handlers: Dict[str, List[Callable]] = {}
        self._commands: Dict[str, dict] = {}  # name → {handler, options, description, type}
        self._component_handlers: Dict[str, Callable] = {}
        self._shards: List[GatewayClient] = []

    # ── Public: decorators ────────────────────────────────────────────

    def event(self, fn: Callable) -> Callable:
        """Register an event handler. The function name becomes the event name.
        Example: `async def on_message(msg): ...` — fires on new messages."""
        name = fn.__name__.removeprefix("on_")
        # Discord-style shortcuts: on_message -> message_create, etc.
        aliases = {
            "message": "message_create",
            "message_edit": "message_update",
            "reaction": "reaction_add",
            "member_join": "guild_member_add",
            "member_leave": "guild_member_remove",
            "voice_state": "voice_state_update",
            "presence": "presence_update",
        }
        resolved = aliases.get(name, name)
        self._event_handlers.setdefault(resolved, []).append(fn)
        return fn

    def slash_command(self, *, name: Optional[str] = None, description: str = "", guild_id: Optional[str] = None):
        """Decorator that registers a slash command. Parameter types are derived
        from the function signature.

            @bot.slash_command(description="Add two numbers")
            async def add(ctx: CommandContext, a: int, b: int):
                await ctx.respond(str(a + b))
        """
        def deco(fn):
            cmd_name = name or fn.__name__
            sig = inspect.signature(fn)
            options: List[dict] = []
            for pname, p in list(sig.parameters.items())[1:]:  # skip ctx
                t = TYPE_MAP.get(p.annotation, 3)
                options.append({
                    "name": pname, "description": pname, "type": t,
                    "required": p.default is inspect._empty,
                })
            self._commands[cmd_name] = {
                "handler": fn,
                "type": "slash",
                "name": cmd_name,
                "description": description or cmd_name,
                "options": options,
                "guild_id": guild_id,
            }
            return fn
        return deco

    def component(self, custom_id: str):
        """Register a handler for a message component interaction (button/select)."""
        def deco(fn):
            self._component_handlers[custom_id] = fn
            return fn
        return deco

    # ── Voice ────────────────────────────────────────────────────────

    async def connect_voice(self, *, channel_id: str | None = None, dm_id: str | None = None):
        """Join a voice channel or DM call. Returns a `VoiceConnection` you
        can use to publish audio. Requires `pip install livekit`."""
        from .voice import connect_voice as _connect
        return await _connect(self, channel_id=channel_id, dm_id=dm_id)

    # ── Event dispatch (called by the gateway) ────────────────────────

    async def _dispatch(self, event: str, data: dict) -> None:
        if event == "ready":
            user_dict = data.get("user") or {}
            self.user = User(
                id=user_dict.get("id", ""),
                username=user_dict.get("username", ""),
                display_name=user_dict.get("display_name"),
                avatar_url=user_dict.get("avatar_url"),
                bot=True,
                _raw=user_dict,
            )
            self.shard_count = data.get("shard", [0, 1])[1]
            # Auto-register any slash_commands that were declared before connect.
            if self.application_id:
                for cmd in self._commands.values():
                    try:
                        await self.http.register_command(
                            self.application_id,
                            type=cmd["type"], name=cmd["name"],
                            description=cmd["description"], options=cmd["options"],
                            guild_id=cmd["guild_id"],
                        )
                    except Exception:
                        log.exception("failed to register /%s", cmd["name"])

        # Build rich objects for well-known events.
        payload: Any = data
        if event == "message_create":
            author_d = data.get("author") or {}
            payload = Message(
                id=data.get("id", ""),
                channel_id=data.get("channel_id"),
                dm_id=data.get("dm_id"),
                author=User(
                    id=author_d.get("id", ""), username=author_d.get("username", ""),
                    display_name=author_d.get("display_name"),
                    avatar_url=author_d.get("avatar_url"),
                    bot=author_d.get("bot", False),
                    _raw=author_d,
                ),
                content=data.get("content", ""),
                created_at=data.get("created_at", ""),
                _bot=self,
                _raw=data,
            )
            # Auto-invoke slash commands if content is "/name ..."
            if payload.content.startswith("/"):
                first = payload.content[1:].split(" ", 1)[0]
                if first in self._commands and not (payload.author and payload.author.bot):
                    cmd = self._commands[first]
                    # Very simple argv parser: split by spaces.
                    rest = payload.content[len(first) + 1:].strip().split(None, len(cmd["options"]))
                    kwargs = {}
                    for o, val in zip(cmd["options"], rest):
                        t = o["type"]
                        try:
                            if t == 4: kwargs[o["name"]] = int(val)
                            elif t == 5: kwargs[o["name"]] = val.lower() in ("1", "true", "yes", "y")
                            elif t == 10: kwargs[o["name"]] = float(val)
                            else: kwargs[o["name"]] = val
                        except Exception:
                            kwargs[o["name"]] = val
                    ctx = CommandContext(self, message=payload, args=kwargs)
                    try:
                        await cmd["handler"](ctx, **kwargs)
                    except Exception:
                        log.exception("command /%s failed", first)

        # Gateway-native interaction events (buttons, selects, picker-invoked slash commands).
        if event == "interaction_create":
            inter = data or {}
            itype = inter.get("type")
            if itype == "component":
                cid = inter.get("custom_id") or ""
                h = self._component_handlers.get(cid)
                if h:
                    ctx = CommandContext(self, interaction=inter, args=inter.get("data") or {})
                    try:
                        res = h(ctx)
                        if asyncio.iscoroutine(res):
                            await res
                    except Exception:
                        log.exception("component %s failed", cid)
            elif itype == "command":
                name = inter.get("command_name") or ""
                cmd = self._commands.get(name)
                if cmd:
                    opts = (inter.get("data") or {}).get("options") or {}
                    ctx = CommandContext(self, interaction=inter, args=opts)
                    try:
                        await cmd["handler"](ctx, **opts)
                    except Exception:
                        log.exception("slash /%s via interaction failed", name)

        for h in self._event_handlers.get(event, []):
            try:
                # Accept both `async def on_ready()` and `async def on_message(msg)` —
                # inspect the signature and only pass payload when there's a slot for it.
                try:
                    sig = inspect.signature(h)
                    positional = [
                        p for p in sig.parameters.values()
                        if p.kind in (
                            inspect.Parameter.POSITIONAL_ONLY,
                            inspect.Parameter.POSITIONAL_OR_KEYWORD,
                            inspect.Parameter.VAR_POSITIONAL,
                        )
                    ]
                    takes_arg = (
                        any(p.kind == inspect.Parameter.VAR_POSITIONAL for p in positional)
                        or len(positional) >= 1
                    )
                except (TypeError, ValueError):
                    takes_arg = True
                res = h(payload) if takes_arg else h()
                if asyncio.iscoroutine(res):
                    await res
            except Exception:
                log.exception("handler for %s failed", event)

    # ── Run ──────────────────────────────────────────────────────────

    def run(self, token: str) -> None:
        """Blocking helper — spins up shards and runs until Ctrl+C."""
        async def _main():
            self.http.token = token
            shards = self.shard_count or 1
            async with aiohttp.ClientSession() as session:
                self._shards = [
                    GatewayClient(
                        url=self.base_url, token=token, intents=Intents(self.intents),
                        shard_id=i, shard_count=shards,
                        on_dispatch=self._dispatch,
                    )
                    for i in range(shards)
                ]
                try:
                    await asyncio.gather(*[s.connect(session=session) for s in self._shards])
                finally:
                    for s in self._shards:
                        await s.close()
                    await self.http.close()

        try:
            asyncio.run(_main())
        except KeyboardInterrupt:
            pass
