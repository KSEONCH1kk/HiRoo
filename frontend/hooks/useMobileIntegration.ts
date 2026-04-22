"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

/**
 * Mobile-only side effects:
 *   • registers the FCM token with our backend when the native shell delivers one;
 *   • pings /api/mobile/latest on start and prompts the user to download a newer APK.
 *
 * No-op on web / desktop.
 */
export function useMobileIntegration() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    const platform: string = cap.getPlatform();
    const push = cap.Plugins?.PushNotifications;
    const App = cap.Plugins?.App;

    // ─── FCM / APNS registration ─────────────────────────────────
    if (push && user) {
      (async () => {
        try {
          const perm = await push.requestPermissions();
          if (perm.receive !== "granted") return;
          await push.register();

          push.addListener("registration", async (tok: { value: string }) => {
            try {
              await api.post("/api/mobile/device-token", {
                token: tok.value, platform,
              });
            } catch {}
          });

          push.addListener("registrationError", (err: any) => {
            console.warn("push registration error:", err);
          });

          push.addListener("pushNotificationActionPerformed", (action: any) => {
            const data = action?.notification?.data ?? {};
            if (data.dm_id) window.location.href = `/dms/${data.dm_id}`;
            else if (data.channel_id && data.server_id) {
              window.location.href = `/servers/${data.server_id}/channels/${data.channel_id}`;
            }
          });
        } catch (e) {
          console.warn("push init failed:", e);
        }
      })();
    }

    // ─── Update check ────────────────────────────────────────────
    if (App) {
      (async () => {
        try {
          const info = await App.getInfo();
          const latest = await fetch("/api/mobile/latest").then((r) => r.json());
          if (!latest?.version) return;
          if (cmpSemver(latest.version, info.version) <= 0) return;

          const msg = latest.notes
            ? `Доступна ${latest.version}:\n\n${latest.notes}\n\nОбновить?`
            : `Доступна ${latest.version}. Обновить сейчас?`;
          if (confirm(msg) && latest.apk_url) {
            // Capacitor Browser plugin would be nicer; window.open works too.
            window.open(latest.apk_url, "_system");
            if (latest.mandatory) {
              // Lock the UI until user installs — show a blocking overlay.
              showMandatoryOverlay();
            }
          }
        } catch (e) {
          console.warn("update check failed:", e);
        }
      })();
    }
  }, [user?.id]);
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

function showMandatoryOverlay() {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,0.92); color:#fff;
    display:flex; align-items:center; justify-content:center;
    font:500 15px/1.5 system-ui, sans-serif; text-align:center; padding:20px;
  `;
  el.textContent = "Обновление обязательно. Установите новую версию и перезапустите приложение.";
  document.body.appendChild(el);
}
