"""hiroo.py — official Python client for the HiRoo platform.

Basic usage::

    import hiroo

    bot = hiroo.Bot(intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT)

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

    bot.run("Bot " + BOT_TOKEN)
"""
from .client import Bot, CommandContext
from .intents import Intents
from .models import User, Message, Guild, Channel
from .components import Button, ButtonStyle, ActionRow, SelectMenu, SelectOption
from .embeds import Embed
from .errors import HiRooError, HTTPError, GatewayError

__all__ = [
    "Bot", "CommandContext",
    "Intents",
    "User", "Message", "Guild", "Channel",
    "Button", "ButtonStyle", "ActionRow", "SelectMenu", "SelectOption",
    "Embed",
    "HiRooError", "HTTPError", "GatewayError",
]
