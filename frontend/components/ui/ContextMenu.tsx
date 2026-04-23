"use client";
import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  icon?: string;
  label: string;
  /** Omit when the item only opens a submenu. */
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** When set, the row shows a chevron and hovering it opens a submenu. */
  submenu?: MenuItem[];
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 220;

export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const estHeight = items.length * 32 + 10;
  let left = x;
  let top = y;
  if (typeof window !== "undefined") {
    if (left + MENU_WIDTH > window.innerWidth) left = window.innerWidth - MENU_WIDTH - 8;
    if (top + estHeight > window.innerHeight) top = window.innerHeight - estHeight - 8;
  }

  return (
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <MenuPanel x={left} y={top} items={items} onClose={onClose} />
    </>
  );
}

/** Shared panel: used both by the root menu and by submenus. Submenus
 * are positioned relative to the parent row instead of viewport coords. */
function MenuPanel({
  x, y, items, onClose, depth = 0,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  depth?: number;
}) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenSub(null), 180);
  };

  return (
    <div
      style={{
        position: "fixed", left: x, top: y, zIndex: 201 + depth,
        minWidth: MENU_WIDTH, background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        padding: 4, fontSize: 13.5, animation: "fadeIn 90ms ease-out",
      }}
    >
      {items.map((it, i) => {
        if (it.separator) {
          return <div key={`sep-${i}`} style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />;
        }
        const hasSubmenu = !!it.submenu && it.submenu.length > 0;
        return (
          <div
            key={`${it.label}-${i}`}
            onClick={() => {
              if (it.disabled) return;
              if (hasSubmenu) return; // submenu opens on hover; click is a no-op
              if (it.onClick) { it.onClick(); onClose(); }
            }}
            onMouseEnter={(e) => {
              if (!it.disabled) e.currentTarget.style.background = it.danger ? "rgba(255,80,80,0.1)" : "var(--bg-hover)";
              if (hasSubmenu) {
                cancelClose();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                // Place the submenu to the right by default; flip to the left
                // if it would overflow the viewport.
                const leftRight = r.right + 2;
                const leftLeft = r.left - MENU_WIDTH - 2;
                const left = (typeof window !== "undefined" && leftRight + MENU_WIDTH > window.innerWidth)
                  ? Math.max(8, leftLeft)
                  : leftRight;
                setOpenSub(i);
                setSubPos({ left, top: r.top - 4 });
              } else if (!hasSubmenu) {
                // Moving onto a sibling without a submenu — close any
                // currently-open one.
                setOpenSub(null);
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              if (hasSubmenu) scheduleClose();
            }}
            style={{
              padding: "7px 10px", borderRadius: 6, cursor: it.disabled ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 10,
              color: it.disabled ? "var(--text-3)" : (it.danger ? "var(--danger)" : "var(--text-1)"),
              opacity: it.disabled ? 0.5 : 1,
            }}
          >
            {it.icon && <i className={`fa-solid ${it.icon}`} style={{ width: 14, fontSize: 12, textAlign: "center" }} />}
            <span style={{ flex: 1 }}>{it.label}</span>
            {hasSubmenu && (
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 9, color: "var(--text-3)" }} />
            )}
          </div>
        );
      })}
      {openSub !== null && items[openSub]?.submenu && subPos && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <MenuPanel
            x={subPos.left}
            y={subPos.top}
            items={items[openSub]!.submenu!}
            onClose={onClose}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}
