import { create } from "zustand";
import { usersApi } from "@/lib/api";

interface State {
  blockedIds: Set<string>;
  loaded: boolean;
  refresh: () => Promise<void>;
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  isBlocked: (userId: string) => boolean;
}

function notify() {
  // Tell any interested view (FriendsList, profile popout etc.) to refetch
  // its React Query-backed copy of the block list.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hiroo:blocks-updated"));
  }
}

export const useBlocksStore = create<State>((set, get) => ({
  blockedIds: new Set(),
  loaded: false,
  refresh: async () => {
    try {
      const users = await usersApi.listBlocks();
      set({ blockedIds: new Set(users.map((u) => u.id)), loaded: true });
    } catch {
      set({ loaded: true });
    }
    notify();
  },
  block: async (userId) => {
    await usersApi.block(userId);
    set((s) => {
      const next = new Set(s.blockedIds);
      next.add(userId);
      return { blockedIds: next };
    });
    notify();
  },
  unblock: async (userId) => {
    await usersApi.unblock(userId);
    set((s) => {
      const next = new Set(s.blockedIds);
      next.delete(userId);
      return { blockedIds: next };
    });
    notify();
  },
  isBlocked: (userId) => get().blockedIds.has(userId),
}));
