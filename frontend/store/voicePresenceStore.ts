import { create } from "zustand";

interface State {
  byRoom: Record<string, string[]>; // roomId -> userIds

  join: (roomId: string, userId: string) => void;
  leave: (roomId: string, userId: string) => void;
  setRoom: (roomId: string, userIds: string[]) => void;
  clearUser: (userId: string) => void;
}

export const useVoicePresenceStore = create<State>((set) => ({
  byRoom: {},

  join: (roomId, userId) =>
    set((s) => {
      const cur = s.byRoom[roomId] ?? [];
      if (cur.includes(userId)) return s;
      return { byRoom: { ...s.byRoom, [roomId]: [...cur, userId] } };
    }),
  leave: (roomId, userId) =>
    set((s) => ({
      byRoom: {
        ...s.byRoom,
        [roomId]: (s.byRoom[roomId] ?? []).filter((u) => u !== userId),
      },
    })),
  setRoom: (roomId, userIds) =>
    set((s) => ({ byRoom: { ...s.byRoom, [roomId]: userIds } })),
  clearUser: (userId) =>
    set((s) => {
      const next: Record<string, string[]> = {};
      for (const [r, users] of Object.entries(s.byRoom)) {
        const filtered = users.filter((u) => u !== userId);
        if (filtered.length) next[r] = filtered;
      }
      return { byRoom: next };
    }),
}));
