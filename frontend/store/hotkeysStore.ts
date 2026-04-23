import { create } from "zustand";
import { persist } from "zustand/middleware";

export type HotkeyAction =
  | "toggle_mute"
  | "toggle_deafen"
  | "push_to_talk"
  | "toggle_video"
  | "toggle_screen_share"
  | "disconnect"
  | "toggle_window";

export interface HotkeyDef {
  id: HotkeyAction;
  label: string;
  description?: string;
  /** `true` — событие приходит и на нажатие, и на отпускание (для PTT). */
  isHold?: boolean;
}

export const HOTKEY_DEFS: HotkeyDef[] = [
  { id: "toggle_mute",         label: "Микрофон",            description: "Включить/выключить свой микрофон" },
  { id: "toggle_deafen",       label: "Звук",                description: "Включить/выключить входящий звук" },
  { id: "push_to_talk",        label: "Push-to-Talk",        description: "Говорить, пока клавиша зажата", isHold: true },
  { id: "toggle_video",        label: "Камера",              description: "Включить/выключить веб-камеру" },
  { id: "toggle_screen_share", label: "Демонстрация экрана", description: "Начать/остановить шэринг" },
  { id: "disconnect",          label: "Отключиться",         description: "Покинуть голосовой канал" },
  { id: "toggle_window",       label: "Показать/скрыть окно" },
];

type Bindings = Partial<Record<HotkeyAction, string>>;

interface HotkeysState {
  bindings: Bindings;
  enabled: boolean;
  setBinding: (id: HotkeyAction, accelerator: string | null) => void;
  setEnabled: (v: boolean) => void;
  reset: () => void;
}

const DEFAULT_BINDINGS: Bindings = {
  toggle_window: "CommandOrControl+Shift+H",
};

export const useHotkeysStore = create<HotkeysState>()(
  persist(
    (set) => ({
      bindings: { ...DEFAULT_BINDINGS },
      enabled: true,
      setBinding: (id, accelerator) =>
        set((s) => {
          const next = { ...s.bindings };
          if (accelerator && accelerator.length > 0) next[id] = accelerator;
          else delete next[id];
          return { bindings: next };
        }),
      setEnabled: (enabled) => set({ enabled }),
      reset: () => set({ bindings: { ...DEFAULT_BINDINGS }, enabled: true }),
    }),
    { name: "hiroo-hotkeys", partialize: (s) => ({ bindings: s.bindings, enabled: s.enabled }) },
  ),
);
