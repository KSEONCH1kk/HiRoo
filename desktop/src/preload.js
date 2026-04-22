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
});
