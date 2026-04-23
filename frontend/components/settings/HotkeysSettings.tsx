"use client";
import { useEffect, useRef, useState } from "react";
import { HOTKEY_DEFS, useHotkeysStore, type HotkeyAction } from "@/store/hotkeysStore";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useDesktop } from "@/hooks/useDesktop";

/**
 * Настройки глобальных горячих клавиш. Работают только в десктоп-сборке
 * (Electron), потому что браузер не умеет ловить нажатия за пределами
 * окна. В веб-версии показываем подсказку и выключаем форму.
 */
export function HotkeysSettings() {
  const { available } = useDesktop();
  const bindings = useHotkeysStore((s) => s.bindings);
  const enabled = useHotkeysStore((s) => s.enabled);
  const setBinding = useHotkeysStore((s) => s.setBinding);
  const setEnabled = useHotkeysStore((s) => s.setEnabled);
  const reset = useHotkeysStore((s) => s.reset);
  const { errors } = useHotkeys();
  const [recording, setRecording] = useState<HotkeyAction | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 620 }}>
      {!available && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "var(--bg-2)", border: "1px solid var(--line)",
          color: "var(--text-1)", fontSize: 13.5, lineHeight: 1.5,
        }}>
          <i className="fa-solid fa-circle-info" style={{ color: "var(--accent)", marginRight: 8 }} />
          Глобальные хоткеи работают только в десктоп-приложении HiRoo.
          В браузере вкладке недоступен системный API — клавиши будут
          срабатывать только пока фокус в окне.
        </div>
      )}

      <label style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px", borderRadius: 8,
        background: "var(--bg-2)", border: "1px solid var(--line)",
        opacity: available ? 1 : 0.6,
      }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!available}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: 500 }}>
            Включить глобальные клавиши
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
            Работают, даже если окно HiRoo свёрнуто или не в фокусе.
          </div>
        </div>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {HOTKEY_DEFS.map((def) => (
          <HotkeyRow
            key={def.id}
            label={def.label}
            description={def.description}
            isHold={def.isHold}
            accelerator={bindings[def.id] ?? ""}
            recording={recording === def.id}
            error={errors[def.id]}
            disabled={!available || !enabled}
            onRecord={() => setRecording(def.id)}
            onCancel={() => setRecording(null)}
            onChange={(v) => { setBinding(def.id, v); setRecording(null); }}
            onClear={() => { setBinding(def.id, null); setRecording(null); }}
          />
        ))}
      </div>

      <div>
        <button
          onClick={() => reset()}
          style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)",
            background: "var(--bg-2)", color: "var(--text-1)", cursor: "pointer",
            fontSize: 13, fontWeight: 500,
          }}
        >
          Сбросить все
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>
        Подсказка: нажмите на поле рядом с действием и зажмите нужную
        комбинацию — поддерживается любая связка модификаторов и клавиши.
        HiRoo только слушает клавиатуру — нажатие продолжает доходить до
        активного окна (ничего не блокируем). Push-to-Talk работает как
        настоящее удержание, даже если HiRoo свёрнут.
      </div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

function HotkeyRow({
  label, description, isHold, accelerator, recording, error, disabled,
  onRecord, onCancel, onChange, onClear,
}: {
  label: string;
  description?: string;
  isHold?: boolean;
  accelerator: string;
  recording: boolean;
  error?: string;
  disabled?: boolean;
  onRecord: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      background: "var(--bg-2)", border: `1px solid ${error ? "var(--danger)" : "var(--line)"}`,
      opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
          {label}
          {isHold && (
            <span style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 4,
              background: "var(--bg-3)", color: "var(--text-2)", letterSpacing: 0.4,
            }}>HOLD</span>
          )}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{description}</div>
        )}
        {error && (
          <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 4 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
            {error}
          </div>
        )}
      </div>
      <RecorderInput
        accelerator={accelerator}
        recording={recording}
        disabled={!!disabled}
        onStart={onRecord}
        onCancel={onCancel}
        onChange={onChange}
      />
      <button
        onClick={onClear}
        disabled={!accelerator || disabled}
        title="Снять биндинг"
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)",
          background: "var(--bg-1)", color: "var(--text-2)",
          cursor: (!accelerator || disabled) ? "default" : "pointer",
          opacity: (!accelerator || disabled) ? 0.4 : 1,
        }}
      >
        <i className="fa-solid fa-xmark" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

