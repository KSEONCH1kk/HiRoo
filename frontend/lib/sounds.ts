const MUTE_KEY = "hiroo-sfx-muted";

export function isSfxMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setSfxMuted(v: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  if (v) stopCall();
}

let callAudio: HTMLAudioElement | null = null;
let notifyAudio: HTMLAudioElement | null = null;

function getCallAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!callAudio) {
    callAudio = new Audio("/sounds/call.mp3");
    callAudio.loop = true;
    callAudio.volume = 0.7;
    callAudio.preload = "auto";
  }
  return callAudio;
}

function getNotifyAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!notifyAudio) {
    notifyAudio = new Audio("/sounds/notify.mp3");
    notifyAudio.volume = 0.55;
    notifyAudio.preload = "auto";
  }
  return notifyAudio;
}

export function playCall() {
  if (isSfxMuted()) return;
  const a = getCallAudio();
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {}
}

export function stopCall() {
  const a = getCallAudio();
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
  } catch {}
}

let lastNotifyAt = 0;
export function playNotify() {
  if (isSfxMuted()) return;
  const now = Date.now();
  if (now - lastNotifyAt < 400) return;
  lastNotifyAt = now;
  const a = getNotifyAudio();
  if (!a) return;
  try {
    const clone = a.cloneNode() as HTMLAudioElement;
    clone.volume = a.volume;
    clone.play().catch(() => {});
  } catch {
    try { a.currentTime = 0; a.play().catch(() => {}); } catch {}
  }
}
