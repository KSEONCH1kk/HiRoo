// HiRoo desktop — Electron main process.
// Wraps the web app at hiroo.intave.tech, adds a splash screen, system tray,
// Windows toast notifications, and a native screen-share picker.

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification,
        session, ipcMain, desktopCapturer, globalShortcut, dialog, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const globalKeys = require("./globalKeys");

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
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "splash-preload.js"),
    },
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
    // Обновления проверяются ДО создания главного окна — см. runUpdateFlow().
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

// ── Global hotkeys ────────────────────────────────────────────────────
//
// Все биндинги идут через uiohook-napi (пассивная подписка на клавиатуру
// ОС — не блокирует нажатие для фокусного приложения). Это важное отличие
// от `globalShortcut.register`, который съедает клавишу системно.
//
// Отдельно от tap-хоткеев есть PTT-режим: он шлёт рендеру "down"/"up"
// через канал `hiroo:ptt`, и фронт сам управляет удержанием.

/** @type {Set<string>} — какие action id сейчас зарегистрированы в globalKeys */
const registeredHotkeyIds = new Set();

function setHotkey(id, accelerator) {
  // Снятие — во всех случаях одинаково.
  if (!accelerator) {
    const res = globalKeys.setBinding(id, null);
    registeredHotkeyIds.delete(id);
    return res;
  }

  if (id === "push_to_talk") {
    const res = globalKeys.setBinding(id, accelerator, {
      mode: "hold",
      onDown: () => mainWindow?.webContents.send("hiroo:ptt", "down"),
      onUp:   () => mainWindow?.webContents.send("hiroo:ptt", "up"),
    });
    if (res.ok) registeredHotkeyIds.add(id);
    return res;
  }

  const res = globalKeys.setBinding(id, accelerator, {
    mode: "tap",
    onDown: () => {
      mainWindow?.webContents.send("hiroo:hotkey", id);
      if (id === "toggle_window") {
        if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide();
        else showMain();
      }
    },
  });
  if (res.ok) registeredHotkeyIds.add(id);
  return res;
}

ipcMain.handle("hiroo:hotkeys:set", (_e, bindings) => {
  const seen = new Set();
  const results = {};
  for (const b of Array.isArray(bindings) ? bindings : []) {
    if (!b || typeof b.id !== "string") continue;
    seen.add(b.id);
    results[b.id] = setHotkey(b.id, typeof b.accelerator === "string" ? b.accelerator : null);
  }
  // Снять те биндинги, которых нет в новом списке.
  for (const id of Array.from(registeredHotkeyIds)) {
    if (!seen.has(id)) setHotkey(id, null);
  }
  return results;
});

ipcMain.handle("hiroo:hotkeys:clear", () => {
  for (const id of Array.from(registeredHotkeyIds)) setHotkey(id, null);
  return { ok: true };
});

// ── Lifecycle ─────────────────────────────────────────────────────────

app.on("second-instance", showMain);

app.whenReady().then(async () => {
  createSplash();
  createTray();

  // Проверяем апдейты пока показываем сплэш. В зависимости от результата:
  //  - апдейт установлен → quit, процесс выйдет (инсталлер сам перезапустит);
  //  - апдейта нет / ошибка → обычный запуск.
  // Даём сплэшу мигнуть и покрасится перед тяжёлой работой.
  setTimeout(async () => {
    try {
      const updated = await runUpdateFlow();
      if (updated) return;           // инсталлер стартанул, quit уже вызван
    } catch (e) {
      console.warn("[hiroo] update flow failed:", e);
    }
    createMainWindow();
  }, 200);
  // Global hotkeys are installed by the renderer once it reads the user's
  // persisted bindings — see ipcMain.handle("hiroo:hotkeys:set") above.
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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  try { globalKeys.stop(); } catch {}
});


// ── Update checker / auto-installer ───────────────────────────────────
//
// Полный флоу: тянем /api/desktop/latest, сравниваем версии, если есть
// новая — скачиваем инсталлер прямо во время сплэша (с прогрессом),
// запускаем инсталлятор в тихом режиме и выходим. Если версия не
// обновилась, загрузка упала или формат релиза не подходит текущей ОС —
// молча возвращаем false, и запуск продолжается как обычно.