// ─── Recorder ────────────────────────────────────────────────────────

function RecorderInput({
  accelerator, recording, disabled, onStart, onCancel, onChange,
}: {
  accelerator: string;
  recording: boolean;
  disabled: boolean;
  onStart: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
}) {
  const boxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    boxRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { onCancel(); return; }
      // Пропускаем "чистые" модификаторы — ждём полноценную комбинацию.
      if (["Shift", "Control", "Alt", "Meta", "OS", "AltGraph"].includes(e.key)) return;
      const acc = eventToAccelerator(e);
      if (!acc) return;
      onChange(acc);
    };
    const onBlur = () => onCancel();
    window.addEventListener("keydown", onKeyDown, true);
    boxRef.current?.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      boxRef.current?.removeEventListener("blur", onBlur);
    };
  }, [recording]);

  const display = recording
    ? "Нажмите комбинацию…"
    : accelerator
      ? formatAcceleratorForDisplay(accelerator)
      : "Не назначено";

  return (
    <button
      ref={boxRef}
      disabled={disabled}
      onClick={onStart}
      style={{
        minWidth: 170,
        height: 32, padding: "0 12px",
        borderRadius: 8,
        border: `1px solid ${recording ? "var(--accent)" : "var(--line)"}`,
        background: recording ? "var(--bg-active)" : "var(--bg-1)",
        color: accelerator || recording ? "var(--text-0)" : "var(--text-3)",
        fontSize: 12.5, fontFamily: "Geist Mono, monospace", letterSpacing: 0.3,
        textAlign: "center", cursor: disabled ? "default" : "pointer",
      }}
    >
      {display}
    </button>
  );
}

function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = normalizeKey(e);
  if (!k) return null;
  parts.push(k);
  return parts.join("+");
}

/**
 * Нормализация клавиши. Используем в первую очередь `e.code` — это
 * физическая клавиша на клавиатуре ("KeyA", "Digit1", "Semicolon"),
 * независимая от раскладки. Иначе нажатие `М` на русской раскладке
 * сохранилось бы как `М` и uiohook его не распознал бы.
 */
function normalizeKey(e: KeyboardEvent): string | null {
  const code = e.code || "";
  // Буквы
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  // Цифры верхнего ряда
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  // Нампад: цифры и действия
  const numpadDigit = /^Numpad([0-9])$/.exec(code);
  if (numpadDigit) return `num${numpadDigit[1]}`;
  // F-ряд
  const fn = /^F(\d{1,2})$/.exec(code);
  if (fn) return `F${fn[1]}`;
  // Именованные клавиши (по `e.code`)
  const byCode: Record<string, string> = {
    Space: "Space",
    Enter: "Enter", NumpadEnter: "Enter",
    Escape: "Esc",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home", End: "End",
    PageUp: "PageUp", PageDown: "PageDown",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    PrintScreen: "PrintScreen",
    CapsLock: "CapsLock",
    NumLock: "NumLock", ScrollLock: "ScrollLock",
    Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Slash: "/",
    Semicolon: ";", Quote: "'", Backquote: "`",
    Comma: ",", Period: ".",
  };
  if (byCode[code]) return byCode[code];

  // Fallback на e.key: для пользователей, у которых KeyboardEvent.code
  // не выставлен (некоторые виртуальные/remote-клавиатуры).
  const raw = e.key;
  if (!raw) return null;
  if (raw === " ") return "Space";
  if (raw.length === 1) return raw.toUpperCase();
  const map: Record<string, string> = {
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Escape: "Esc",
  };
  return map[raw] ?? raw;
}

function formatAcceleratorForDisplay(acc: string): string {
  return acc
    .replace(/CommandOrControl/gi, isMac() ? "Cmd" : "Ctrl")
    .replace(/\+/g, " + ");
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.toLowerCase().includes("mac");
}
