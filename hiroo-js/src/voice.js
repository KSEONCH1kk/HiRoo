// Голосовые подключения для ботов.
//
// HiRoo делегирует аудио-транспорт LiveKit. Бот подключается к voice-каналу
// так:
//   1. Запрашивает LiveKit-токен для конкретной комнаты через HiRoo API.
//   2. Коннектится к LiveKit-SFU через `@livekit/rtc-node`.
//
// Поскольку `@livekit/rtc-node` тянет ~80MB нативного бинаря, он объявлен
// как optionalDependencies — ставьте отдельно, если нужен голос:
//
//     npm install @livekit/rtc-node
//
// Применение:
//
//     const vc = await bot.connectVoice({ channelId: "..." });
//     await vc.playFile("./music.mp3");
//     await vc.disconnect();

import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { HiRooError } from "./errors.js";

export class VoiceConnection {
  constructor(bot, roomName, url, token) {
    this.bot = bot;
    this.roomName = roomName;
    this.url = url;
    this.token = token;
    this._room = null;
    this._rtc = null;
  }

  async connect() {
    let rtc;
    try {
      rtc = await import("@livekit/rtc-node");
    } catch (e) {
      throw new HiRooError(
        "Voice support requires @livekit/rtc-node. Install with: npm install @livekit/rtc-node",
      );
    }
    this._rtc = rtc;
    this._room = new rtc.Room();
    await this._room.connect(this.url, this.token, {
      autoSubscribe: true,
      dynacast: true,
    });
    // Регистрируем voice-presence на HiRoo, чтобы фронт показал бота
    // в списке участников канала.
    try {
      await this.bot.http.request("POST", "/api/voice/presence", {
        json: { room: this.roomName },
      });
    } catch (e) {
      console.warn("[hiroo] voice presence register failed:", e?.message ?? e);
    }
  }

  async disconnect() {
    if (this._room) {
      try { await this._room.disconnect(); }
      finally { this._room = null; }
    }
    try { await this.bot.http.request("DELETE", "/api/voice/presence"); }
    catch {}
  }

  /**
   * Стримит локальный аудио-файл в активное подключение. Внутри поднимает
   * ffmpeg, декодирует в 48 kHz mono PCM16, публикует как LocalAudioTrack.
   * Требует ffmpeg в PATH.
   */
  async playFile(path) {
    if (!this._room) throw new HiRooError("not connected");
    const rtc = this._rtc;

    const ffmpeg = findFfmpeg();
    if (!ffmpeg) {
      throw new HiRooError(
        "ffmpeg не найден в PATH. Установите его:\n" +
        "  • Windows: winget install Gyan.FFmpeg  (или choco install ffmpeg)\n" +
        "  • macOS:   brew install ffmpeg\n" +
        "  • Linux:   apt install ffmpeg",
      );
    }

    // LiveKit: создаём источник, трек, публикуем с опцией microphone —
    // без неё SFU отвергает трек как не попадающий в token grants.
    const source = new rtc.AudioSource(48_000, 1);
    const track = rtc.LocalAudioTrack.createAudioTrack("bot-audio", source);
    const opts = new rtc.TrackPublishOptions();
    try { opts.source = rtc.TrackSource.SOURCE_MICROPHONE; } catch {}

    await withTimeout(
      this._room.localParticipant.publishTrack(track, opts),
      15_000,
      "publishTrack timed out — check that UDP 50000-50100 to the LiveKit server is reachable",
    );

    // 10 мс фреймы при 48 kHz mono → 480 сэмплов → 960 байт s16le.
    const samplesPerFrame = 480;
    const bytesPerFrame = samplesPerFrame * 2; // mono * 16-bit

    const proc = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-i", path,
      "-f", "s16le", "-ar", "48000", "-ac", "1", "-",
    ], { stdio: ["ignore", "pipe", "inherit"] });

    let buf = Buffer.alloc(0);
    try {
      for await (const chunk of proc.stdout) {
        buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
        while (buf.length >= bytesPerFrame) {
          const slice = buf.subarray(0, bytesPerFrame);
          buf = buf.subarray(bytesPerFrame);
          // AudioFrame ожидает Int16Array. Копируем из Buffer.
          const int16 = new Int16Array(samplesPerFrame);
          for (let i = 0; i < samplesPerFrame; i++) {
            int16[i] = slice.readInt16LE(i * 2);
          }
          const frame = new rtc.AudioFrame(int16, 48_000, 1, samplesPerFrame);
          await source.captureFrame(frame);
        }
      }
    } finally {
      try { proc.kill(); } catch {}
    }
  }

  /** Заглушить локального участника (бота). */
  async setMuted(muted) {
    if (!this._room?.localParticipant) return;
    try { await this._room.localParticipant.setMicrophoneEnabled(!muted); }
    catch {}
  }
}

/** Получить URL и токен LiveKit для комнаты HiRoo. */
export async function getVoiceToken(bot, room) {
  const data = await bot.http.request("GET", "/api/voice/token", { params: { room } });
  return { url: data.url, token: data.token };
}

export async function connectVoice(bot, { channelId, dmId } = {}) {
  let room;
  if (channelId) room = `channel:${channelId}`;
  else if (dmId) room = `dm:${dmId}`;
  else throw new Error("Provide channelId or dmId");

  const { url, token } = await getVoiceToken(bot, room);
  const vc = new VoiceConnection(bot, room, url, token);
  await vc.connect();
  if (typeof bot._registerVoice === "function") bot._registerVoice(vc);
  return vc;
}

// ── internals ──────────────────────────────────────────────────────

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new HiRooError(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function findFfmpeg() {
  const cmd = process.platform === "win32" ? "where ffmpeg" : "command -v ffmpeg";
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim().split(/\r?\n/)[0] || null;
  } catch { return null; }
}
