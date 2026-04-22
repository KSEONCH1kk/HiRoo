import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { tokenStore } from "./auth";
import type {
  TokenResponse, User, Server, Channel, Message, DirectMessage,
  DMMessageType, FriendRequest, Notification, VoiceState, PaginatedMessages,
  ServerMember, UserPublic,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL: BASE, withCredentials: true });

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401 + resilient retry on 5xx (backend rebuild / nginx 502/503/504)
let refreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function _sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const orig = err.config as InternalAxiosRequestConfig & {
      _retry?: boolean; _5xxAttempts?: number;
    };
    const status = err.response?.status ?? 0;

    // Transient infrastructure errors — backend restarting, nginx can't reach
    // upstream, gateway timeout. Retry up to 5 times with increasing backoff
    // so the user doesn't get kicked to /login just because we redeployed.
    const isTransient = status === 502 || status === 503 || status === 504 || !err.response;
    if (isTransient && orig) {
      const attempts = (orig._5xxAttempts ?? 0) + 1;
      if (attempts <= 5) {
        orig._5xxAttempts = attempts;
        await _sleep(Math.min(8000, 600 * attempts));
        return api(orig);
      }
    }

    if (status === 401 && !orig._retry && !orig.url?.includes("/auth/")) {
      orig._retry = true;
      if (refreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((token) => {
            if (token) {
              orig.headers.Authorization = `Bearer ${token}`;
              resolve(api(orig));
            } else {
              reject(err);
            }
          });
        });
      }
      refreshing = true;
      try {
        const { data } = await api.post<TokenResponse>("/api/auth/refresh");
        tokenStore.set(data.access_token);
        refreshQueue.forEach((cb) => cb(data.access_token));
        refreshQueue = [];
        orig.headers.Authorization = `Bearer ${data.access_token}`;
        return api(orig);
      } catch (refreshErr: any) {
        // Only clear auth on genuine 401/403 from /refresh. Network or 5xx
        // errors mean backend is unreachable, not that the user is logged out.
        const rStatus = refreshErr?.response?.status ?? 0;
        const isAuthFailure = rStatus === 401 || rStatus === 403;
        refreshQueue.forEach((cb) => cb(null));
        refreshQueue = [];
        if (isAuthFailure) {
          tokenStore.clear();
          if (typeof window !== "undefined") {
            try { localStorage.removeItem("hiroo-auth"); } catch {}
            const next = window.location.pathname + window.location.search;
            window.location.href = `/login?next=${encodeURIComponent(next)}`;
          }
        }
        // else: leave auth state alone — UI will show errors but session survives.
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  },
);

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post<TokenResponse>("/api/auth/register", data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post<TokenResponse>("/api/auth/login", data).then((r) => r.data),
  logout: () => api.post("/api/auth/logout"),
  me: () => api.get<User>("/api/auth/me").then((r) => r.data),
};

// ── QR login ─────────────────────────────────────────────────
export const qrAuthApi = {
  start: () =>
    api.post<{ code: string; expires_at: string; approve_url: string }>("/api/auth/qr/start")
      .then((r) => r.data),
  status: (code: string) =>
    api.get<{ status: "pending" | "approved" | "expired"; access_token?: string; user?: User }>(
      `/api/auth/qr/status`, { params: { code } },
    ).then((r) => r.data),
  approve: (code: string) =>
    api.post<{ ok: boolean; message: string }>(`/api/auth/qr/approve`, { code }).then((r) => r.data),
};

