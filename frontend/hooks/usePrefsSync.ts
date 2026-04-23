"use client";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useHotkeysStore } from "@/store/hotkeysStore";
import { usersApi } from "@/lib/api";

/**
 * Синхронизация пользовательских настроек (тема, акцент, хоткеи) между
 * устройствами.
 *
 * - При логине/обновлении `/me`: если в user есть значения — накатываем
 *   их на локальные сторы (и data-theme / --accent на документе).
 * - При локальных изменениях в сторах: дебаунс 600 мс → PATCH
 *   /api/users/me/preferences. Этот же PATCH возвращает свежего
 *   пользователя, и мы кладём его обратно в authStore.
 *
 * Чтобы серверный гидрат не вызывал сразу PATCH обратно, используем
 * `hydratingRef` — помечаем себя как "сейчас применяем, не шлите".
 */
export function usePrefsSync() {
  const user = useAuthStore((s) => s.user);
  const hydratingRef = useRef(false);
  const lastSentRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 1) Гидрат из /me ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    hydratingRef.current = true;

    try {
      // Форс-применяем к document, даже если в сторе уже стоит то же
      // значение (иначе после F5 до /me на html висит дефолтное data-theme).
      if (user.theme) useUIStore.getState().setTheme(user.theme);
      if (user.accent_color) useUIStore.getState().setAccent(user.accent_color);
      if (user.hotkeys && typeof user.hotkeys === "object") {
        const current = useHotkeysStore.getState().bindings;
        // Полная замена — серверная версия является истиной для этого
        // пользователя на этом устройстве.
        const incoming = user.hotkeys as Record<string, string>;
        if (JSON.stringify(current) !== JSON.stringify(incoming)) {
          useHotkeysStore.setState({ bindings: incoming as any });
        }
      }
    } finally {
      // Отпускаем флаг на следующем тике, чтобы наши же set-вызовы
      // успели сработать до включения watch-эффектов.
      setTimeout(() => { hydratingRef.current = false; }, 0);
    }
    // Сбросим "последний отправленный" — он описывает прошлого юзера.
    lastSentRef.current = "";
  }, [user?.id]);

  // ── 2) Watch → PATCH ────────────────────────────────────────────
  useEffect(() => {
    const schedule = () => {
      if (!useAuthStore.getState().user) return;
      if (hydratingRef.current) return;

      const { theme, accent } = useUIStore.getState();
      const { bindings } = useHotkeysStore.getState();
      const payload = {
        theme,
        accent_color: accent,
        hotkeys: bindings,
      };
      const key = JSON.stringify(payload);
      if (key === lastSentRef.current) return;
      lastSentRef.current = key;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          const updated = await usersApi.updatePreferences(payload as any);
          // Обновляем локального user, но БЕЗ перезапуска гидрата — мы
          // уже в синке с сервером, и заново применять значения лишнее.
          hydratingRef.current = true;
          useAuthStore.getState().updateUser(updated);
          setTimeout(() => { hydratingRef.current = false; }, 0);
        } catch (e) {
          // Если запрос упал — сбросим lastSent, чтобы повторная попытка
          // при следующем изменении отправила свежее значение.
          lastSentRef.current = "";
        }
      }, 600);
    };

    const offUI = useUIStore.subscribe(schedule);
    const offHk = useHotkeysStore.subscribe(schedule);
    return () => { offUI(); offHk(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
}
