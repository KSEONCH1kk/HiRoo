"use client";
import { useState, useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ClanTag } from "@/components/ui/ClanTag";
import { formatMessageTime } from "@/lib/utils";
import { MessageContent } from "./MessageContent";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { useUIStore } from "@/store/uiStore";
import { useChatStore } from "@/store/chatStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Message as MessageType } from "@/types";
import { MessageComponents } from "./MessageComponents";
import { useBlocksStore } from "@/store/blocksStore";
import { ForwardModal } from "@/components/modals/ForwardModal";

interface Props {
  grouped?: boolean;
  message: MessageType;
  prevAuthorId?: string | null;
  currentUserId?: string;
  authorColor?: string | null;
  canManageMessages?: boolean;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onPin?: (id: string, pin: boolean) => void;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function Message({ message: m, prevAuthorId, currentUserId, authorColor, canManageMessages, onEdit, onDelete, onReact, onPin }: Props) {
  // Hooks — must always be called in the same order, so do NOT early-return
  // between them. The `blocked` placeholder is rendered via a conditional in
  // the JSX at the bottom.
  const [hover, setHover] = useState(false);
  const [editValue, setEditValue] = useState(m.content);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [bodyCtx, setBodyCtx] = useState<{ x: number; y: number } | null>(null);
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [revealBlocked, setRevealBlocked] = useState(false);
  const blocked = useBlocksStore((s) => m.author?.id ? s.blockedIds.has(m.author.id) : false);
  const { editingMessageId, startEdit, cancelEdit, startReply } = useChatStore();
  const editing = editingMessageId === m.id;
  const isMobile = useIsMobile();
  const AVATAR_SIZE = isMobile ? 32 : 40;
  const GAP = isMobile ? 8 : 12;
  const SIDE_PAD = isMobile ? 10 : 16;
  const GROUPED_INDENT = SIDE_PAD + AVATAR_SIZE + GAP;

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

  if (blocked && !revealBlocked) {
    return (
      <div style={{
        padding: "6px 16px", margin: "2px 0", color: "var(--text-3)",
        fontSize: 12, fontStyle: "italic",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <i className="fa-solid fa-ban" style={{ fontSize: 10 }} />
        <span>Сообщение от заблокированного пользователя</span>
        <button
          onClick={() => setRevealBlocked(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 11, fontWeight: 600 }}
        >
          Показать
        </button>
      </div>
    );
  }

  if (m.is_deleted) {
    return (
      <div style={{ padding: `2px ${SIDE_PAD}px 2px ${GROUPED_INDENT}px`, fontSize: 13.5, color: "var(--text-3)", fontStyle: "italic" }}>
        [сообщение удалено]
      </div>
    );
  }

  // System messages (welcome, etc.) render as a slim inline banner without
  // avatar or grouping — resembles Discord's "X joined" line.
  if (m.type === "system_welcome") {
    const name = m.author?.display_name ?? m.author?.username ?? "Кто-то";
    // Template uses "{name} ..." — split off the name at the start so we can
    // click it to open the profile.
    const rest = m.content.startsWith(name) ? m.content.slice(name.length) : ` ${m.content}`;
    return (
      <div style={{
        padding: `6px ${SIDE_PAD}px 6px ${GROUPED_INDENT}px`,
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.4,
      }}>
        <i className="fa-solid fa-arrow-right-to-bracket"
           style={{ fontSize: 11, color: "var(--ok, #58cf8c)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          <span
            onClick={() => m.author && useUIStore.getState().setProfileUser(m.author as any)}
            style={{
              fontWeight: 600, color: "var(--text-0)",
              cursor: m.author ? "pointer" : "default",
            }}
          >
            {name}
          </span>
          <span>{rest}</span>
          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
            {formatMessageTime(m.created_at)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      data-msgid={m.id}
      onContextMenu={(e) => {
        // Don't shadow the author-row menu on avatar/name right-click.
        const tgt = e.target as HTMLElement;
        if (tgt.closest("[data-author-anchor]")) return;
        if (editing) return;
        e.preventDefault();
        setBodyCtx({ x: e.clientX, y: e.clientY });
      }}
      style={{
        padding: isGroup
          ? `8px ${SIDE_PAD}px 2px ${SIDE_PAD}px`
          : `0 ${SIDE_PAD}px 2px ${GROUPED_INDENT}px`,
        position: "relative",
        background: hover ? "var(--bg-hover)" : "transparent",
      }}>

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
          <button onClick={() => setForwardOpen(true)} title="Переслать" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--text-2)", fontSize: 12 }}>
            <i className="fa-solid fa-share" />
          </button>
          {isMe && <button onClick={() => { startEdit(m.id); }} title="Редактировать" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--text-2)", fontSize: 12 }}>
            <i className="fa-solid fa-pen" />
          </button>}
          {(isMe || canManageMessages) && <button onClick={() => { if (confirm("Удалить сообщение?")) onDelete?.(m.id); }} title="Удалить" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: "var(--danger)", fontSize: 12 }}>
            <i className="fa-solid fa-trash" />
          </button>}
        </div>
      )}

      <div style={{ display: "flex", gap: GAP }}>
        {isGroup && (
          <div
            onClick={isWebhook ? undefined : openProfile}
            onContextMenu={isWebhook ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }); }}
            data-author-anchor
            style={{ cursor: isWebhook ? "default" : "pointer", flexShrink: 0 }}
          >
            <Avatar name={isWebhook ? webhookDisplayName : (m.author?.username ?? "?")} size={AVATAR_SIZE} shape="circle" avatarUrl={isWebhook ? webhookAvatar : (m.author?.avatar_url ?? null)} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isGroup && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
              <span
                onClick={isWebhook ? undefined : openProfile}
                onContextMenu={isWebhook ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }); }}
            data-author-anchor
                style={{ fontSize: 14, fontWeight: 600, color: isWebhook ? "var(--text-0)" : (authorColor ?? "var(--text-0)"), cursor: isWebhook ? "default" : "pointer" }}
              >
                {isWebhook ? webhookDisplayName : (m.author?.display_name ?? m.author?.username ?? "Неизвестный")}
              </span>
              {!isWebhook && <ClanTag tag={m.author?.tag} />}
              {isWebhook && (
                <span style={{ fontSize: 9.5, padding: "1px 5px", borderRadius: 3, background: "var(--accent)", color: "#fff", fontWeight: 700, fontFamily: "Geist Mono", letterSpacing: 0.5 }}>
                  ВЕБХУК
                </span>
              )}
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                {formatMessageTime(m.created_at)}
              </span>
              {m.edited_at && <span style={{ fontSize: 10, color: "var(--text-3)" }}>(ред.)</span>}
              {m.is_pinned && (
                <span title="Закреплено" style={{ color: "var(--accent)" }}>
                  <i className="fa-solid fa-thumbtack" style={{ fontSize: 9 }} />
                </span>
              )}
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
            <>
              <MessageContent content={m.content} embeds={m.embeds} />
              {m.components && m.components.length > 0 && (
                <MessageComponents
                  components={m.components as any}
                  messageId={m.id}
                  channelId={m.channel_id}
                  applicationId={m.application_id ?? null}
                />
              )}
            </>
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

      {bodyCtx && (() => {
        const items: MenuItem[] = [];
        if (!m.is_deleted) {
          items.push({
            icon: "fa-face-smile", label: "Добавить реакцию",
            onClick: () => { const pt = bodyCtx; setBodyCtx(null); if (pt) setPickerAt(pt); },
          });
          items.push({ icon: "fa-reply", label: "Ответить", onClick: beginReply });
          items.push({ icon: "fa-share", label: "Переслать…", onClick: () => setForwardOpen(true) });
          if (canManageMessages && onPin) {
            items.push({
              icon: "fa-thumbtack",
              label: m.is_pinned ? "Открепить сообщение" : "Закрепить сообщение",
              onClick: () => onPin(m.id, !m.is_pinned),
            });
          }
          if (isMe) {
            items.push({ icon: "fa-pen", label: "Редактировать", onClick: () => startEdit(m.id) });
          }
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({
            icon: "fa-copy", label: "Копировать текст",
            onClick: () => { try { navigator.clipboard?.writeText(m.content); } catch {} },
          });
        }
        items.push({
          icon: "fa-hashtag", label: "Копировать ID",
          onClick: () => { try { navigator.clipboard?.writeText(m.id); } catch {} },
        });
        if ((isMe || canManageMessages) && !m.is_deleted) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({
            icon: "fa-trash", label: "Удалить сообщение", danger: true,
            onClick: () => { if (confirm("Удалить сообщение?")) onDelete?.(m.id); },
          });
        }
        return <ContextMenu x={bodyCtx.x} y={bodyCtx.y} items={items} onClose={() => setBodyCtx(null)} />;
      })()}

      {pickerAt && (
        <div style={{ position: "fixed", left: pickerAt.x, top: pickerAt.y, zIndex: 300 }}>
          <EmojiPicker
            anchor="bottom-right"
            onPick={(e) => { onReact?.(m.id, e); setPickerAt(null); }}
            onClose={() => setPickerAt(null)}
          />
        </div>
      )}
      {forwardOpen && (
        <ForwardModal message={m} onClose={() => setForwardOpen(false)} />
      )}
    </div>
  );
}
