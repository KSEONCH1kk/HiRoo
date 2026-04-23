# hiroo-py

Официальный Python-клиент для HiRoo (бот-шлюз + REST API).

Поддерживает: WebSocket-шлюз с авто-переподключением, слэш-команды с
авто-регистрацией, интеракции (кнопки/селекты), REST-хелперы для
сообщений/каналов/модерации/ролей, голосовое подключение через LiveKit
(экспериментально).

---

## Содержание

1. [Установка](#установка)
2. [Первый бот за 60 секунд](#первый-бот-за-60-секунд)
3. [Intents](#intents)
4. [События](#события)
5. [Слэш-команды](#слэш-команды)
6. [Интеракции и компоненты](#интеракции-и-компоненты)
7. [REST API: сообщения](#rest-api-сообщения)
8. [REST API: каналы](#rest-api-каналы)
9. [REST API: участники и модерация](#rest-api-участники-и-модерация)
10. [REST API: роли](#rest-api-роли)
11. [Шардинг](#шардинг)
12. [Голосовые каналы (экспериментально)](#голосовые-каналы-экспериментально)
13. [Ошибки и отладка](#ошибки-и-отладка)

---

## Установка

Python ≥ 3.10.

```bash
pip install -e ./hiroo-py
```

Либо прямо из локального пути:

```bash
pip install ./hiroo-py
```

Зависимости подтянутся автоматически: `aiohttp`, `websockets`.

## Первый бот за 60 секунд

```python
import hiroo

bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT,
    application_id="YOUR_APP_UUID",   # необязательно — нужен только для auto-register слэш-команд
)

@bot.event
async def on_ready():
    print(f"Залогинен как {bot.user.username}")

@bot.event
async def on_message(msg: hiroo.Message):
    if msg.content == "!ping":
        await msg.reply("pong")

@bot.slash_command(description="Эхо")
async def echo(ctx: hiroo.CommandContext, text: str):
    await ctx.respond(text)

bot.run("YOUR_BOT_TOKEN")
```

Токен бота можно выдать на `/developers` в дашборде — HiRoo возвращает строку,
которую передают в `bot.run`; префикс `Bot ` добавляется автоматически.

## Intents

Intent-флаги управляют тем, какие события шлюз будет посылать боту.
Привилегированные интенты (`GUILD_MEMBERS`, `GUILD_PRESENCES`,
`MESSAGE_CONTENT`) нужно включить в дашборде.

```python
from hiroo import Intents

# Только то, что бесплатно:
intents = Intents.default()

# Всё включая привилегированные:
intents = Intents.all()

# Ручная сборка:
intents = (
    Intents.GUILDS
    | Intents.GUILD_MESSAGES
    | Intents.MESSAGE_CONTENT
    | Intents.GUILD_VOICE_STATES
)
```

Полный список:
`GUILDS`, `GUILD_MEMBERS`, `GUILD_BANS`, `GUILD_VOICE_STATES`, `GUILD_PRESENCES`,
`GUILD_MESSAGES`, `GUILD_MESSAGE_REACTIONS`, `GUILD_MESSAGE_TYPING`,
`DIRECT_MESSAGES`, `DIRECT_MESSAGE_REACTIONS`, `DIRECT_MESSAGE_TYPING`,
`MESSAGE_CONTENT`, `GUILD_SCHEDULED_EVENTS`.

## События

Декоратор `@bot.event` регистрирует корутину — имя события берётся из имени
функции, префикс `on_` убирается. Discord-совместимые алиасы маппятся
автоматически (`on_message` → `message_create`, `on_reaction` → `reaction_add`
и т.д.).

```python
@bot.event
async def on_ready(): ...
@bot.event
async def on_message(msg: hiroo.Message): ...
@bot.event
async def on_message_update(data: dict): ...
@bot.event
async def on_reaction_add(data: dict): ...
@bot.event
async def on_member_join(data: dict): ...            # guild_member_add
@bot.event
async def on_voice_state(data: dict): ...            # voice_state_update
@bot.event
async def on_interaction_create(data: dict): ...
```

Обработчики могут быть как с аргументом `payload`, так и без (для `on_ready`).
Для «сырых» событий, не указанных в алиасах, используйте оригинальное имя
из шлюза: `guild_create`, `channel_update`, `typing_start` и т.д.

## Слэш-команды

```python
@bot.slash_command(description="Сложить два числа")
async def add(ctx: hiroo.CommandContext, a: int, b: int):
    await ctx.respond(str(a + b))

@bot.slash_command(description="Пинг с флагом")
async def ping(ctx, verbose: bool = False):
    if verbose:
        await ctx.respond(f"pong · latency=<...>")
    else:
        await ctx.respond("pong")
```

- Тип параметра определяется по аннотации: `str` → 3, `int` → 4, `bool` → 5,
  `float` → 10.
- Обязательность определяется по наличию дефолта: `a: int` — обязателен,
  `verbose: bool = False` — нет.
- Команды авто-регистрируются при `on_ready`, если задан `application_id`.
  Без `application_id` можно использовать их только через текстовые
  `/add 1 2` — парсер сам разберёт аргументы.

`CommandContext` в обработчике предоставляет:
- `ctx.respond(content, *, embed=None, components=None, ephemeral=False)`
- `ctx.defer()` — показать пользователю «Бот думает…»
- `ctx.followup(content, ...)` — отправить после `defer`
- `ctx.channel_id`, `ctx.dm_id`, `ctx.interaction_id`, `ctx.args`
- `ctx.author` — объект `User`

## Интеракции и компоненты

```python
from hiroo import Button, ButtonStyle, ActionRow, SelectMenu, SelectOption, Embed

@bot.slash_command(description="Пример кнопок")
async def panel(ctx):
    await ctx.respond(
        "Выбери действие:",
        components=[ActionRow(components=[
            Button(label="OK", style=ButtonStyle.SUCCESS, custom_id="ok_btn"),
            Button(label="Отмена", style=ButtonStyle.DANGER, custom_id="cancel_btn"),
        ])],
    )

@bot.component("ok_btn")
async def on_ok(ctx):
    await ctx.respond("Вы нажали OK", ephemeral=True)

@bot.component("cancel_btn")
async def on_cancel(ctx):
    await ctx.respond("Отменено")
```

Embed:

```python
await msg.reply(embed=Embed(
    title="Привет", description="Это эмбед.",
    color=0x7c5cff, fields=[{"name": "Статус", "value": "OK", "inline": True}],
))
```

## REST API: сообщения

Весь доступ к REST — через `bot.http` (экземпляр `HTTPClient`). Все методы
асинхронные.

```python
# Отправка
await bot.http.send_message(channel_id="...", content="Привет")
await bot.http.send_message(dm_id="...", content="Привет",
                             embeds=[Embed(title="Тест")],
                             reply_to_id="<msg_id>")

# Редактирование / удаление
await bot.http.edit_message(channel_id, msg_id, "новый текст")
await bot.http.delete_message(channel_id, msg_id)

# Для DM-сообщений — отдельные методы
await bot.http.edit_dm_message(dm_id, msg_id, "new")
await bot.http.delete_dm_message(dm_id, msg_id)

# Реакции
await bot.http.add_reaction(channel_id, msg_id, "👍")
await bot.http.remove_reaction(channel_id, msg_id, "👍")

# Закрепление
await bot.http.pin_message(channel_id, msg_id)
await bot.http.unpin_message(channel_id, msg_id)
pinned = await bot.http.list_pinned(channel_id)

# То же для DM
await bot.http.pin_dm_message(dm_id, msg_id)
await bot.http.unpin_dm_message(dm_id, msg_id)
await bot.http.list_dm_pinned(dm_id)
```

## REST API: каналы

```python
# Получить список каналов сервера
channels = await bot.http.get_guild_channels(guild_id)

# Создать текстовый канал в категории
cat = next(c for c in channels if c["type"] == "category" and c["name"] == "Чат")
new = await bot.http.create_channel(
    guild_id, "general",
    type="text",                 # text | voice | announcement | category | forum
    parent_id=cat["id"],
    is_private=False,
    topic="Общий чат",
)

# Переименовать
await bot.http.update_channel(guild_id, new["id"], name="общий")

# Удалить
await bot.http.delete_channel(guild_id, new["id"])
```

Для создания каналов нужно право `MANAGE_CHANNELS`.

## REST API: участники и модерация

```python
# Кик
await bot.http.kick_member(guild_id, user_id)

# Бан
await bot.http.ban_member(guild_id, user_id, reason="Спам")
await bot.http.unban_member(guild_id, user_id)
bans = await bot.http.list_bans(guild_id)

# Тайм-аут (на секунды, до 28 дней)
await bot.http.set_timeout(guild_id, user_id, duration_seconds=3600, reason="Маты")
await bot.http.clear_timeout(guild_id, user_id)

# Сменить ник / роль участника
await bot.http.update_member(guild_id, user_id, nickname="Новый ник")
await bot.http.update_member(guild_id, user_id, role="admin")   # owner|admin|member
```

## REST API: роли

```python
roles = await bot.http.list_roles(guild_id)

role = await bot.http.create_role(
    guild_id, "Модераторы",
    color="#5b8af0", permissions=(1 << 13),   # MANAGE_MESSAGES
    hoist=True, mentionable=True,
)

await bot.http.update_role(guild_id, role["id"], name="Мододеры")
await bot.http.delete_role(guild_id, role["id"])

# Роли одного участника
role_ids = await bot.http.get_member_roles(guild_id, user_id)
await bot.http.set_member_roles(guild_id, user_id, role_ids + [role["id"]])
```

## Шардинг

```python
bot = hiroo.Bot(intents=..., shard_count=4)
```

Каждый шард — отдельное WS-соединение; события распределяются по
`guild_id % shard_count == shard_id`. Для ботов до ~1000 серверов достаточно
одного шарда.

## Голосовые каналы (экспериментально)

```python
vc = await bot.connect_voice(channel_id="...")
await vc.play_file("/path/to/music.mp3")
await vc.disconnect()
```

Требует `pip install livekit`. Публикация аудио идёт через LiveKit SFU.

## Ошибки и отладка

- `hiroo.HTTPError` — статус-код и тело ответа; поднимается из любого
  REST-метода на 4xx/5xx.
- `hiroo.GatewayError` — ошибки WebSocket-сессии (invalid session, отсутствие
  HELLO и т.п.). Сам `GatewayClient` авто-переподключается с экспоненциальной
  паузой.
- Логи пишутся в логгер `hiroo.*`. Включите `logging.basicConfig(level="INFO")`
  для просмотра.

Graceful shutdown: `Ctrl+C` → бот отключит голос, снесёт presence, закроет
шарды, вернёт управление.
