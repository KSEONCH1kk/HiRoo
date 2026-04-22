"use client";
import type { ClanTag as ClanTagType } from "@/types";

/** Small pill rendered next to a username: FA icon + short label.
 * Safe against XSS: icon is restricted to a fixed pool on the backend
 * (services/tag_icons.py), so even if the API is compromised the worst
 * that can happen is a missing icon (no eval, no HTML).
 * If the backend sends an unknown key it simply renders nothing. */
const ALLOWED_ICON_RE = /^[a-z][a-z0-9-]{0,30}$/;

interface Props {
  tag: ClanTagType | null | undefined;
  size?: "sm" | "md";
}

export function ClanTag({ tag, size = "sm" }: Props) {
  if (!tag || !tag.label) return null;
  const iconSafe = tag.icon && ALLOWED_ICON_RE.test(tag.icon) ? tag.icon : null;
  if (!iconSafe) return null;
  const h = size === "sm" ? 17 : 20;
  const fs = size === "sm" ? 10.5 : 12;
  const iconFs = size === "sm" ? 9 : 11;
  return (
    <span
      title={tag.server_name ? `Тэг сервера "${tag.server_name}"` : undefined}
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
      }}
    >
      <i className={`fa-solid fa-${iconSafe}`} style={{ fontSize: iconFs, color: "var(--accent)" }} />
      {tag.label}
    </span>
  );
}
