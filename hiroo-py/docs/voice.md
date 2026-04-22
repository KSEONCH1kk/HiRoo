# Voice

HiRoo использует LiveKit SFU для голоса и видео. Бот подключается тем же протоколом что и обычный веб-клиент.

## Требования

```bash
pip install livekit       # WebRTC стек
# + ffmpeg в PATH для стриминга файлов
```

**Windows:**
```powershell
winget install Gyan.FFmpeg
```

**Linux/macOS:**
```bash
apt install ffmpeg       # или brew install ffmpeg
```

## Подключение

```python
vc = await bot.connect_voice(channel_id="CHANNEL_UUID")
# или в DM-звонок:
vc = await bot.connect_voice(dm_id="DM_UUID")

# Проиграть файл
await vc.play_audio_file("intro.mp3")

# Отключиться
await vc.disconnect()
```

Что происходит под капотом:

1. SDK делает `GET /api/voice/token?room=channel:<UUID>` — получает URL LiveKit и JWT.
2. Поднимает WebRTC-соединение через нативный livekit SDK.
3. `POST /api/voice/presence` — сообщает бэкенду, что бот зашёл в voice-комнату. Фронтенды всех участников получают `voice_peer_joined` и видят бота в списке.
4. `play_audio_file()` публикует audio-track (source=MICROPHONE). Фронтенд видит бота как «говорящего».
5. `disconnect()` закрывает WebRTC + `DELETE /api/voice/presence`.

При краше бота (Ctrl+C, SIGTERM) бэкенд всё равно вычистит его voice-presence, когда WS gateway-соединение закроется.

## Права

- На channel-комнатах у бота должен быть `CONNECT_VOICE`. При invite через OAuth2 бот получает роль `member`, у которой есть дефолт `@everyone`.
- Публикация звука (`SPEAK_VOICE`) для ботов не требует отдельной роли — бэкенд автоматически выдаёт им `canPublish: true` с полным набором источников.

## Полный пример (voice_bot.py)

```python
import asyncio
import os
import hiroo

bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.GUILD_VOICE_STATES,
    application_id=os.environ["HIROO_APP_ID"],
)

_vc: dict[str, object] = {}

@bot.slash_command(description="Join the first voice channel")
async def vjoin(ctx):
    guild_id = ctx.interaction.get("guild_id")
    channels = await bot.http.get_guild_channels(guild_id)
    voice = next((c for c in channels if c.get("type") == "voice"), None)
    if not voice:
        await ctx.respond("Нет голосовых каналов", ephemeral=True)
        return
    await ctx.defer()
    vc = await bot.connect_voice(channel_id=voice["id"])
    _vc[guild_id] = vc
    await ctx.followup(f"Подключился к #{voice['name']}")

@bot.slash_command(description="Play a file")
async def vplay(ctx, path: str):
    vc = _vc.get(ctx.interaction.get("guild_id"))
    if not vc:
        await ctx.respond("Сначала /vjoin", ephemeral=True)
        return
    await ctx.defer()
    await vc.play_audio_file(path)
    await ctx.followup("Поток пошёл 🎵")

@bot.slash_command(description="Leave voice")
async def vleave(ctx):
    guild_id = ctx.interaction.get("guild_id")
    vc = _vc.pop(guild_id, None)
    if not vc:
        await ctx.respond("Я не в войсе", ephemeral=True)
        return
    await vc.disconnect()
    await ctx.respond("Вышел")

bot.run(os.environ["HIROO_TOKEN"])
```

## Приём аудио от других участников

```python
vc = await bot.connect_voice(channel_id="...")
# vc._room — объект livekit.rtc.Room
@vc._room.on("track_subscribed")
def on_track(track, publication, participant):
    if track.kind == rtc.TrackKind.KIND_AUDIO:
        print(f"subscribed to {participant.identity}")
        # обработка audio: track.on("frame_received", ...)
```

## Известные ограничения

- **Одно соединение на процесс** — класс `VoiceConnection` не мультиплексирует. Для нескольких звонков одновременно держите несколько `VoiceConnection` в словаре по guild.
- **ICE transport** — бот должен быть в состоянии открыть UDP 50000-50100 к LiveKit-серверу. При строгом NAT используйте TCP fallback (порт 7881).

## Troubleshooting

**`track publication timed out`** — чаще всего токен не разрешает публиковать из-за ролей. У бота должны быть полные publish-права (SDK это делает автоматически). Второй вариант — UDP-порты недоступны.

**`memoryview assignment: lvalue and rvalue have different structures`** — старая версия `livekit`, обновите: `pip install -U livekit`.

**`[WinError 2] Не удаётся найти указанный файл`** — ffmpeg не в PATH. Установите и перезапустите терминал.
