import { create } from "zustand";
import type { Message, DMMessageType } from "@/types";

export interface TypingUser {
  userId: string;
  username: string;
  displayName?: string | null;
}

export interface ReplyTarget {
  messageId: string;
  authorId: string | null;
  username: string;
  displayName?: string | null;
  contentPreview: string;
}

interface ChatState {
  messages: Record<string, Message[]>; // channelId -> messages
  dmMessages: Record<string, DMMessageType[]>; // dmId -> messages
  typing: Record<string, TypingUser[]>; // roomKey (channelId | dmId) -> users
  replyingTo: Record<string, ReplyTarget | null>; // roomKey -> target
  editingMessageId: string | null;
  startEditLast: (channelId: string, userId: string) => boolean;
  startEditLastDM: (dmId: string, userId: string) => boolean;
  startEdit: (messageId: string) => void;
  cancelEdit: () => void;

  setMessages: (channelId: string, msgs: Message[]) => void;
  prependMessages: (channelId: string, msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  updateMessage: (msg: Message) => void;
  deleteMessage: (channelId: string, msgId: string) => void;

  setDMMessages: (dmId: string, msgs: DMMessageType[]) => void;
  prependDMMessages: (dmId: string, msgs: DMMessageType[]) => void;
  addDMMessage: (msg: DMMessageType) => void;
  updateDMMessage: (msg: DMMessageType) => void;
  deleteDMMessage: (dmId: string, msgId: string) => void;
  addDMReaction: (dmId: string, messageId: string, emoji: string, userId: string, currentUserId: string) => void;
  removeDMReaction: (dmId: string, messageId: string, emoji: string, userId: string, currentUserId: string) => void;

  addReaction: (channelId: string, messageId: string, emoji: string, userId: string, currentUserId: string) => void;
  removeReaction: (channelId: string, messageId: string, emoji: string, userId: string, currentUserId: string) => void;

  setTyping: (roomKey: string, user: TypingUser, isTyping: boolean) => void;

  startReply: (roomKey: string, target: ReplyTarget) => void;
  cancelReply: (roomKey: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  dmMessages: {},
  typing: {},
  replyingTo: {},
  editingMessageId: null,

  startReply: (roomKey, target) =>
    set((s) => ({ replyingTo: { ...s.replyingTo, [roomKey]: target } })),
  cancelReply: (roomKey) =>
    set((s) => ({ replyingTo: { ...s.replyingTo, [roomKey]: null } })),

  startEditLast: (channelId, userId) => {
    const list = get().messages[channelId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.author_id === userId && !m.is_deleted) {
        set({ editingMessageId: m.id });
        return true;
      }
    }
    return false;
  },
  startEditLastDM: (dmId, userId) => {
    const list = get().dmMessages[dmId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.author_id === userId && !m.is_deleted) {
        set({ editingMessageId: m.id });
        return true;
      }
    }
    return false;
  },
  startEdit: (messageId) => set({ editingMessageId: messageId }),
  cancelEdit: () => set({ editingMessageId: null }),

  setMessages: (channelId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [channelId]: msgs } })),
  prependMessages: (channelId, msgs) =>
    set((s) => ({
      messages: { ...s.messages, [channelId]: [...msgs, ...(s.messages[channelId] ?? [])] },
    })),
  addMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.channel_id] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      return { messages: { ...s.messages, [msg.channel_id]: [...existing, msg] } };
    }),
  updateMessage: (msg) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [msg.channel_id]: (s.messages[msg.channel_id] ?? []).map((m) =>
          m.id === msg.id ? msg : m
        ),
      },
    })),
  deleteMessage: (channelId, msgId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).filter((m) => m.id !== msgId),
      },
    })),

  setDMMessages: (dmId, msgs) =>
    set((s) => ({ dmMessages: { ...s.dmMessages, [dmId]: msgs } })),
  prependDMMessages: (dmId, msgs) =>
    set((s) => ({
      dmMessages: { ...s.dmMessages, [dmId]: [...msgs, ...(s.dmMessages[dmId] ?? [])] },
    })),
  addDMMessage: (msg) =>
    set((s) => {
      const existing = s.dmMessages[msg.dm_id] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      return { dmMessages: { ...s.dmMessages, [msg.dm_id]: [...existing, msg] } };
    }),
  updateDMMessage: (msg) =>
    set((s) => ({
      dmMessages: {
        ...s.dmMessages,
        [msg.dm_id]: (s.dmMessages[msg.dm_id] ?? []).map((m) => (m.id === msg.id ? msg : m)),
      },
    })),
  deleteDMMessage: (dmId, msgId) =>
    set((s) => ({
      dmMessages: {
        ...s.dmMessages,
        [dmId]: (s.dmMessages[dmId] ?? []).map((m) =>
          m.id === msgId ? { ...m, is_deleted: true, content: "[deleted]" } : m
        ),
      },
    })),
  addDMReaction: (dmId, messageId, emoji, userId, currentUserId) =>
    set((s) => ({
      dmMessages: {
        ...s.dmMessages,
        [dmId]: (s.dmMessages[dmId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions ?? [])];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            if (userId === currentUserId && reactions[idx].me) return m;
            reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, me: reactions[idx].me || userId === currentUserId };
          } else {
            reactions.push({ emoji, count: 1, me: userId === currentUserId });
          }
          return { ...m, reactions };
        }),
      },
    })),
  removeDMReaction: (dmId, messageId, emoji, userId, currentUserId) =>
    set((s) => ({
      dmMessages: {
        ...s.dmMessages,
        [dmId]: (s.dmMessages[dmId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions ?? [])];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (idx < 0) return m;
          if (userId === currentUserId && !reactions[idx].me) return m;
          const next = {
            ...reactions[idx],
            count: reactions[idx].count - 1,
            me: userId === currentUserId ? false : reactions[idx].me,
          };
          if (next.count <= 0) reactions.splice(idx, 1);
          else reactions[idx] = next;
          return { ...m, reactions };
        }),
      },
    })),

  addReaction: (channelId, messageId, emoji, userId, currentUserId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions ?? [])];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            // Don't double-count the same user
            if (userId === currentUserId && reactions[idx].me) return m;
            reactions[idx] = {
              ...reactions[idx],
              count: reactions[idx].count + 1,
              me: reactions[idx].me || userId === currentUserId,
            };
          } else {
            reactions.push({ emoji, count: 1, me: userId === currentUserId });
          }
          return { ...m, reactions };
        }),
      },
    })),
  removeReaction: (channelId, messageId, emoji, userId, currentUserId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions ?? [])];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (idx < 0) return m;
          // Idempotent: if this is us and we've already been marked as "not me", the event already applied
          if (userId === currentUserId && !reactions[idx].me) return m;
          const next = {
            ...reactions[idx],
            count: reactions[idx].count - 1,
            me: userId === currentUserId ? false : reactions[idx].me,
          };
          if (next.count <= 0) reactions.splice(idx, 1);
          else reactions[idx] = next;
          return { ...m, reactions };
        }),
      },
    })),

  setTyping: (roomKey, user, isTyping) =>
    set((s) => {
      const cur = s.typing[roomKey] ?? [];
      if (isTyping) {
        const rest = cur.filter((u) => u.userId !== user.userId);
        return { typing: { ...s.typing, [roomKey]: [...rest, user] } };
      }
      return { typing: { ...s.typing, [roomKey]: cur.filter((u) => u.userId !== user.userId) } };
    }),
}));
