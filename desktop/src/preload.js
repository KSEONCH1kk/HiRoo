const { contextBridge, ipcRenderer } = require("electron");

// Expose a tiny, well-scoped API to the web app running inside Electron.
// `window.hiroo` is `undefined` in plain browser tabs, so the web UI can
// progressively enhance with desktop-only features when it detects us.
contextBridge.exposeInMainWorld("hiroo", {
  isDesktop: true,
  version: () => ipcRenderer.invoke("hiroo:version"),

  // Native Windows / macOS / Linux toast notifications.
  notify: (title, body, opts = {}) =>
    ipcRenderer.invoke("hiroo:notify", { title, body, silent: !!opts.silent }),

  // Taskbar badge (unread counter). Pass 0 to clear.
  setBadge: (count) => ipcRenderer.send("hiroo:set-badge", count),

  // ─ Screen share picker ────────────────────────────────────────────
  // Main process forwards getDisplayMedia() source lists via IPC. The web
  // UI subscribes, renders its own nice picker and replies with a chosen id.
  onShareRequest: (handler) => {
    const sub = (_e, sources) => handler(sources);
    ipcRenderer.on("hiroo:share:request", sub);
    return () => ipcRenderer.removeListener("hiroo:share:request", sub);
  },
  pickShareSource: (id) => ipcRenderer.send("hiroo:share:choice", id),

  // ─ Tray → renderer events ─────────────────────────────────────────
  onMuteToggle: (handler) => {
    const sub = (_e, muted) => handler(!!muted);
    ipcRenderer.on("hiroo:mute", sub);
    return () => ipcRenderer.removeListener("hiroo:mute", sub);
  },

  // ─ Global hotkeys ─────────────────────────────────────────────────
  // Renderer passes an array of { id, accelerator } bindings; empty string
  // or null accelerator unregisters that id. Main process replies with
  // per-id { ok, error? } so the UI can highlight conflicts.
  setHotkeys: (bindings) => ipcRenderer.invoke("hiroo:hotkeys:set", bindings),
  clearHotkeys: () => ipcRenderer.invoke("hiroo:hotkeys:clear"),
  onHotkey: (handler) => {
    const sub = (_e, id) => handler(String(id));
    ipcRenderer.on("hiroo:hotkey", sub);
    return () => ipcRenderer.removeListener("hiroo:hotkey", sub);
  },
  onPtt: (handler) => {
    const sub = (_e, phase) => handler(phase === "down" ? "down" : "up");
    ipcRenderer.on("hiroo:ptt", sub);
    return () => ipcRenderer.removeListener("hiroo:ptt", sub);
  },
});
