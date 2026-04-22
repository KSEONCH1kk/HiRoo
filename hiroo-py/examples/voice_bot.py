"""Bot that joins a voice channel and streams an audio file.

Prereqs:
    pip install -e ./hiroo-py
    pip install livekit

Usage:
    HIROO_TOKEN=... HIROO_APP_ID=... python examples/voice_bot.py

In a server where the bot is a member, type `/vjoin` in any text channel.
The bot picks the first voice channel it can see and joins. `/vleave`
disconnects. `/vplay <path>` plays a local audio file via ffmpeg.
"""
import asyncio
import os

import hiroo


bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT | hiroo.Intents.GUILD_VOICE_STATES,
    base_url=os.environ.get("HIROO_BASE_URL", "https://hiroo.intave.tech"),
    application_id="85102224-beff-445f-b34d-78640c59ec1d",
)

# Track the bot's active voice connection per guild so /vleave can find it.
_voice: dict[str, object] = {}


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.username}")


@bot.slash_command(description="Join the first voice channel on this server")
async def vjoin(ctx: hiroo.CommandContext):
    guild_id = (ctx.interaction or {}).get("guild_id")
    if not guild_id:
        await ctx.respond("Эта команда работает только в сервере.", ephemeral=True)
        return
    channels = await bot.http.get_guild_channels(guild_id)
    voice = next((c for c in channels if c.get("type") == "voice"), None)
    if not voice:
        await ctx.respond("На этом сервере нет голосовых каналов.", ephemeral=True)
        return
    await ctx.defer()
    try:
        vc = await bot.connect_voice(channel_id=voice["id"])
    except hiroo.HiRooError as e:
        await ctx.followup(f"Voice error: {e}")
        return
    _voice[guild_id] = vc
    await ctx.followup(f"Подключился к `#{voice.get('name')}` ✅")


@bot.slash_command(description="Leave voice")
async def vleave(ctx: hiroo.CommandContext):
    guild_id = (ctx.interaction or {}).get("guild_id")
    vc = _voice.pop(guild_id, None) if guild_id else None
    if vc is None:
        await ctx.respond("Я не в голосовом канале тут.", ephemeral=True)
        return
    await vc.disconnect()
    await ctx.respond("Отключился.")


@bot.slash_command(description="Play a local audio file (server-side path)")
async def vplay(ctx: hiroo.CommandContext, path: str):
    guild_id = (ctx.interaction or {}).get("guild_id")
    vc = _voice.get(guild_id) if guild_id else None
    if vc is None:
        await ctx.respond("Сначала /vjoin.", ephemeral=True)
        return
    await ctx.defer()
    try:
        await vc.play_audio_file(path)
    except Exception as e:
        await ctx.followup(f"Ошибка: {e}")
        return
    await ctx.followup("Поток пошёл 🎵")


if __name__ == "__main__":
    bot.run("RjTwkOjOQHOfBRsE7-2EZQ.AGnomEg.afc9bc3005387d8ac40d54a7fb3")
