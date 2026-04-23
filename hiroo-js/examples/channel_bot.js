// Channel management bot — demonstrates creating / deleting channels in
// categories via the bot API. The bot must have MANAGE_CHANNELS in the
// target guild.
//
// Commands:
//   /mkchannel <category> <name>   creates a text channel inside <category>
//   /mkvoice   <category> <name>   same, but voice
//   /rmchannel <name>              deletes a channel by name
//
//   BOT_TOKEN=... APP_ID=... node examples/channel_bot.js

import { Bot, Intents, defaultIntents, HTTPError } from "../src/index.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APP_ID;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in env");

const bot = new Bot({
  intents: defaultIntents() | Intents.MESSAGE_CONTENT,
  applicationId: APP_ID,
});

async function findCategory(guildId, name) {
  const channels = await bot.http.getGuildChannels(guildId);
  const wanted = name.trim().toLowerCase();
  return channels.find((c) => c.type === "category" && (c.name ?? "").toLowerCase() === wanted);
}

async function findChannel(guildId, name) {
  const channels = await bot.http.getGuildChannels(guildId);
  const wanted = name.trim().toLowerCase().replace(/^#/, "");
  return channels.find((c) => (c.name ?? "").toLowerCase() === wanted);
}

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user?.username} (id=${bot.user?.id})`);
});

bot.slashCommand(
  { name: "mkchannel", description: "Create a text channel inside a category" },
  async (ctx, { category, name }) => {
    if (!ctx.guildId) return ctx.respond("Команда работает только в сервере.");
    const cat = await findCategory(ctx.guildId, category);
    if (!cat) return ctx.respond(`Категория «${category}» не найдена.`);
    try {
      const ch = await bot.http.createChannel(ctx.guildId, name, { type: "text", parentId: cat.id });
      await ctx.respond(`Канал **#${ch.name}** создан в категории «${cat.name}».`);
    } catch (e) {
      if (e instanceof HTTPError) await ctx.respond(`Не удалось создать канал: ${e.message}`);
      else throw e;
    }
  },
  [
    { name: "category", type: "string", required: true },
    { name: "name", type: "string", required: true },
  ],
);

bot.slashCommand(
  { name: "mkvoice", description: "Create a voice channel inside a category" },
  async (ctx, { category, name }) => {
    if (!ctx.guildId) return ctx.respond("Команда работает только в сервере.");
    const cat = await findCategory(ctx.guildId, category);
    if (!cat) return ctx.respond(`Категория «${category}» не найдена.`);
    try {
      const ch = await bot.http.createChannel(ctx.guildId, name, { type: "voice", parentId: cat.id });
      await ctx.respond(`Голосовой канал **${ch.name}** создан в категории «${cat.name}».`);
    } catch (e) {
      if (e instanceof HTTPError) await ctx.respond(`Не удалось создать канал: ${e.message}`);
      else throw e;
    }
  },
  [
    { name: "category", type: "string", required: true },
    { name: "name", type: "string", required: true },
  ],
);

bot.slashCommand(
  { name: "rmchannel", description: "Delete a channel by name" },
  async (ctx, { name }) => {
    if (!ctx.guildId) return ctx.respond("Команда работает только в сервере.");
    const ch = await findChannel(ctx.guildId, name);
    if (!ch) return ctx.respond(`Канал «${name}» не найден.`);
    try {
      await bot.http.deleteChannel(ctx.guildId, ch.id);
      await ctx.respond(`Канал **#${ch.name}** удалён.`);
    } catch (e) {
      if (e instanceof HTTPError) await ctx.respond(`Не удалось удалить канал: ${e.message}`);
      else throw e;
    }
  },
  [{ name: "name", type: "string", required: true }],
);

bot.run("Bot " + BOT_TOKEN).catch((e) => {
  console.error(e);
  process.exit(1);
});
