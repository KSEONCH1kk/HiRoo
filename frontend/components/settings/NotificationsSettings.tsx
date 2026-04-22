"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { usersApi } from "@/lib/api";

type Level = "all" | "mentions" | "none";

export function NotificationsSettings() {
  const { user, setAuth } = useAuthStore();
  const [saving, setSaving] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  if (!user) return null;

  const save = async (patch: Partial<typeof user>, key: string) => {
    setSaving(key);
    try {
      const updated = await usersApi.updatePreferences(patch);
      const token = useAuthStore.getState().accessToken;
      if (token) setAuth(updated, token);
    } finally { setSaving(null); }
  };

  const requestPerm = async () => {
    if (perm === "unsupported") return;
    const res = await Notification.requestPermission();
    setPerm(res);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 560 }}>
      <Group title="Когда уведомлять">
        {(["all", "mentions", "none"] as Level[]).map((lvl) => (
          <Radio
            key={lvl}
            value={lvl}
            current={(user.notif_level as Level) ?? "mentions"}
            label={
              lvl === "all" ? "Все сообщения"
              : lvl === "mentions" ? "Только упоминания и ЛС"
              : "Никогда"
            }
            hint={
              lvl === "all" ? "Звук и тост на каждое сообщение в каждом канале."
              : lvl === "mentions" ? "По умолчанию — как в Discord."
              : "Полная тишина."
            }
            onPick={(v) => save({ notif_level: v }, "level")}
            saving={saving === "level"}
          />
        ))}
      </Group>

      <Group title="Звук и показ">
        <Toggle
          checked={!!user.notif_sound}
          onChange={(v) => save({ notif_sound: v }, "sound")}
          label="Проигрывать звук"
          hint="Короткий сигнал при новом сообщении (в соответствии с уровнем выше)."
          saving={saving === "sound"}
        />
        <Toggle
          checked={!!user.notif_desktop}
          onChange={(v) => save({ notif_desktop: v }, "desktop")}
          label="Всплывающие уведомления на рабочем столе"
          hint="Для браузера — системный попап. Для desktop-приложения — нативный toast Windows/macOS."
          saving={saving === "desktop"}
        />
      </Group>

      <Group title="Разрешение браузера">
        <div style={{
          padding: "12px 14px", borderRadius: 8,
          background: "var(--bg-2)", border: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <i className={`fa-solid ${permIcon(perm)}`} style={{ fontSize: 16, color: permColor(perm) }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: 500 }}>
              {permLabel(perm)}
            </div>
            {perm === "denied" && (
              <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                Вы заблокировали уведомления. Включите их в настройках сайта в браузере.
              </div>
            )}
          </div>
          {perm === "default" && (
            <button
              onClick={requestPerm}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 600,
              }}
            >
              Разрешить
            </button>
          )}
        </div>
      </Group>
    </div>
  );
}

function permIcon(p: string) {
  return p === "granted" ? "fa-circle-check" : p === "denied" ? "fa-circle-xmark" : "fa-circle-question";
}
function permColor(p: string) {
  return p === "granted" ? "#6fd99a" : p === "denied" ? "#ff7a7a" : "#fcbf49";
}
function permLabel(p: string) {
  return p === "granted" ? "Уведомления разрешены"
    : p === "denied" ? "Уведомления заблокированы"
    : p === "unsupported" ? "Браузер не поддерживает"
    : "Разрешение не запрошено";
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
      }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function Radio<T extends string>({ value, current, label, hint, onPick, saving }:
  { value: T; current: T; label: string; hint?: string;
    onPick: (v: T) => void; saving?: boolean }) {
  const active = value === current;
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px", borderRadius: 8, cursor: "pointer",
      background: active ? "var(--bg-active)" : "var(--bg-2)",
      border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
    }}>
      <input type="radio" checked={active} disabled={saving} onChange={() => onPick(value)} style={{ marginTop: 3 }} />
      <div>
        <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{hint}</div>}
      </div>
    </label>
  );
}

function Toggle({ checked, onChange, label, hint, saving }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; saving?: boolean }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      background: "var(--bg-2)", border: "1px solid var(--line)",
    }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={saving} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{hint}</div>}
      </div>
    </label>
  );
}
