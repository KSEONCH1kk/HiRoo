import { HTTPClient } from "./http.js";
import { GatewayClient } from "./gateway.js";
import { defaultIntents } from "./intents.js";
import { connectVoice } from "./voice.js";

/**
 * CommandContext passed to slash command / interaction handlers.
 *
 * - `respond(content, {embeds, components, ephemeral})` — for interactions
 *   uses the interaction callback endpoint, otherwise falls back to
 *   posting a regular message in the source channel.
 * - `defer()` — tell the user "thinking…" (only for interactions).
 * - `followup(...)` — send a follow-up message after deferring.
 */
export class CommandContext {
  constructor(bot, { message = null, interaction = null, args = {} } = {}) {
    this.bot = bot;
    this.message = message;
    this.interaction = interaction;
    this.args = args;
    if (interaction) {
      this.channelId = interaction.channel_id ?? null;
      this.dmId = interaction.dm_id ?? null;
      this.guildId = interaction.guild_id ?? null;
      this.interactionId = interaction.id ?? null;
    } else if (message) {
      this.channelId = message.channel_id ?? null;
      this.dmId = message.dm_id ?? null;
      this.guildId = message.server_id ?? message.guild_id ?? null;
      this.interactionId = null;
    } else {
      this.channelId = this.dmId = this.guildId = this.interactionId = null;
    }
  }

  get author() {
    if (this.message) return this.message.author ?? null;
    if (this.interaction) return this.interaction.user ?? null;
    return null;
  }

  async respond(content = "", { embeds, components, ephemeral = false } = {}) {
    if (this.interactionId) {
      return this.bot.http.interactionCallback(this.interactionId, {
        type: 4, content, ephemeral, embeds, components,
      });
    }
    return this.bot.http.sendMessage({
      channelId: this.channelId, dmId: this.dmId, content, embeds, components,
    });
  }

  async defer() {
    if (!this.interactionId) return;
    await this.bot.http.interactionCallback(this.interactionId, { type: 5 });
  }

  async followup(content = "", opts = {}) {
    if (!this.interactionId) return this.respond(content, opts);
    return this.bot.http.interactionFollowup(this.interactionId, { content, ...opts });
  }
}

const TYPE_MAP = { string: 3, number: 4, boolean: 5, float: 10 };

/**
 * Main entry point for a HiRoo bot.
 *
 *   const bot = new Bot({ intents: defaultIntents() });
 *   bot.on("ready", () => console.log("ready"));
 *   bot.on("message_create", async (msg) => { ... });
 *   bot.slashCommand({ name: "echo", description: "Echo" }, async (ctx, { text }) => {
 *     await ctx.respond(text);
 *   }, [{ name: "text", type: "string", required: true }]);
 *   await bot.run(process.env.BOT_TOKEN);
 */
export class Bot {
  constructor({
    intents = defaultIntents(),
    baseURL = "https://hiroo.intave.tech",
    applicationId = null,
    shardCount = 1,
  } = {}) {
    this.intents = Number(intents);
    this.baseURL = baseURL;
    this.applicationId = applicationId;
    this.shardCount = shardCount;
    this.user = null;
    this.http = new HTTPClient({ token: "", baseURL });
    this._handlers = new Map();    // event name → array of handlers
    this._commands = new Map();    // command name → { handler, options, ... }
    this._componentHandlers = new Map();
    this._shards = [];
    this._voiceConnections = [];
  }

  /** Подключиться к голосовому каналу (или DM-звонку). */
  async connectVoice({ channelId, dmId } = {}) {
    return connectVoice(this, { channelId, dmId });
  }

  /** Зарегистрировать VoiceConnection, чтобы run() корректно отключил его по SIGINT. */
  _registerVoice(vc) { this._voiceConnections.push(vc); }

  /**
   * Register an event handler. Discord-style short names are mapped to
   * gateway event names (message → message_create, reaction → reaction_add,
   * etc.) automatically.
   */
  on(event, handler) {
    const aliases = {
      message: "message_create",
      message_edit: "message_update",
      reaction: "reaction_add",
      member_join: "guild_member_add",
      member_leave: "guild_member_remove",
      voice_state: "voice_state_update",
      presence: "presence_update",
    };
    const resolved = aliases[event] ?? event;
    if (!this._handlers.has(resolved)) this._handlers.set(resolved, []);
    this._handlers.get(resolved).push(handler);
    return this;
  }

