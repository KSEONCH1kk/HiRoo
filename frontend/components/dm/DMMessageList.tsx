"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { MessageContent } from "@/components/chat/MessageContent";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { formatMessageTime } from "@/lib/utils";
import type { DMMessageType } from "@/types";

interface Props { dmId: string; }

export function DMMessageList({ dmId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dmMessages, setDMMessages, prependDMMessages, addDMReaction, removeDMReaction, editingMessageId, startEdit, cancelEdit } = useChatStore();
  const { user } = useAuthStore();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const msgs: DMMessageType[] = dmMessages[dmId] ?? [];

  useEffect(() => {
    setLoading(true);
    dmsApi.messages(dmId).then((res) => {
      setDMMessages(dmId, res.items);
      setCursor(res.next_cursor ?? undefined);
      setHasMore(!!res.next_cursor);
    }).finally(() => setLoading(false));
  }, [dmId]);

  useEffect(() => { cancelEdit(); }, [dmId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    setLoading(true);
    try {
      const res = await dmsApi.messages(dmId, cursor);
      prependDMMessages(dmId, res.items);
      setCursor(res.next_cursor ?? undefined);
      setHasMore(!!res.next_cursor);
    } finally { setLoading(false); }
  }, [dmId, cursor, hasMore, loading]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop < 80 && hasMore && !loading) loadMore();
  }, [hasMore, loading, loadMore]);

  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    if (!user) return;
    const msg = msgs.find((m) => m.id === msgId);
    const already = msg?.reactions?.some((r) => r.emoji === emoji && r.me);
    if (already) removeDMReaction(dmId, msgId, emoji, user.id, user.id);
    else addDMReaction(dmId, msgId, emoji, user.id, user.id);
    try {
      if (already) await dmsApi.removeReaction(dmId, msgId, emoji);
      else await dmsApi.addReaction(dmId, msgId, emoji);
    } catch {
      if (already) addDMReaction(dmId, msgId, emoji, user.id, user.id);
      else removeDMReaction(dmId, msgId, emoji, user.id, user.id);
    }
  }, [dmId, msgs, user]);

  const handleEdit = useCallback(async (msgId: string, content: string) => {
    try { await dmsApi.edit(dmId, msgId, content); } catch {}
  }, [dmId]);

  const handleDelete = useCallback(async (msgId: string) => {
    try { await dmsApi.delete(dmId, msgId); } catch {}
  }, [dmId]);

  return (
    <div ref={containerRef} onScroll={handleScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
      {loading && (
        <div style={{ textAlign: "center", padding: 12, fontSize: 12, color: "var(--text-2)", fontFamily: "Geist Mono" }}>загрузка…</div>
      )}
      {msgs.map((msg, i) => {
        const prev = msgs[i - 1];
        const grouped = !!prev && prev.author?.id === msg.author?.id && !prev.is_deleted &&
          new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
        return (
          <DMMessageItem
            key={msg.id}
            msg={msg}
            grouped={grouped}
            isMe={user?.id === msg.author?.id}
            editing={editingMessageId === msg.id}
            onStartEdit={() => startEdit(msg.id)}
            onCancelEdit={cancelEdit}
            onSubmitEdit={handleEdit}
            onDelete={handleDelete}
            onReact={handleReact}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

interface ItemProps {
  msg: DMMessageType;
  grouped: boolean;
  isMe: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReact: (id: string, emoji: string) => Promise<void>;
}

const QUICK = ["👍", "❤️", "😂", "🔥"];

function DMMessageItem({ msg, grouped, isMe, editing, onStartEdit, onCancelEdit, onSubmitEdit, onDelete, onReact }: ItemProps) {
  const [hover, setHover] = useState(false);
  const [editValue, setEditValue] = useState(msg.content);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => { if (editing) setEditValue(msg.content); }, [editing, msg.content]);

  if (msg.is_deleted) {
    return (
      <div style={{ padding: grouped ? "1px 0 1px 44px" : "6px 0 6px 44px", fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
        Сообщение удалено
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: grouped ? "center" : "flex-start", gap: 10, padding: grouped ? "1px 0 1px 42px" : "6px 0", position: "relative", background: hover ? "var(--bg-hover)" : "transparent", borderRadius: 4 }}
    >
      {hover && !editing && (
        <div style={{
          position: "absolute", right: 8, top: -14, zIndex: 10,
          background: "var(--bg-2)", border: "1px solid var(--line-strong)",
          borderRadius: 8, padding: "2px 4px", display: "flex", gap: 2,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}>
          {QUICK.map((e) => (
            <button key={e} onClick={() => onReact(msg.id, e)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 3px", borderRadius: 4 }}>{e}</button>
          ))}
          <div style={{ position: "relative" }}>
            <button onClick={(e) => { e.stopPropagation(); setEmojiOpen((v) => !v); }} title="Другая реакция" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px", color: "var(--text-2)", fontSize: 13 }}>
              <i className="fa-regular fa-face-smile" />
            </button>
            {emojiOpen && (
              <EmojiPicker anchor="bottom-right" onPick={(e) => { onReact(msg.id, e); setEmojiOpen(false); }} onClose={() => setEmojiOpen(false)} />
            )}
          </div>
          {isMe && <button onClick={onStartEdit} title="Редактировать" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--text-2)", fontSize: 12 }}>
            <i className="fa-solid fa-pen" />
          </button>}
          {isMe && <button onClick={() => { if (confirm("Удалить сообщение?")) onDelete(msg.id); }} title="Удалить" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--danger)", fontSize: 12 }}>
            <i className="fa-solid fa-trash" />
          </button>}
        </div>
      )}

      {!grouped && <Avatar name={msg.author?.username ?? ""} size={34} shape="circle" avatarUrl={msg.author?.avatar_url} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!grouped && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>{msg.author?.display_name ?? msg.author?.username}</span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>{formatMessageTime(msg.created_at)}</span>
            {msg.edited_at && <span style={{ fontSize: 10, color: "var(--text-3)" }}>(ред.)</span>}
          </div>
        )}
        {editing ? (
          <div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const t = editValue.trim();
                  if (t && t !== msg.content) onSubmitEdit(msg.id, t);
                  onCancelEdit();
                }
                if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
              }}
              autoFocus
              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--accent)", borderRadius: 6, padding: "6px 10px", color: "var(--text-0)", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none" }}
            />
            <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>enter — сохранить · esc — отмена</div>
          </div>
        ) : (
          <MessageContent content={msg.content} />
        )}
        {msg.reactions && msg.reactions.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {msg.reactions.map((r) => (
              <div key={r.emoji} onClick={() => onReact(msg.id, r.emoji)} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "2px 8px", borderRadius: 10,
                background: r.me ? "var(--bg-active)" : "var(--bg-3)",
                border: `1px solid ${r.me ? "var(--accent)" : "var(--line)"}`,
                fontSize: 12, cursor: "pointer",
              }}>
                <span style={{ fontSize: 13 }}>{r.emoji}</span>
                <span style={{ fontFamily: "Geist Mono", fontSize: 11, color: "var(--text-2)" }}>{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
