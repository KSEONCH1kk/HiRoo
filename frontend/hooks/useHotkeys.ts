"use client";
import { useEffect, useRef, useState } from "react";
import { useHotkeysStore, type HotkeyAction } from "@/store/hotkeysStore";
import { useCallStore } from "@/store/callStore";
import { useDesktop } from "@/hooks/useDesktop";

/**
 * Глобальный диспетчер хоткеев. Монтируется один раз в корневом layout.
 *
 * - Десктоп: биндинги уходят в main через `hiroo.setHotkeys(...)`; main
 *   регистрирует их через Electron `globalShortcut`, кроме PTT — тот
 *   обрабатывается отдельно через uiohook-napi (настоящий keyup).
 * - Браузер: ничего не делаем, API недоступен.
 */
export function useHotkeys() {
  const { available, api } = useDesktop();
  const bindings = useHotkeysStore((s) => s.bindings);
  const enabled = useHotkeysStore((s) => s.enabled);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pttPrevMutedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!available || !api) return;

    const push = async () => {
      if (!enabled) {
        await api.clearHotkeys();
        setErrors({});
        return;
      }
      const payload = Object.entries(bindings).map(([id, accelerator]) => ({
        id,
        accelerator: accelerator || null,
      }));
      const res = await api.setHotkeys(payload);
      const errMap: Record<string, string> = {};
      for (const [id, r] of Object.entries(res || {})) {
        if (!r.ok) errMap[id] = r.error || "не удалось назначить";
      }
      setErrors(errMap);
    };
    push();

    const offHotkey = api.onHotkey((id) => dispatchHotkey(id as HotkeyAction));
    const offPtt = api.onPtt((phase) => {
      const ctrl = useCallStore.getState().controls;
      if (!ctrl) return;
      if (phase === "down") {
        pttPrevMutedRef.current = ctrl.isMuted;
        if (ctrl.isMuted) ctrl.toggleMute();
      } else {
        const wasMuted = pttPrevMutedRef.current;
        pttPrevMutedRef.current = null;
        if (wasMuted && !ctrl.isMuted) ctrl.toggleMute();
      }
    });

    return () => { offHotkey(); offPtt(); };
  }, [available, api, bindings, enabled]);

  return { errors, available };
}

function dispatchHotkey(id: HotkeyAction) {
  const ctrl = useCallStore.getState().controls;
  switch (id) {
    case "toggle_mute":         ctrl?.toggleMute(); break;
    case "toggle_deafen":       ctrl?.toggleDeafen(); break;
    case "toggle_video":        ctrl?.toggleVideo(); break;
    case "toggle_screen_share": ctrl?.toggleScreenShare(); break;
    case "disconnect":          ctrl?.leave()?.catch(() => {}); break;
    case "push_to_talk":        /* обрабатывается через onPtt */ break;
    case "toggle_window":       /* обрабатывается в main-процессе */ break;
  }
}