// ── Soundboard ───────────────────────────────────────────────
import type { SoundboardSound } from "@/types";
export const soundboardApi = {
  listServer: (serverId: string) =>
    api.get<SoundboardSound[]>(`/api/servers/${serverId}/sounds`).then((r) => r.data),
  listMine: () =>
    api.get<SoundboardSound[]>(`/api/me/sounds`).then((r) => r.data),
  upload: (serverId: string, file: File, name: string, emoji?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("name", name);
    if (emoji) form.append("emoji", emoji);
    return api.post<SoundboardSound>(`/api/servers/${serverId}/sounds`, form).then((r) => r.data);
  },
  update: (serverId: string, soundId: string, data: { name?: string; emoji?: string }) =>
    api.patch<SoundboardSound>(`/api/servers/${serverId}/sounds/${soundId}`, data).then((r) => r.data),
  delete: (serverId: string, soundId: string) =>
    api.delete(`/api/servers/${serverId}/sounds/${soundId}`),
};

// ── Users ────────────────────────────────────────────────────
export const usersApi = {
  get: (id: string) => api.get<UserPublic>(`/api/users/${id}`).then((r) => r.data),
  block: (id: string) => api.post(`/api/users/${id}/block`),
  unblock: (id: string) => api.delete(`/api/users/${id}/block`),
  listBlocks: () => api.get<UserPublic[]>(`/api/users/me/blocks`).then((r) => r.data),
  updateMe: (data: { display_name?: string; custom_status?: string; active_tag_server_id?: string | null }) =>
    api.patch<User>("/api/users/me", data).then((r) => r.data),
  tagIcons: () => api.get<{ icons: string[] }>("/api/meta/tag-icons").then((r) => r.data.icons),
  updatePreferences: (body: Partial<User>) =>
    api.patch<User>(`/api/users/me/preferences`, body).then((r) => r.data),
  listDevices: () => api.get<{
    id: string; platform: string; token_suffix: string;
    created_at: string | null; last_used_at: string | null;
  }[]>(`/api/users/me/devices`).then((r) => r.data),
  revokeDevice: (id: string) => api.delete(`/api/users/me/devices/${id}`),
  listSessions: () => api.get<{
    id: string; ip: string | null; user_agent: string | null;
    created_at: string | null; last_used_at: string | null; current: boolean;
  }[]>(`/api/users/me/sessions`).then((r) => r.data),
  revokeSession: (id: string) => api.delete(`/api/users/me/sessions/${id}`),
  revokeOtherSessions: () => api.delete(`/api/users/me/sessions`),
  updateStatus: (status: string) =>
    api.patch<User>("/api/users/me/status", { status }).then((r) => r.data),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<User>("/api/users/me/avatar", form).then((r) => r.data);
  },
  setPublicKey: (public_key: string, signing_public_key?: string) =>
    api.post<User>("/api/users/me/key", { public_key, signing_public_key }).then((r) => r.data),
};

// ── Servers ──────────────────────────────────────────────────
export const serversApi = {
  list: () => api.get<Server[]>("/api/servers").then((r) => r.data),
  discover: (q?: string) =>
    api.get<Server[]>("/api/servers/discover", { params: q ? { q } : undefined }).then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post<Server>("/api/servers", data).then((r) => r.data),
  get: (id: string) => api.get<Server>(`/api/servers/${id}`).then((r) => r.data),
  preview: (id: string) => api.get<Server>(`/api/servers/${id}/preview`).then((r) => r.data),
  update: (id: string, data: Partial<Server>) =>
    api.patch<Server>(`/api/servers/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/api/servers/${id}`),
  join: (code: string) => api.get<Server>(`/api/servers/join/${code}`).then((r) => r.data),
  leave: (id: string) => api.post(`/api/servers/${id}/leave`),
  members: (id: string) =>
    api.get<ServerMember[]>(`/api/servers/${id}/members`).then((r) => r.data),
  listMembers: (id: string) =>
    api.get<ServerMember[]>(`/api/servers/${id}/members`).then((r) => r.data),
  regenerateInvite: (id: string) =>
    api.post<{ invite_code: string }>(`/api/servers/${id}/invite`).then((r) => r.data),
  myPermissions: (id: string) =>
    api.get<{ permissions: number }>(`/api/servers/${id}/me/permissions`).then((r) => r.data.permissions),
  uploadIcon: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<Server>(`/api/servers/${id}/icon`, form).then((r) => r.data);
  },
  deleteIcon: (id: string) => api.delete<Server>(`/api/servers/${id}/icon`).then((r) => r.data),
  kickMember: (serverId: string, userId: string) =>
    api.delete(`/api/servers/${serverId}/members/${userId}`),
  updateMember: (serverId: string, userId: string, data: { role?: string; nickname?: string }) =>
    api.patch<ServerMember>(`/api/servers/${serverId}/members/${userId}`, data).then((r) => r.data),
  listBans: (serverId: string) =>
    api.get<ServerBan[]>(`/api/servers/${serverId}/bans`).then((r) => r.data),
  banMember: (serverId: string, userId: string, reason?: string | null) =>
    api.post<ServerBan>(`/api/servers/${serverId}/bans`, { user_id: userId, reason: reason ?? null }).then((r) => r.data),
  unbanMember: (serverId: string, userId: string) =>
    api.delete(`/api/servers/${serverId}/bans/${userId}`),
};

