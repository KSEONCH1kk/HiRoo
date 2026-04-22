// HiRoo desktop — Electron main process.
// Wraps the web app at hiroo.intave.tech, adds a splash screen, system tray,
// Windows toast notifications, and a native screen-share picker.

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification,
        session, ipcMain, desktopCapturer, globalShortcut, dialog, net } = require("electron");
const path = require("node:path");

// Squirrel (Windows installer) needs this to not launch windows during install.
if (require("electron-squirrel-startup")) {
  app.quit();
  process.exit(0);
}

const HIROO_URL = (process.env.HIROO_URL
  || require("../package.json").config.hirooUrl
  || "https://hiroo.intave.tech").replace(/\/$/, "");
const DEV = !!process.env.HIROO_DEV;

// Required on Windows for Toast notifications to pick up the app name + icon
// instead of "node.exe" / "electron.exe".
if (process.platform === "win32") {
  app.setAppUserModelId("tech.intave.hiroo");
}

// Single-instance lock — clicking the tray icon while another copy exists
// focuses the existing window instead of spinning up a new process.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let splashWindow = null;
let tray = null;
let forceQuit = false;

function iconPath(name) {
  return path.join(__dirname, "assets", name);
}

// ── Splash ────────────────────────────────────────────────────────────

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => splashWindow.show());
}

// ── Main window ───────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 780,
    minHeight: 520,
    show: false,
    backgroundColor: "#0d0d10",
    icon: iconPath("icon.png"),
    title: "HiRoo",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
      webviewTag: false,
      spellcheck: true,
    },
  });

  // Hide the default menu bar on Windows/Linux (macOS uses app-level menu).
  mainWindow.setMenuBarVisibility(false);
  mainWindow.autoHideMenuBar = true;

  // Allow the web client to request camera / mic / screen / notifications
  // without re-prompting the user every launch.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, cb) => {
    const ok = [
      "media", "mediaKeySystem", "notifications",
      "display-capture", "audio-capture", "video-capture",
      "clipboard-read", "clipboard-sanitized-write",
    ].includes(permission);
    cb(ok);
  });

  // Custom screen-share source picker — forwards the list of sources to the
  // renderer via IPC and lets our React UI pick one. Falls back to the
  // system dialog if the renderer doesn't respond in time.
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 360, height: 200 },
      fetchWindowIcons: true,
    });

    const wc = mainWindow.webContents;
    const choice = await new Promise((resolve) => {
      let settled = false;
      const reply = (_e, id) => { settled = true; resolve(id); };
      ipcMain.once("hiroo:share:choice", reply);
      wc.send("hiroo:share:request", sources.map((s) => ({
        id: s.id, name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        display_id: s.display_id,
        appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      })));
      // Fallback: 60 s of silence → cancel the request.
      setTimeout(() => { if (!settled) { ipcMain.removeListener("hiroo:share:choice", reply); resolve(null); } }, 60_000);
    });
    if (!choice) return callback({});  // user cancelled
    const picked = sources.find((s) => s.id === choice);
    callback({ video: picked, audio: "loopback" });
  });

  // Open external links in the user's default browser, not in the window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(HIROO_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(HIROO_URL, { userAgent: defaultUA() });

  mainWindow.webContents.once("did-finish-load", () => {
    if (splashWindow) {
      try { splashWindow.close(); } catch {}
      splashWindow = null;
    }
    mainWindow.show();
    if (DEV) mainWindow.webContents.openDevTools({ mode: "detach" });
    // Defer the update check until the UI is actually visible so the dialog
    // doesn't race the splash.
    setTimeout(() => { checkForUpdates().catch(() => {}); }, 1200);
  });

  // Keep the process alive when the user closes the window — app lives in
  // the tray. Hold Ctrl while closing or use tray → Quit to actually exit.
  mainWindow.on("close", (e) => {
    if (!forceQuit) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function defaultUA() {
  const base = session.defaultSession.getUserAgent()
    .replace(/Electron\/[^\s]+\s*/g, "")
    .replace(/HirooDesktop\/[^\s]+\s*/g, "");
  return `${base.trim()} HirooDesktop/${app.getVersion()}`;
}

// ── Tray ──────────────────────────────────────────────────────────────

function createTray() {
  try {
    const img = nativeImage.createFromPath(iconPath("tray.png"));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  } catch {
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.setToolTip("HiRoo");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Открыть HiRoo",  click: showMain },
    { label: "Заглушить уведомления", type: "checkbox", id: "mute",
      click: (item) => { mainWindow?.webContents.send("hiroo:mute", item.checked); } },
    { type: "separator" },
    { label: "О приложении", click: () => shell.openExternal(`${HIROO_URL}/about`) },
    { label: "Выйти", click: () => { forceQuit = true; app.quit(); } },
  ]));
  tray.on("click", showMain);
  tray.on("double-click", showMain);
}

function showMain() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// ── IPC glue ──────────────────────────────────────────────────────────

ipcMain.on("hiroo:set-badge", (_e, count) => {
  if (typeof count !== "number") return;
  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  } else {
    mainWindow?.setOverlayIcon(count > 0 ? null : null, count > 0 ? String(count) : "");
  }
});

ipcMain.handle("hiroo:notify", (_e, { title, body, silent }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: title || "HiRoo",
    body: body || "",
    silent: !!silent,
    icon: iconPath("icon.png"),
  });
  n.on("click", showMain);
  n.show();
  return true;
});

ipcMain.handle("hiroo:version", () => app.getVersion());

// ── Lifecycle ─────────────────────────────────────────────────────────

app.on("second-instance", showMain);

app.whenReady().then(() => {
  createSplash();
  // Give the splash a beat to paint before we start the heavy main window.
  setTimeout(createMainWindow, 150);
  createTray();

  // Ctrl+Shift+H — quick show/hide.
  globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showMain();
  });
});

app.on("before-quit", () => { forceQuit = true; });

app.on("window-all-closed", () => {
  // Keep running in the tray on Win/Linux; macOS follows its usual convention.
  if (process.platform === "darwin") return;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  else showMain();
});

app.on("will-quit", () => globalShortcut.unregisterAll());


// ── Update checker ────────────────────────────────────────────────────
//
// Simple, non-intrusive: hits /api/desktop/latest once on startup, compares
// semver against app.getVersion(). If newer, shows a modal offering to open
// the download link. No silent auto-install — that would need full
// electron-updater (Squirrel feed) integration, can be added later.

function cmpSemver(a, b) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = net.request({ method: "GET", url });
    let body = "";
    req.on("response", (res) => {
      res.on("data", (c) => { body += c.toString(); });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function checkForUpdates() {
  const info = await fetchJson(`${HIROO_URL}/api/desktop/latest`);
  if (!info || !info.version) return;
  const current = app.getVersion();
  if (cmpSemver(info.version, current) <= 0) return;   // already up to date

  const { response } = await dialog.showMessageBox(mainWindow || {
    type: "info",
  }, {
    type: "info",
    title: "Доступна новая версия HiRoo",
    message: `Установлена ${current}, доступна ${info.version}.`,
    detail: info.notes || "Обновите, чтобы получить последние улучшения.",
    buttons: info.mandatory
      ? ["Скачать"]
      : ["Скачать", "Позже"],
    defaultId: 0,
    cancelId: info.mandatory ? 0 : 1,
    noLink: true,
  });
  if (response === 0 && info.download_url) {
    shell.openExternal(info.download_url);
    if (info.mandatory) {
      forceQuit = true;
      app.quit();
    }
  }
}
