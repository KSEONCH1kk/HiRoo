import { create } from "zustand";
import { persist } from "zustand/middleware";

interface VoiceVolumeState {
  /** Per-user volume multiplier in [0, 2]. 1.0 = unchanged. */
  volumeByUserId: Record<string, number>;
  getVolume: (uid: string) => number;
  setVolume: (uid: string, v: number) => void;
  reset: (uid: string) => void;
}

/** Persistent per-participant volume set from the voice-call right-click
 * menu. HTMLAudioElement.volume is clamped to [0,1], so values > 1 are
 * applied through a WebAudio GainNode instead. */
export const useVoiceVolumeStore = create<VoiceVolumeState>()(
  persist(
    (set, get) => ({
      volumeByUserId: {},
      getVolume: (uid) => {
        const v = get().volumeByUserId[uid];
        return v === undefined ? 1 : v;
      },
      setVolume: (uid, v) =>
        set((s) => ({
          volumeByUserId: { ...s.volumeByUserId, [uid]: Math.max(0, Math.min(2, v)) },
        })),
      reset: (uid) =>
        set((s) => {
          const { [uid]: _, ...rest } = s.volumeByUserId;
          return { volumeByUserId: rest };
        }),
    }),
    { name: "hiroo-voice-volumes" },
  ),
);
