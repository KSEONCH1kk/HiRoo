"use client";
import { useEffect } from "react";

export interface MenuItem {
  icon?: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Clamp inside viewport
  const width = 220;
  const estHeight = items.length * 32 + 10;
  let left = x;
  let top = y;
  if (typeof window !== "undefined") {
    if (left + width > window.innerWidth) left = window.innerWidth - width - 8;
    if (top + estHeight > window.innerHeight) top = window.innerHeight - estHeight - 8;
  }

  return (
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <div style={{
        position: "fixed", left, top, zIndex: 201,
        minWidth: width, background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        padding: 4, fontSize: 13.5, animation: "fadeIn 90ms ease-out",
      }}>
        {items.map((it, i) => {
          if (it.separator) {
            return <div key={`sep-${i}`} style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />;
          }
          return (
            <div
              key={`${it.label}-${i}`}
              onClick={() => { if (!it.disabled) { it.onClick(); onClose(); } }}
              style={{
                padding: "7px 10px", borderRadius: 6, cursor: it.disabled ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 10,
                color: it.disabled ? "var(--text-3)" : (it.danger ? "var(--danger)" : "var(--text-1)"),
                opacity: it.disabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = it.danger ? "rgba(255,80,80,0.1)" : "var(--bg-hover)"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {it.icon && <i className={`fa-solid ${it.icon}`} style={{ width: 14, fontSize: 12, textAlign: "center" }} />}
              <span style={{ flex: 1 }}>{it.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
