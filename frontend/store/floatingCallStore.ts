import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FloatingCallState {
  /** Anchored from bottom-right. null = default (bottom: 18, right: 18). */
  offsetX: number | null;
  offsetY: number | null;
  setOffset: (x: number, y: number) => void;
  reset: () => void;
}

/** Stores the user-dragged position of the minimized voice widget.
 * Anchored from bottom-right so resizing the window keeps it in-frame. */
export const useFloatingCallStore = create<FloatingCallState>()(
  persist(
    (set) => ({
      offsetX: null,
      offsetY: null,
      setOffset: (x, y) => set({ offsetX: x, offsetY: y }),
      reset: () => set({ offsetX: null, offsetY: null }),
    }),
    { name: "hiroo-floating-call-pos" },
  ),
);
