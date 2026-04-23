import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserPublic } from "@/types";

type AppMode = "server" | "dms" | "friends" | "inbox" | "settings" | "voice" | "explore";

interface UIState {
  mode: AppMode;
  theme: "dark" | "light";
  accent: string;
  membersOpen: boolean;
  cmdOpen: boolean;
  profileUser: UserPublic | null;
  incomingCall: boolean;
  // When set, a ServerPreviewModal opens at the root layout level.
  previewServerId: string | null;

  setMode: (m: AppMode) => void;
  setTheme: (t: "dark" | "light") => void;
  setAccent: (a: string) => void;
  setMembersOpen: (v: boolean) => void;
  setCmdOpen: (v: boolean) => void;
  setProfileUser: (u: UserPublic | null) => void;
  setIncomingCall: (v: boolean) => void;
  setPreviewServerId: (id: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      mode: "dms",
      theme: "dark",
      accent: "#7c5cff",
      membersOpen: true,
      cmdOpen: false,
      profileUser: null,
      incomingCall: false,
      previewServerId: null,

      setMode: (mode) => set({ mode }),
      setTheme: (theme) => {
        if (typeof document !== "undefined")
          document.documentElement.setAttribute("data-theme", theme);
        set({ theme });
      },
      setAccent: (accent) => {
        if (typeof document !== "undefined")
          document.documentElement.style.setProperty("--accent", accent);
        set({ accent });
      },
      setMembersOpen: (membersOpen) => set({ membersOpen }),
      setCmdOpen: (cmdOpen) => set({ cmdOpen }),
      setProfileUser: (profileUser) => set({ profileUser }),
      setIncomingCall: (incomingCall) => set({ incomingCall }),
      setPreviewServerId: (previewServerId) => set({ previewServerId }),
    }),
    {
      name: "hiroo-ui",
      partialize: (s: UIState) => ({ theme: s.theme, accent: s.accent }) as any,
      onRehydrateStorage: () => (state: UIState | undefined) => {
        if (typeof document === "undefined" || !state) return;
        try {
          document.documentElement.setAttribute("data-theme", state.theme);
          document.documentElement.style.setProperty("--accent", state.accent);
        } catch {}
      },
    } as any,
  ),
);