export interface ServerBan {
  user_id: string;
  banned_by: string | null;
  reason: string | null;
  created_at: string;
}

// ── Channels ─────────────────────────────────────────────────
export const channelsApi = {
  list: (serverId: string) =>
    api.get<Channel[]>(`/api/servers/${serverId}/channels`).then((r) => r.data),
  create: (serverId: string, data: { name: string; type?: string; topic?: string }) =>
    api.post<Channel>(`/api/servers/${serverId}/channels`, data).then((r) => r.data),
  update: (serverId: string, channelId: string, data: Partial<Channel>) =>
    api.patch<Channel>(`/api/servers/${serverId}/channels/${channelId}`, data).then((r) => r.data),
  delete: (serverId: string, channelId: string) =>
    api.delete(`/api/servers/${serverId}/channels/${channelId}`),
  reorder: (serverId: string, orderedIds: string[]) =>
    api.post(`/api/servers/${serverId}/channels/reorder`, orderedIds),
  listOverrides: (serverId: string, channelId: string) =>
    api.get<ChannelRoleOverride[]>(`/api/servers/${serverId}/channels/${channelId}/permissions`).then((r) => r.data),
  setOverride: (serverId: string, channelId: string, roleId: string, data: { allow: number; deny: number }) =>
    api.put<ChannelRoleOverride>(`/api/servers/${serverId}/channels/${channelId}/permissions/${roleId}`, data).then((r) => r.data),
  deleteOverride: (serverId: string, channelId: string, roleId: string) =>
    api.delete(`/api/servers/${serverId}/channels/${channelId}/permissions/${roleId}`),
};

export interface ChannelRoleOverride {
  role_id: string;
  allow: number;
  deny: number;
}

// ── Roles ────────────────────────────────────────────────────
export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
  hoist: boolean;
  mentionable: boolean;
  is_everyone: boolean;
}

export const rolesApi = {
  list: (serverId: string) =>
    api.get<Role[]>(`/api/servers/${serverId}/roles`).then((r) => r.data),
  create: (serverId: string, data: { name: string; color?: string; permissions?: number; hoist?: boolean; mentionable?: boolean }) =>
    api.post<Role>(`/api/servers/${serverId}/roles`, data).then((r) => r.data),
  update: (serverId: string, roleId: string, data: Partial<Role>) =>
    api.patch<Role>(`/api/servers/${serverId}/roles/${roleId}`, data).then((r) => r.data),
  delete: (serverId: string, roleId: string) =>
    api.delete(`/api/servers/${serverId}/roles/${roleId}`),
  memberRoles: (serverId: string, userId: string) =>
    api.get<string[]>(`/api/servers/${serverId}/roles/members/${userId}`).then((r) => r.data),
  setMemberRoles: (serverId: string, userId: string, roleIds: string[]) =>
    api.put<string[]>(`/api/servers/${serverId}/roles/members/${userId}`, { role_ids: roleIds }).then((r) => r.data),
};

