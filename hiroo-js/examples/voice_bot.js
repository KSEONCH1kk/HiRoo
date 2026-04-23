// Бот, подключающийся к голосовому каналу и проигрывающий файл.
//
// Требования:
//   npm install ws
//   npm install @livekit/rtc-node    # для voice
//   ffmpeg в PATH                    # для /vplay
//
// Запуск:
//   BOT_TOKEN=... APP_ID=... node examples/voice_bot.js
//
// В сервере, где бот участник, вызовите /vjoin — бот подключится к первому
// голосовому каналу. /vleave отключит. /vplay <путь> проиграет локальный
// аудио-файл.

import { Bot, Intents, defaultIntents, HiRooError } from "../src/index.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APP_ID;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in env");

const bot = new Bot({
  intents: defaultIntents() | Intents.MESSAGE_CONTENT | Intents.GUILD_VOICE_STATES,
  applicationId: APP_ID,
});

// Один активный VoiceConnection на гильдию.
const voiceByGuild = new Map();

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user?.username}`);
});

bot.slashCommand(
  { name: "vjoin", description: "Подключиться к первому голосовому каналу сервера" },
  async (ctx) => {
    if (!ctx.guildId) return ctx.respond("Только в сервере.", { ephemeral: true });
    const channels = await bot.http.getGuildChannels(ctx.guildId);
    const voice = channels.find((c) => c.type === "voice");
    if (!voice) return ctx.respond("Нет голосовых каналов.", { ephemeral: true });
    await ctx.defer();
    try {
      const vc = await bot.connectVoice({ channelId: voice.id });
      voiceByGuild.set(ctx.guildId, vc);
      await ctx.followup(`Подключился к \`#${voice.name}\` ✅`);
    } catch (e) {
      await ctx.followup(`Voice error: ${e instanceof HiRooError ? e.message : e}`);
    }
  },
);

bot.slashCommand(
  { name: "vleave", description: "Отключиться от голосового" },
  async (ctx) => {
    const vc = voiceByGuild.get(ctx.guildId);
    if (!vc) return ctx.respond("Я не в голосовом канале.", { ephemeral: true });
    voiceByGuild.delete(ctx.guildId);
    await vc.disconnect();
    await ctx.respond("Отключился.");
  },
);

bot.slashCommand(
  { name: "vplay", description: "Проиграть локальный аудио-файл (путь на стороне бота)" },
  async (ctx, { path }) => {
    const vc = voiceByGuild.get(ctx.guildId);
    if (!vc) return ctx.respond("Сначала /vjoin.", { ephemeral: true });
    await ctx.defer();
    try {
      await vc.playFile(path);
      await ctx.followup("Поток пошёл 🎵");
    } catch (e) {
      await ctx.followup(`Ошибка: ${e instanceof HiRooError ? e.message : e}`);
    }
  },
  [{ name: "path", type: "string", required: true }],
);

bot.run("Bot " + BOT_TOKEN).catch((e) => {
  console.error(e);
  process.exit(1);
});
