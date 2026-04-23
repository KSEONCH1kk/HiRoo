import { HTTPError } from "./errors.js";

/**
 * Thin wrapper over fetch() for the HiRoo REST API.
 *
 * Bot tokens are sent as `Authorization: Bot <token>`; if your token already
 * carries the `Bot ` / `Bearer ` prefix it's used verbatim.
 */
export class HTTPClient {
  constructor({ token, baseURL }) {
    this.token = token;
    this.baseURL = baseURL.replace(/\/$/, "");
  }

  get authHeader() {
    const t = this.token ?? "";
    return /^(bot |bearer )/i.test(t) ? t : `Bot ${t}`;
  }

  async request(method, path, { json, params } = {}) {
    let url = this.baseURL + path;
    if (params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v != null) qs.set(k, String(v));
      }
      const q = qs.toString();
      if (q) url += (url.includes("?") ? "&" : "?") + q;
    }
    const init = {
      method,
      headers: {
        "Authorization": this.authHeader,
        "User-Agent": "hiroo-js/0.1",
      },
    };
    if (json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(json);
    }
    const res = await fetch(url, init);
    if (res.status === 204) return null;
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) throw new HTTPError(res.status, body);
    return body;
  }

  // ── Messages ─────────────────────────────────────────────────────

  async sendMessage({ channelId, dmId, content = "", embeds, components, replyToId }) {
    const body = { content };
    if (embeds) body.embeds = embeds.map((e) => (e?.toJSON ? e.toJSON() : e));
    if (components) body.components = components.map((c) => (c?.toJSON ? c.toJSON() : c));
    if (replyToId) body.reply_to_id = replyToId;
    if (channelId) return this.request("POST", `/api/channels/${channelId}/messages`, { json: body });
    if (dmId) return this.request("POST", `/api/dms/${dmId}/messages`, { json: body });
    throw new Error("Either channelId or dmId required");
  }

  async editMessage(channelId, messageId, content) {
    return this.request("PATCH", `/api/channels/${channelId}/messages/${messageId}`, { json: { content } });
  }

  async deleteMessage(channelId, messageId) {
    return this.request("DELETE", `/api/channels/${channelId}/messages/${messageId}`);
  }

  async addReaction(channelId, messageId, emoji) {
    return this.request("POST", `/api/channels/${channelId}/messages/${messageId}/reactions`, { json: { emoji } });
  }

  // ── Channels ─────────────────────────────────────────────────────

  async getGuildChannels(guildId) {
    return this.request("GET", `/api/servers/${guildId}/channels`);
  }

  /**
   * Create a channel in a server. `parentId` points to a category channel
   * to nest the new channel inside. Types: `text`, `voice`, `announcement`,
   * `category`, `forum`. Requires the bot to have MANAGE_CHANNELS.
   */
  async createChannel(guildId, name, {
    type = "text",
    topic,
    isPrivate = false,
    parentId,
    position = 0,
  } = {}) {
    const body = { name, type, is_private: isPrivate, position };
    if (topic != null) body.topic = topic;
    if (parentId != null) body.parent_id = parentId;
    return this.request("POST", `/api/servers/${guildId}/channels`, { json: body });
  }

  async updateChannel(guildId, channelId, fields) {
    return this.request("PATCH", `/api/servers/${guildId}/channels/${channelId}`, { json: fields });
  }

  async deleteChannel(guildId, channelId) {
    return this.request("DELETE", `/api/servers/${guildId}/channels/${channelId}`);
  }

  async getGuilds() {
    return this.request("GET", "/api/servers");
  }

  // ── Messages (extra) ─────────────────────────────────────────────

  async editDMMessage(dmId, messageId, content) {
    return this.request("PATCH", `/api/dms/${dmId}/messages/${messageId}`, { json: { content } });
  }

  async deleteDMMessage(dmId, messageId) {
    return this.request("DELETE", `/api/dms/${dmId}/messages/${messageId}`);
  }

  async removeReaction(channelId, messageId, emoji) {
    return this.request("DELETE", `/api/channels/${channelId}/messages/${messageId}/reactions`, { params: { emoji } });
  }

  async pinMessage(channelId, messageId) {
    return this.request("PUT", `/api/channels/${channelId}/messages/${messageId}/pin`);
  }

  async unpinMessage(channelId, messageId) {
    return this.request("DELETE", `/api/channels/${channelId}/messages/${messageId}/pin`);
  }

  async listPinned(channelId) {
    return this.request("GET", `/api/channels/${channelId}/messages/pinned`);
  }

  async pinDMMessage(dmId, messageId) {
    return this.request("PUT", `/api/dms/${dmId}/messages/${messageId}/pin`);
  }

  async unpinDMMessage(dmId, messageId) {
    return this.request("DELETE", `/api/dms/${dmId}/messages/${messageId}/pin`);
  }

  async listDMPinned(dmId) {
    return this.request("GET", `/api/dms/${dmId}/pinned`);
  }

  // ── Moderation ─────────────────────────────────────────────────────

  async kickMember(guildId, userId) {
    return this.request("DELETE", `/api/servers/${guildId}/members/${userId}`);
  }

  async banMember(guildId, userId, reason = null) {
    const body = { user_id: userId };
    if (reason != null) body.reason = reason;
    return this.request("POST", `/api/servers/${guildId}/bans`, { json: body });
  }

  async unbanMember(guildId, userId) {
    return this.request("DELETE", `/api/servers/${guildId}/bans/${userId}`);
  }

  async listBans(guildId) {
    return this.request("GET", `/api/servers/${guildId}/bans`);
  }

  async setTimeout(guildId, userId, durationSeconds, reason = null) {
    const body = { duration_seconds: durationSeconds };
    if (reason != null) body.reason = reason;
    return this.request("PUT", `/api/servers/${guildId}/members/${userId}/timeout`, { json: body });
  }

  async clearTimeout(guildId, userId) {
    return this.request("DELETE", `/api/servers/${guildId}/members/${userId}/timeout`);
  }

  async updateMember(guildId, userId, { nickname, role } = {}) {
    const body = {};
    if (nickname !== undefined) body.nickname = nickname;
    if (role !== undefined) body.role = role;
    return this.request("PATCH", `/api/servers/${guildId}/members/${userId}`, { json: body });
  }

  // ── Roles ──────────────────────────────────────────────────────────

  async listRoles(guildId) {
    return this.request("GET", `/api/servers/${guildId}/roles`);
  }

  async createRole(guildId, name, { color, permissions = 0, hoist = false, mentionable = true } = {}) {
    const body = { name, permissions, hoist, mentionable };
    if (color != null) body.color = color;
    return this.request("POST", `/api/servers/${guildId}/roles`, { json: body });
  }

  async updateRole(guildId, roleId, fields) {
    return this.request("PATCH", `/api/servers/${guildId}/roles/${roleId}`, { json: fields });
  }

  async deleteRole(guildId, roleId) {
    return this.request("DELETE", `/api/servers/${guildId}/roles/${roleId}`);
  }

  async getMemberRoles(guildId, userId) {
    return this.request("GET", `/api/servers/${guildId}/roles/members/${userId}`);
  }

  async setMemberRoles(guildId, userId, roleIds) {
    return this.request("PUT", `/api/servers/${guildId}/roles/members/${userId}`, { json: { role_ids: roleIds } });
  }

  // ── Commands (slash) ─────────────────────────────────────────────

  async registerCommand(applicationId, { type = "slash", name, description, options = [], guildId = null }) {
    return this.request("POST", `/api/commands/applications/${applicationId}/commands`, {
      json: { type, name, description, options, guild_id: guildId },
    });
  }

  // ── Interactions ─────────────────────────────────────────────────

  async interactionCallback(interactionId, { type = 4, content = "", embeds, components, ephemeral = false } = {}) {
    const body = { type, content, ephemeral };
    if (embeds) body.embeds = embeds.map((e) => (e?.toJSON ? e.toJSON() : e));
    if (components) body.components = components.map((c) => (c?.toJSON ? c.toJSON() : c));
    return this.request("POST", `/api/interactions/${interactionId}/callback`, { json: body });
  }

  async interactionFollowup(interactionId, { content = "", embeds, components } = {}) {
    const body = { content };
    if (embeds) body.embeds = embeds.map((e) => (e?.toJSON ? e.toJSON() : e));
    if (components) body.components = components.map((c) => (c?.toJSON ? c.toJSON() : c));
    return this.request("POST", `/api/interactions/${interactionId}/followup`, { json: body });
  }
}
