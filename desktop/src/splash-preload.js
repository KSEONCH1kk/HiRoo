const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hirooSplash", {
  onStatus: (handler) => {
    const sub = (_e, payload) => {
      try { handler(payload); } catch {}
    };
    ipcRenderer.on("hiroo:splash:status", sub);
    return () => ipcRenderer.removeListener("hiroo:splash:status", sub);
  },
});
