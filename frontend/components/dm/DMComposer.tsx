"use client";
import { useCallback } from "react";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { dmsApi } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";

interface Props { dmId: string; recipientName: string; }

export function DMComposer({ dmId, recipientName }: Props) {
  const { addDMMessage } = useChatStore();

  const handleSend = useCallback(async (content: string, replyToId?: string | null) => {
    if (!content.trim()) return;
    const msg = await dmsApi.sendMessage(dmId, content, replyToId ?? null);
    addDMMessage(msg);
  }, [dmId]);

  return (
    <MessageComposer
      placeholder={`Написать ${recipientName}`}
      dmId={dmId}
      onSend={handleSend}
    />
  );
}
