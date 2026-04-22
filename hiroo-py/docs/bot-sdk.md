# Python SDK — `hiroo.py`

## Установка

```bash
pip install -e ./hiroo-py
# опционально для voice:
pip install livekit
```

## Класс `Bot`

```python
bot = hiroo.Bot(
    intents: hiroo.Intents | int = hiroo.Intents.default(),
    base_url: str = "https://hiroo.intave.tech",
    application_id: str | None = None,     # UUID приложения из /developers
    shard_count: int = 1,                  # см. Shards
)
```

- `intents` — битфилд событий, которые бот хочет получать. См. [Intents](./intents.md).
- `application_id` — если указан, SDK автоматически регистрирует slash-команды на событии `READY`. Без него команды нужно регистрировать руками через `bot.http.register_command(...)`.
- `shard_count` — количество параллельных gateway-соединений. Для малых ботов достаточно 1.

## Запуск

```python
bot.run("Bot " + TOKEN)   # префикс "Bot " опционален — SDK проставит сам
```

Блокирующий вызов. Внутри: поднимает N шардов, ходит по HTTP, слушает события, закрывает всё на `KeyboardInterrupt`.

## Декораторы

### `@bot.event`

Имя функции = имя события (без префикса `on_`):

```python
@bot.event
async def on_ready():
    print("ready")

@bot.event
async def on_message(msg: hiroo.Message):
    ...
```

Aliases: `on_message` → `message_create`, `on_message_edit` → `message_update`, `on_reaction` → `reaction_add`, `on_member_join` → `guild_member_add`, `on_voice_state` → `voice_state_update`, `on_presence` → `presence_update`.

Полный список raw-имён событий см. [Gateway Protocol](./gateway.md).

### `@bot.slash_command(...)`

```python
@bot.slash_command(name="echo", description="Echo text", guild_id=None)
async def echo(ctx: hiroo.CommandContext, text: str, count: int = 1):
    await ctx.respond(text * count)
```

- Параметры функции становятся опциями команды. Типы выводятся из аннотаций (`str`/`int`/`bool`/`float`).
- `guild_id=None` — глобальная команда (доступна везде, где бот). Указание конкретного UUID ограничивает команду одним сервером.
- `required` определяется наличием default-значения.

### `@bot.component(custom_id)`

Обработчик клика по кнопке или select-меню:

```python
@bot.component("like")
async def on_like(ctx: hiroo.CommandContext):
    await ctx.respond("Thanks!", ephemeral=True)
```

## `CommandContext`

Объект, переданный в slash-команду или component-handler:

```python
ctx.author            # User | None
ctx.channel_id        # str | None
ctx.dm_id             # str | None
ctx.interaction_id    # str | None — для interactions, иначе None
ctx.args              # dict[str, Any] — разобранные аргументы
ctx.message           # Message | None — если контекст из text-message
ctx.interaction       # dict | None — сырой payload interaction

await ctx.respond(content="", embed=None, components=None, ephemeral=False)
await ctx.defer()     # показывает "бот думает", даёт 15 минут на followup
await ctx.followup(content="", embed=None, components=None)
```

`ephemeral=True` работает только внутри interactions — показывает сообщение только вызвавшему юзеру (как в Discord).

## Embeds

```python
from hiroo import Embed

e = Embed(title="Status", description="All green", color=0x3ecf8e)
e.add_field("Uptime", "42d", inline=True)
e.add_field("Members", "1337", inline=True)
e.footer_text = "HiRoo Bot"
e.thumbnail_url = "https://example.com/logo.png"

await ctx.respond(embed=e)
```

## Interactive components

```python
from hiroo import ActionRow, Button, ButtonStyle, SelectMenu, SelectOption

await ctx.respond(
    "Выбери:",
    components=[
        ActionRow(components=[
            Button("Like",   ButtonStyle.SUCCESS, custom_id="like"),
            Button("Dislike", ButtonStyle.DANGER,  custom_id="dislike"),
            Button("Docs",    ButtonStyle.LINK,    url="https://hiroo.intave.tech/docs"),
        ]),
        ActionRow(components=[
            SelectMenu(custom_id="pick_color", options=[
                SelectOption(label="Red",   value="red"),
                SelectOption(label="Green", value="green"),
                SelectOption(label="Blue",  value="blue"),
            ]),
        ]),
    ],
)

@bot.component("pick_color")
async def on_color(ctx):
    chosen = ctx.interaction["data"]["values"][0]
    await ctx.respond(f"Вы выбрали {chosen}", ephemeral=True)
```

## Raw HTTP

Для всего, что не покрыто высокоуровневыми методами, используйте `bot.http`:

```python
data = await bot.http.request("GET", "/api/servers/UUID/channels")
```

См. полный список эндпоинтов в [REST API](./rest-api.md).

## Голос

```python
vc = await bot.connect_voice(channel_id="...")
await vc.play_audio_file("track.mp3")
await vc.disconnect()
```

Требует `pip install livekit` + `ffmpeg` в PATH. Детали в [Voice](./voice.md).

## Shards

Для тысяч серверов используйте `shard_count > 1`. Распределение guild_id по шардам — `guild_uuid.int % shard_count`. Подробнее в [Shards](./shards.md).

## Обработка ошибок

```python
from hiroo import HTTPError, HiRooError

try:
    await bot.http.register_command(...)
except HTTPError as e:
    print(e.status, e.data)
```

## Graceful shutdown

`bot.run()` ловит Ctrl+C и закрывает все шарды + HTTP-сессию. В backend-е при дисконнекте бота автоматически вычищается его voice-presence и status переводится в offline.
