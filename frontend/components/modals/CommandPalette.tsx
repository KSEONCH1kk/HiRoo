"use client";
import { useState, useEffect } from "react";
import { useServerStore } from "@/store/serverStore";

export function CommandPalette({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const { channels, activeServerId } = useServerStore();
  const chs = activeServerId ? (channels[activeServerId] ?? []) : [];

  useEffect(() => { if (show) setQ(""); }, [show]);

  if (!show) return null;
  const filtered = chs.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120, animation: "fadeIn 140ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ color: "var(--text-2)", fontSize: 16 }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск каналов, людей, команд…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-0)", fontSize: 16, fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, fontFamily: "Geist Mono", padding: "2px 6px", borderRadius: 4, background: "var(--bg-3)", color: "var(--text-2)" }}>esc</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
          {filtered.length === 0 && <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--text-2)", textAlign: "center" }}>Ничего не найдено</div>}
          {filtered.map((ch, i) => (
            <div key={ch.id} onClick={onClose} style={{
              padding: "8px 12px", display: "flex", alignItems: "center", gap: 10,
              borderRadius: 6, cursor: "pointer",
              background: i === 0 && !q ? "var(--bg-active)" : "transparent",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = i === 0 && !q ? "var(--bg-active)" : "transparent")}
            >
              <i className={`fa-solid ${ch.type === "voice" ? "fa-volume-high" : "fa-hashtag"}`} style={{ fontSize: 13, color: "var(--text-2)", width: 18, textAlign: "center" }} />
              <span style={{ flex: 1, fontSize: 14, color: "var(--text-0)" }}>{ch.name}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-2)", fontFamily: "Geist Mono" }}>{ch.type}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 16, fontSize: 11, color: "var(--text-2)", fontFamily: "Geist Mono" }}>
          <span><kbd style={{ padding: "1px 5px", borderRadius: 3, background: "var(--bg-3)" }}>↑↓</kbd> навигация</span>
          <span><kbd style={{ padding: "1px 5px", borderRadius: 3, background: "var(--bg-3)" }}>↵</kbd> выбрать</span>
          <span><kbd style={{ padding: "1px 5px", borderRadius: 3, background: "var(--bg-3)" }}>⌘K</kbd> открыть</span>
        </div>
      </div>
    </div>
  );
}