function cmpSemver(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
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

/** Загружает файл по URL. Отдаёт прогресс через onProgress({loaded,total,pct}). */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: "GET", url, redirect: "follow" });
    req.on("response", (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        req.abort();
        return;
      }
      const total = parseInt(res.headers["content-length"] || "0", 10) || 0;
      const out = fs.createWriteStream(destPath);
      let loaded = 0;
      let lastReport = 0;
      res.on("data", (chunk) => {
        out.write(chunk);
        loaded += chunk.length;
        const now = Date.now();
        if (now - lastReport > 120) {
          lastReport = now;
          if (onProgress) {
            const pct = total > 0 ? (loaded / total) : 0;
            try { onProgress({ loaded, total, pct }); } catch {}
          }
        }
      });
      res.on("end", () => {
        out.end(() => {
          if (onProgress) { try { onProgress({ loaded, total, pct: 1 }); } catch {} }
          resolve(destPath);
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function splashSend(channel, payload) {
  try { splashWindow?.webContents?.send(channel, payload); } catch {}
}

/** Выбирает для текущей платформы URL инсталлера из release-манифеста. */
function pickInstallerUrl(info) {
  const plat = process.platform;
  const arch = process.arch;
  const key = `${plat}-${arch}`;
  // Предпочтительный формат: { assets: { "win32-x64": "https://.../Setup.exe", ... } }
  if (info.assets && typeof info.assets === "object") {
    return info.assets[key] || info.assets[plat] || null;
  }
  // Легаси: единый download_url, угадываем по расширению.
  if (info.download_url) {
    const u = String(info.download_url).toLowerCase();
    if (plat === "win32" && u.endsWith(".exe")) return info.download_url;
    if (plat === "darwin" && (u.endsWith(".dmg") || u.endsWith(".zip"))) return info.download_url;
    if (plat === "linux" && (u.endsWith(".deb") || u.endsWith(".appimage"))) return info.download_url;
  }
  return null;
}

/** Запускает скачанный инсталлер. Возвращает true, если процесс передан ОС. */
function launchInstaller(filePath) {
  try {
    if (process.platform === "win32") {
      // Squirrel-инсталлер: /S = silent. Он сам остановит текущую копию,
      // поставит новую и перезапустит её. Для надёжности detach + unref.
      const child = spawn(filePath, ["/S"], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    }
    if (process.platform === "darwin") {
      // DMG-файл — открываем, дальше пользователь перетащит в Applications.
      // Полностью silent-установку без подписи и helper-приложения не
      // сделать, поэтому просто открываем образ и выходим.
      shell.openPath(filePath);
      return true;
    }
    if (process.platform === "linux") {
      // .deb — передаём apt/pkexec если есть, иначе просто открываем.
      shell.openPath(filePath);
      return true;
    }
  } catch (e) {
    console.warn("[hiroo] launchInstaller failed:", e);
  }
  return false;
}

/** Основной апдейт-флоу. Возвращает true, если запущен инсталлер и приложение выходит. */
async function runUpdateFlow() {
  const info = await fetchJson(`${HIROO_URL}/api/desktop/latest`);
  if (!info || !info.version) return false;

  const current = app.getVersion();
  if (cmpSemver(info.version, current) <= 0) return false;

  const url = pickInstallerUrl(info);
  if (!url) {
    // Нет подходящего инсталлера для этой платформы — просто предложим
    // открыть страницу загрузок и продолжим обычный запуск.
    return false;
  }

  splashSend("hiroo:splash:status", {
    phase: "update",
    text: `Обновление ${current} → ${info.version}`,
    version: info.version,
  });

  const tmp = path.join(os.tmpdir(), `HiRoo-update-${info.version}${path.extname(url) || ".bin"}`);
  try {
    await downloadFile(url, tmp, ({ pct, loaded, total }) => {
      splashSend("hiroo:splash:status", {
        phase: "update",
        text: total > 0
          ? `Обновление ${info.version} — ${Math.round(pct * 100)}%`
          : `Обновление ${info.version} — ${(loaded / (1024 * 1024)).toFixed(1)} МБ`,
        progress: pct,
      });
    });
  } catch (e) {
    console.warn("[hiroo] download failed:", e);
    splashSend("hiroo:splash:status", { phase: "error", text: "Не удалось загрузить обновление" });
    // Молчаливо падаем назад в обычный запуск.
    try { fs.unlinkSync(tmp); } catch {}
    return false;
  }

  splashSend("hiroo:splash:status", { phase: "install", text: "Запускаем установку…" });

  const launched = launchInstaller(tmp);
  if (!launched) {
    splashSend("hiroo:splash:status", { phase: "error", text: "Не удалось запустить установщик" });
    return false;
  }

  // Даём сплэшу показать финальный кадр перед выходом.
  await new Promise((r) => setTimeout(r, 1200));
  forceQuit = true;
  app.quit();
  return true;
}
