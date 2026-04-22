import { create } from "zustand";

interface Toast {
  id: string;
  content: string;
}

interface State {
  toasts: Toast[];
  push: (t: Toast) => void;
  remove: (id: string) => void;
}

export const useEphemeralToastStore = create<State>((set) => ({
  toasts: [],
  push: (t) => {
    set((s) => ({ toasts: [...s.toasts, t] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
    }, 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
