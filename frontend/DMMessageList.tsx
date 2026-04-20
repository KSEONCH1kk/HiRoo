"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime } from "@/lib/utils";
import type { DMMessageType } from "@/types";

interface Props { dmId: string; }

export function DMMessageList({ dmId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dmMessages, addDMMessage } = useChatStore();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const msgs: DMMessageType[] = dmMessages[dmId] ?? [];

  useEffect(() => {
    setLoading(true);
    dmsApi.messages(dmId).then((res) => {
      res.items.forEach((m) => addDMMessage(m));
      setCursor(res.next_cursor ?? undefined);
      setHasMore(!!res.next_cursor);
    }).finally(() => setLoading(false));
  }, [dmId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    setLoading(true);
    try {
      const res = await dmsApi.messages(dmId, cursor);
      res.items.forEach((m) => addDMMessage(m));
      setCursor(res.next_cursor ?? undefined);
      setHasMore(!!res.next_cursor);
    } finally { setLoading(false); }
  }, [dmId, cursor, hasMore, loading]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop < 80 && hasMore && !loading) loadMore();
  }, [hasMore, loading, loadMore]);

  return (
    <div ref={containerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
      {loading && (
        <div style={{ textAlign: "center", padding: 12, fontSize: 12, color: "var(--text-2)", fontFamily: "Geist Mono" }}>загрузка…</div>
      )}
      {msgs.map((msg, i) => {
        const prev = msgs[i - 1];
        const grouped = !!prev && prev.author?.id === msg.author?.id &&
          new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
        return (
          <div key={msg.id} style={{ display: "flex", alignItems: grouped ? "center" : "flex-start", gap: 10, padding: grouped ? "1px 0 1px 42px" : "6px 0" }}>
            {!grouped && <Avatar name={msg.author?.username ?? ""} size={34} shape="circle" avatarUrl={msg.author?.avatar_url} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              {!grouped && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>{msg.author?.display_name ?? msg.author?.username}</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>{formatMessageTime(msg.created_at)}</span>
                </div>
              )}
              <div style={{ fontSize: 14, color: msg.is_deleted ? "var(--text-3)" : "var(--text-1)", fontStyle: msg.is_deleted ? "italic" : "normal", lineHeight: 1.5 }}>
                {msg.is_deleted ? "Сообщение удалено" : msg.content}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
