# Interactions

Interactions — способ пользователя вызвать код бота **не через текстовое сообщение**: клик по кнопке, выбор в select-меню, использование slash-команды из picker'а.

## Жизненный цикл

```
┌───────────────┐      POST /api/interactions         ┌───────────────┐
│ Пользователь  │ ───────────────────────────────▶    │   HiRoo API    │
└───────────────┘                                       └───────┬───────┘
                                                               │ Gateway: INTERACTION_CREATE
                                                               ▼
                                                       ┌───────────────┐
                                                       │      Бот       │
                                                       └───────┬───────┘
                                                               │ POST .../callback
                                                               ▼
                                                       ┌───────────────┐
                                                       │   HiRoo API    │
                                                       └───────┬───────┘
                                                               │ WS к пользователю
                                                               ▼
                                                       ┌───────────────┐
                                                       │ Пользователь  │
                                                       └───────────────┘
```

Бот должен ответить в течение **~3 секунд**, иначе кнопка зависнет в loading state. Если нужно больше — используйте `ctx.defer()` и потом `ctx.followup()`.

## Три типа ответов

| Type | Название | Что делает |
|---:|---|---|
| 4 | MESSAGE | создаёт новое сообщение |
| 5 | DEFER | показывает «bot is thinking», можно ответить через `followup` |
| 6 | UPDATE | редактирует исходное сообщение (только для компонентов) |

## Примеры

### Кнопка с быстрым ответом

```python
from hiroo import Button, ButtonStyle, ActionRow

@bot.slash_command(description="Demo")
async def demo(ctx):
    await ctx.respond(
        "Жми:",
        components=[ActionRow(components=[
            Button("OK", ButtonStyle.SUCCESS, custom_id="ok"),
        ])],
    )

@bot.component("ok")
async def on_ok(ctx):
    await ctx.respond("Clicked!", ephemeral=True)
```

### Долгая обработка через defer + followup

```python
@bot.slash_command(description="Run a 5s task")
async def slow(ctx):
    await ctx.defer()
    await asyncio.sleep(5)
    await ctx.followup("Готово!")
```

### Редактирование исходного сообщения

```python
@bot.component("toggle")
async def on_toggle(ctx):
    # type=6 — UPDATE исходного сообщения вместо создания нового
    await ctx.bot.http.request(
        "POST", f"/api/interactions/{ctx.interaction_id}/callback",
        json={"type": 6, "content": "Переключено."},
    )
```

## Ephemeral responses

Передайте `ephemeral=True` в `ctx.respond(...)`, и ответ увидит **только вызвавший юзер**, никому в чат не попадёт:

```python
await ctx.respond("Секрет.", ephemeral=True)
```

Фронтенд показывает ephemeral как toast в углу экрана.

## Select-меню

```python
from hiroo import SelectMenu, SelectOption, ActionRow

await ctx.respond(
    "Выбери цвет:",
    components=[ActionRow(components=[
        SelectMenu(custom_id="color", options=[
            SelectOption(label="Red", value="red"),
            SelectOption(label="Green", value="green"),
            SelectOption(label="Blue", value="blue"),
        ]),
    ])],
)

@bot.component("color")
async def on_color(ctx):
    values = ctx.interaction["data"]["values"]  # ["red"] etc.
    await ctx.respond(f"Вы выбрали: {', '.join(values)}", ephemeral=True)
```

## Raw REST

Если пишете не на Python — вот три эндпоинта:

```
POST /api/interactions
    Body: { type: "component"|"command", custom_id?, command_id?, command_name?,
            message_id?, channel_id?, dm_id?, guild_id?, application_id?,
            values?: string[], options?: dict }
    Auth: Bearer <user access_token>   (отправляет юзер, не бот)
    Возвращает: { id, correlation_id }

POST /api/interactions/{id}/callback
    Body: { type: 4|5|6, content?, embeds?, components?, ephemeral? }
    Auth: Bot <token>
    ≤ 3 сек после получения INTERACTION_CREATE

POST /api/interactions/{id}/followup
    Body: { content?, embeds?, components? }
    Auth: Bot <token>
    Доступен после defer (type=5). До 15 минут.
```