// ── Messages ─────────────────────────────────────────────────
export const messagesApi = {
  list: (channelId: string, before?: string) =>
    api.get<PaginatedMessages>(`/api/channels/${channelId}/messages`, {
      params: before ? { before } : undefined,
    }).then((r) => r.data),
  send: (channelId: string, content: string, reply_to_id?: string) =>
    api.post<Message>(`/api/channels/${channelId}/messages`, { content, reply_to_id }).then((r) => r.data),
  edit: (channelId: string, msgId: string, content: string) =>
    api.patch<Message>(`/api/channels/${channelId}/messages/${msgId}`, { content }).then((r) => r.data),
  delete: (channelId: string, msgId: string) =>
    api.delete(`/api/channels/${channelId}/messages/${msgId}`),
  addReaction: (channelId: string, msgId: string, emoji: string) =>
    api.post(`/api/channels/${channelId}/messages/${msgId}/reactions`, { emoji }),
  removeReaction: (channelId: string, msgId: string, emoji: string) =>
    api.delete(`/api/channels/${channelId}/messages/${msgId}/reactions`, { params: { emoji } }),
  search: (channelId: string, params: SearchParams) =>
    api.get<{ items: Message[] }>(`/api/channels/${channelId}/messages/search`, { params }).then((r) => r.data),
};

export interface SearchParams {
  q?: string;
  author_id?: string;
  before?: string;
  after?: string;
  has?: "link" | "file" | "image";
  limit?: number;
}

// ── DMs ──────────────────────────────────────────────────────
export const dmsApi = {
  list: () => api.get<DirectMessage[]>("/api/dms").then((r) => r.data),
  get: (dmId: string) => api.get<DirectMessage>(`/api/dms/${dmId}`).then((r) => r.data),
  create: (user_ids: string[], name?: string) =>
    api.post<DirectMessage>("/api/dms", { user_ids, name }).then((r) => r.data),
  update: (dmId: string, data: { name?: string | null }) =>
    api.patch<DirectMessage>(`/api/dms/${dmId}`, data).then((r) => r.data),
  uploadIcon: (dmId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<DirectMessage>(`/api/dms/${dmId}/icon`, form).then((r) => r.data);
  },
  deleteIcon: (dmId: string) =>
    api.delete<DirectMessage>(`/api/dms/${dmId}/icon`).then((r) => r.data),
  kickMember: (dmId: string, userId: string) =>
    api.delete(`/api/dms/${dmId}/members/${userId}`),
  leave: (dmId: string, myUserId: string) =>
    api.delete(`/api/dms/${dmId}/members/${myUserId}`),
  sendMessage: (dmId: string, content: string, reply_to_id?: string | null) =>
    api.post<DMMessageType>(`/api/dms/${dmId}/messages`, { content, reply_to_id: reply_to_id ?? null }).then((r) => r.data),
  messages: (dmId: string, before?: string) =>
    api.get<{ items: DMMessageType[]; has_more: boolean; next_cursor: string | null }>(
      `/api/dms/${dmId}/messages`, { params: before ? { before } : undefined }
    ).then((r) => r.data),
  send: (dmId: string, content: string, reply_to_id?: string | null) =>
    api.post<DMMessageType>(`/api/dms/${dmId}/messages`, { content, reply_to_id: reply_to_id ?? null }).then((r) => r.data),
  edit: (dmId: string, msgId: string, content: string) =>
    api.patch<DMMessageType>(`/api/dms/${dmId}/messages/${msgId}`, { content }).then((r) => r.data),
  delete: (dmId: string, msgId: string) =>
    api.delete(`/api/dms/${dmId}/messages/${msgId}`),
  addReaction: (dmId: string, msgId: string, emoji: string) =>
    api.post(`/api/dms/${dmId}/messages/${msgId}/reactions`, { emoji }),
  removeReaction: (dmId: string, msgId: string, emoji: string) =>
    api.delete(`/api/dms/${dmId}/messages/${msgId}/reactions`, { params: { emoji } }),
  search: (dmId: string, params: SearchParams) =>
    api.get<{ items: DMMessageType[] }>(`/api/dms/${dmId}/messages/search`, { params }).then((r) => r.data),
};

