"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { MessageContent } from "@/components/chat/MessageContent";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { formatMessageTime } from "@/lib/utils";
import type { DMMessageType } from "@/types";

interface Props { dmId: string; }

export function DMMessageList({ dmId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dmMessages, setDMMessages, prependDMMessages, addDMReaction, removeDMReaction, editingMessageId, startEdit, cancelEdit, updateDMMessage } = useChatStore();
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
    try {
      const updated = await dmsApi.edit(dmId, msgId, content);
      updateDMMessage(updated);
    } catch {}
  }, [dmId, updateDMMessage]);

  const handleDelete = useCallback(async (msgId: string) => {
    try { await dmsApi.delete(dmId, msgId); } catch {}
  }, [dmId]);

  return (
    <>
      <div ref={containerRef} onScroll={handleScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 12, fontSize: 12, color: "var(--text-2)", fontFamily: "Geist Mono" }}>загрузка…</div>
        )}
        {msgs.map((msg, i) => {
          const prev = msgs[i - 1];
          const grouped = !!prev && prev.type !== "call_log" && msg.type !== "call_log" &&
            prev.author?.id === msg.author?.id && !prev.is_deleted &&
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
      <TypingIndicator roomKey={dmId} />
    </>
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
  const startReply = useChatStore((s) => s.startReply);

  useEffect(() => { if (editing) setEditValue(msg.content); }, [editing, msg.content]);

  const beginReply = () => {
    if (!msg.author) return;
    startReply(msg.dm_id, {
      messageId: msg.id,
      authorId: msg.author.id,
      username: msg.author.username,
      displayName: msg.author.display_name,
      contentPreview: (msg.content || "").slice(0, 120),
    });
  };

  const scrollToOriginal = () => {
    if (!msg.reply_to?.id) return;
    const el = document.querySelector(`[data-msgid="${msg.reply_to.id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prev = el.style.background;
    el.style.transition = "background 200ms";
    el.style.background = "var(--bg-active)";
    setTimeout(() => { el.style.background = prev; }, 900);
  };

  if (msg.type === "call_log") {
    const ongoing = msg.content === "ongoing" || msg.content === "" || isNaN(parseInt(msg.content, 10));
    const totalSec = ongoing ? 0 : Math.max(0, parseInt(msg.content, 10) || 0);
    const name = msg.author?.display_name ?? msg.author?.username ?? "Кто-то";
    let durationText: string;
    if (ongoing) {
      durationText = "";
    } else if (totalSec >= 3600) {
      durationText = `${Math.floor(totalSec / 3600)} ч ${Math.floor((totalSec % 3600) / 60)} мин`;
    } else {
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      durationText = `${mm}:${ss.toString().padStart(2, "0")}`;
    }
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 0 8px 2px", fontSize: 13.5, color: "var(--text-2)",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%", background: "var(--bg-3)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          position: "relative",
        }}>
          <i className="fa-solid fa-phone" style={{ color: "var(--ok)", fontSize: 13 }} />
          {ongoing && (
            <span style={{
              position: "absolute", top: -2, right: -2, width: 10, height: 10,
              borderRadius: "50%", background: "var(--ok)",
              boxShadow: "0 0 0 2px var(--bg-1)",
              animation: "ringPulse 1.4s infinite",
            }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>
            <span style={{ color: "var(--text-0)", fontWeight: 600 }}>{name}</span>
            {ongoing ? (
              <span> начал звонок · <span style={{ color: "var(--ok)", fontWeight: 600 }}>идёт сейчас</span></span>
            ) : (
              <>
                <span> начал звонок, который длился </span>
                <span style={{ fontFamily: "Geist Mono", color: "var(--text-0)" }}>{durationText}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 2 }}>
            {formatMessageTime(msg.created_at)}
          </div>
        </div>
      </div>
    );
  }

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
      data-msgid={msg.id}
      style={{ display: "flex", flexDirection: "column", padding: grouped ? "1px 0 1px 42px" : "6px 0", position: "relative", background: hover ? "var(--bg-hover)" : "transparent", borderRadius: 4 }}
    >
      {msg.reply_to && (
        <div
          onClick={scrollToOriginal}
          style={{
            marginLeft: grouped ? 0 : 44, marginBottom: 2,
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12.5, color: "var(--text-2)", cursor: "pointer", overflow: "hidden",
          }}
        >
          <i className="fa-solid fa-reply" style={{ fontSize: 10, color: "var(--text-3)", transform: "scaleX(-1)" }} />
          <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>
            {msg.reply_to.author?.display_name ?? msg.reply_to.author?.username ?? "Удалённый"}
          </strong>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>
            {msg.reply_to.is_deleted ? "сообщение удалено" : msg.reply_to.content}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: grouped ? "center" : "flex-start", gap: 10, position: "relative" }}>
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
          <button onClick={beginReply} title="Ответить" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--text-2)", fontSize: 12 }}>
            <i className="fa-solid fa-reply" />
          </button>
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
    </div>
  );
}
