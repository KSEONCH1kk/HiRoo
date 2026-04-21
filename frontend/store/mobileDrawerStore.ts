import { create } from "zustand";

interface State {
  leftOpen: boolean;
  rightOpen: boolean;
  setLeftOpen: (v: boolean) => void;
  setRightOpen: (v: boolean) => void;
  closeAll: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
}

export const useMobileDrawerStore = create<State>((set) => ({
  leftOpen: false,
  rightOpen: false,
  setLeftOpen: (leftOpen) => set({ leftOpen, rightOpen: false }),
  setRightOpen: (rightOpen) => set({ rightOpen, leftOpen: false }),
  closeAll: () => set({ leftOpen: false, rightOpen: false }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen, rightOpen: false })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen, leftOpen: false })),
}));
