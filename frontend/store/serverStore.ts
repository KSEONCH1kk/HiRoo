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
    set((st) => ({
      channels: {
        ...st.channels,
        [ch.server_id]: [...(st.channels[ch.server_id] ?? []), ch],
      },
    })),
  setMembers: (serverId, members) =>
    set((st) => ({ members: { ...st.members, [serverId]: members } })),
  setActiveServer: (id) => set({ activeServerId: id }),
  setActiveChannel: (id) => set({ activeChannelId: id }),
}));
