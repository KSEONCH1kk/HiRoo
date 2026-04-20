"use client";
import { useUIStore } from "@/store/uiStore";
import { Toggle } from "@/components/ui/Toggle";

const ACCENTS = [
  { color: "#7c5cff", label: "Фиолетовый" },
  { color: "#5b8af0", label: "Синий" },
  { color: "#3ecf8e", label: "Зелёный" },
  { color: "#f0a050", label: "Оранжевый" },
  { color: "#e05c7a", label: "Розовый" },
];

export function AppearanceSettings() {
  const { theme, setTheme, accent, setAccent } = useUIStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Тема</div>
        <div style={{ display: "flex", gap: 10 }}>
          {(["dark", "light"] as const).map((t) => (
            <div
              key={t}
              onClick={() => setTheme(t)}
              style={{
                width: 120, height: 80, borderRadius: 10, border: `2px solid ${theme === t ? "var(--accent)" : "var(--line-strong)"}`,
                background: t === "dark" ? "#14161e" : "#f5f5f5",
                cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 8,
                transition: "border-color 0.15s",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: t === "dark" ? "#fff" : "#111" }}>
                {t === "dark" ? "Тёмная" : "Светлая"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Акцентный цвет</div>
        <div style={{ display: "flex", gap: 8 }}>
          {ACCENTS.map((a) => (
            <div
              key={a.color}
              onClick={() => setAccent(a.color)}
              title={a.label}
              style={{
                width: 36, height: 36, borderRadius: "50%", background: a.color, cursor: "pointer",
                border: `3px solid ${accent === a.color ? "var(--text-0)" : "transparent"}`,
                boxShadow: accent === a.color ? `0 0 0 2px var(--bg-2)` : "none",
                transition: "border-color 0.15s",
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Интерфейс</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Компактный режим сообщений", key: "compact" },
            { label: "Показывать аватары участников", key: "avatars" },
            { label: "Анимированные эмодзи", key: "animEmoji" },
          ].map(({ label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--bg-2)" }}>
              <span style={{ fontSize: 14, color: "var(--text-0)" }}>{label}</span>
              <Toggle on={true} onChange={() => {}} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
