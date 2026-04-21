import { create } from "zustand";
import type { Server, Channel, ServerMember } from "@/types";

interface ServerState {
  servers: Server[];
  channels: Record<string, Channel[]>; // serverId -> channels
  members: Record<string, ServerMember[]>;
  activeServerId: string | null;
  activeChannelId: string | null;

  setServers: (s: Server[]) => void;
  addServer: (s: Server) => void;
  removeServer: (id: string) => void;
  setChannels: (serverId: string, channels: Channel[]) => void;
  addChannel: (ch: Channel) => void;
  updateChannel: (ch: Channel) => void;
  removeChannel: (serverId: string, channelId: string) => void;
  reorderChannels: (serverId: string, orderedIds: string[]) => void;
  setMembers: (serverId: string, members: ServerMember[]) => void;
  setActiveServer: (id: string | null) => void;
  setActiveChannel: (id: string | null) => void;
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  channels: {},
  members: {},
  activeServerId: null,
  activeChannelId: null,

  setServers: (servers) => set({ servers }),
  addServer: (s) => set((st) => ({ servers: [...st.servers, s] })),
  removeServer: (id) => set((st) => ({ servers: st.servers.filter((s) => s.id !== id) })),
  setChannels: (serverId, channels) =>
    set((st) => ({ channels: { ...st.channels, [serverId]: channels } })),
  addChannel: (ch) =>
    set((st) => {
      const existing = st.channels[ch.server_id] ?? [];
      if (existing.some((c) => c.id === ch.id)) return st;
      return { channels: { ...st.channels, [ch.server_id]: [...existing, ch] } };
    }),
  updateChannel: (ch) =>
    set((st) => ({
      channels: {
        ...st.channels,
        [ch.server_id]: (st.channels[ch.server_id] ?? []).map((c) => c.id === ch.id ? ch : c),
      },
    })),
  removeChannel: (serverId, channelId) =>
    set((st) => ({
      channels: {
        ...st.channels,
        [serverId]: (st.channels[serverId] ?? []).filter((c) => c.id !== channelId),
      },
    })),
  reorderChannels: (serverId, orderedIds) =>
    set((st) => {
      const list = st.channels[serverId] ?? [];
      const byId = new Map(list.map((c) => [c.id, c]));
      const next: Channel[] = [];
      orderedIds.forEach((id, idx) => {
        const c = byId.get(id);
        if (c) { next.push({ ...c, position: idx }); byId.delete(id); }
      });
      for (const c of byId.values()) next.push(c);
      return { channels: { ...st.channels, [serverId]: next } };
    }),
  setMembers: (serverId, members) =>
    set((st) => ({ members: { ...st.members, [serverId]: members } })),
  setActiveServer: (id) => set({ activeServerId: id }),
  setActiveChannel: (id) => set({ activeChannelId: id }),
}));
