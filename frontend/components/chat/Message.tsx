"use client";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime } from "@/lib/utils";
import { MessageContent } from "./MessageContent";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { useUIStore } from "@/store/uiStore";
import { useChatStore } from "@/store/chatStore";
import type { Message as MessageType } from "@/types";

interface Props {
  grouped?: boolean;
  message: MessageType;
  prevAuthorId?: string | null;
  currentUserId?: string;
  authorColor?: string | null;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function Message({ message: m, prevAuthorId, currentUserId, authorColor, onEdit, onDelete, onReact }: Props) {
  const [hover, setHover] = useState(false);
  const [editValue, setEditValue] = useState(m.content);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const { editingMessageId, startEdit, cancelEdit, startReply } = useChatStore();
  const editing = editingMessageId === m.id;

  const beginReply = () => {
    if (!m.author) return;
    startReply(m.channel_id, {
      messageId: m.id,
      authorId: m.author.id,
      username: m.author.username,
      displayName: m.author.display_name,
      contentPreview: (m.content || "").slice(0, 120),
    });
  };

  const scrollToOriginal = () => {
    if (!m.reply_to?.id) return;
    const el = document.querySelector(`[data-msgid="${m.reply_to.id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 200ms";
    const prev = el.style.background;
    el.style.background = "var(--bg-active)";
    setTimeout(() => { el.style.background = prev; }, 900);
  };

  useEffect(() => {
    if (editing) setEditValue(m.content);
  }, [editing, m.content]);
  const { setProfileUser } = useUIStore();

  const openProfile = () => { if (m.author) setProfileUser(m.author); };

  const authorCtxItems: MenuItem[] = m.author ? [
    { icon: "fa-user", label: "Профиль", onClick: openProfile },
    { icon: "fa-paper-plane", label: "Личное сообщение", onClick: () => { /* wired externally if needed */ }, disabled: true },
    { icon: "fa-at", label: "Упомянуть", onClick: () => { /* wired externally if needed */ }, disabled: true },
    { separator: true, label: "" } as MenuItem,
    { icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(m.author!.id) },
  ] : [];

  const isWebhook = !!m.webhook_id;
  const webhookDisplayName = m.webhook_name ?? "Webhook";
  const webhookAvatar = m.webhook_avatar_url ?? null;
  const isGroup = m.author_id !== prevAuthorId || isWebhook;
  const isMe = !isWebhook && m.author_id === currentUserId;
  const hue = 268;

  if (m.is_deleted) {
    return (
      <div style={{ padding: "2px 16px 2px 74px", fontSize: 13.5, color: "var(--text-3)", fontStyle: "italic" }}>
        [сообщение удалено]
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      data-msgid={m.id}
      style={{ padding: isGroup ? "8px 16px 2px" : "0 16px 2px 74px", position: "relative", background: hover ? "var(--bg-hover)" : "transparent" }}>

      {m.reply_to && (
        <div
          onClick={scrollToOriginal}
          style={{
            marginLeft: isGroup ? 52 : 0, marginBottom: 2,
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12.5, color: "var(--text-2)", cursor: "pointer", overflow: "hidden",
          }}
        >
          <i className="fa-solid fa-reply" style={{ fontSize: 10, color: "var(--text-3)", transform: "scaleX(-1)" }} />
          <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>
            {m.reply_to.author?.display_name ?? m.reply_to.author?.username ?? "Удалённый"}
          </strong>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>
            {m.reply_to.is_deleted ? "сообщение удалено" : m.reply_to.content}
          </span>
        </div>
      )}

      {/* Action bar */}
      {hover && !editing && (
        <div style={{
          position: "absolute", right: 16, top: -16, zIndex: 10,
          background: "var(--bg-2)", border: "1px solid var(--line-strong)",
          borderRadius: 8, padding: "2px 4px", display: "flex", gap: 2,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }}>
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => onReact?.(m.id, e)} title={`Реакция ${e}`} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 3px", borderRadius: 4 }}>{e}</button>
          ))}
          <div style={{ position: "relative" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setEmojiOpen((v) => !v); }}
              title="Другая реакция"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px", color: "var(--text-2)", fontSize: 13 }}
            >
              <i className="fa-regular fa-face-smile" />
            </button>
            {emojiOpen && (
              <EmojiPicker
                anchor="bottom-right"
                onPick={(e) => { onReact?.(m.id, e); setEmojiOpen(false); }}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <button onClick={beginReply} title="Ответить" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--text-2)", fontSize: 12 }}>
            <i className="fa-solid fa-reply" />
          </button>
          {isMe && <button onClick={() => { startEdit(m.id); }} title="Редактировать" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--text-2)", fontSize: 12 }}>
            <i className="fa-solid fa-pen" />
          </button>}
          {isMe && <button onClick={() => { if (confirm("Удалить сообщение?")) onDelete?.(m.id); }} title="Удалить" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--danger)", fontSize: 12 }}>
            <i className="fa-solid fa-trash" />
          </button>}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        {isGroup && (
          <div
            onClick={isWebhook ? undefined : openProfile}
            onContextMenu={isWebhook ? undefined : (e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
            style={{ cursor: isWebhook ? "default" : "pointer" }}
          >
            <Avatar name={isWebhook ? webhookDisplayName : (m.author?.username ?? "?")} size={40} shape="circle" avatarUrl={isWebhook ? webhookAvatar : (m.author?.avatar_url ?? null)} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isGroup && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
              <span
                onClick={isWebhook ? undefined : openProfile}
                onContextMenu={isWebhook ? undefined : (e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
                style={{ fontSize: 14, fontWeight: 600, color: isWebhook ? "var(--text-0)" : (authorColor ?? "var(--text-0)"), cursor: isWebhook ? "default" : "pointer" }}
              >
                {isWebhook ? webhookDisplayName : (m.author?.display_name ?? m.author?.username ?? "Неизвестный")}
              </span>
              {isWebhook && (
                <span style={{ fontSize: 9.5, padding: "1px 5px", borderRadius: 3, background: "var(--accent)", color: "#fff", fontWeight: 700, fontFamily: "Geist Mono", letterSpacing: 0.5 }}>
                  ВЕБХУК
                </span>
              )}
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                {formatMessageTime(m.created_at)}
              </span>
              {m.edited_at && <span style={{ fontSize: 10, color: "var(--text-3)" }}>(ред.)</span>}
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
                    const trimmed = editValue.trim();
                    if (trimmed && trimmed !== m.content) onEdit?.(m.id, trimmed);
                    cancelEdit();
                  }
                  if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                }}
                autoFocus
                onFocus={(e) => { e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); }}
                style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--accent)", borderRadius: 6, padding: "6px 10px", color: "var(--text-0)", fontSize: 14.5, fontFamily: "inherit", resize: "none", outline: "none" }}
              />
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>
                <span style={{ cursor: "pointer" }} onClick={cancelEdit}>esc</span>
                {" — отмена · "}
                <span style={{ cursor: "pointer" }} onClick={() => { const t = editValue.trim(); if (t && t !== m.content) onEdit?.(m.id, t); cancelEdit(); }}>enter</span>
                {" — сохранить"}
              </div>
            </div>
          ) : (
            <MessageContent content={m.content} embeds={m.embeds} />
          )}
          {/* Reactions */}
          {m.reactions.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {m.reactions.map((r) => (
                <div key={r.emoji} onClick={() => onReact?.(m.id, r.emoji)} style={{
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
      {ctx && authorCtxItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} items={authorCtxItems} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}
