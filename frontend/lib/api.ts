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

// Auto-refresh on 401
let refreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const orig = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status === 401 && !orig._retry && !orig.url?.includes("/auth/")) {
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
      } catch {
        tokenStore.clear();
        refreshQueue.forEach((cb) => cb(null));
        refreshQueue = [];
        if (typeof window !== "undefined") {
          try { localStorage.removeItem("hiroo-auth"); } catch {}
          const next = window.location.pathname + window.location.search;
          window.location.href = `/login?next=${encodeURIComponent(next)}`;
        }
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

// ── Users ────────────────────────────────────────────────────
export const usersApi = {
  get: (id: string) => api.get<UserPublic>(`/api/users/${id}`).then((r) => r.data),
  updateMe: (data: { display_name?: string; custom_status?: string }) =>
    api.patch<User>("/api/users/me", data).then((r) => r.data),
  updateStatus: (status: string) =>
    api.patch<User>("/api/users/me/status", { status }).then((r) => r.data),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<User>("/api/users/me/avatar", form).then((r) => r.data);
  },
};

// ── Servers ──────────────────────────────────────────────────
export const serversApi = {
  list: () => api.get<Server[]>("/api/servers").then((r) => r.data),
  discover: (q?: string) =>
    api.get<Server[]>("/api/servers/discover", { params: q ? { q } : undefined }).then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post<Server>("/api/servers", data).then((r) => r.data),
  get: (id: string) => api.get<Server>(`/api/servers/${id}`).then((r) => r.data),
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
};

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
};

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
};

// ── DMs ──────────────────────────────────────────────────────
export const dmsApi = {
  list: () => api.get<DirectMessage[]>("/api/dms").then((r) => r.data),
  get: (dmId: string) => api.get<DirectMessage>(`/api/dms/${dmId}`).then((r) => r.data),
  create: (user_ids: string[], name?: string) =>
    api.post<DirectMessage>("/api/dms", { user_ids, name }).then((r) => r.data),
  sendMessage: (dmId: string, content: string) =>
    api.post<DMMessageType>(`/api/dms/${dmId}/messages`, { content }).then((r) => r.data),
  messages: (dmId: string, before?: string) =>
    api.get<{ items: DMMessageType[]; has_more: boolean; next_cursor: string | null }>(
      `/api/dms/${dmId}/messages`, { params: before ? { before } : undefined }
    ).then((r) => r.data),
  send: (dmId: string, content: string) =>
    api.post<DMMessageType>(`/api/dms/${dmId}/messages`, { content }).then((r) => r.data),
  edit: (dmId: string, msgId: string, content: string) =>
    api.patch<DMMessageType>(`/api/dms/${dmId}/messages/${msgId}`, { content }).then((r) => r.data),
  delete: (dmId: string, msgId: string) =>
    api.delete(`/api/dms/${dmId}/messages/${msgId}`),
  addReaction: (dmId: string, msgId: string, emoji: string) =>
    api.post(`/api/dms/${dmId}/messages/${msgId}/reactions`, { emoji }),
  removeReaction: (dmId: string, msgId: string, emoji: string) =>
    api.delete(`/api/dms/${dmId}/messages/${msgId}/reactions`, { params: { emoji } }),
};

// ── Friends ──────────────────────────────────────────────────
export const friendsApi = {
  list: () => api.get<UserPublic[]>("/api/friends").then((r) => r.data),
  pending: () => api.get<FriendRequest[]>("/api/friends/pending").then((r) => r.data),
  blocked: () => api.get<UserPublic[]>("/api/friends/blocked").then((r) => r.data),
  sendRequest: (username: string) =>
    api.post<FriendRequest>("/api/friends/request", { username }).then((r) => r.data),
  accept: (id: string) => api.post<FriendRequest>(`/api/friends/request/${id}/accept`).then((r) => r.data),
  reject: (id: string) => api.post(`/api/friends/request/${id}/reject`),
  remove: (userId: string) => api.delete(`/api/friends/${userId}`),
  block: (userId: string) => api.post(`/api/friends/block/${userId}`),
  unblock: (userId: string) => api.delete(`/api/friends/block/${userId}`),
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
export const voiceApi = {
  join: (channel_id: string) =>
    api.post<VoiceState>("/api/voice/join", { channel_id }).then((r) => r.data),
  leave: () => api.post("/api/voice/leave"),
  updateState: (data: Partial<VoiceState>) =>
    api.patch<VoiceState>("/api/voice/state", data).then((r) => r.data),
  token: (room: string) =>
    api.get<{ url: string; token: string }>("/api/voice/token", { params: { room } }).then((r) => r.data),
};
