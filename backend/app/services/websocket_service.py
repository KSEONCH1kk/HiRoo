import json
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Any
import redis.asyncio as aioredis
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets
        self._connections: dict[str, set[WebSocket]] = {}
        # channel_id -> set of user_ids
        self._channel_members: dict[str, set[str]] = {}
        # server_id -> set of user_ids
        self._server_members: dict[str, set[str]] = {}
        # voice room_id -> set of user_ids
        self._voice_rooms: dict[str, set[str]] = {}
        # user_id -> room_id
        self._user_voice_room: dict[str, str] = {}
        # room_id -> (started_at, starter_user_id, call_log_msg_id)
        self._voice_room_meta: dict[str, tuple[datetime, str, str | None]] = {}
        # server-imposed restrictions (persist until admin lifts)
        self._server_muted: set[str] = set()
        self._server_deafened: set[str] = set()

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

    def voice_join(self, user_id: str, room_id: str) -> tuple[list[str], bool]:
        """Add user to voice room, leave previous one.
        Returns (existing_peers_before_join, is_new_call_started)."""
        self.voice_leave(user_id)
        existing = list(self._voice_rooms.get(room_id, set()))
        self._voice_rooms.setdefault(room_id, set()).add(user_id)
        self._user_voice_room[user_id] = room_id
        is_new = False
        if room_id not in self._voice_room_meta:
            self._voice_room_meta[room_id] = (datetime.now(timezone.utc), user_id, None)
            is_new = True
        return existing, is_new

    def set_call_log_msg_id(self, room_id: str, msg_id: str) -> None:
        meta = self._voice_room_meta.get(room_id)
        if meta:
            self._voice_room_meta[room_id] = (meta[0], meta[1], msg_id)

    def voice_leave(self, user_id: str) -> tuple[str | None, list[str], tuple[datetime, str, str | None] | None]:
        """Remove user. Returns (room_id, remaining_peers, call_meta_if_ended)."""
        room_id = self._user_voice_room.pop(user_id, None)
        if not room_id:
            return None, [], None
        members = self._voice_rooms.get(room_id, set())
        members.discard(user_id)
        remaining = list(members)
        ended_meta: tuple[datetime, str, str | None] | None = None
        if not members:
            self._voice_rooms.pop(room_id, None)
            ended_meta = self._voice_room_meta.pop(room_id, None)
        return room_id, remaining, ended_meta

    def voice_room_of(self, user_id: str) -> str | None:
        return self._user_voice_room.get(user_id)

    def voice_room_members(self, room_id: str) -> list[str]:
        return list(self._voice_rooms.get(room_id, set()))

    def connect(self, user_id: str, ws: WebSocket):
        self._connections.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self._connections:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                del self._connections[user_id]

    def join_server(self, server_id: str, user_id: str):
        self._server_members.setdefault(server_id, set()).add(user_id)

    def leave_server(self, server_id: str, user_id: str):
        if server_id in self._server_members:
            self._server_members[server_id].discard(user_id)

    async def send_to_user(self, user_id: str, data: dict):
        sockets = self._connections.get(user_id, set()).copy()
        dead = set()
        for ws in sockets:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[user_id].discard(ws)

    async def broadcast_to_server(self, server_id: str, data: dict, exclude_user: str | None = None):
        members = self._server_members.get(server_id, set()).copy()
        tasks = []
        for uid in members:
            if uid == exclude_user:
                continue
            tasks.append(self.send_to_user(uid, data))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        # Mirror the event to any bots in this guild via the bot gateway.
        try:
            import uuid as _uuid
            import logging as _logging
            from app.routers.bot_gateway import dispatch_to_all_bots_in_guild
            evt = data.get("event")
            payload = data.get("data") or {}
            if evt:
                _logging.getLogger("hiroo.ws").info(
                    "broadcast→bots guild=%s evt=%s", server_id, evt,
                )
                await dispatch_to_all_bots_in_guild(_uuid.UUID(server_id), evt, payload)
        except Exception:
            import logging as _logging
            _logging.getLogger("hiroo.ws").exception("dispatch_to_all_bots_in_guild failed")

    async def broadcast_to_users(self, user_ids: list[str], data: dict, exclude_user: str | None = None):
        tasks = []
        offline: list[str] = []
        for uid in user_ids:
            if uid == exclude_user:
                continue
            if self.is_online(uid):
                tasks.append(self.send_to_user(uid, data))
            else:
                offline.append(uid)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        # Reach offline users over FCM for DM messages — the one event where
        # push has clearest value. Mentions inside servers go through a
        # separate path (routers/messages.py) since we need server context.
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
                    import logging as _l
                    _l.getLogger("hiroo.ws").exception("FCM fanout failed")
        # For DM broadcasts, dispatch to any bot that's a DM participant.
        try:
            import logging as _logging
            from app.routers.bot_gateway import dispatch_to_bot
            from sqlalchemy import select as _select
            from app.database import AsyncSessionLocal
            from app.models.user import User as _User
            evt = data.get("event")
            payload = data.get("data") or {}
            if evt and user_ids:
                import uuid as _uuid
                async with AsyncSessionLocal() as db:
                    rows = await db.execute(
                        _select(_User.id).where(
                            _User.id.in_([_uuid.UUID(u) for u in user_ids]),
                            _User.is_bot.is_(True),
                        )
                    )
                    bot_uids = [row[0] for row in rows.all()]
                if bot_uids:
                    _logging.getLogger("hiroo.ws").info(
                        "broadcast_to_users→bots evt=%s bots=%s", evt, bot_uids,
                    )
                    for bot_uid in bot_uids:
                        await dispatch_to_bot(bot_uid, evt, payload)
        except Exception:
            import logging as _logging
            _logging.getLogger("hiroo.ws").exception("broadcast_to_users→bots failed")

    def is_online(self, user_id: str) -> bool:
        return user_id in self._connections and bool(self._connections[user_id])


manager = ConnectionManager()
