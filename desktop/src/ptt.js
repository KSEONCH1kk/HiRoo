// Настоящий push-to-talk через uiohook-napi: нативная подписка на
// keydown/keyup на уровне ОС, работает, когда окно HiRoo не в фокусе.
//
// Electron'овский `globalShortcut` не умеет отдавать keyup, поэтому PTT
// обрабатывается отдельно — через этот модуль.

let uIOhook = null;
let UiohookKey = null;
let started = false;
let activeBinding = null;          // { keyCode, ctrl, alt, shift, meta }
let onDownFn = null;
let onUpFn = null;
let heldDown = false;

// Track modifier state. uiohook шлёт keydown/keyup для каждой клавиши
// отдельно, поэтому собираем картину сами.
const mods = { ctrl: false, alt: false, shift: false, meta: false };

function tryLoad() {
  if (uIOhook) return true;
  try {
    const mod = require("uiohook-napi");
    uIOhook = mod.uIOhook;
    UiohookKey = mod.UiohookKey;
    return true;
  } catch (e) {
    console.warn("[hiroo] uiohook-napi unavailable:", e.message);
    return false;
  }
}

function ensureStarted() {
  if (!tryLoad()) return false;
  if (started) return true;

  uIOhook.on("keydown", (e) => {
    updateMods(e, true);
    if (!activeBinding) return;
    if (!matches(e, activeBinding)) return;
    if (heldDown) return;           // игнорируем авто-повторы ОС
    heldDown = true;
    if (onDownFn) { try { onDownFn(); } catch {} }
  });

  uIOhook.on("keyup", (e) => {
    updateMods(e, false);
    if (!activeBinding) return;
    if (!heldDown) return;
    // Считаем отпусканием любое отпускание главной клавиши ИЛИ
    // отпускание любого из удерживавшихся модификаторов — иначе можно
    // залипнуть, если пользователь отпустил Shift раньше буквы.
    if (isRelease(e, activeBinding)) {
      heldDown = false;
      if (onUpFn) { try { onUpFn(); } catch {} }
    }
  });

  try { uIOhook.start(); started = true; }
  catch (e) { console.warn("[hiroo] uIOhook.start failed:", e.message); return false; }
  return true;
}

function updateMods(e, pressed) {
  const K = UiohookKey;
  if (!K) return;
  if (e.keycode === K.Ctrl || e.keycode === K.CtrlRight) mods.ctrl = pressed;
  if (e.keycode === K.Alt  || e.keycode === K.AltRight)  mods.alt  = pressed;
  if (e.keycode === K.Shift || e.keycode === K.ShiftRight) mods.shift = pressed;
  if (e.keycode === K.Meta || e.keycode === K.MetaRight) mods.meta = pressed;
}

function matches(e, b) {
  if (e.keycode !== b.keyCode) return false;
  if (!!b.ctrl  !== !!(mods.ctrl  || e.ctrlKey))  return false;
  if (!!b.alt   !== !!(mods.alt   || e.altKey))   return false;
  if (!!b.shift !== !!(mods.shift || e.shiftKey)) return false;
  if (!!b.meta  !== !!(mods.meta  || e.metaKey))  return false;
  return true;
}

function isRelease(e, b) {
  if (e.keycode === b.keyCode) return true;
  const K = UiohookKey;
  if (!K) return false;
  if (b.ctrl && (e.keycode === K.Ctrl || e.keycode === K.CtrlRight)) return true;
  if (b.alt  && (e.keycode === K.Alt  || e.keycode === K.AltRight))  return true;
  if (b.shift && (e.keycode === K.Shift || e.keycode === K.ShiftRight)) return true;
  if (b.meta && (e.keycode === K.Meta || e.keycode === K.MetaRight)) return true;
  return false;
}

/**
 * Задать/снять PTT-биндинг. Accelerator — строка в формате Electron:
 *   "Shift+Space", "CommandOrControl+Alt+V", "F4", "Space".
 * Null/пустая строка — снять.
 */
function setPushToTalk(accelerator, { onDown, onUp }) {
  onDownFn = onDown || null;
  onUpFn = onUp || null;

  if (!accelerator) {
    activeBinding = null;
    heldDown = false;
    return { ok: true };
  }
  if (!ensureStarted()) {
    return { ok: false, error: "uiohook недоступен" };
  }
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return { ok: false, error: "не удалось разобрать комбинацию" };
  activeBinding = parsed;
  heldDown = false;
  return { ok: true };
}

function stop() {
  if (started && uIOhook) {
    try { uIOhook.stop(); } catch {}
  }
  started = false;
  activeBinding = null;
  onDownFn = null;
  onUpFn = null;
}

function parseAccelerator(acc) {
  if (!UiohookKey) return null;
  const parts = acc.split("+").map((p) => p.trim()).filter(Boolean);
  const out = { keyCode: 0, ctrl: false, alt: false, shift: false, meta: false };
  for (const raw of parts) {
    const k = raw.toLowerCase();
    if (k === "ctrl" || k === "control" || k === "cmdorctrl" || k === "commandorcontrol") {
      if (process.platform === "darwin" && k.startsWith("cmdor")) out.meta = true;
      else out.ctrl = true;
    } else if (k === "cmd" || k === "command" || k === "super" || k === "meta") {
      if (process.platform === "darwin") out.meta = true;
      else out.ctrl = true;
    } else if (k === "shift") out.shift = true;
    else if (k === "alt" || k === "option") out.alt = true;
    else {
      const code = keyNameToUiohook(raw);
      if (code == null) return null;
      out.keyCode = code;
    }
  }
  if (!out.keyCode) return null;
  return out;
}

function keyNameToUiohook(name) {
  const K = UiohookKey;
  if (!K) return null;
  const n = name.toLowerCase();
  // Буквы
  if (/^[a-z]$/i.test(name)) return K[name.toUpperCase()];
  // Цифры верхнего ряда
  if (/^[0-9]$/.test(name)) return K[`Digit${name}`] ?? K[name] ?? null;
  // Функциональные и специальные
  const map = {
    space: K.Space,
    enter: K.Enter, return: K.Enter,
    esc: K.Escape, escape: K.Escape,
    tab: K.Tab,
    backspace: K.Backspace,
    delete: K.Delete, del: K.Delete,
    insert: K.Insert, ins: K.Insert,
    home: K.Home, end: K.End,
    pageup: K.PageUp, pagedown: K.PageDown,
    up: K.ArrowUp, down: K.ArrowDown, left: K.ArrowLeft, right: K.ArrowRight,
    arrowup: K.ArrowUp, arrowdown: K.ArrowDown, arrowleft: K.ArrowLeft, arrowright: K.ArrowRight,
    printscreen: K.PrintScreen,
  };
  if (map[n] != null) return map[n];
  // F1-F24
  const fm = /^f(\d{1,2})$/i.exec(name);
  if (fm) {
    const num = parseInt(fm[1], 10);
    const code = K[`F${num}`];
    if (code != null) return code;
  }
  return null;
}

module.exports = { setPushToTalk, stop };
