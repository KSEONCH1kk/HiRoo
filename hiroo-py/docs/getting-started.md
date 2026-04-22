# Getting Started

## 1. Создать приложение

1. Залогиньтесь на `https://hiroo.intave.tech`.
2. Откройте `/developers` или `Настройки → Developers`.
3. Нажмите **«Новое приложение»**, введите имя.
4. В модалке со свежесозданным приложением — **скопируйте `client_secret`** (показывается один раз).

## 2. Создать бота

1. В настройках приложения → вкладка **Bot** → **«Создать бота»**.
2. Скопируйте **Bot token** (тоже показывается один раз).
3. Во вкладке Intents включите те события, что вам нужны. `Message Content` и `Guild Members` — privileged, без них бот не получит содержимое сообщений.

## 3. Пригласить на сервер

1. Вкладка **OAuth2** → **«Пригласить»** (или скопируйте URL).
2. Выберите сервер, подтвердите — бот появится в списке участников.

## 4. Установить SDK

```bash
pip install -e ./hiroo-py       # если клонировали репо
# + опционально для voice:
pip install livekit
```

## 5. Написать бота

```python
import hiroo

bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT,
    base_url="https://hiroo.intave.tech",
    application_id="UUID-вашего-приложения",   # не client_id, а id из /developers/<UUID>
)

@bot.event
async def on_ready():
    print(f"Ready as {bot.user.username}")

@bot.event
async def on_message(msg: hiroo.Message):
    if msg.author and msg.author.bot:
        return
    if msg.content.lower() == "!ping":
        await msg.reply("pong 🏓")

@bot.slash_command(description="Echo your text back")
async def echo(ctx: hiroo.CommandContext, text: str):
    await ctx.respond(text)

bot.run("BOT-TOKEN-HERE")
```

Запустите — в логе должно быть `Logged in as <username>`. В чате сервера наберите `!ping` — получите `pong`.

Далее:
- [Python SDK в деталях](./bot-sdk.md)
- [Кнопки и select-меню](./interactions.md)
- [Голосовые каналы](./voice.md)
