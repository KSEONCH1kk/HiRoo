"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { commandsApi, type SlashCommand } from "@/lib/api";

interface Props {
  guildId?: string | null;
  dmId?: string | null;
  query: string;             // text after "/"
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

/**
 * Popup that appears above the composer when the user types `/`. Filters
 * installed bot commands by prefix — same UX as Discord.
 */
export function CommandPicker({ guildId, dmId, query, onSelect, onClose }: Props) {
  const [highlight, setHighlight] = useState(0);

  const { data: cmds } = useQuery({
    queryKey: ["slash-commands", guildId, dmId, query],
    queryFn: () => commandsApi.forChannel({ guild_id: guildId, dm_id: dmId, q: query }),
    enabled: guildId != null || dmId != null,
    staleTime: 15_000,
  });

  const items = cmds ?? [];

  useEffect(() => { setHighlight(0); }, [query, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation();
        setHighlight((h) => (h + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        setHighlight((h) => (h - 1 + items.length) % items.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        const it = items[highlight];
        if (it) {
          e.preventDefault();
          e.stopPropagation();
          // Also block Shift+Enter-style defaults bubbling into textarea.
          (e as any).stopImmediatePropagation?.();
          onSelect(it);
        }
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        onClose();
      }
    };
    // Capture phase — we need to intercept BEFORE the composer textarea's
    // onKeyDown handler fires (which would otherwise submit the message on Enter).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, highlight, onSelect, onClose]);

  if (!items.length) return null;

  return (
    <div style={{
      position: "absolute", left: 16, right: 16, bottom: "100%", marginBottom: 8,
      background: "var(--bg-2)", border: "1px solid var(--line-strong)",
      borderRadius: 10, boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
      overflow: "hidden", zIndex: 40, maxHeight: 320, display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "8px 12px", fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid var(--line)" }}>
        Команды
      </div>
      <div style={{ overflowY: "auto" }}>
        {items.map((c, i) => (
          <button
            key={c.id}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => onSelect(c)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "9px 12px", width: "100%", border: "none",
              background: i === highlight ? "var(--bg-active)" : "transparent",
              cursor: "pointer", textAlign: "left",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "var(--bg-3)", color: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontFamily: "Geist Mono", fontWeight: 700, flexShrink: 0,
            }}>/</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-0)", fontFamily: "Geist Mono" }}>
                  {c.name}
                </span>
                {c.options.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                    {c.options.map((o) => `<${o.name}>`).join(" ")}
                  </span>
                )}
              </div>
              {c.description && (
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      <div style={{ padding: "6px 12px", borderTop: "1px solid var(--line)", fontSize: 10.5, color: "var(--text-3)", fontFamily: "Geist Mono", display: "flex", justifyContent: "space-between" }}>
        <span><kbd>↑↓</kbd> выбор · <kbd>Tab</kbd> дополнить · <kbd>Esc</kbd> закрыть</span>
        <span>{items.length}</span>
      </div>
    </div>
  );
}
