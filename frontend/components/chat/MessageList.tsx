"use client";
import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAuthStore } from "@/store/authStore";
import { messagesApi } from "@/lib/api";
import { useServerRoles } from "@/hooks/useServerRoles";
import { Message } from "./Message";
import { TypingIndicator } from "./TypingIndicator";
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
              onReact={handleReact}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
      <TypingIndicator roomKey={channelId} />
    </>
  );
}
