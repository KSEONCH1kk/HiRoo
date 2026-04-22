import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SoundboardState {
  mutedUserIds: string[];
  isMuted: (uid: string) => boolean;
  toggleMuted: (uid: string) => void;
  setMuted: (uid: string, muted: boolean) => void;
}

/** Per-user "ignore their soundboard" list, persisted locally.
 * Right-click a participant in a voice room → toggle. */
export const useSoundboardStore = create<SoundboardState>()(
  persist(
    (set, get) => ({
      mutedUserIds: [],
      isMuted: (uid) => get().mutedUserIds.includes(uid),
      toggleMuted: (uid) =>
        set((s) => ({
          mutedUserIds: s.mutedUserIds.includes(uid)
            ? s.mutedUserIds.filter((x) => x !== uid)
            : [...s.mutedUserIds, uid],
        })),
      setMuted: (uid, muted) =>
        set((s) => ({
          mutedUserIds: muted
            ? Array.from(new Set([...s.mutedUserIds, uid]))
            : s.mutedUserIds.filter((x) => x !== uid),
        })),
    }),
    { name: "hiroo-soundboard-mutes" },
  ),
);