  /**
   * Register a slash command.
   *
   *   bot.slashCommand({ name: "add", description: "Sum" },
   *     async (ctx, { a, b }) => ctx.respond(String(a + b)),
   *     [{ name: "a", type: "number", required: true },
   *      { name: "b", type: "number", required: true }]);
   */
  slashCommand({ name, description = "", guildId = null }, handler, options = []) {
    const normalized = options.map((o) => ({
      name: o.name,
      description: o.description ?? o.name,
      type: typeof o.type === "number" ? o.type : (TYPE_MAP[o.type] ?? 3),
      required: o.required ?? false,
    }));
    this._commands.set(name, {
      handler,
      type: "slash",
      name,
      description: description || name,
      options: normalized,
      guildId,
    });
    return this;
  }

  /** Register a handler for a component interaction (button/select). */
  component(customId, handler) {
    this._componentHandlers.set(customId, handler);
    return this;
  }

  async _dispatch(event, data) {
    if (event === "ready") {
      this.user = data.user ?? null;
      const shardArr = data.shard ?? [0, 1];
      this.shardCount = shardArr[1];
      if (this.applicationId) {
        for (const cmd of this._commands.values()) {
          try {
            await this.http.registerCommand(this.applicationId, cmd);
          } catch (e) {
            console.error(`[hiroo] failed to register /${cmd.name}:`, e?.message ?? e);
          }
        }
      }
    }

    // Decorate message_create with a .reply helper.
    let payload = data;
    if (event === "message_create") {
      payload = {
        ...data,
        reply: async (content = "", opts = {}) =>
          this.http.sendMessage({
            channelId: data.channel_id, dmId: data.dm_id,
            content, ...opts, replyToId: data.id,
          }),
      };
      // Auto-invoke slash command if content starts with `/<name>`.
      const content = data.content ?? "";
      if (content.startsWith("/")) {
        const first = content.slice(1).split(/\s+/, 1)[0];
        const cmd = this._commands.get(first);
        if (cmd && !(data.author?.bot)) {
          const rest = content.slice(first.length + 1).trim();
          const parts = rest ? rest.split(/\s+/) : [];
          const kwargs = {};
          for (let i = 0; i < cmd.options.length; i++) {
            const o = cmd.options[i];
            // The last option soaks up the remaining whitespace.
            const raw = i === cmd.options.length - 1
              ? parts.slice(i).join(" ")
              : parts[i];
            if (raw == null || raw === "") continue;
            kwargs[o.name] = coerceArg(raw, o.type);
          }
          const ctx = new CommandContext(this, { message: data, args: kwargs });
          try { await cmd.handler(ctx, kwargs); }
          catch (e) { console.error(`[hiroo] command /${first} failed:`, e); }
        }
      }
    }

    if (event === "interaction_create") {
      const inter = data ?? {};
      if (inter.type === "component") {
        const h = this._componentHandlers.get(inter.custom_id ?? "");
        if (h) {
          const ctx = new CommandContext(this, { interaction: inter, args: inter.data ?? {} });
          try { await h(ctx); }
          catch (e) { console.error(`[hiroo] component ${inter.custom_id} failed:`, e); }
        }
      } else if (inter.type === "command") {
        const cmd = this._commands.get(inter.command_name ?? "");
        if (cmd) {
          const opts = (inter.data ?? {}).options ?? {};
          const ctx = new CommandContext(this, { interaction: inter, args: opts });
          try { await cmd.handler(ctx, opts); }
          catch (e) { console.error(`[hiroo] slash /${inter.command_name} failed:`, e); }
        }
      }
    }

    const handlers = this._handlers.get(event) ?? [];
    for (const h of handlers) {
      try { await h(payload); }
      catch (e) { console.error(`[hiroo] handler for ${event} failed:`, e); }
    }
  }

  /** Connect all shards. Resolves when every shard's reconnect loop exits. */
  async run(token) {
    this.http.token = token;
    this._shards = Array.from({ length: this.shardCount }, (_, i) =>
      new GatewayClient({
        url: this.baseURL, token, intents: this.intents,
        shardId: i, shardCount: this.shardCount,
        onDispatch: (event, data) => this._dispatch(event, data),
      })
    );
    const stop = async () => {
      for (const vc of this._voiceConnections) {
        try { await vc.disconnect(); } catch {}
      }
      this._voiceConnections.length = 0;
      try { await this.http.request("DELETE", "/api/voice/presence"); } catch {}
      for (const s of this._shards) { try { await s.close(); } catch {} }
      process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await Promise.all(this._shards.map((s) => s.connect()));
  }
}

function coerceArg(raw, type) {
  // type is a numeric APPLICATION_COMMAND_OPTION_TYPE; see TYPE_MAP.
  switch (type) {
    case 4: { const n = parseInt(raw, 10); return Number.isFinite(n) ? n : raw; }
    case 5: return /^(1|true|yes|y)$/i.test(raw);
    case 10: { const f = parseFloat(raw); return Number.isFinite(f) ? f : raw; }
    default: return raw;
  }
}
