"""Tiny bot that echoes back + demonstrates buttons.

Run:
    pip install -e ./hiroo-py
    HIROO_TOKEN=... HIROO_APP_ID=... python examples/echo_bot.py
"""
import os

import hiroo
from hiroo import Button, ButtonStyle, ActionRow, Embed


bot = hiroo.Bot(
    intents=hiroo.Intents.default() | hiroo.Intents.MESSAGE_CONTENT,
    base_url=os.environ.get("HIROO_BASE_URL", "https://hiroo.intave.tech"),
    application_id="85102224-beff-445f-b34d-78640c59ec1d",
    shard_count=int(os.environ.get("HIROO_SHARDS", "1")),
)


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.username} ({bot.user.id})")


@bot.event
async def on_message(msg: hiroo.Message):
    if msg.author and msg.author.bot:
        return
    if msg.content.lower() == "!ping":
        await msg.reply("pong 🏓")


@bot.slash_command(description="Echo back text with a fancy embed")
async def echo(ctx: hiroo.CommandContext, text: str):
    e = Embed(title="Echo", description=text, color=0x7c5cff)
    e.add_field("Length", str(len(text)), inline=True)
    await ctx.respond(embed=e, components=[
        ActionRow(components=[
            Button(label="👍", style=ButtonStyle.SUCCESS, custom_id="like"),
            Button(label="👎", style=ButtonStyle.DANGER, custom_id="dislike"),
        ]),
    ])


@bot.component("like")
async def on_like(ctx: hiroo.CommandContext):
    await ctx.respond("Thanks!", ephemeral=True)


@bot.component("dislike")
async def on_dislike(ctx: hiroo.CommandContext):
    await ctx.respond("Noted.", ephemeral=True)


if __name__ == "__main__":
    bot.run("RjTwkOjOQHOfBRsE7-2EZQ.AGnomEg.afc9bc3005387d8ac40d54a7fb3")
