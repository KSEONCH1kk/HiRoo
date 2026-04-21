import { create } from "zustand";

interface State {
  muted: Record<string, boolean>;
  deafened: Record<string, boolean>;

  setMuted: (userId: string, v: boolean) => void;
  setDeafened: (userId: string, v: boolean) => void;
  setBulk: (muted: string[], deafened: string[]) => void;
  clear: () => void;
}

export const useVoiceAdminStore = create<State>((set) => ({
  muted: {},
  deafened: {},
  setMuted: (userId, v) => set((s) => {
    const next = { ...s.muted };
    if (v) next[userId] = true;
    else delete next[userId];
    return { muted: next };
  }),
  setDeafened: (userId, v) => set((s) => {
    const next = { ...s.deafened };
    if (v) next[userId] = true;
    else delete next[userId];
    return { deafened: next };
  }),
  setBulk: (muted, deafened) => set({
    muted: Object.fromEntries(muted.map((u) => [u, true])),
    deafened: Object.fromEntries(deafened.map((u) => [u, true])),
  }),
  clear: () => set({ muted: {}, deafened: {} }),
}));
