"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { dmsApi } from "@/lib/api";
import { DMMessageList } from "@/components/dm/DMMessageList";
import { DMComposer } from "@/components/dm/DMComposer";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/authStore";
import { useUnreadStore } from "@/store/unreadStore";
import { useCallStore } from "@/store/callStore";
import type { DirectMessage } from "@/types";

export default function DMPage({ params }: { params: { dmId: string } }) {
  const { dmId } = params;
  const { user } = useAuthStore();
  const { startCall: startCallStore } = useCallStore();

  const { data: dm } = useQuery<DirectMessage>({
    queryKey: ["dm", dmId],
    queryFn: () => dmsApi.get(dmId),
  });

  useEffect(() => { useUnreadStore.getState().clearDmUnread(dmId); }, [dmId]);

  const other = dm?.participants?.find((p) => p.user.id !== user?.id) ?? dm?.participants?.[0];
  const name = other?.user.display_name ?? other?.user.username ?? "Пользователь";

  const startCall = (video: boolean) => {
    if (!other?.user?.id) return;
    startCallStore({
      roomId: `dm:${dmId}`,
      title: name,
      dmId,
      ringUserId: other.user.id,
      video,
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div style={{ height: 48, flexShrink: 0, padding: "0 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-1)" }}>
        <Avatar name={other?.user.username ?? "?"} size={28} status={other?.user.status} shape="circle" avatarUrl={other?.user.avatar_url} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>{name}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button onClick={() => startCall(false)} title="Голосовой звонок" style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="fa-solid fa-phone" style={{ fontSize: 14 }} />
          </button>
          <button onClick={() => startCall(true)} title="Видеозвонок" style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="fa-solid fa-video" style={{ fontSize: 14 }} />
          </button>
        </div>
      </div>

      <DMMessageList dmId={dmId} />
      <DMComposer dmId={dmId} recipientName={name} />
    </div>
  );
}
