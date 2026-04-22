"use client";
import { useEffect, useState } from "react";

/**
 * Bridge to the HiRoo desktop shell (Electron).
 * In a regular browser tab `window.hiroo` is undefined, so callers
 * should gate desktop-only features on `available`.
 */
interface DesktopApi {
  isDesktop: true;
  version: () => Promise<string>;
  notify: (title: string, body: string, opts?: { silent?: boolean }) => Promise<boolean>;
  setBadge: (count: number) => void;
  onShareRequest: (handler: (sources: ShareSource[]) => void) => () => void;
  pickShareSource: (id: string | null) => void;
  onMuteToggle: (handler: (muted: boolean) => void) => () => void;
}

export interface ShareSource {
  id: string;
  name: string;
  thumbnail: string;    // data URL
  display_id?: string;
  appIcon?: string | null;
}

declare global {
  interface Window { hiroo?: DesktopApi; }
}

export function useDesktop() {
  const [available, setAvailable] = useState(false);
  useEffect(() => { setAvailable(typeof window !== "undefined" && !!window.hiroo); }, []);
  return {
    available,
    api: typeof window !== "undefined" ? window.hiroo : undefined,
  };
}
