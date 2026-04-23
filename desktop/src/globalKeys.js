// Глобальный пассивный слушатель клавиатуры через uiohook-napi.
// В отличие от Electron `globalShortcut.register`, uiohook только
// наблюдает за событиями ОС и не блокирует передачу нажатия в
// фокусное приложение — поэтому связки в духе `Ctrl+M` продолжают
// работать в других программах, а HiRoo лишь реагирует дополнительно.
//
// Поддерживает два режима на каждый биндинг:
//   - "tap"  — onDown вызывается один раз на нажатие (автоповторы ОС игнорируются)
//   - "hold" — onDown на нажатие + onUp на отпускание (для push-to-talk)

let uIOhook = null;
let UiohookKey = null;
let started = false;

/** @type {Map<string, {accelerator:string, parsed:object, mode:"tap"|"hold", onDown?:Function, onUp?:Function, held:boolean}>} */
const bindings = new Map();

// Трекаем состояние модификаторов: uiohook шлёт keydown/keyup по каждой
// клавише отдельно, а в событии обычной клавиши ctrlKey/shiftKey иногда
// не выставлены (платформенная особенность linux/X11).
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
    for (const b of bindings.values()) {
      if (!matches(e, b.parsed)) continue;
      if (b.mode === "tap") {
        if (b.held) continue;          // игнорируем автоповтор ОС
        b.held = true;
        try { b.onDown?.(); } catch {}
      } else {
        if (b.held) continue;
        b.held = true;
        try { b.onDown?.(); } catch {}
      }
    }
  });

  uIOhook.on("keyup", (e) => {
    updateMods(e, false);
    for (const b of bindings.values()) {
      if (!b.held) continue;
      if (!isRelease(e, b.parsed)) continue;
      b.held = false;
      if (b.mode === "hold") {
        try { b.onUp?.(); } catch {}
      }
    }
  });

  try { uIOhook.start(); started = true; return true; }
  catch (e) { console.warn("[hiroo] uIOhook.start failed:", e.message); return false; }
}

function updateMods(e, pressed) {
  const K = UiohookKey;
  if (!K) return;
  if (e.keycode === K.Ctrl || e.keycode === K.CtrlRight) mods.ctrl = pressed;
  if (e.keycode === K.Alt  || e.keycode === K.AltRight)  mods.alt  = pressed;
  if (e.keycode === K.Shift || e.keycode === K.ShiftRight) mods.shift = pressed;
  if (e.keycode === K.Meta || e.keycode === K.MetaRight) mods.meta = pressed;
}

function matches(e, p) {
  if (e.keycode !== p.keyCode) return false;
  if (!!p.ctrl  !== !!(mods.ctrl  || e.ctrlKey))  return false;
  if (!!p.alt   !== !!(mods.alt   || e.altKey))   return false;
  if (!!p.shift !== !!(mods.shift || e.shiftKey)) return false;
  if (!!p.meta  !== !!(mods.meta  || e.metaKey))  return false;
  return true;
}

function isRelease(e, p) {
  if (e.keycode === p.keyCode) return true;
  const K = UiohookKey;
  if (!K) return false;
  if (p.ctrl  && (e.keycode === K.Ctrl  || e.keycode === K.CtrlRight))  return true;
  if (p.alt   && (e.keycode === K.Alt   || e.keycode === K.AltRight))   return true;
  if (p.shift && (e.keycode === K.Shift || e.keycode === K.ShiftRight)) return true;
  if (p.meta  && (e.keycode === K.Meta  || e.keycode === K.MetaRight))  return true;
  return false;
}

/**
 * Установить/обновить биндинг. Вернёт { ok:false, error } если
 * не удалось разобрать комбинацию или модуль не загружен.
 */
function setBinding(id, accelerator, { mode = "tap", onDown, onUp } = {}) {
  bindings.delete(id);
  if (!accelerator) return { ok: true };
  if (!ensureStarted()) return { ok: false, error: "uiohook недоступен" };
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return { ok: false, error: "не удалось разобрать комбинацию" };
  bindings.set(id, { accelerator, parsed, mode, onDown, onUp, held: false });
  return { ok: true };
}

function clearAll() {
  bindings.clear();
}

function stop() {
  if (started && uIOhook) {
    try { uIOhook.stop(); } catch {}
  }
  started = false;
  bindings.clear();
}

// ─── Accelerator parsing ─────────────────────────────────────────────

function parseAccelerator(acc) {
  if (!UiohookKey) return null;
  const parts = acc.split("+").map((p) => p.trim()).filter(Boolean);
  const out = { keyCode: 0, ctrl: false, alt: false, shift: false, meta: false };
  for (const raw of parts) {
    const k = raw.toLowerCase();
    if (k === "ctrl" || k === "control") out.ctrl = true;
    else if (k === "cmdorctrl" || k === "commandorcontrol") {
      if (process.platform === "darwin") out.meta = true;
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
  // Буквы
  if (/^[a-z]$/i.test(name)) return K[name.toUpperCase()];
  // Цифры верхнего ряда
  if (/^[0-9]$/.test(name)) {
    return K[`Digit${name}`] ?? K[`Number${name}`] ?? K[name] ?? null;
  }
  // Нампад: "num0".."num9"
  const numpad = /^num([0-9])$/i.exec(name);
  if (numpad) {
    const d = numpad[1];
    return K[`Numpad${d}`] ?? K[`NumPad${d}`] ?? null;
  }
  const n = name.toLowerCase();
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
    capslock: K.CapsLock,
    numlock: K.NumLock, scrolllock: K.ScrollLock,
    // Знаки препинания / символы на основной раскладке
    ".": K.Period, period: K.Period,
    ",": K.Comma, comma: K.Comma,
    ";": K.Semicolon, semicolon: K.Semicolon,
    "'": K.Quote, quote: K.Quote,
    "`": K.Backquote, backquote: K.Backquote,
    "[": K.OpenBracket, "]": K.CloseBracket,
    "\\": K.Backslash, backslash: K.Backslash,
    "/": K.Slash, slash: K.Slash,
    "-": K.Minus, minus: K.Minus,
    "=": K.Equal, equal: K.Equal, equals: K.Equal,
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

module.exports = { setBinding, clearAll, stop };
