# hiroo.py

Official Python client for the HiRoo bot gateway.

## Install (dev)

```bash
pip install -e ./hiroo-py
```

## Quick start

```python
import hiroo

bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT,
    base_url="https://hiroo.intave.tech",
    application_id="YOUR_APP_UUID",     # optional — enables auto command registration
    shard_count=1,
)

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.username}")

@bot.event
async def on_message(msg: hiroo.Message):
    if msg.content == "!ping":
        await msg.reply("pong")

@bot.slash_command(description="Echoes back your text")
async def echo(ctx: hiroo.CommandContext, text: str):
    await ctx.respond(text)

bot.run("YOUR_BOT_TOKEN")
```

## Intents

Privileged intents (`GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`)
must be enabled in the `/developers` UI for your app. Other intents are free.

## Shards

`shard_count` controls how many parallel WebSocket connections your bot opens.
Each shard handles `guild_id % shard_count == shard_id`. For small bots, 1 is fine.

## Components

```python
from hiroo import Button, ButtonStyle, ActionRow

await msg.reply(
    "Click me:",
    components=[ActionRow(components=[
        Button(label="OK", style=ButtonStyle.SUCCESS, custom_id="ok_btn"),
        Button(label="Cancel", style=ButtonStyle.DANGER, custom_id="cancel_btn"),
    ])],
)

@bot.component("ok_btn")
async def on_ok(ctx):
    await ctx.respond("You clicked OK")
```

## Voice

Voice support is **experimental**. Bots join voice rooms via LiveKit; see
`hiroo.voice` (WIP).
