import { create } from "zustand";

interface State {
  url: string | null;
  filename?: string | null;
  open: (url: string, filename?: string | null) => void;
  close: () => void;
}

export const useImageViewerStore = create<State>((set) => ({
  url: null,
  filename: null,
  open: (url, filename) => set({ url, filename: filename ?? null }),
  close: () => set({ url: null, filename: null }),
}));
