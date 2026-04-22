"""Voice connections for bots.

HiRoo delegates actual audio transport to LiveKit. A bot joins a voice channel
by:

  1. Asking the HiRoo API for a LiveKit token scoped to the target room.
  2. Connecting to the LiveKit SFU with the `livekit` Python SDK.

Because pulling in the ~30 MB livekit SDK would be painful for many users who
don't need voice, we only import it on demand. Install with:

    pip install livekit

Usage::

    vc = await bot.connect_voice(guild_id=..., channel_id=...)
    await vc.play_audio_file("greeting.opus")
    await vc.disconnect()
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

from .errors import HiRooError

if TYPE_CHECKING:
    from .client import Bot

log = logging.getLogger("hiroo.voice")


@dataclass
class VoiceConnection:
    bot: "Bot"
    room_name: str
    livekit_url: str
    livekit_token: str
    _room: object | None = None  # livekit.rtc.Room

    async def connect(self) -> None:
        try:
            from livekit import rtc
        except ImportError as e:
            raise HiRooError(
                "voice support requires the `livekit` package. Install with: pip install livekit"
            ) from e
        self._room = rtc.Room()
        await self._room.connect(self.livekit_url, self.livekit_token, rtc.RoomOptions(
            auto_subscribe=True, dynacast=True,
        ))
        log.info("connected to voice room %s", self.room_name)

    async def disconnect(self) -> None:
        if self._room is not None:
            try:
                await self._room.disconnect()
            finally:
                self._room = None

    async def play_audio_file(self, path: str) -> None:
        """Convenience: stream a local audio file. Requires ffmpeg + livekit."""
        try:
            from livekit import rtc
        except ImportError as e:
            raise HiRooError("livekit required") from e
        if self._room is None:
            raise HiRooError("not connected")
        # Decode via ffmpeg to 48kHz mono PCM16 and publish as a LiveKit audio track.
        source = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track("bot-audio", source)
        await self._room.local_participant.publish_track(track)

        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", path, "-f", "s16le", "-ar", "48000", "-ac", "1", "-",
            stdout=asyncio.subprocess.PIPE,
        )
        assert proc.stdout is not None
        frame_ms = 10
        bytes_per_frame = (48000 // (1000 // frame_ms)) * 2  # 960 samples * 2 bytes
        try:
            while True:
                chunk = await proc.stdout.readexactly(bytes_per_frame)
                frame = rtc.AudioFrame.create(48000, 1, 480)
                frame.data[:] = chunk
                await source.capture_frame(frame)
        except asyncio.IncompleteReadError:
            pass
        finally:
            try: proc.kill()
            except Exception: pass
            await proc.wait()


async def _get_voice_token(bot: "Bot", room: str) -> tuple[str, str]:
    """Fetch a LiveKit token from the HiRoo API."""
    data = await bot.http.request("GET", "/api/voice/token", params={"room": room})
    return data["url"], data["token"]


async def connect_voice(bot: "Bot", *, guild_id: Optional[str] = None, channel_id: Optional[str] = None,
                        dm_id: Optional[str] = None) -> VoiceConnection:
    if channel_id:
        room = f"channel:{channel_id}"
    elif dm_id:
        room = f"dm:{dm_id}"
    else:
        raise ValueError("Provide channel_id or dm_id")
    url, token = await _get_voice_token(bot, room)
    vc = VoiceConnection(bot=bot, room_name=room, livekit_url=url, livekit_token=token)
    await vc.connect()
    return vc
