"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { ServerMember } from "@/types";

export interface MentionItem {
  id: string;
  label: string;  // visible display name
  username: string; // used when inserted
  avatarUrl?: string | null;
  status?: "online" | "idle" | "dnd" | "offline";
  kind?: "user" | "role";
  color?: string | null;
}

interface Props {
  query: string;
  members: ServerMember[];
  onPick: (item: MentionItem) => void;
  onClose: () => void;
}

const SPECIAL: MentionItem[] = [
  { id: "everyone", username: "everyone", label: "@everyone", kind: "role", color: "#f0a050" },
  { id: "all", username: "all", label: "@all", kind: "role", color: "#f0a050" },
];

export function MentionMenu({ query, members, onPick, onClose }: Props) {
  const [selected, setSelected] = useState(0);

  const q = query.toLowerCase();
  const filteredUsers = members
    .filter((m) => {
      const un = m.user.username.toLowerCase();
      const dn = (m.user.display_name ?? "").toLowerCase();
      const nick = (m.nickname ?? "").toLowerCase();
      return un.includes(q) || dn.includes(q) || nick.includes(q);
    })
    .slice(0, 8)
    .map<MentionItem>((m) => ({
      id: m.user.id,
      username: m.user.username,
      label: m.nickname || m.user.display_name || m.user.username,
      avatarUrl: m.user.avatar_url,
      status: m.user.status,
      kind: "user",
    }));

  const filteredSpecial = SPECIAL.filter((s) => s.username.includes(q));
  const items: MentionItem[] = [...filteredSpecial, ...filteredUsers];

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((i) => Math.min(i + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); onPick(items[selected]); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [items, selected]);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: "100%", marginBottom: 6,
      background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 10,
      boxShadow: "0 16px 40px rgba(0,0,0,0.4)", padding: 4, maxHeight: 260, overflowY: "auto", zIndex: 60,
    }}>
      <div style={{ padding: "6px 10px 4px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Упомянуть — {items.length}
      </div>
      {items.map((it, i) => {
        const active = i === selected;
        return (
          <div
            key={`${it.kind}-${it.id}`}
            onClick={() => onPick(it)}
            onMouseEnter={() => setSelected(i)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6,
              cursor: "pointer", background: active ? "var(--bg-active)" : "transparent",
            }}
          >
            {it.kind === "user" ? (
              <Avatar name={it.username} size={24} shape="circle" avatarUrl={it.avatarUrl ?? null} status={it.status} />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: it.color ?? "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11 }}>
                @
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: it.kind === "role" ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.label}
              </div>
              {it.kind === "user" && (
                <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>@{it.username}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
