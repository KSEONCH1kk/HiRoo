"use client";
import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAuthStore } from "@/store/authStore";
import { messagesApi } from "@/lib/api";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { Message } from "./Message";
import { TypingIndicator } from "./TypingIndicator";
import { FailedMessageList } from "./FailedMessageList";
import type { Message as MsgType } from "@/types";

interface Props {
  channelId: string;
  serverId: string;
}

export function MessageList({ channelId, serverId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { messages, addReaction, removeReaction, cancelEdit, updateMessage } = useChatStore();
  const { user } = useAuthStore();
  const { getColor } = useServerRoles(serverId);
  const { has } = useServerPermissions(serverId);
  const canManageMessages = has("MANAGE_MESSAGES") || has("MANAGE_SERVER");
  const { loadMore, hasMore, loading } = useMessages(channelId);

  const msgs: MsgType[] = messages[channelId] ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  useEffect(() => {
    cancelEdit();
  }, [channelId]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop < 80 && hasMore && !loading) loadMore();
  }, [hasMore, loading, loadMore]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const msg = msgs.find((m) => m.id === messageId);
    const already = msg?.reactions?.some((r) => r.emoji === emoji && r.me);
    // Optimistic
    if (already) removeReaction(channelId, messageId, emoji, user.id, user.id);
    else addReaction(channelId, messageId, emoji, user.id, user.id);
    try {
      if (already) await messagesApi.removeReaction(channelId, messageId, emoji);
      else await messagesApi.addReaction(channelId, messageId, emoji);
    } catch {
      // Revert on error
      if (already) addReaction(channelId, messageId, emoji, user.id, user.id);
      else removeReaction(channelId, messageId, emoji, user.id, user.id);
    }
  }, [channelId, msgs, user]);

  const handleEdit = useCallback(async (messageId: string, content: string) => {
    try {
      const updated = await messagesApi.edit(channelId, messageId, content);
      updateMessage(updated);
    } catch {}
  }, [channelId, updateMessage]);

  const handleDelete = useCallback(async (messageId: string) => {
    try { await messagesApi.delete(channelId, messageId); } catch {}
  }, [channelId]);

  const handlePin = useCallback(async (messageId: string, pin: boolean) => {
    try {
      if (pin) await messagesApi.pin(channelId, messageId);
      else await messagesApi.unpin(channelId, messageId);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Ошибка");
    }
  }, [channelId]);

  return (
    <>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column" }}
      >
        {loading && (
          <div style={{ textAlign: "center", padding: 12, fontSize: 12, color: "var(--text-2)", fontFamily: "Geist Mono" }}>
            загрузка…
          </div>
        )}
        {msgs.map((msg, i) => {
          const prev = msgs[i - 1];
          return (
            <Message
              key={msg.id}
              message={msg}
              prevAuthorId={prev?.author?.id ?? null}
              currentUserId={user?.id}
              authorColor={msg.author?.id ? getColor(msg.author.id) : null}
              canManageMessages={canManageMessages}
              onReact={handleReact}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPin={handlePin}
            />
          );
        })}
        <FailedMessageList roomKey={channelId} />
        <div ref={bottomRef} />
      </div>
      <TypingIndicator roomKey={channelId} />
    </>
  );
}
