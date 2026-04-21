import { create } from "zustand";

interface State {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

export const usePaletteStore = create<State>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
