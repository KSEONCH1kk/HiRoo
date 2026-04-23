/**
 * HiRoo Science — клиентская телеметрия.
 *
 * Модель повторяет Discord Science: вызовы `track()` складываются в
 * очередь, раз в 10 сек (или при 50 событиях) батч летит на сервер.
 * На закрытии вкладки шлём через `navigator.sendBeacon` — он доходит
 * даже если страница ушла.
 *
 * Ошибки проглатываются — клиент никогда не ретраит и не показывает
 * пользователю. Если opt-out включён (`science_enabled === false`),
 * `track()` превращается в no-op.
 */
import { tokenStore } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const ENDPOINT = `${API_BASE}/api/science`;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 50;
const BATCH_CAP = 100;

type Properties = Record<string, unknown>;

interface QueuedEvent {
  event_name: string;
  client_track_timestamp: string;
  properties: Properties;
}

interface WireEvent extends QueuedEvent {
  client_send_timestamp: string;
  context: ScienceContext;
}

interface ScienceContext {
  session_id: string;
  user_id: string | null;
  client_version: string;
  platform: "web" | "desktop" | "ios" | "android";
  locale: string;
  tz: string;
  is_desktop: boolean;
}

interface InitOpts {
  getUserId: () => string | null;
  getScienceEnabled: () => boolean;
  clientVersion: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let inited = false;
let opts: InitOpts | null = null;
let sessionId: string = "";

/** Инициализация. Безопасно вызывать несколько раз — no-op после первого. */
export function initScience(o: InitOpts): void {
  if (inited) return;
  inited = true;
  opts = o;
  sessionId = resolveSessionId();

  flushTimer = setInterval(() => { void flushScience(); }, FLUSH_INTERVAL_MS);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushBeacon();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushBeacon);
  }
}

export function track(event_name: string, properties: Properties = {}): void {
  if (!inited || !opts) return;
  try {
    if (!opts.getScienceEnabled()) return;
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(event_name)) {
      // Молча игнорим кривые имена — валидатор на бэке такой же.
      return;
    }
    queue.push({
      event_name,
      client_track_timestamp: new Date().toISOString(),
      properties,
    });
    if (queue.length >= MAX_QUEUE) void flushScience();
  } catch {
    /* fire-and-forget */
  }
}

/** Async flush — обычный `fetch` с `keepalive`. Ошибки проглатываются. */
export async function flushScience(): Promise<void> {
  if (!inited || !opts) return;
  if (queue.length === 0) return;
  const pending = queue.splice(0, BATCH_CAP);
  const payload = buildPayload(pending);
  const token = tokenStore.get();
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "include",
    });
  } catch {
    /* fire-and-forget */
  }
}

/** Синхронный flush через sendBeacon — единственное что надёжно работает на unload. */
function flushBeacon(): void {
  if (!inited || !opts) return;
  if (queue.length === 0) return;
  const pending = queue.splice(0, BATCH_CAP);
  const payload = buildPayload(pending);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
  } catch { /* fallthrough */ }
  // Фолбэк — пусть попробует обычный fetch с keepalive.
  void flushScience();
}

/** Сбросить очередь без отправки (например, при отключении телеметрии). */
export function clearScience(): void {
  queue = [];
}

// ─── Internals ───────────────────────────────────────────────────────

function buildPayload(events: QueuedEvent[]): { events: WireEvent[] } {
  const now = new Date().toISOString();
  const ctx = buildContext();
  return {
    events: events.map((e) => ({
      ...e,
      client_send_timestamp: now,
      context: ctx,
    })),
  };
}

function buildContext(): ScienceContext {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    session_id: sessionId,
    user_id: opts?.getUserId() ?? null,
    client_version: opts?.clientVersion ?? "",
    platform: detectPlatform(),
    locale: nav?.language ?? "",
    tz: resolveTz(),
    is_desktop: isDesktop(),
  };
}

function detectPlatform(): ScienceContext["platform"] {
  if (isDesktop()) return "desktop";
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return !!(w.hiroo?.isDesktop);
}

function resolveSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const key = "hiroo.science.sid";
    const existing = sessionStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const fresh = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "");
    sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return "nossn" + Math.random().toString(36).slice(2);
  }
}

function resolveTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
  catch { return ""; }
}
