import json
import uuid
import asyncio
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

    def voice_join(self, user_id: str, room_id: str) -> list[str]:
        """Add user to voice room, leave previous one. Returns existing peers (before join)."""
        self.voice_leave(user_id)
        existing = list(self._voice_rooms.get(room_id, set()))
        self._voice_rooms.setdefault(room_id, set()).add(user_id)
        self._user_voice_room[user_id] = room_id
        return existing

    def voice_leave(self, user_id: str) -> tuple[str | None, list[str]]:
        """Remove user from current voice room. Returns (room_id, remaining_peers)."""
        room_id = self._user_voice_room.pop(user_id, None)
        if not room_id:
            return None, []
        members = self._voice_rooms.get(room_id, set())
        members.discard(user_id)
        remaining = list(members)
        if not members:
            self._voice_rooms.pop(room_id, None)
        return room_id, remaining

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

    async def broadcast_to_users(self, user_ids: list[str], data: dict, exclude_user: str | None = None):
        tasks = []
        for uid in user_ids:
            if uid == exclude_user:
                continue
            tasks.append(self.send_to_user(uid, data))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def is_online(self, user_id: str) -> bool:
        return user_id in self._connections and bool(self._connections[user_id])


manager = ConnectionManager()
