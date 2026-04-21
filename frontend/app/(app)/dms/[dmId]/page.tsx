"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dmsApi } from "@/lib/api";
import { DMMessageList } from "@/components/dm/DMMessageList";
import { DMComposer } from "@/components/dm/DMComposer";
import { GroupDMSettings } from "@/components/dm/GroupDMSettings";
import { MessageSearchModal } from "@/components/chat/MessageSearchModal";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/authStore";
import { useUnreadStore } from "@/store/unreadStore";
import { useCallStore } from "@/store/callStore";
import { useVoicePresenceStore } from "@/store/voicePresenceStore";
import { dmTitle, dmOthers } from "@/lib/dm";
import type { DirectMessage } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

export default function DMPage({ params }: { params: { dmId: string } }) {
  const { dmId } = params;
  const { user } = useAuthStore();
  const { active, startCall: startCallStore, setMaximized } = useCallStore();
  const roomId = `dm:${dmId}`;
  const roomMembers = useVoicePresenceStore((s) => s.byRoom[roomId]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: dm } = useQuery<DirectMessage>({
    queryKey: ["dm", dmId],
    queryFn: () => dmsApi.get(dmId),
  });

  useEffect(() => { useUnreadStore.getState().clearDmUnread(dmId); }, [dmId]);

  const others = dm ? dmOthers(dm, user?.id ?? null) : [];
  const title = dm ? dmTitle(dm, user?.id ?? null) : "Диалог";
  const othersInCall = (roomMembers ?? []).filter((uid) => uid !== user?.id);

  const startCall = (video: boolean) => {
    if (!dm) return;
    const targets = others.map((u) => u.id);
    if (targets.length === 0) return;
    startCallStore({
      roomId,
      title,
      dmId,
      ringUserIds: targets,
      video,
    });
  };

  const joinOngoing = () => {
    if (!dm) return;
    startCallStore({
      roomId,
      title,
      dmId,
      video: false,
    });
  };

  const iAmInCall = active?.roomId === roomId;
  const isGroup = !!dm?.is_group;
  const isOwner = isGroup && dm?.owner_id === user?.id;
  const groupIconUrl = dm?.icon_url ? resolveIcon(dm.icon_url) : undefined;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div style={{ height: 48, flexShrink: 0, padding: "0 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-1)" }}>
        {isGroup ? (
          groupIconUrl ? (
            <img src={groupIconUrl} alt={title} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "linear-gradient(135deg, oklch(55% 0.17 268), oklch(40% 0.12 300))",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            }}>
              <i className="fa-solid fa-users" style={{ fontSize: 12 }} />
            </div>
          )
        ) : (
          <Avatar name={others[0]?.username ?? "?"} size={28} status={others[0]?.status} shape="circle" avatarUrl={others[0]?.avatar_url} />
        )}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {dm?.is_group && (
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
              {dm.participants.length} участн.
            </span>
          )}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {othersInCall.length > 0 && !iAmInCall && (
            <button
              onClick={joinOngoing}
              title="Присоединиться к звонку"
              style={{
                height: 30, padding: "0 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: "var(--ok)", color: "#fff", fontSize: 12.5, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <i className="fa-solid fa-phone" style={{ fontSize: 11 }} />
              Присоединиться · {othersInCall.length}
            </button>
          )}
          {iAmInCall && (
            <button
              onClick={() => setMaximized(true)}
              title="Открыть звонок"
              style={{
                height: 30, padding: "0 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: "var(--bg-3)", color: "var(--ok)", fontSize: 12.5, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <i className="fa-solid fa-phone" style={{ fontSize: 11 }} />
              В эфире
            </button>
          )}
          <button
            onClick={() => startCall(false)}
            disabled={iAmInCall || others.length === 0}
            title="Голосовой звонок"
            style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: iAmInCall || others.length === 0 ? "default" : "pointer", color: iAmInCall || others.length === 0 ? "var(--text-3)" : "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <i className="fa-solid fa-phone" style={{ fontSize: 14 }} />
          </button>
          <button
            onClick={() => startCall(true)}
            disabled={iAmInCall || others.length === 0}
            title="Видеозвонок"
            style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: iAmInCall || others.length === 0 ? "default" : "pointer", color: iAmInCall || others.length === 0 ? "var(--text-3)" : "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <i className="fa-solid fa-video" style={{ fontSize: 14 }} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            title="Поиск сообщений"
            style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 13 }} />
          </button>
          {isGroup && (
            <button
              onClick={() => setSettingsOpen(true)}
              title={isOwner ? "Настройки группы" : "Участники"}
              style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="fa-solid fa-gear" style={{ fontSize: 14 }} />
            </button>
          )}
        </div>
      </div>

      {dm?.is_group && (
        <div style={{ padding: "6px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 6, background: "var(--bg-1)", overflowX: "auto", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginRight: 4 }}>Участники:</span>
          {dm.participants.map((p) => (
            <div key={p.user.id} title={p.user.display_name ?? p.user.username} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 4px", borderRadius: 999, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
              <Avatar name={p.user.username} size={18} shape="circle" status={p.user.status} avatarUrl={p.user.avatar_url} />
              <span style={{ fontSize: 11.5, color: "var(--text-1)" }}>
                {p.user.display_name ?? p.user.username}
                {p.user.id === user?.id && <span style={{ color: "var(--text-3)" }}> · вы</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <DMMessageList dmId={dmId} />
      <DMComposer dmId={dmId} recipientName={title} />
      {settingsOpen && dm && <GroupDMSettings dm={dm} onClose={() => setSettingsOpen(false)} />}
      {searchOpen && dm && (
        <MessageSearchModal
          ctx={{ type: "dm", dmId, participants: dm.participants }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
