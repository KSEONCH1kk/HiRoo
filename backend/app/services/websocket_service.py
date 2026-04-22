"""WebSocket fan-out layer.

Local state (`_connections`, `_server_members`, `_voice_rooms`, …) is kept
per-replica — it only reflects what THIS process sees. Cross-replica
delivery happens through Redis Pub/Sub:

  • sending to a specific user:
        PUBLISH user:<uid>  {data: ..., exclude: ...}

  • broadcasting to a server:
        PUBLISH server:<sid> {data: ..., exclude: ...}

Each replica subscribes to channels for the users / servers it currently
hosts locally. The background listener pulls messages and pushes them into
its own websockets. Distributed online-status uses a simple per-user
counter (INCR on first local connection, DECR on last).

This lets the backend run with >1 replica behind a load balancer while
keeping the public ConnectionManager API unchanged.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from fastapi import WebSocket

log = logging.getLogger("hiroo.ws")


class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets (LOCAL to this replica)
        self._connections: dict[str, set[WebSocket]] = {}
        # channel_id -> set of user_ids (unused at the moment)
        self._channel_members: dict[str, set[str]] = {}
        # server_id -> set of user_ids currently connected HERE
        self._server_members: dict[str, set[str]] = {}
        # voice room_id -> set of user_ids (LOCAL only for now — step 2)
        self._voice_rooms: dict[str, set[str]] = {}
        self._user_voice_room: dict[str, str] = {}
        self._voice_room_meta: dict[str, tuple[datetime, str, str | None]] = {}
        # server-imposed restrictions (persist until admin lifts)
        self._server_muted: set[str] = set()
        self._server_deafened: set[str] = set()

        # Redis-backed cross-replica state
        self._redis: aioredis.Redis | None = None
        self._pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task | None = None
        # Reference counts — so we only subscribe once per channel and
        # unsubscribe when the last local member leaves.
        self._user_sub_refs: dict[str, int] = {}
        self._server_sub_refs: dict[str, int] = {}

    # ── Lifecycle ────────────────────────────────────────────────────

    async def start(self, redis: aioredis.Redis) -> None:
        """Attach a Redis client and kick off the pub-sub listener.
        Called once from app startup."""
        self._redis = redis
        self._pubsub = redis.pubsub(ignore_subscribe_messages=True)
        # Subscribe to at least one throwaway channel so .listen() has
        # something to await on before anyone connects.
        await self._pubsub.subscribe("hiroo:_bootstrap")
        self._listener_task = asyncio.create_task(self._listener_loop())
        log.info("ConnectionManager pub-sub listener started")

    async def stop(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try: await self._listener_task
            except Exception: pass
        if self._pubsub:
            try: await self._pubsub.aclose()
            except Exception:
                try: await self._pubsub.close()
                except Exception: pass

    async def _listener_loop(self) -> None:
        assert self._pubsub is not None
        try:
            async for msg in self._pubsub.listen():
                if msg.get("type") not in ("message", "pmessage"):
                    continue
                try:
                    ch = msg["channel"]
                    if isinstance(ch, (bytes, bytearray)):
                        ch = ch.decode("utf-8", errors="ignore")
                    raw = msg["data"]
                    if isinstance(raw, (bytes, bytearray)):
                        raw = raw.decode("utf-8", errors="ignore")
                    payload = json.loads(raw)
                except Exception:
                    log.exception("pubsub parse error")
                    continue

                data = payload.get("data") or {}
                exclude = payload.get("exclude")
                try:
                    if ch.startswith("user:"):
                        uid = ch.split(":", 1)[1]
                        if uid != exclude:
                            await self._send_local(uid, data)
                    elif ch.startswith("server:"):
                        sid = ch.split(":", 1)[1]
                        for uid in list(self._server_members.get(sid, set())):
                            if uid == exclude:
                                continue
                            await self._send_local(uid, data)
                except Exception:
                    log.exception("pubsub dispatch error (channel=%s)", ch)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("pubsub listener crashed")

    # ── Subscription bookkeeping ─────────────────────────────────────

    async def _ref_user(self, user_id: str) -> None:
        if not self._pubsub:
            return
        n = self._user_sub_refs.get(user_id, 0) + 1
        self._user_sub_refs[user_id] = n
        if n == 1:
            try: await self._pubsub.subscribe(f"user:{user_id}")
            except Exception: log.exception("subscribe user:%s failed", user_id)

    async def _unref_user(self, user_id: str) -> None:
        if not self._pubsub:
            return
        n = self._user_sub_refs.get(user_id, 0) - 1
        if n <= 0:
            self._user_sub_refs.pop(user_id, None)
            try: await self._pubsub.unsubscribe(f"user:{user_id}")
            except Exception: log.exception("unsubscribe user:%s failed", user_id)
        else:
            self._user_sub_refs[user_id] = n

    async def _ref_server(self, server_id: str) -> None:
        if not self._pubsub:
            return
        n = self._server_sub_refs.get(server_id, 0) + 1
        self._server_sub_refs[server_id] = n
        if n == 1:
            try: await self._pubsub.subscribe(f"server:{server_id}")
            except Exception: log.exception("subscribe server:%s failed", server_id)

    async def _unref_server(self, server_id: str) -> None:
        if not self._pubsub:
            return
        n = self._server_sub_refs.get(server_id, 0) - 1
        if n <= 0:
            self._server_sub_refs.pop(server_id, None)
            try: await self._pubsub.unsubscribe(f"server:{server_id}")
            except Exception: log.exception("unsubscribe server:%s failed", server_id)
        else:
            self._server_sub_refs[server_id] = n

    # ── Server-mute / deaf flags (local — admin needs one replica) ──

    def is_server_muted(self, user_id: str) -> bool:
        return user_id in self._server_muted

    def is_server_deafened(self, user_id: str) -> bool:
        return user_id in self._server_deafened

    def set_server_muted(self, user_id: str, on: bool) -> None:
        if on: self._server_muted.add(user_id)
        else: self._server_muted.discard(user_id)

    def set_server_deafened(self, user_id: str, on: bool) -> None:
        if on: self._server_deafened.add(user_id)
        else: self._server_deafened.discard(user_id)

    # ── Voice rooms (Redis-backed, shared across replicas) ───────────
    #
    # Redis keys:
    #   voice:room:<room_id>  →  SET of user_ids currently in that room
    #   voice:user:<user_id>  →  STRING, which room (if any) they're in
    #   voice:meta:<room_id>  →  JSON {started_at, starter_id, call_log_msg_id}
    #   voice:rooms           →  SET of all active room_ids (for snapshot)
    #
    # The in-memory dicts are kept only as a fallback when Redis isn't
    # attached yet (very early in app startup) so we don't crash; at runtime
    # every voice_* method prefers Redis.

    @staticmethod
    def _b(v: Any) -> str:
        if isinstance(v, (bytes, bytearray)):
            return v.decode("utf-8", errors="ignore")
        return v if v is not None else ""

    async def voice_join(self, user_id: str, room_id: str) -> tuple[list[str], bool]:
        """Add user to voice room, leaving any previous one.
        Returns (existing_peers_before_join, is_new_call_started)."""
        if not self._redis:
            return self._voice_join_local(user_id, room_id)

        prev = self._b(await self._redis.get(f"voice:user:{user_id}"))
        if prev and prev != room_id:
            # Clean up the previous room first.
            await self._voice_leave_redis(user_id, prev)

        existing_raw = await self._redis.smembers(f"voice:room:{room_id}")
        existing = [self._b(x) for x in existing_raw if self._b(x) != user_id]

        pipe = self._redis.pipeline()
        pipe.sadd(f"voice:room:{room_id}", user_id)
        pipe.set(f"voice:user:{user_id}", room_id)
        pipe.sadd("voice:rooms", room_id)
        await pipe.execute()

        # Create meta iff this is the first participant.
        is_new = False
        if not await self._redis.exists(f"voice:meta:{room_id}"):
            meta = {
                "started_at": datetime.now(timezone.utc).isoformat(),
                "starter_id": user_id,
                "call_log_msg_id": None,
            }
            await self._redis.set(f"voice:meta:{room_id}", json.dumps(meta))
            is_new = True

        return existing, is_new

    async def voice_leave(self, user_id: str):
        """Remove user. Returns (room_id, remaining_peers, call_meta_if_ended)."""
        if not self._redis:
            return self._voice_leave_local(user_id)

        room_id = self._b(await self._redis.get(f"voice:user:{user_id}"))
        if not room_id:
            return None, [], None
        remaining, ended_meta = await self._voice_leave_redis(user_id, room_id)
        return room_id, remaining, ended_meta

    async def _voice_leave_redis(self, user_id: str, room_id: str):
        """Low-level remove, assumes room_id is known. Returns (remaining, ended_meta)."""
        assert self._redis is not None
        pipe = self._redis.pipeline()
        pipe.srem(f"voice:room:{room_id}", user_id)
        pipe.delete(f"voice:user:{user_id}")
        await pipe.execute()

        members_raw = await self._redis.smembers(f"voice:room:{room_id}")
        remaining = [self._b(x) for x in members_raw]

        ended_meta = None
        if not remaining:
            meta_raw = self._b(await self._redis.get(f"voice:meta:{room_id}"))
            if meta_raw:
                try:
                    meta = json.loads(meta_raw)
                    try:
                        ts = datetime.fromisoformat(meta.get("started_at", ""))
                    except Exception:
                        ts = datetime.now(timezone.utc)
                    ended_meta = (ts, meta.get("starter_id", ""), meta.get("call_log_msg_id"))
                except Exception:
                    ended_meta = None
            pipe2 = self._redis.pipeline()
            pipe2.delete(f"voice:room:{room_id}")
            pipe2.delete(f"voice:meta:{room_id}")
            pipe2.srem("voice:rooms", room_id)
            await pipe2.execute()

        return remaining, ended_meta

    async def set_call_log_msg_id(self, room_id: str, msg_id: str) -> None:
        if not self._redis:
            meta = self._voice_room_meta.get(room_id)
            if meta:
                self._voice_room_meta[room_id] = (meta[0], meta[1], msg_id)
            return
        raw = self._b(await self._redis.get(f"voice:meta:{room_id}"))
        if not raw:
            return
        try: meta = json.loads(raw)
        except Exception: return
        meta["call_log_msg_id"] = msg_id
        await self._redis.set(f"voice:meta:{room_id}", json.dumps(meta))

    async def voice_room_of(self, user_id: str) -> str | None:
        if not self._redis:
            return self._user_voice_room.get(user_id)
        v = self._b(await self._redis.get(f"voice:user:{user_id}"))
        return v or None

    async def voice_room_members(self, room_id: str) -> list[str]:
        if not self._redis:
            return list(self._voice_rooms.get(room_id, set()))
        raw = await self._redis.smembers(f"voice:room:{room_id}")
        return [self._b(x) for x in raw]

    async def voice_all_rooms(self) -> dict[str, list[str]]:
        """Snapshot of every active voice room — used by /ws on reconnect to
        send the user their current-state payload. Redis keys stay small."""
        if not self._redis:
            return {rid: list(m) for rid, m in self._voice_rooms.items()}
        ids_raw = await self._redis.smembers("voice:rooms")
        ids = [self._b(x) for x in ids_raw]
        out: dict[str, list[str]] = {}
        if not ids:
            return out
        # Fetch each room's members in one pipeline.
        pipe = self._redis.pipeline()
        for rid in ids:
            pipe.smembers(f"voice:room:{rid}")
        results = await pipe.execute()
        for rid, members_raw in zip(ids, results):
            members = [self._b(x) for x in members_raw]
            if members:
                out[rid] = members
        return out

    # In-memory fallbacks (used only before start() is called).

    def _voice_join_local(self, user_id: str, room_id: str) -> tuple[list[str], bool]:
        prev = self._user_voice_room.get(user_id)
        if prev and prev != room_id:
            self._voice_leave_local(user_id)
        existing = [u for u in self._voice_rooms.get(room_id, set()) if u != user_id]
        self._voice_rooms.setdefault(room_id, set()).add(user_id)
        self._user_voice_room[user_id] = room_id
        is_new = False
        if room_id not in self._voice_room_meta:
            self._voice_room_meta[room_id] = (datetime.now(timezone.utc), user_id, None)
            is_new = True
        return existing, is_new

    def _voice_leave_local(self, user_id: str):
        room_id = self._user_voice_room.pop(user_id, None)
        if not room_id:
            return None, [], None
        members = self._voice_rooms.get(room_id, set())
        members.discard(user_id)
        remaining = list(members)
        ended_meta = None
        if not members:
            self._voice_rooms.pop(room_id, None)
            ended_meta = self._voice_room_meta.pop(room_id, None)
        return room_id, remaining, ended_meta

    # ── Connections ──────────────────────────────────────────────────

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        first = user_id not in self._connections or not self._connections[user_id]
        self._connections.setdefault(user_id, set()).add(ws)
        if first:
            await self._ref_user(user_id)
            if self._redis:
                try: await self._redis.incr(f"online:count:{user_id}")
                except Exception: log.exception("online counter incr failed")

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        if user_id not in self._connections:
            return
        self._connections[user_id].discard(ws)
        if not self._connections[user_id]:
            del self._connections[user_id]
            await self._unref_user(user_id)
            if self._redis:
                try:
                    cur = await self._redis.decr(f"online:count:{user_id}")
                    if cur is not None and int(cur) < 0:
                        await self._redis.set(f"online:count:{user_id}", 0)
                except Exception:
                    log.exception("online counter decr failed")

    def join_server(self, server_id: str, user_id: str) -> None:
        first = server_id not in self._server_members or not self._server_members[server_id]
        self._server_members.setdefault(server_id, set()).add(user_id)
        if first:
            # Fire-and-forget — we're in a sync method called from sync paths.
            asyncio.create_task(self._ref_server(server_id))

    def leave_server(self, server_id: str, user_id: str) -> None:
        if server_id not in self._server_members:
            return
        self._server_members[server_id].discard(user_id)
        if not self._server_members[server_id]:
            del self._server_members[server_id]
            asyncio.create_task(self._unref_server(server_id))

    # ── Delivery ─────────────────────────────────────────────────────

    async def _send_local(self, user_id: str, data: dict) -> None:
        sockets = self._connections.get(user_id, set()).copy()
        if not sockets:
            return
        dead = set()
        payload = json.dumps(data)
        for ws in sockets:
            try: await ws.send_text(payload)
            except Exception: dead.add(ws)
        for ws in dead:
            self._connections.get(user_id, set()).discard(ws)

    async def send_to_user(self, user_id: str, data: dict) -> None:
        if self._redis:
            try:
                await self._redis.publish(
                    f"user:{user_id}",
                    json.dumps({"data": data}),
                )
                return
            except Exception:
                log.exception("publish user:%s failed, falling back to local", user_id)
        await self._send_local(user_id, data)

    async def broadcast_to_server(self, server_id: str, data: dict, exclude_user: str | None = None) -> None:
        if self._redis:
            try:
                await self._redis.publish(
                    f"server:{server_id}",
                    json.dumps({"data": data, "exclude": exclude_user}),
                )
            except Exception:
                log.exception("publish server:%s failed, falling back to local", server_id)
                for uid in list(self._server_members.get(server_id, set())):
                    if uid == exclude_user:
                        continue
                    await self._send_local(uid, data)
        else:
            for uid in list(self._server_members.get(server_id, set())):
                if uid == exclude_user:
                    continue
                await self._send_local(uid, data)

        # Fan out to bots in this guild (their gateway lives on this replica).
        try:
            from app.routers.bot_gateway import dispatch_to_all_bots_in_guild
            evt = data.get("event")
            payload = data.get("data") or {}
            if evt:
                log.info("broadcast→bots guild=%s evt=%s", server_id, evt)
                await dispatch_to_all_bots_in_guild(uuid.UUID(server_id), evt, payload)
        except Exception:
            log.exception("dispatch_to_all_bots_in_guild failed")

    async def broadcast_to_users(self, user_ids: list[str], data: dict, exclude_user: str | None = None) -> None:
        # Published per-user — the pub-sub fabric takes care of delivering to
        # whichever replica holds each websocket.
        offline: list[str] = []
        if self._redis:
            try:
                pipe = self._redis.pipeline()
                for uid in user_ids:
                    if uid == exclude_user:
                        continue
                    pipe.publish(f"user:{uid}", json.dumps({"data": data}))
                await pipe.execute()
            except Exception:
                log.exception("broadcast_to_users publish failed, falling back")
                for uid in user_ids:
                    if uid == exclude_user:
                        continue
                    await self._send_local(uid, data)
        else:
            for uid in user_ids:
                if uid == exclude_user:
                    continue
                await self._send_local(uid, data)

        # Figure out who's offline for FCM purposes.
        for uid in user_ids:
            if uid == exclude_user:
                continue
            if not await self.is_online(uid):
                offline.append(uid)

        # Reach offline users over FCM for DM messages.
        if offline and data.get("event") == "dm_message_create":
            d = data.get("data") or {}
            author = d.get("author") or {}
            title = author.get("display_name") or author.get("username") or "HiRoo"
            body = (d.get("content") or "")[:240]
            if body:
                try:
                    from app.services.fcm import send_to_user as _fcm
                    await asyncio.gather(*[
                        _fcm(uid, title=title, body=body, data={"dm_id": d.get("dm_id", "")})
                        for uid in offline
                    ], return_exceptions=True)
                except Exception:
                    log.exception("FCM fanout failed")

        # DM-relevant bot gateway dispatch.
        try:
            from app.routers.bot_gateway import dispatch_to_bot
            from sqlalchemy import select as _select
            from app.database import AsyncSessionLocal
            from app.models.user import User as _User
            evt = data.get("event")
            payload = data.get("data") or {}
            if evt and user_ids:
                async with AsyncSessionLocal() as db:
                    rows = await db.execute(
                        _select(_User.id).where(
                            _User.id.in_([uuid.UUID(u) for u in user_ids]),
                            _User.is_bot.is_(True),
                        )
                    )
                    bot_uids = [row[0] for row in rows.all()]
                if bot_uids:
                    log.info("broadcast_to_users→bots evt=%s bots=%s", evt, bot_uids)
                    for bot_uid in bot_uids:
                        await dispatch_to_bot(bot_uid, evt, payload)
        except Exception:
            log.exception("broadcast_to_users→bots failed")

    async def is_online(self, user_id: str) -> bool:
        """Cross-replica online check.

        Fast path: if the user has a websocket on THIS replica, return True
        immediately. Otherwise ask Redis — they might be connected elsewhere.
        """
        if user_id in self._connections and self._connections[user_id]:
            return True
        if self._redis:
            try:
                v = await self._redis.get(f"online:count:{user_id}")
                if v is None:
                    return False
                return int(v) > 0
            except Exception:
                return False
        return False


manager = ConnectionManager()
