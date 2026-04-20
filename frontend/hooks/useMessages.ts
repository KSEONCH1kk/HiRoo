"use client";
import { useEffect, useCallback, useRef } from "react";
import { messagesApi } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";

export function useMessages(channelId: string | null) {
  const { messages, setMessages, prependMessages } = useChatStore();
  const cursor = useRef<string | null>(null);
  const hasMore = useRef(true);
  const loading = useRef(false);

  useEffect(() => {
    if (!channelId) return;
    cursor.current = null;
    hasMore.current = true;

    messagesApi.list(channelId).then((data) => {
      setMessages(channelId, data.items);
      hasMore.current = data.has_more;
      cursor.current = data.next_cursor;
    });
  }, [channelId]);

  const loadMore = useCallback(async () => {
    if (!channelId || !hasMore.current || loading.current || !cursor.current) return;
    loading.current = true;
    try {
      const data = await messagesApi.list(channelId, cursor.current);
      prependMessages(channelId, data.items);
      hasMore.current = data.has_more;
      cursor.current = data.next_cursor;
    } finally {
      loading.current = false;
    }
  }, [channelId]);

  return { messages: channelId ? (messages[channelId] ?? []) : [], loadMore, hasMore: hasMore.current, loading: loading.current };
}
