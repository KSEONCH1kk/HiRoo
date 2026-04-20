"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useCallStore } from "@/store/callStore";
import type { User } from "@/types";

interface UserTrayProps {
  me: User;
  isMuted: boolean; setMuted: (v: boolean) => void;
  isDeafened: boolean; setDeafened: (v: boolean) => void;
  onSettings: () => void;
  inVoice: boolean;
  onHangup: () => void;
}

const STATUSES: { id: "online" | "idle" | "dnd" | "offline"; label: string; color: string }[] = [
  { id: "online", label: "В сети", color: "#3ecf8e" },
  { id: "idle", label: "Не активен", color: "#f0a050" },
  { id: "dnd", label: "Не беспокоить", color: "#e05c7a" },
  { id: "offline", label: "Невидимка", color: "#6b7280" },
];

export function UserTray({ me, isMuted, setMuted, isDeafened, setDeafened, onSettings, inVoice, onHangup }: UserTrayProps) {
  const [open, setOpen] = useState(false);
  const { updateUser } = useAuthStore();
  const { controls, setMaximized, active } = useCallStore();

  const changeStatus = useMutation({
    mutationFn: (status: string) => usersApi.updateStatus(status),
    onSuccess: (u) => { updateUser(u); setOpen(false); },
  });

  return (
    <div>
      {inVoice && (
        <div style={{
          padding: "8px 6px",
          background: "oklch(22% 0.05 142)",
          borderTop: "1px solid var(--line)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        }}>
          <div
            onClick={() => setMaximized(true)}
            title={active?.title ?? "Открыть звонок"}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: "var(--ok)", fontFamily: "Geist Mono", letterSpacing: 0.3, cursor: "pointer" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", boxShadow: "0 0 6px var(--ok)" }} />
            В ЭФИРЕ
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <Button
              size="sm"
              icon={<i className="fa-solid fa-display" style={{ fontSize: 11, color: controls?.isSharing ? "var(--accent)" : undefined }} />}
              onClick={() => controls?.toggleScreenShare()}
              title={controls?.isSharing ? "Остановить демонстрацию" : "Поделиться экраном"}
            />
            <Button
              size="sm"
              icon={<i className={`fa-solid ${controls?.isVideo ? "fa-video" : "fa-video-slash"}`} style={{ fontSize: 11, color: controls?.isVideo ? "var(--accent)" : undefined }} />}
              onClick={() => controls?.toggleVideo()}
              title="Камера"
            />
            <Button size="sm" icon={<i className="fa-solid fa-phone-slash" style={{ fontSize: 11, color: "var(--danger)" }} />} onClick={onHangup} title="Отключиться" />
          </div>
        </div>
      )}
      <div style={{
        padding: "8px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "var(--bg-0)", borderTop: "1px solid var(--line)",
        position: "relative",
      }}>
        <div onClick={() => setOpen((v) => !v)} style={{ padding: 4, borderRadius: 8, cursor: "pointer" }} title={me.display_name || me.username}>
          <Avatar name={me.display_name || me.username} size={34} status={me.status} avatarUrl={me.avatar_url} />
        </div>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 88 }} />
            <div style={{
              position: "absolute", left: 60, bottom: 10, zIndex: 89,
              width: 200, borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line-strong)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.4)", padding: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "6px 8px" }}>
                Статус
              </div>
              {STATUSES.map((s) => (
                <div
                  key={s.id}
                  onClick={() => changeStatus.mutate(s.id)}
                  style={{
                    padding: "7px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    background: me.status === s.id ? "var(--bg-active)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (me.status !== s.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { if (me.status !== s.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
                  <span style={{ fontSize: 13, color: "var(--text-0)", flex: 1 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 2 }}>
          <Button size="sm"
            icon={<i className={`fa-solid fa-microphone${isMuted ? "-slash" : ""}`} style={{ fontSize: 11, color: isMuted ? "var(--danger)" : undefined }} />}
            onClick={() => setMuted(!isMuted)} title="Микрофон"
          />
          <Button size="sm"
            icon={<i className={`fa-solid fa-headphones${isDeafened ? "" : ""}`} style={{ fontSize: 11, color: isDeafened ? "var(--danger)" : undefined }} />}
            onClick={() => setDeafened(!isDeafened)} title="Звук"
          />
        </div>
        <Button size="sm" icon={<i className="fa-solid fa-gear" style={{ fontSize: 11 }} />} onClick={onSettings} title="Настройки" />
      </div>
    </div>
  );
}
