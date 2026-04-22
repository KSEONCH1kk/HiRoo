import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScreenRes = "720" | "1080" | "1440";
export type ScreenFps = 30 | 60;

interface State {
  inputDeviceId: string;   // "default" or deviceId
  outputDeviceId: string;  // "default" or deviceId
  inputVolume: number;     // 0..1
  outputVolume: number;    // 0..1
  screenResolution: ScreenRes;
  screenFps: ScreenFps;

  setInputDeviceId: (id: string) => void;
  setOutputDeviceId: (id: string) => void;
  setInputVolume: (v: number) => void;
  setOutputVolume: (v: number) => void;
  setScreenResolution: (v: ScreenRes) => void;
  setScreenFps: (v: ScreenFps) => void;
}

export function screenResolutionSize(r: ScreenRes): { width: number; height: number } {
  if (r === "720") return { width: 1280, height: 720 };
  if (r === "1440") return { width: 2560, height: 1440 };
  return { width: 1920, height: 1080 };
}

export function screenBitrate(r: ScreenRes, fps: ScreenFps): number {
  // Tuned to roughly match Discord Nitro screenshare quality.
  // 720p30 → 3M, 720p60 → 5M
  // 1080p30 → 6M, 1080p60 → 10M
  // 1440p30 → 12M, 1440p60 → 18M
  const base30 = r === "720" ? 3_000_000 : r === "1440" ? 12_000_000 : 6_000_000;
  const base60 = r === "720" ? 5_000_000 : r === "1440" ? 18_000_000 : 10_000_000;
  return fps >= 60 ? base60 : base30;
}

export const useVoiceSettingsStore = create<State>()(
  persist(
    (set) => ({
      inputDeviceId: "default",
      outputDeviceId: "default",
      inputVolume: 1,
      outputVolume: 1,
      screenResolution: "1080",
      screenFps: 60,
      setInputDeviceId: (inputDeviceId) => set({ inputDeviceId }),
      setOutputDeviceId: (outputDeviceId) => set({ outputDeviceId }),
      setInputVolume: (inputVolume) => set({ inputVolume: Math.max(0, Math.min(1, inputVolume)) }),
      setOutputVolume: (outputVolume) => set({ outputVolume: Math.max(0, Math.min(1, outputVolume)) }),
      setScreenResolution: (screenResolution) => set({ screenResolution }),
      setScreenFps: (screenFps) => set({ screenFps }),
    }),
    { name: "hiroo-voice-settings" },
  ),
);
