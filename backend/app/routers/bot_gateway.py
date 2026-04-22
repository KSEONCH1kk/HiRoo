"""WebSocket gateway for bots.

Flow:
  1. Client connects to wss://.../api/bot/gateway
  2. Sends Identify: { op: 2, token: "Bot xxx", intents: N, shard: [id, count] }
  3. Server replies with Hello { op: 10, heartbeat_interval } + Ready { op: 0, t: "READY" }
  4. Server streams events (op: 0) filtered by intents + shard assignment.
  5. Client heartbeats (op: 1) every heartbeat_interval ms; server ACKs (op: 11).

Guild→shard assignment uses the Discord formula:
    shard_id = (guild_id_high_bits >> 22) % shard_count
We use a simple hash on the UUID low-bits to the same effect.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Set

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, get_db

from app.database import AsyncSessionLocal as async_session
from app.models.application import Application, Bot
from app.models.server import ServerMember
from app.models.user import User
from app.services.app_tokens import hash_secret
from app.services.intents import Intents, PRIVILEGED_INTENTS, event_requires_intent

log = logging.getLogger("hiroo.bot.gateway")
router = APIRouter(prefix="/api/bot", tags=["bot-gateway"])

HEARTBEAT_INTERVAL_MS = 41250  # same as Discord — ~41s


# Ops
OP_DISPATCH = 0
OP_HEARTBEAT = 1
OP_IDENTIFY = 2
OP_RESUME = 6
OP_RECONNECT = 7
OP_INVALID_SESSION = 9
OP_HELLO = 10
OP_HEARTBEAT_ACK = 11


@dataclass
class BotConn:
    ws: WebSocket
    bot_user_id: uuid.UUID
    application_id: uuid.UUID
    intents: int
    shard_id: int
    shard_count: int
    seq: int = 0
    guild_ids: Set[uuid.UUID] = field(default_factory=set)


# Registry of live bot connections. Key is (application_id, shard_id) so the
# same bot running multiple shards can coexist.
_connections: Dict[tuple[uuid.UUID, int], BotConn] = {}


def _shard_for_guild(guild_id: uuid.UUID, shard_count: int) -> int:
    if shard_count <= 1:
        return 0
    return guild_id.int % shard_count


async def _authenticate(token: str) -> tuple[Application, Bot] | None:
    """Exchange a 'Bot ...' token for the application + bot row."""
    raw = token.strip()
    if raw.lower().startswith("bot "):
        raw = raw[4:].strip()
    async with async_session() as db:
        br = await db.execute(select(Bot).where(Bot.token_hash == hash_secret(raw)))
        bot = br.scalar_one_or_none()
        if not bot:
            return None
        ar = await db.execute(select(Application).where(Application.id == bot.application_id))
        app = ar.scalar_one_or_none()
        if not app:
            return None
        return app, bot


async def _load_guilds(bot_user_id: uuid.UUID) -> list[dict]:
    async with async_session() as db:
        from app.models.server import Server
        rows = await db.execute(
            select(Server).join(ServerMember, ServerMember.server_id == Server.id)
            .where(ServerMember.user_id == bot_user_id)
        )
        return [
            {"id": str(s.id), "name": s.name, "icon_url": s.icon_url, "owner_id": str(s.owner_id)}
            for s in rows.scalars()
        ]


async def _send(ws: WebSocket, payload: dict) -> None:
    # Skip if the socket is already closed — avoids noisy
    # "websocket.send after close" RuntimeError from the ASGI layer.
    try:
        client_state = getattr(ws, "client_state", None)
        if client_state is not None and getattr(client_state, "name", None) == "DISCONNECTED":
            return
        app_state = getattr(ws, "application_state", None)
        if app_state is not None and getattr(app_state, "name", None) == "DISCONNECTED":
            return
        await ws.send_text(json.dumps(payload))
    except RuntimeError:
        pass
    except Exception:
        pass


@router.get("/gateway/bot")
async def gateway_bot_info(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticated variant — returns recommended shard count & session
    limits. Client must send `Authorization: Bot <token>`."""
    authz = request.headers.get("authorization", "")
    if not authz.lower().startswith("bot "):
        raise HTTPException(401, "Bot auth required")
    raw = authz[4:].strip()
    from app.services.app_tokens import hash_secret
    res = await db.execute(select(Bot).where(Bot.token_hash == hash_secret(raw)))
    bot = res.scalar_one_or_none()
    if not bot:
        raise HTTPException(401, "Invalid bot token")

    # Rough recommendation: 1 shard per ~1000 guilds, min 1.
    g_count = (await db.execute(
        select(ServerMember).where(ServerMember.user_id == bot.user_id)
    )).scalars()
    guilds = len(list(g_count))
    recommended = max(1, (guilds + 999) // 1000)

    return {
        "url": "wss://hiroo.intave.tech/api/bot/gateway",
        "shards": recommended,
        "session_start_limit": {
            "total": 1000,
            "remaining": 1000,
            "reset_after": 86400_000,
            "max_concurrency": 1,
        },
    }


@router.websocket("/gateway")
async def bot_gateway(ws: WebSocket):
    await ws.accept()
    await _send(ws, {"op": OP_HELLO, "d": {"heartbeat_interval": HEARTBEAT_INTERVAL_MS}})

    conn: BotConn | None = None
    try:
        # Expect Identify within 30s.
        first = await asyncio.wait_for(ws.receive_text(), timeout=30)
        msg = json.loads(first)
        if msg.get("op") != OP_IDENTIFY:
            await _send(ws, {"op": OP_INVALID_SESSION, "d": False})
            await ws.close(code=4001)
            return
        d = msg.get("d") or {}
        token = d.get("token") or ""
        intents = int(d.get("intents") or 0)
        shard = d.get("shard") or [0, 1]
        if not (isinstance(shard, list) and len(shard) == 2):
            shard = [0, 1]
        shard_id, shard_count = int(shard[0]), int(shard[1])
        if shard_count < 1 or shard_id < 0 or shard_id >= shard_count:
            await _send(ws, {"op": OP_INVALID_SESSION, "d": False})
            await ws.close(code=4010)
            return

        auth = await _authenticate(token)
        if not auth:
            await _send(ws, {"op": OP_INVALID_SESSION, "d": False})
            await ws.close(code=4004)
            return
        app, bot = auth

        # Reject privileged intents the application hasn't explicitly enabled.
        wanted_privileged = intents & int(PRIVILEGED_INTENTS)
        allowed_privileged = int(app.intents) & int(PRIVILEGED_INTENTS)
        if wanted_privileged & ~allowed_privileged:
            await _send(ws, {
                "op": OP_INVALID_SESSION, "d": False,
                "error": "disallowed_privileged_intents",
            })
            await ws.close(code=4014)
            return

        all_guilds = await _load_guilds(bot.user_id)
        my_guilds = [
            g for g in all_guilds
            if _shard_for_guild(uuid.UUID(g["id"]), shard_count) == shard_id
        ]

        conn = BotConn(
            ws=ws,
            bot_user_id=bot.user_id,
            application_id=app.id,
            intents=intents,
            shard_id=shard_id,
            shard_count=shard_count,
            guild_ids={uuid.UUID(g["id"]) for g in my_guilds},
        )
        _connections[(app.id, shard_id)] = conn
        log.info("bot gateway READY: bot_user=%s app=%s shard=%s/%s intents=%s guilds=%s",
                 bot.user_id, app.id, shard_id, shard_count, intents, len(conn.guild_ids))

        async with async_session() as db:
            u = (await db.execute(select(User).where(User.id == bot.user_id))).scalar_one()
            u.status = "online"
            # Collect servers where the bot is a member — so we can broadcast
            # its presence_update to the people who can see it.
            member_servers = await db.execute(
                select(ServerMember.server_id).where(ServerMember.user_id == bot.user_id)
            )
            guild_ids_for_presence = [row[0] for row in member_servers.all()]
            await db.commit()
        from app.services.websocket_service import manager as _ws_manager
        for sid in guild_ids_for_presence:
            await _ws_manager.broadcast_to_server(str(sid), {
                "event": "presence_update",
                "data": {"user_id": str(bot.user_id), "status": "online"},
            }, exclude_user=str(bot.user_id))

        conn.seq += 1
        await _send(ws, {
            "op": OP_DISPATCH, "s": conn.seq, "t": "READY",
            "d": {
                "v": 1,
                "user": {
                    "id": str(bot.user_id),
                    "username": u.username,
                    "display_name": u.display_name,
                    "avatar_url": u.avatar_url,
                    "bot": True,
                },
                "guilds": my_guilds,
                "session_id": uuid.uuid4().hex,
                "shard": [shard_id, shard_count],
                "application": {"id": str(app.id), "name": app.name},
            },
        })

        # Main receive loop — mostly heartbeats. Dispatches are pushed from
        # elsewhere (see dispatch_to_bots below).
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            op = msg.get("op")
            if op == OP_HEARTBEAT:
                await _send(ws, {"op": OP_HEARTBEAT_ACK})
            elif op == OP_RESUME:
                # We don't persist sessions yet — reply with Ready-equivalent.
                await _send(ws, {"op": OP_INVALID_SESSION, "d": False})
    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await ws.close(code=4008)
    except Exception as e:
        log.exception("bot_gateway error: %s", e)
    finally:
        if conn is not None:
            _connections.pop((conn.application_id, conn.shard_id), None)
            # If another shard of the same bot is still connected, don't flip
            # the user status to offline.
            still_online = any(
                c.application_id == conn.application_id
                for c in _connections.values()
            )
            try:
                async with async_session() as db:
                    u = (await db.execute(select(User).where(User.id == conn.bot_user_id))).scalar_one_or_none()
                    sids: list = []
                    if u and not still_online:
                        u.status = "offline"
                        rows = await db.execute(
                            select(ServerMember.server_id).where(ServerMember.user_id == conn.bot_user_id)
                        )
                        sids = [r[0] for r in rows.all()]
                    await db.commit()
                if not still_online and sids:
                    from app.services.websocket_service import manager as _ws_manager
                    for sid in sids:
                        await _ws_manager.broadcast_to_server(str(sid), {
                            "event": "presence_update",
                            "data": {"user_id": str(conn.bot_user_id), "status": "offline"},
                        }, exclude_user=str(conn.bot_user_id))
            except Exception:
                log.exception("bot_gateway cleanup failed")


# ── Public helpers called from other routers to fan events out to bots ──

async def dispatch_to_bot(bot_user_id: uuid.UUID, event: str, data: dict, guild_id: uuid.UUID | None = None) -> None:
    """Deliver an event to every shard of a bot that:
       - has the required intent;
       - owns the guild in its shard;
       - is currently connected."""
    required = event_requires_intent(event)
    async with async_session() as db:
        r = await db.execute(select(Bot).where(Bot.user_id == bot_user_id))
        bot = r.scalar_one_or_none()
    if not bot:
        log.warning("dispatch_to_bot: no Bot row for user=%s", bot_user_id)
        return
    matched = 0
    for (app_id, shard_id), conn in list(_connections.items()):
        if app_id != bot.application_id:
            continue
        if required and not (conn.intents & int(required)):
            log.info("dispatch skip: bot=%s intent mismatch evt=%s (need=%s have=%s)",
                     bot_user_id, event, int(required), conn.intents)
            continue
        if guild_id is not None:
            if _shard_for_guild(guild_id, conn.shard_count) != shard_id:
                continue
            if guild_id not in conn.guild_ids:
                log.info("dispatch skip: bot=%s guild=%s not in conn.guild_ids (%s)",
                         bot_user_id, guild_id, len(conn.guild_ids))
                continue
        conn.seq += 1
        await _send(conn.ws, {
            "op": OP_DISPATCH, "s": conn.seq, "t": event.upper(),
            "d": data,
        })
        matched += 1
    if matched == 0:
        log.info("dispatch_to_bot: no matching connection for bot=%s evt=%s guild=%s",
                 bot_user_id, event, guild_id)


async def dispatch_to_all_bots_in_guild(guild_id: uuid.UUID, event: str, data: dict) -> None:
    """Fan out a guild event to every bot currently in that guild."""
    async with async_session() as db:
        rows = await db.execute(
            select(Bot).join(ServerMember, ServerMember.user_id == Bot.user_id)
            .where(ServerMember.server_id == guild_id)
        )
        bots = list(rows.scalars())
    for bot in bots:
        await dispatch_to_bot(bot.user_id, event, data, guild_id=guild_id)


async def add_bot_to_guild(bot_user_id: uuid.UUID, guild_id: uuid.UUID) -> None:
    """Tell every live connection of this bot that it just joined a guild.
    Keeps dispatch_to_bot happy (its `guild_id in conn.guild_ids` check)."""
    async with async_session() as db:
        br = await db.execute(select(Bot).where(Bot.user_id == bot_user_id))
        bot = br.scalar_one_or_none()
        if not bot:
            return
        from app.models.server import Server
        gr = await db.execute(select(Server).where(Server.id == guild_id))
        g = gr.scalar_one_or_none()
    if not g:
        return
    for (app_id, shard_id), conn in list(_connections.items()):
        if app_id != bot.application_id:
            continue
        if _shard_for_guild(guild_id, conn.shard_count) != shard_id:
            continue
        conn.guild_ids.add(guild_id)
        conn.seq += 1
        await _send(conn.ws, {
            "op": OP_DISPATCH, "s": conn.seq, "t": "GUILD_CREATE",
            "d": {"id": str(g.id), "name": g.name, "icon_url": g.icon_url, "owner_id": str(g.owner_id)},
        })


async def remove_bot_from_guild(bot_user_id: uuid.UUID, guild_id: uuid.UUID) -> None:
    async with async_session() as db:
        br = await db.execute(select(Bot).where(Bot.user_id == bot_user_id))
        bot = br.scalar_one_or_none()
        if not bot:
            return
    for (app_id, shard_id), conn in list(_connections.items()):
        if app_id != bot.application_id:
            continue
        if guild_id not in conn.guild_ids:
            continue
        conn.guild_ids.discard(guild_id)
        conn.seq += 1
        await _send(conn.ws, {
            "op": OP_DISPATCH, "s": conn.seq, "t": "GUILD_DELETE",
            "d": {"id": str(guild_id)},
        })