// ── Friends ──────────────────────────────────────────────────
export const friendsApi = {
  list: () => api.get<UserPublic[]>("/api/friends").then((r) => r.data),
  pending: () => api.get<FriendRequest[]>("/api/friends/pending").then((r) => r.data),
  // Unified source of truth — same endpoint as the global block list
  // exposed from the profile popout.
  blocked: () => api.get<UserPublic[]>("/api/users/me/blocks").then((r) => r.data),
  unblock: (userId: string) => api.delete(`/api/users/${userId}/block`),
  sendRequest: (username: string) =>
    api.post<FriendRequest>("/api/friends/request", { username }).then((r) => r.data),
  accept: (id: string) => api.post<FriendRequest>(`/api/friends/request/${id}/accept`).then((r) => r.data),
  reject: (id: string) => api.post(`/api/friends/request/${id}/reject`),
  remove: (userId: string) => api.delete(`/api/friends/${userId}`),
};

// ── Inbox ─────────────────────────────────────────────────────
export const inboxApi = {
  list: (unread_only = false) =>
    api.get<Notification[]>("/api/inbox", { params: { unread_only } }).then((r) => r.data),
  markRead: (id: string) => api.patch(`/api/inbox/${id}/read`),
  markAllRead: () => api.post("/api/inbox/read-all"),
};

// ── Uploads ──────────────────────────────────────────────────
export interface UploadResult {
  url: string;
  filename: string;
  content_type: string;
  size: number;
}

export const uploadsApi = {
  attachment: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<UploadResult>("/api/uploads/attachment", form, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }).then((r) => r.data);
  },
};

// ── Voice ────────────────────────────────────────────────────
// ── Webhooks ─────────────────────────────────────────────────
export interface Webhook {
  id: string;
  channel_id: string;
  server_id: string;
  name: string;
  avatar_url: string | null;
  token: string;
  url: string;
  created_by: string | null;
  created_at: string;
}

export const webhooksApi = {
  list: (serverId: string, channelId: string) =>
    api.get<Webhook[]>(`/api/servers/${serverId}/channels/${channelId}/webhooks`).then((r) => r.data),
  create: (serverId: string, channelId: string, data: { name: string; avatar_url?: string | null }) =>
    api.post<Webhook>(`/api/servers/${serverId}/channels/${channelId}/webhooks`, data).then((r) => r.data),
  update: (serverId: string, channelId: string, webhookId: string, data: { name?: string; avatar_url?: string | null }) =>
    api.patch<Webhook>(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`, data).then((r) => r.data),
  regenerate: (serverId: string, channelId: string, webhookId: string) =>
    api.post<Webhook>(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}/regenerate`).then((r) => r.data),
  delete: (serverId: string, channelId: string, webhookId: string) =>
    api.delete(`/api/servers/${serverId}/channels/${channelId}/webhooks/${webhookId}`),
};

// ── Unfurl ───────────────────────────────────────────────────
export interface UnfurlData {
  url: string;
  resolved_url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  kind: "link" | "image" | "video" | "audio";
}

export const unfurlApi = {
  get: (url: string) =>
    api.get<UnfurlData>("/api/unfurl", { params: { url } }).then((r) => r.data),
};

export const voiceApi = {
  join: (channel_id: string) =>
    api.post<VoiceState>("/api/voice/join", { channel_id }).then((r) => r.data),
  leave: () => api.post("/api/voice/leave"),
  updateState: (data: Partial<VoiceState>) =>
    api.patch<VoiceState>("/api/voice/state", data).then((r) => r.data),
  token: (room: string) =>
    api.get<{ url: string; token: string }>("/api/voice/token", { params: { room } }).then((r) => r.data),
};

// ── Developer Applications ───────────────────────────────────────────────

