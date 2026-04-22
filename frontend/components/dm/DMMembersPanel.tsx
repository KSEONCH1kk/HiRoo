"use client";
import { useMemo } from "react";
import { DMMemberPill } from "./DMMemberPill";
import type { DirectMessage } from "@/types";

interface Props {
  dm: DirectMessage;
  meId?: string;
  onClose?: () => void;
}

/**
 * Right-hand panel for group DMs, mirroring server MembersPanel.
 * Shows online users first, then offline. Each row has the same context
 * menu as anywhere else (profile, message, block, kick).
 */
export function DMMembersPanel({ dm, meId, onClose }: Props) {
  const { online, offline } = useMemo(() => {
    const on = dm.participants
      .filter((p) => p.user.status && p.user.status !== "offline")
      .sort((a, b) => (a.user.display_name ?? a.user.username).localeCompare(b.user.display_name ?? b.user.username));
    const off = dm.participants
      .filter((p) => !p.user.status || p.user.status === "offline")
      .sort((a, b) => (a.user.display_name ?? a.user.username).localeCompare(b.user.display_name ?? b.user.username));
    return { online: on, offline: off };
  }, [dm]);

  const isOwner = dm.is_group && dm.owner_id === meId;

  return (
    <div style={{
      width: 240, flexShrink: 0,
      borderLeft: "1px solid var(--line)",
      background: "var(--bg-1)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)" }}>Участники</span>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
          {dm.participants.length}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            title="Скрыть"
            style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer" }}
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: 11 }} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
        {online.length > 0 && <SectionLabel>В сети — {online.length}</SectionLabel>}
        {online.map((p) => (
          <DMMemberPill key={p.user.id} user={p.user} dmId={dm.id} isOwner={isOwner} variant="row" />
        ))}
        {offline.length > 0 && <SectionLabel>Не в сети — {offline.length}</SectionLabel>}
        {offline.map((p) => (
          <DMMemberPill key={p.user.id} user={p.user} dmId={dm.id} isOwner={isOwner} variant="row" />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: "var(--text-3)",
      textTransform: "uppercase", letterSpacing: 0.5,
      padding: "10px 10px 4px",
    }}>{children}</div>
  );
}
