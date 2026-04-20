import { create } from "zustand";

interface UnreadState {
  // Per-server mention counts (red badge on server rail)
  mentionsByServer: Record<string, number>;
  // Per-DM unread counts (red badge on DM sidebar)
  unreadByDm: Record<string, number>;

  addServerMention: (serverId: string, amount?: number) => void;
  clearServerMentions: (serverId: string) => void;

  addDmUnread: (dmId: string, amount?: number) => void;
  clearDmUnread: (dmId: string) => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  mentionsByServer: {},
  unreadByDm: {},

  addServerMention: (serverId, amount = 1) =>
    set((s) => ({ mentionsByServer: { ...s.mentionsByServer, [serverId]: (s.mentionsByServer[serverId] ?? 0) + amount } })),
  clearServerMentions: (serverId) =>
    set((s) => {
      if (!s.mentionsByServer[serverId]) return s;
      const { [serverId]: _, ...rest } = s.mentionsByServer;
      return { mentionsByServer: rest };
    }),

  addDmUnread: (dmId, amount = 1) =>
    set((s) => ({ unreadByDm: { ...s.unreadByDm, [dmId]: (s.unreadByDm[dmId] ?? 0) + amount } })),
  clearDmUnread: (dmId) =>
    set((s) => {
      if (!s.unreadByDm[dmId]) return s;
      const { [dmId]: _, ...rest } = s.unreadByDm;
      return { unreadByDm: rest };
    }),
}));
