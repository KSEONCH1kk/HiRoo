"use client";
import { usePaletteStore } from "@/store/paletteStore";

export function SearchBarButton() {
  const open = usePaletteStore((s) => s.setOpen);
  return (
    <div style={{ padding: "0 8px 8px", flexShrink: 0 }}>
      <button
        onClick={() => open(true)}
        style={{
          width: "100%", height: 30, borderRadius: 6, border: "1px solid var(--line)",
          background: "var(--bg-2)", color: "var(--text-2)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", fontSize: 12.5, fontFamily: "inherit",
          transition: "color 120ms, border-color 120ms, background 120ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-0)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--line)"; }}
      >
        <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 11 }} />
        <span style={{ flex: 1, textAlign: "left" }}>Поиск</span>
      </button>
    </div>
  );
}
