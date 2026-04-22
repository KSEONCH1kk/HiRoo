"use client";
import { useCallback } from "react";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { dmsApi } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";

interface Props { dmId: string; recipientName: string; }

export function DMComposer({ dmId, recipientName }: Props) {
  const { addDMMessage, addFailed } = useChatStore();
  const { user } = useAuthStore();

  const handleSend = useCallback(async (content: string, replyToId?: string | null) => {
    if (!content.trim()) return;
    try {
      const msg = await dmsApi.sendMessage(dmId, content, replyToId ?? null);
      addDMMessage(msg);
    } catch (err: any) {
      // Render a Discord-style "not delivered" placeholder visible only
      // to us. Re-throw nothing — the composer should swallow and clear.
      const detail = err?.response?.data?.detail;
      addFailed({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        roomKey: dmId,
        content,
        error: typeof detail === "string" ? detail : "Сообщение не отправлено",
        authorId: user?.id ?? "",
        created_at: new Date().toISOString(),
      });
    }
  }, [dmId, user?.id]);

  return (
    <MessageComposer
      placeholder={`Написать ${recipientName}`}
      dmId={dmId}
      onSend={handleSend}
    />
  );
}
