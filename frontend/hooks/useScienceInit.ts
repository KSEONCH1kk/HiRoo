"use client";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { initScience, track } from "@/lib/science";

/**
 * Инициализирует клиентскую телеметрию один раз за сессию вкладки.
 * Колбэки читают состояние через `.getState()` — не подписываемся,
 * чтобы изменение user не триггерило re-init.
 */
export function useScienceInit() {
  useEffect(() => {
    initScience({
      getUserId: () => useAuthStore.getState().user?.id ?? null,
      getScienceEnabled: () => useAuthStore.getState().user?.science_enabled ?? true,
      clientVersion: (process.env.NEXT_PUBLIC_APP_VERSION as string) || "dev",
    });
    track("app_launched", { cold: true });
  }, []);
}
