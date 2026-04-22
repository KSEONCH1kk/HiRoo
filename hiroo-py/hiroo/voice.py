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
        # Register our voice presence with the HiRoo backend so other users'
        # clients show us in the voice channel's participant list.
        try:
            await self.bot.http.request(
                "POST", "/api/voice/presence", json={"room": self.room_name},
            )
        except Exception as e:
            log.warning("voice presence register failed: %s", e)
        log.info("connected to voice room %s", self.room_name)

    async def disconnect(self) -> None:
        if self._room is not None:
            try:
                await self._room.disconnect()
            finally:
                self._room = None
        try:
            await self.bot.http.request("DELETE", "/api/voice/presence")
        except Exception:
            pass

    async def play_audio_file(self, path: str) -> None:
        """Convenience: stream a local audio file. Requires ffmpeg + livekit."""
        import os
        import shutil
        try:
            from livekit import rtc
        except ImportError as e:
            raise HiRooError("livekit required") from e
        if self._room is None:
            raise HiRooError("not connected")

        ffmpeg = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
        if not ffmpeg:
            raise HiRooError(
                "ffmpeg не найден в PATH. Установите его:\n"
                "  • Windows: winget install Gyan.FFmpeg  (или choco install ffmpeg)\n"
                "  • macOS:   brew install ffmpeg\n"
                "  • Linux:   apt install ffmpeg"
            )
        if not os.path.exists(path):
            raise HiRooError(f"Файл не найден: {path}")
        # Decode via ffmpeg to 48kHz mono PCM16 and publish as a LiveKit audio track.
        # 10 ms frames at 48 kHz mono → 480 samples → 960 bytes of s16le.
        source = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track("bot-audio", source)

        # Explicit source + publish options — without this the SFU can't match
        # the track to `canPublishSources=["microphone"]` on the token, which
        # manifests as "track publication timed out".
        options = rtc.TrackPublishOptions()
        try:
            options.source = rtc.TrackSource.SOURCE_MICROPHONE
        except AttributeError:
            pass

        try:
            await asyncio.wait_for(
                self._room.local_participant.publish_track(track, options),
                timeout=15,
            )
        except asyncio.TimeoutError:
            raise HiRooError(
                "publish_track timed out — likely a WebRTC transport issue. "
                "Check that UDP 50000-50100 to the LiveKit server is reachable "
                "from the bot machine, or enable LiveKit's TCP fallback on 7881."
            )

        proc = await asyncio.create_subprocess_exec(
            ffmpeg, "-hide_banner", "-loglevel", "error",
            "-i", path, "-f", "s16le", "-ar", "48000", "-ac", "1", "-",
            stdout=asyncio.subprocess.PIPE,
        )
        assert proc.stdout is not None
        samples_per_frame = 480            # 10 ms at 48 kHz mono
        bytes_per_frame = samples_per_frame * 1 * 2  # mono, s16le → 2 bytes per sample

        def _make_frame(pcm: bytes):
            # livekit-python has two shapes across versions; try the modern
            # constructor first, fall back to the older `.create` + memoryview.
            try:
                return rtc.AudioFrame(
                    data=pcm,
                    sample_rate=48000,
                    num_channels=1,
                    samples_per_channel=samples_per_frame,
                )
            except TypeError:
                f = rtc.AudioFrame.create(48000, 1, samples_per_frame)
                # Cast the int16-typed memoryview down to raw bytes for assignment.
                try:
                    mv = f.data.cast("B")  # "B" = unsigned char
                except AttributeError:
                    mv = memoryview(f.data)
                mv[:] = pcm
                return f

        try:
            while True:
                chunk = await proc.stdout.readexactly(bytes_per_frame)
                await source.capture_frame(_make_frame(chunk))
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
    try:
        bot._register_voice_connection(vc)
    except AttributeError:
        pass
    return vc
