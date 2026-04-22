"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { usersApi } from "@/lib/api";

type DmPerm = "everyone" | "friends";
type FrPerm = "everyone" | "friends";

export function PrivacySettings() {
  const { user, setAuth } = useAuthStore();
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!user) return null;

  const save = async (patch: Partial<typeof user>, key: string) => {
    setSaving(key); setErr(null);
    try {
      const updated = await usersApi.updatePreferences(patch);
      const token = useAuthStore.getState().accessToken;
      if (token) setAuth(updated, token);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Не удалось сохранить");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 560 }}>
      <Group title="Кто может писать вам в ЛС">
        <Radio
          value="everyone"
          current={(user.dm_permission as DmPerm) ?? "everyone"}
          label="Все"
          hint="Любой пользователь HiRoo может открыть ЛС."
          onPick={(v) => save({ dm_permission: v }, "dm")}
          saving={saving === "dm"}
        />
        <Radio
          value="friends"
          current={(user.dm_permission as DmPerm) ?? "everyone"}
          label="Только друзья"
          hint="Только те, кого вы добавили в друзья, смогут открыть диалог."
          onPick={(v) => save({ dm_permission: v }, "dm")}
          saving={saving === "dm"}
        />
      </Group>

      <Group title="Заявки в друзья">
        <Radio
          value="everyone"
          current={(user.friend_request_permission as FrPerm) ?? "everyone"}
          label="От любого"
          onPick={(v) => save({ friend_request_permission: v }, "fr")}
          saving={saving === "fr"}
        />
        <Radio
          value="friends"
          current={(user.friend_request_permission as FrPerm) ?? "everyone"}
          label="Только от друзей"
          hint="Эффективно блокирует новые заявки."
          onPick={(v) => save({ friend_request_permission: v }, "fr")}
          saving={saving === "fr"}
        />
      </Group>

      <Group title="Статус онлайн">
        <Toggle
          checked={!!user.show_online_status}
          onChange={(v) => save({ show_online_status: v }, "online")}
          label="Показывать мой онлайн-статус"
          hint="Если выключено — другие пользователи увидят вас как «Не в сети»."
          saving={saving === "online"}
        />
      </Group>

      <Group title="Заблокированные">
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>
          Список заблокированных пользователей доступен на вкладке «Друзья».
        </div>
        <Link href="/friends" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>
          Открыть список →
        </Link>
      </Group>

      {err && (
        <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>
      )}
    </div>
  );
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
      <input
        type="radio" checked={active} disabled={saving}
        onChange={() => onPick(value)}
        style={{ marginTop: 3 }}
      />
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
