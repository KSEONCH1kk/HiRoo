import { create } from "zustand";
import { persist } from "zustand/middleware";

interface State {
  inputDeviceId: string;   // "default" or deviceId
  outputDeviceId: string;  // "default" or deviceId
  inputVolume: number;     // 0..1
  outputVolume: number;    // 0..1

  setInputDeviceId: (id: string) => void;
  setOutputDeviceId: (id: string) => void;
  setInputVolume: (v: number) => void;
  setOutputVolume: (v: number) => void;
}

export const useVoiceSettingsStore = create<State>()(
  persist(
    (set) => ({
      inputDeviceId: "default",
      outputDeviceId: "default",
      inputVolume: 1,
      outputVolume: 1,
      setInputDeviceId: (inputDeviceId) => set({ inputDeviceId }),
      setOutputDeviceId: (outputDeviceId) => set({ outputDeviceId }),
      setInputVolume: (inputVolume) => set({ inputVolume: Math.max(0, Math.min(1, inputVolume)) }),
      setOutputVolume: (outputVolume) => set({ outputVolume: Math.max(0, Math.min(1, outputVolume)) }),
    }),
    { name: "hiroo-voice-settings" },
  ),
);
