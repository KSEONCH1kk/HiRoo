"use client";
import { useEffect, useState } from "react";

/**
 * Detects whether the page is running inside our Capacitor (mobile) shell
 * and exposes a typed pointer to its plugin registry.
 *
 * In a normal browser `window.Capacitor` is undefined — callers should gate
 * features on `available` or `platform`.
 */
interface CapPlugin { [method: string]: (...args: any[]) => Promise<any>; }
interface CapacitorGlobal {
  isNativePlatform: () => boolean;
  getPlatform: () => "ios" | "android" | "web";
  Plugins: {
    LocalNotifications?: CapPlugin;
    PushNotifications?: CapPlugin;
    Haptics?: CapPlugin;
    StatusBar?: CapPlugin;
    App?: CapPlugin;
  };
}

declare global {
  interface Window { Capacitor?: CapacitorGlobal; }
}

export function useMobile() {
  const [platform, setPlatform] = useState<"ios" | "android" | "web" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.Capacitor) return;
    try {
      setPlatform(window.Capacitor.isNativePlatform() ? window.Capacitor.getPlatform() : "web");
    } catch {}
  }, []);

  return {
    platform,
    available: platform === "ios" || platform === "android",
    plugins: typeof window !== "undefined" ? window.Capacitor?.Plugins : undefined,
  };
}

/** Fire a native notification from any page. On web falls back to toast. */
export async function nativeNotify(title: string, body: string): Promise<boolean> {
  const cap = typeof window !== "undefined" ? window.Capacitor : undefined;
  const ln = cap?.Plugins?.LocalNotifications;
  if (!ln) return false;
  try {
    await ln.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_000_000_000),
        title, body,
        smallIcon: "ic_stat_hiroo",
      }],
    });
    return true;
  } catch {
    return false;
  }
}

/** Haptic pulse on supported devices. */
export async function hapticTap(style: "light" | "medium" | "heavy" = "light") {
  const cap = typeof window !== "undefined" ? window.Capacitor : undefined;
  const h = cap?.Plugins?.Haptics;
  if (!h) return;
  try { await h.impact({ style }); } catch {}
}
