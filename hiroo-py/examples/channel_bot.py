"""Demonstrates channel management via the bot API.

Commands:
  /mkchannel <category-name> <channel-name>   creates a text channel inside
                                              the named category.
  /mkvoice <category-name> <channel-name>     same but for a voice channel.
  /rmchannel <channel-name>                   deletes a channel by name.

The bot must have the MANAGE_CHANNELS permission in the server.

Invoke as:
    BOT_TOKEN=... APP_ID=... python channel_bot.py
"""
import os
import asyncio
import hiroo


BOT_TOKEN = os.environ["BOT_TOKEN"]
APP_ID = os.environ.get("APP_ID")

bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT,
    application_id=APP_ID,
)


async def find_category(guild_id: str, name: str) -> dict | None:
    """Locate a category channel in the given guild by (case-insensitive) name."""
    channels = await bot.http.get_guild_channels(guild_id)
    wanted = name.strip().lower()
    for ch in channels:
        if ch.get("type") == "category" and (ch.get("name") or "").lower() == wanted:
            return ch
    return None


async def find_channel(guild_id: str, name: str) -> dict | None:
    channels = await bot.http.get_guild_channels(guild_id)
    wanted = name.strip().lower().lstrip("#")
    for ch in channels:
        if (ch.get("name") or "").lower() == wanted:
            return ch
    return None


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.username} (id={bot.user.id})")


@bot.slash_command(description="Create a text channel inside a category")
async def mkchannel(ctx: hiroo.CommandContext, category: str, name: str):
    guild_id = (ctx.interaction or {}).get("guild_id") or (ctx.message and ctx.message._raw.get("server_id"))
    if not guild_id:
        await ctx.respond("Работает только в серверном канале.")
        return
    cat = await find_category(guild_id, category)
    if not cat:
        await ctx.respond(f"Категория «{category}» не найдена.")
        return
    try:
        ch = await bot.http.create_channel(
            guild_id, name, type="text", parent_id=cat["id"],
        )
    except hiroo.HTTPError as e:
        await ctx.respond(f"Не удалось создать канал: {e}")
        return
    await ctx.respond(f"Канал **#{ch['name']}** создан в категории «{cat['name']}».")


@bot.slash_command(description="Create a voice channel inside a category")
async def mkvoice(ctx: hiroo.CommandContext, category: str, name: str):
    guild_id = (ctx.interaction or {}).get("guild_id") or (ctx.message and ctx.message._raw.get("server_id"))
    if not guild_id:
        await ctx.respond("Работает только в серверном канале.")
        return
    cat = await find_category(guild_id, category)
    if not cat:
        await ctx.respond(f"Категория «{category}» не найдена.")
        return
    try:
        ch = await bot.http.create_channel(
            guild_id, name, type="voice", parent_id=cat["id"],
        )
    except hiroo.HTTPError as e:
        await ctx.respond(f"Не удалось создать канал: {e}")
        return
    await ctx.respond(f"Голосовой канал **{ch['name']}** создан в категории «{cat['name']}».")


@bot.slash_command(description="Delete a channel by name")
async def rmchannel(ctx: hiroo.CommandContext, name: str):
    guild_id = (ctx.interaction or {}).get("guild_id") or (ctx.message and ctx.message._raw.get("server_id"))
    if not guild_id:
        await ctx.respond("Работает только в серверном канале.")
        return
    ch = await find_channel(guild_id, name)
    if not ch:
        await ctx.respond(f"Канал «{name}» не найден.")
        return
    try:
        await bot.http.delete_channel(guild_id, ch["id"])
    except hiroo.HTTPError as e:
        await ctx.respond(f"Не удалось удалить канал: {e}")
        return
    await ctx.respond(f"Канал **#{ch['name']}** удалён.")


if __name__ == "__main__":
    bot.run("Bot " + BOT_TOKEN)
