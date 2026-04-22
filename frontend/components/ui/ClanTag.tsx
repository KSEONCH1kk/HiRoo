"use client";
import { useUIStore } from "@/store/uiStore";
import type { ClanTag as ClanTagType } from "@/types";

/** Small pill rendered next to a username: FA icon + short label.
 * Click → opens a server preview card (public servers only).
 * Safe against XSS: icon is restricted to a fixed pool on the backend
 * (services/tag_icons.py), so even if the API is compromised the worst
 * that can happen is a missing icon (no eval, no HTML).
 * If the backend sends an unknown key it simply renders nothing. */
const ALLOWED_ICON_RE = /^[a-z][a-z0-9-]{0,30}$/;

interface Props {
  tag: ClanTagType | null | undefined;
  size?: "sm" | "md";
  /** If true, the pill is not clickable (e.g. in preview contexts). */
  nonInteractive?: boolean;
}

export function ClanTag({ tag, size = "sm", nonInteractive = false }: Props) {
  const setPreviewServerId = useUIStore((s) => s.setPreviewServerId);
  if (!tag || !tag.label) return null;
  const iconSafe = tag.icon && ALLOWED_ICON_RE.test(tag.icon) ? tag.icon : null;
  if (!iconSafe) return null;
  const h = size === "sm" ? 17 : 20;
  const fs = size === "sm" ? 10.5 : 12;
  const iconFs = size === "sm" ? 9 : 11;
  const clickable = !nonInteractive && !!tag.server_id;
  const onClick = clickable
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        setPreviewServerId(tag.server_id);
      }
    : undefined;
  return (
    <span
      onClick={onClick}
      title={
        tag.server_name
          ? (clickable ? `Тэг сервера "${tag.server_name}" — открыть` : `Тэг сервера "${tag.server_name}"`)
          : undefined
      }
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        height: h, padding: "0 6px",
        borderRadius: 4,
        background: "var(--bg-3, rgba(255,255,255,0.07))",
        border: "1px solid var(--line, rgba(255,255,255,0.08))",
        fontSize: fs, fontWeight: 600,
        color: "var(--text-1)",
        lineHeight: 1,
        verticalAlign: "middle",
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
        flexShrink: 0,
        cursor: clickable ? "pointer" : "default",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.12))"; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.background = "var(--bg-3, rgba(255,255,255,0.07))"; }}
    >
      <i className={`fa-solid fa-${iconSafe}`} style={{ fontSize: iconFs, color: "var(--accent)" }} />
      {tag.label}
    </span>
  );
}
