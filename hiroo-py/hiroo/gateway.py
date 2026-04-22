"""WebSocket gateway client. One instance per shard."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Optional

import aiohttp

from .errors import GatewayError
from .intents import Intents

log = logging.getLogger("hiroo.gateway")


OP_DISPATCH = 0
OP_HEARTBEAT = 1
OP_IDENTIFY = 2
OP_RESUME = 6
OP_RECONNECT = 7
OP_INVALID_SESSION = 9
OP_HELLO = 10
OP_HEARTBEAT_ACK = 11


class GatewayClient:
    """Single-shard WebSocket connection."""

    def __init__(self, *, url: str, token: str, intents: Intents,
                 shard_id: int, shard_count: int,
                 on_dispatch: Callable[[str, dict], "asyncio.Future | None"]):
        self.url = url.rstrip("/")
        self.token = token
        self.intents = int(intents)
        self.shard_id = shard_id
        self.shard_count = shard_count
        self.on_dispatch = on_dispatch

        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._heartbeat_interval: float = 41.0
        self._closed = False

    async def connect(self, *, session: aiohttp.ClientSession) -> None:
        attempts = 0
        while not self._closed:
            try:
                ws_url = f"{self.url}/api/bot/gateway"
                async with session.ws_connect(ws_url, heartbeat=None, max_msg_size=16 * 1024 * 1024) as ws:
                    self._ws = ws
                    attempts = 0
                    await self._run_session(ws)
            except Exception as e:
                log.warning("gateway error (shard=%s): %s", self.shard_id, e)
            if self._closed:
                break
            # Exponential backoff, capped at 60s.
            wait = min(60, 2 ** min(attempts, 6))
            attempts += 1
            await asyncio.sleep(wait)

    async def _run_session(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        # Expect HELLO first.
        first = await ws.receive_json(timeout=30)
        if first.get("op") != OP_HELLO:
            raise GatewayError(f"Expected HELLO, got {first}")
        self._heartbeat_interval = (first["d"]["heartbeat_interval"] / 1000.0)

        # Identify.
        await ws.send_json({
            "op": OP_IDENTIFY,
            "d": {
                "token": self.token,
                "intents": self.intents,
                "shard": [self.shard_id, self.shard_count],
            },
        })

        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(ws))
        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    op = data.get("op")
                    if op == OP_DISPATCH:
                        t = data.get("t") or ""
                        try:
                            coro = self.on_dispatch(t.lower(), data.get("d") or {})
                            if asyncio.iscoroutine(coro):
                                asyncio.create_task(coro)
                        except Exception:
                            log.exception("on_dispatch error")
                    elif op == OP_HEARTBEAT_ACK:
                        pass
                    elif op == OP_RECONNECT:
                        await ws.close()
                        return
                    elif op == OP_INVALID_SESSION:
                        raise GatewayError("Session invalidated by server")
                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
        finally:
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
                self._heartbeat_task = None

    async def _heartbeat_loop(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        try:
            while not ws.closed:
                await asyncio.sleep(self._heartbeat_interval)
                await ws.send_json({"op": OP_HEARTBEAT})
        except asyncio.CancelledError:
            pass

    async def close(self) -> None:
        self._closed = True
        if self._ws and not self._ws.closed:
            await self._ws.close()