export interface DevApplication {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  client_id: string;
  redirect_uris: string[];
  supports_commands: boolean;
  supports_voice: boolean;
  is_verified: boolean;
  intents: number;
  public_bot: boolean;
  created_at: string;
  has_bot: boolean;
}

export const applicationsApi = {
  list: () => api.get<DevApplication[]>("/api/applications").then((r) => r.data),
  create: (name: string, description?: string) =>
    api.post<DevApplication & { client_secret: string }>("/api/applications", { name, description }).then((r) => r.data),
  get: (id: string) => api.get<DevApplication>(`/api/applications/${id}`).then((r) => r.data),
  patch: (id: string, body: Partial<DevApplication>) =>
    api.patch<DevApplication>(`/api/applications/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/api/applications/${id}`),
  resetSecret: (id: string) =>
    api.post<{ client_secret: string }>(`/api/applications/${id}/secret/reset`).then((r) => r.data),
  createBot: (id: string) =>
    api.post<{ token: string; token_suffix: string; bot_user_id: string; shard_count: number }>(
      `/api/applications/${id}/bot`
    ).then((r) => r.data),
  resetBotToken: (id: string) =>
    api.post<{ token: string; token_suffix: string }>(`/api/applications/${id}/bot/token/reset`).then((r) => r.data),
  uploadIcon: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<DevApplication>(`/api/applications/${id}/icon`, fd).then((r) => r.data);
  },
};

// ── Slash Commands ───────────────────────────────────────────────────────

export interface SlashCommandOption {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  choices?: { name: string; value: string | number }[];
  options?: SlashCommandOption[];
}

export interface SlashCommand {
  id: string;
  application_id: string;
  type: "slash" | "user" | "message";
  name: string;
  description: string;
  options: SlashCommandOption[];
  guild_id: string | null;
}

export const commandsApi = {
  listForApp: (appId: string) =>
    api.get<SlashCommand[]>(`/api/commands/applications/${appId}/commands`).then((r) => r.data),
  forChannel: (args: { guild_id?: string | null; dm_id?: string | null; q?: string }) =>
    api.get<SlashCommand[]>(`/api/commands/for-channel`, { params: args }).then((r) => r.data),
};

// ── OAuth2 (consent screen) ──────────────────────────────────────────────

export interface AuthorizeInfo {
  application: {
    id: string;
    client_id: string;
    name: string;
    icon_url: string | null;
    description: string | null;
    is_verified: boolean;
    supports_commands: boolean;
    supports_voice: boolean;
  };
  scope: string[];
  user: { id: string; username: string; avatar_url: string | null };
}

export const oauth2Api = {
  authorizeInfo: (params: { client_id: string; scope: string; redirect_uri?: string }) => {
    const clean: Record<string, string> = { client_id: params.client_id, scope: params.scope };
    if (params.redirect_uri) clean.redirect_uri = params.redirect_uri;
    return api.get<AuthorizeInfo>(`/api/oauth2/authorize/info`, { params: clean }).then((r) => r.data);
  },
  authorize: (body: { client_id: string; redirect_uri?: string; scope: string; state?: string; guild_id?: string }) => {
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => v != null && fd.append(k, v));
    return api.post<{ location: string | null; success?: boolean; message?: string; code?: string; guild_id?: string }>(
      `/api/oauth2/authorize`, fd,
    ).then((r) => r.data);
  },
};

// ── Interactions ─────────────────────────────────────────────────────────

export interface InteractionCreatePayload {
  type: "component" | "command";
  custom_id?: string;
  command_id?: string | null;
  command_name?: string;
  channel_id?: string | null;
  dm_id?: string | null;
  message_id?: string | null;
  guild_id?: string | null;
  application_id?: string | null;
  values?: string[];
  options?: Record<string, unknown>;
}

export const interactionsApi = {
  send: (body: InteractionCreatePayload) =>
    api.post<{ id: string; correlation_id: string }>(`/api/interactions`, body).then((r) => r.data),
};
