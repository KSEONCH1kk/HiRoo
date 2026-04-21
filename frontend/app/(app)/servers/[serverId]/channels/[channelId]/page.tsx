"use client";
import { useEffect, useState } from "react";
import { useServerStore } from "@/store/serverStore";
import { useUIStore } from "@/store/uiStore";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageSearchModal } from "@/components/chat/MessageSearchModal";
import { useIsMobile } from "@/hooks/useIsMobile";
import { messagesApi } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import { useUnreadStore } from "@/store/unreadStore";
import { MembersPanel } from "@/components/chat/MembersPanel";

interface Params { serverId: string; channelId: string; }

export default function ChannelPage({ params }: { params: Params }) {
  const { serverId, channelId } = params;
  const { setActiveServer, setActiveChannel, channels } = useServerStore();
  const { mode, setMode, membersOpen } = useUIStore();
  const { addMessage } = useChatStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useIsMobile();

  const sendMessage = async (content: string, replyToId?: string | null) => {
    const msg = await messagesApi.send(channelId, content, replyToId ?? undefined);
    addMessage(msg);
  };

  useEffect(() => {
    setActiveServer(serverId);
    setActiveChannel(channelId);
    useUnreadStore.getState().clearServerMentions(serverId);
    setMode("server");
  }, [serverId, channelId]);

  const allChannels = channels[serverId] ?? [];
  const channel = allChannels.find((c) => c.id === channelId);

  if (!channel) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", fontSize: 14 }}>
        Канал не найден
      </div>
    );
  }

  if (channel.type === "voice") {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <i className="fa-solid fa-volume-high" style={{ fontSize: 40, color: "var(--text-2)" }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-0)" }}>{channel.name}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>Голосовой канал — нажмите для подключения</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {/* Channel header */}
        <div style={{ height: 48, flexShrink: 0, padding: "0 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-1)" }}>
          <i className="fa-solid fa-hashtag" style={{ fontSize: 18, color: "var(--text-2)" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>{channel.name}</span>
          {channel.topic && (
            <>
              <div style={{ width: 1, height: 18, background: "var(--line-strong)" }} />
              <span style={{ fontSize: 13, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channel.topic}</span>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button
              onClick={() => setSearchOpen(true)}
              title="Поиск сообщений"
              style={{ width: 32, height: 32, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 13 }} />
            </button>
            {!isMobile && (
              <button
                onClick={() => useUIStore.getState().setMembersOpen(!membersOpen)}
                style={{ width: 32, height: 32, border: "none", background: membersOpen ? "var(--bg-active)" : "transparent", borderRadius: 6, cursor: "pointer", color: membersOpen ? "var(--text-0)" : "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <i className="fa-solid fa-users" style={{ fontSize: 14 }} />
              </button>
            )}
          </div>
        </div>

        <MessageList channelId={channelId} serverId={serverId} />
        <MessageComposer channelId={channelId} serverId={serverId} placeholder={`Написать в #${channel.name}`} onSend={sendMessage} />
      </div>

      {membersOpen && <MembersPanel serverId={serverId} />}
      {searchOpen && (
        <MessageSearchModal
          ctx={{ type: "channel", channelId, serverId }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
