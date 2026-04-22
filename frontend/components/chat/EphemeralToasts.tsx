"use client";
import { useEphemeralToastStore } from "@/store/ephemeralToastStore";

export function EphemeralToasts() {
  const { toasts, remove } = useEphemeralToastStore();
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed", bottom: 80, right: 20, zIndex: 200,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          style={{
            pointerEvents: "auto", cursor: "pointer",
            maxWidth: 340, padding: "10px 14px", borderRadius: 10,
            background: "var(--bg-2)", border: "1px solid var(--accent)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            color: "var(--text-0)", fontSize: 13, lineHeight: 1.45,
            animation: "fadeIn 180ms ease-out",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}
        >
          <i className="fa-solid fa-eye-slash" style={{ color: "var(--accent)", fontSize: 12, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
              Только для вас
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.content}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
