// Official HiRoo JavaScript client.
//
//   import { Bot, Intents } from "hiroo";
//
//   const bot = new Bot({ intents: Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.MESSAGE_CONTENT });
//   bot.on("ready", () => console.log(`Logged in as ${bot.user.username}`));
//   bot.on("message_create", async (msg) => {
//     if (msg.content === "!ping") await msg.reply("pong");
//   });
//   await bot.run("Bot " + process.env.BOT_TOKEN);

export { Bot, CommandContext } from "./bot.js";
export { HTTPClient } from "./http.js";
export { GatewayClient } from "./gateway.js";
export { Intents, defaultIntents, allIntents } from "./intents.js";
export { HiRooError, HTTPError, GatewayError } from "./errors.js";
export { VoiceConnection, connectVoice, getVoiceToken } from "./voice.js";
