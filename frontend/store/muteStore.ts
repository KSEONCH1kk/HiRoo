import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Local-only mute settings. Keyed as `server:<id>` or `dm:<id>`.
 * `until === null` means "muted until I turn it back on". */
type Entry = { until: number | null };

interface MuteState {
  map: Record<string, Entry>;
  mute: (key: string, durationMs: number | null) => void;
  unmute: (key: string) => void;
  _v: number; // ticks every second-ish so `useMuteStore(isMuted)` re-evaluates as timers expire
}

export const MUTE_DURATIONS: { label: string; ms: number | null }[] = [
  { label: "На 15 минут", ms: 15 * 60 * 1000 },
  { label: "На 1 час", ms: 60 * 60 * 1000 },
  { label: "На 3 часа", ms: 3 * 60 * 60 * 1000 },
  { label: "На 8 часов", ms: 8 * 60 * 60 * 1000 },
  { label: "На 24 часа", ms: 24 * 60 * 60 * 1000 },
  { label: "До тех пор пока не включу", ms: null },
];

export const useMuteStore = create<MuteState>()(
  persist(
    (set) => ({
      map: {},
      _v: 0,
      mute: (key, durationMs) =>
        set((s) => ({
          map: { ...s.map, [key]: { until: durationMs == null ? null : Date.now() + durationMs } },
        })),
      unmute: (key) =>
        set((s) => {
          const next = { ...s.map };
          delete next[key];
          return { map: next };
        }),
    }),
    { name: "hiroo-mute", partialize: (s) => ({ map: s.map }) },
  ),
);

// Tick the store every 30 seconds so components auto-refresh when a
// timed mute naturally expires.
if (typeof window !== "undefined") {
  setInterval(() => {
    useMuteStore.setState((s) => ({ _v: s._v + 1 }));
  }, 30_000);
}

/** Read-only helpers. */
export function isMuted(key: string): boolean {
  const entry = useMuteStore.getState().map[key];
  if (!entry) return false;
  if (entry.until === null) return true;
  return entry.until > Date.now();
}

export function muteExpiresAt(key: string): number | null {
  const entry = useMuteStore.getState().map[key];
  if (!entry) return null;
  return entry.until;
}

export function formatMuteExpiry(until: number | null): string {
  if (until === null) return "Беззвучный режим включён";
  const left = Math.max(0, until - Date.now());
  if (left === 0) return "";
  const mins = Math.ceil(left / 60_000);
  if (mins < 60) return `Ещё ${mins} мин`;
  const hours = Math.ceil(left / 3_600_000);
  if (hours < 48) return `Ещё ${hours} ч`;
  const days = Math.ceil(left / 86_400_000);
  return `Ещё ${days} дн`;
}
