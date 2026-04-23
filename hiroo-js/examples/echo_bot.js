// Simple echo bot — responds to "!ping" with "pong" and provides an /echo
// slash command.
//
//   BOT_TOKEN=... APP_ID=... node examples/echo_bot.js

import { Bot, Intents, defaultIntents } from "../src/index.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APP_ID;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in env");

const bot = new Bot({
  intents: defaultIntents() | Intents.MESSAGE_CONTENT,
  applicationId: APP_ID,
});

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user?.username} (id=${bot.user?.id})`);
});

bot.on("message_create", async (msg) => {
  if (msg.author?.bot) return;
  if (msg.content === "!ping") await msg.reply("pong");
});

bot.slashCommand(
  { name: "echo", description: "Echoes back your text" },
  async (ctx, { text }) => ctx.respond(text ?? ""),
  [{ name: "text", type: "string", required: true }],
);

bot.run("Bot " + BOT_TOKEN).catch((e) => {
  console.error(e);
  process.exit(1);
});
