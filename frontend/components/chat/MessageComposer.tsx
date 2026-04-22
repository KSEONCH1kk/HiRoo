"use client";
import { useState, useRef, useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { uploadsApi, type UploadResult } from "@/lib/api";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { MentionMenu, type MentionItem } from "./MentionMenu";
import { CommandPicker } from "@/components/commands/CommandPicker";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  placeholder: string;
  channelId?: string;
  serverId?: string;
  dmId?: string;
  onSend?: (content: string, replyToId?: string | null) => Promise<void>;
}

const AUTO_PING_KEY = "hiroo-reply-ping";
function readAutoPing(): boolean {
  if (typeof localStorage === "undefined") return true;
  const v = localStorage.getItem(AUTO_PING_KEY);
  return v !== "off";
}
function writeAutoPing(on: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTO_PING_KEY, on ? "on" : "off");
}

interface Pending {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  uploaded?: UploadResult;
  error?: string;
}

const MAX_BYTES = 100 * 1024 * 1024;
const LARGE_MSG_CHARS = 500;

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function MessageComposer({ placeholder, channelId, serverId, dmId, onSend = async () => {} }: Props) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { startEditLast, startEditLastDM } = useChatStore();
  const { user } = useAuthStore();
  const { members } = useServerRoles(serverId ?? null);
  const isMobile = useIsMobile();
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(null);
  const roomKey = channelId ?? dmId ?? "";
  const replyingTo = useChatStore((s) => (roomKey ? s.replyingTo[roomKey] : null)) ?? null;
  const cancelReplyStore = useChatStore((s) => s.cancelReply);
  const [autoPing, setAutoPing] = useState<boolean>(true);
  useEffect(() => { setAutoPing(readAutoPing()); }, []);
  const toggleAutoPing = () => {
    setAutoPing((v) => { const next = !v; writeAutoPing(next); return next; });
  };
  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo?.messageId]);

  // Listen for retry requests from FailedMessageList — repopulate the
  // textarea with the original text and drop the "not delivered" card.
  useEffect(() => {
    const myRoom = channelId ?? dmId ?? "";
    const onRetry = (e: Event) => {
      const detail = (e as CustomEvent<{ roomKey: string; content: string; id: string }>).detail;
      if (!detail || detail.roomKey !== myRoom) return;
      setValue(detail.content);
      useChatStore.getState().dismissFailed(detail.roomKey, detail.id);
      setTimeout(() => textareaRef.current?.focus(), 0);
    };
    window.addEventListener("hiroo:retry-failed", onRetry);
    return () => window.removeEventListener("hiroo:retry-failed", onRetry);
  }, [channelId, dmId]);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) { setValue((v) => v + emoji); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const detectMention = (text: string, caret: number) => {
    // Find the nearest '@' behind caret such that there's no space between
    const slice = text.slice(0, caret);
    const at = slice.lastIndexOf("@");
    if (at < 0) return null;
    // @ must be at start or preceded by whitespace
    if (at > 0 && !/\s/.test(text[at - 1])) return null;
    const query = slice.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { query, start: at, end: caret };
  };

  const pickMention = (item: MentionItem) => {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.end);
    const insert = `@${item.username} `;
    const next = before + insert + after;
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = mention.start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  const emitTyping = (typing: boolean) => {
    const s = getSocket();
    if (!s.connected) return;
    s.emit(typing ? "typing_start" : "typing_stop", { channel_id: channelId, server_id: serverId, dm_id: dmId });
  };

  const handleChange = (v: string, caret?: number) => {
    setValue(v);
    const el = textareaRef.current;
    const pos = caret ?? el?.selectionStart ?? v.length;
    setMention(detectMention(v, pos));
    if (!isTyping.current) { isTyping.current = true; emitTyping(true); }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { isTyping.current = false; emitTyping(false); }, 3000);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    for (const file of arr) {
      if (file.size > MAX_BYTES) {
        const err: Pending = { id: genId(), file, progress: 0, error: `Файл ${file.name} больше 100 МБ` };
        setAttachments((cur) => [...cur, err]);
        continue;
      }
      const id = genId();
      const isImg = file.type.startsWith("image/");
      const pending: Pending = {
        id, file, progress: 0,
        previewUrl: isImg ? URL.createObjectURL(file) : undefined,
      };
      setAttachments((cur) => [...cur, pending]);

      uploadsApi.attachment(file, (pct) => {
        setAttachments((cur) => cur.map((a) => a.id === id ? { ...a, progress: pct } : a));
      })
        .then((res) => {
          setAttachments((cur) => cur.map((a) => a.id === id ? { ...a, uploaded: res, progress: 100 } : a));
        })
        .catch((e) => {
          const detail = e?.response?.data?.detail ?? "Ошибка загрузки";
          setAttachments((cur) => cur.map((a) => a.id === id ? { ...a, error: detail } : a));
        });
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((cur) => {
      const target = cur.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return cur.filter((a) => a.id !== id);
    });
  };

  const buildMessage = () => {
    const lines: string[] = [];
    if (value.trim()) lines.push(value.trim());
    for (const a of attachments) {
      if (a.uploaded) lines.push(a.uploaded.url);
    }
    return lines.join("\n");
  };

  const hasPendingUploads = attachments.some((a) => !a.uploaded && !a.error);
  const hasContent = value.trim().length > 0 || attachments.some((a) => a.uploaded);

  const handleSend = async () => {
    if (sending || hasPendingUploads || !hasContent) return;
    setSending(true);
    try {
      const text0 = value.trim();
      // Slash command with arguments — dispatch as an interaction instead of a plain message.
      if (text0.startsWith("/") && (channelId || dmId)) {
        const firstSpace = text0.indexOf(" ");
        const cmdName = firstSpace < 0 ? text0.slice(1) : text0.slice(1, firstSpace);
        const argsText = firstSpace < 0 ? "" : text0.slice(firstSpace + 1);
        if (/^[a-z0-9_-]+$/i.test(cmdName)) {
          try {
            const { commandsApi, interactionsApi } = await import("@/lib/api");
            const matches = await commandsApi.forChannel({
              guild_id: serverId ?? null, dm_id: dmId ?? null, q: cmdName,
            });
            const cmd = matches.find((c) => c.name === cmdName);
            if (cmd) {
              // Naive argv split: split by spaces, last option soaks up the rest.
              const opts = cmd.options ?? [];
              const parts = argsText.length ? argsText.split(/\s+/) : [];
              const options: Record<string, unknown> = {};
              for (let i = 0; i < opts.length; i++) {
                const o = opts[i];
                let raw: string | undefined;
                if (i === opts.length - 1) raw = parts.slice(i).join(" ") || undefined;
                else raw = parts[i];
                if (raw == null || raw === "") {
                  if (o.required) { setSending(false); return; }  // missing required arg — don't send
                  continue;
                }
                if (o.type === 4) options[o.name] = parseInt(raw, 10);
                else if (o.type === 5) options[o.name] = /^(1|true|yes|y)$/i.test(raw);
                else if (o.type === 10) options[o.name] = parseFloat(raw);
                else options[o.name] = raw;
              }
              // All required args present — fire interaction.
              await interactionsApi.send({
                type: "command",
                command_id: cmd.id,
                command_name: cmd.name,
                application_id: cmd.application_id,
                channel_id: channelId ?? null,
                dm_id: dmId ?? null,
                guild_id: serverId ?? null,
                options,
              });
              setValue("");
              if (typingTimer.current) clearTimeout(typingTimer.current);
              isTyping.current = false;
              emitTyping(false);
              return;
            }
          } catch {
            // Command lookup / dispatch failed — fall through to plain send.
          }
        }
      }

      let text = text0;
      const extraUrls: string[] = [];

      // Auto-bundle huge text into message.txt
      if (text.length > LARGE_MSG_CHARS) {
        try {
          const file = new File([text], "message.txt", { type: "text/plain" });
          const res = await uploadsApi.attachment(file);
          extraUrls.push(res.url);
          text = "";
        } catch {
          setSending(false);
          return;
        }
      }

      const lines: string[] = [];
      if (text) lines.push(text);
      for (const a of attachments) {
        if (a.uploaded) lines.push(a.uploaded.url);
      }
      for (const u of extraUrls) lines.push(u);
      let content = lines.join("\n");

      const reply = replyingTo;
      if (reply && autoPing && reply.username) {
        const escaped = reply.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const alreadyMentioned = new RegExp(`(^|[^\\w])@${escaped}\\b`, "i").test(content);
        if (!alreadyMentioned) content = `@${reply.username} ${content}`;
      }
      setValue("");
      attachments.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      setAttachments([]);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      isTyping.current = false;
      emitTyping(false);
      if (roomKey && reply) cancelReplyStore(roomKey);
      await onSend(content, reply?.messageId ?? null);
    } finally {
      setSending(false);
    }
  };

  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{ padding: isMobile ? "0 10px 10px" : "0 16px 20px" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
    >
      {replyingTo && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-2)", border: "1px solid var(--line)",
          borderRadius: "10px 10px 0 0", padding: "6px 12px",
          marginBottom: -1, borderBottom: "none",
        }}>
          <i className="fa-solid fa-reply" style={{ color: "var(--accent)", fontSize: 11 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Ответ <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>{replyingTo.displayName || replyingTo.username}</strong>
            <span style={{ marginLeft: 6, color: "var(--text-3)" }}>{replyingTo.contentPreview}</span>
          </div>
          <button
            onClick={toggleAutoPing}
            title={autoPing ? "Убрать @упоминание" : "Вернуть @упоминание"}
            style={{
              height: 22, padding: "0 8px", borderRadius: 6, border: "none", cursor: "pointer",
              background: autoPing ? "var(--accent)" : "var(--bg-3)",
              color: autoPing ? "#fff" : "var(--text-2)",
              fontSize: 11, fontWeight: 600, fontFamily: "Geist Mono",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            <i className="fa-solid fa-at" style={{ fontSize: 10 }} />
            {autoPing ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => roomKey && cancelReplyStore(roomKey)}
            title="Отменить ответ"
            style={{ width: 22, height: 22, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)" }}
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: 11 }} />
          </button>
        </div>
      )}
      {attachments.length > 0 && isMobile && !attachmentsExpanded && (
        <div
          onClick={() => setAttachmentsExpanded(true)}
          style={{
            background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--line)",
            padding: "8px 12px", marginBottom: 6,
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          }}
        >
          <i className="fa-solid fa-paperclip" style={{ fontSize: 13, color: "var(--accent)" }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--text-1)" }}>
            {attachments.length} файл{attachments.length === 1 ? "" : attachments.length < 5 ? "а" : "ов"}
            {attachments.some((a) => !a.uploaded && !a.error) && (
              <span style={{ marginLeft: 6, color: "var(--text-3)", fontSize: 11, fontFamily: "Geist Mono" }}>· загрузка…</span>
            )}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              attachments.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
              setAttachments([]);
            }}
            title="Удалить все"
            style={{ width: 24, height: 24, border: "none", cursor: "pointer", background: "transparent", color: "var(--danger)", borderRadius: 6 }}
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: 12 }} />
          </button>
          <i className="fa-solid fa-chevron-down" style={{ fontSize: 11, color: "var(--text-3)" }} />
        </div>
      )}
      {attachments.length > 0 && (!isMobile || attachmentsExpanded) && (
        <div style={{
          background: "var(--bg-2)", borderRadius: 12, border: "1px solid var(--line)",
          padding: 10, marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 8,
          maxHeight: isMobile ? 220 : undefined, overflowY: isMobile ? "auto" : undefined,
          position: "relative",
        }}>
          {isMobile && (
            <button
              onClick={() => setAttachmentsExpanded(false)}
              title="Свернуть"
              style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, border: "none", cursor: "pointer", background: "var(--bg-3)", color: "var(--text-1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}
            >
              <i className="fa-solid fa-chevron-up" style={{ fontSize: 10 }} />
            </button>
          )}
          {attachments.map((a) => (
            <div key={a.id} style={{
              position: "relative", width: 120, borderRadius: 8,
              background: "var(--bg-3)", border: "1px solid var(--line-strong)",
              overflow: "hidden", display: "flex", flexDirection: "column",
            }}>
              {a.previewUrl ? (
                <div style={{ width: 120, height: 80, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src={a.previewUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover" }} />
                </div>
              ) : (
                <div style={{ width: 120, height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)" }}>
                  <i className={`fa-solid ${
                    a.file.type.startsWith("video/") ? "fa-film"
                    : a.file.type.startsWith("audio/") ? "fa-music"
                    : a.file.type === "application/pdf" ? "fa-file-pdf"
                    : "fa-file"
                  }`} style={{ fontSize: 26 }} />
                </div>
              )}
              <div style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-1)" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file.name}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 2 }}>
                  {a.error ? <span style={{ color: "var(--danger)" }}>{a.error}</span>
                    : a.uploaded ? formatSize(a.file.size)
                    : `${a.progress}%`}
                </div>
                {!a.uploaded && !a.error && (
                  <div style={{ height: 2, background: "var(--bg-0)", borderRadius: 1, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${a.progress}%`, background: "var(--accent)", transition: "width 120ms" }} />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                title="Удалить"
                style={{
                  position: "absolute", top: 4, right: 4, width: 20, height: 20,
                  borderRadius: "50%", border: "none", cursor: "pointer",
                  background: "rgba(0,0,0,0.7)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <i className="fa-solid fa-xmark" style={{ fontSize: 10 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
      {mention && (channelId || dmId) && (
        <MentionMenu
          query={mention.query}
          members={members}
          onPick={pickMention}
          onClose={() => setMention(null)}
        />
      )}
      {value.startsWith("/") && !value.includes("\n") && !value.includes(" ") && (channelId || dmId) && !sending && (
        <CommandPicker
          guildId={serverId}
          dmId={dmId}
          query={value.slice(1).split(" ")[0]}
          onSelect={async (cmd) => {
            // If the command has no required args, fire the interaction
            // immediately instead of leaving raw text in the composer.
            const hasRequired = cmd.options.some((o) => o.required);
            if (!hasRequired) {
              try {
                const { interactionsApi } = await import("@/lib/api");
                await interactionsApi.send({
                  type: "command",
                  command_id: cmd.id,
                  command_name: cmd.name,
                  application_id: cmd.application_id,
                  channel_id: channelId ?? null,
                  dm_id: dmId ?? null,
                  guild_id: serverId ?? null,
                  options: {},
                });
                setValue("");
                return;
              } catch {/* fall through to text insert */}
            }
            const base = `/${cmd.name}`;
            const next = base + " ";
            setValue(next);
            setTimeout(() => {
              const el = textareaRef.current;
              if (el) { el.focus(); el.selectionStart = el.selectionEnd = next.length; }
            }, 0);
          }}
          onClose={() => { /* dismiss by clearing slash */ }}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        style={{ display: "none" }}
      />

      {isMobile && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
          padding: "0 2px",
        }}>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title="Прикрепить файл"
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)", color: "var(--text-1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <i className="fa-solid fa-plus" style={{ fontSize: 14 }} />
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              title="Эмодзи"
              onClick={() => setEmojiOpen((v) => !v)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)", color: emojiOpen ? "var(--accent)" : "var(--text-1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="fa-regular fa-face-smile" style={{ fontSize: 14 }} />
            </button>
            {emojiOpen && (
              <EmojiPicker onPick={(e) => insertEmoji(e)} onClose={() => setEmojiOpen(false)} anchor="bottom-right" />
            )}
          </div>
          <div style={{ flex: 1 }} />
          {attachments.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
              {attachments.length} файл(ов)
            </span>
          )}
        </div>
      )}

      <div style={{
        background: "var(--bg-2)", borderRadius: 12,
        border: `1px solid ${dragOver ? "var(--accent)" : "var(--line)"}`,
        padding: isMobile ? "6px 8px" : "8px 10px",
        display: "flex", alignItems: "flex-end", gap: 8,
        transition: "border-color 120ms",
      }}>
        {!isMobile && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title="Прикрепить файл"
            style={{ background: "transparent", border: "none", color: "var(--text-2)", cursor: "pointer", padding: "7px 4px" }}
          >
            <i className="fa-solid fa-plus" style={{ fontSize: 18 }} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { handleChange(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          onKeyDown={(e) => {
            if (mention && ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) return;
            if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); handleSend(); return; }
            if (e.key === "ArrowUp" && !value && user?.id && attachments.length === 0) {
              const started = channelId
                ? startEditLast(channelId, user.id)
                : dmId ? startEditLastDM(dmId, user.id) : false;
              if (started) e.preventDefault();
            }
          }}
          placeholder={dragOver ? "Отпустите файл, чтобы прикрепить…" : placeholder}
          rows={1}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "var(--text-0)", fontSize: isMobile ? 15 : 14.5, padding: "7px 4px",
            fontFamily: "inherit", resize: "none", lineHeight: 1.4, minHeight: isMobile ? 32 : 36, maxHeight: 160,
          }}
        />
        {!isMobile && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              title="Эмодзи"
              onClick={() => setEmojiOpen((v) => !v)}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "7px 4px", color: emojiOpen ? "var(--accent)" : "var(--text-2)" }}
            >
              <i className="fa-regular fa-face-smile" style={{ fontSize: 18 }} />
            </button>
            {emojiOpen && (
              <EmojiPicker
                onPick={(e) => insertEmoji(e)}
                onClose={() => setEmojiOpen(false)}
                anchor="bottom-right"
              />
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || hasPendingUploads || !hasContent}
          title={hasPendingUploads ? "Ожидание загрузки…" : "Отправить"}
          style={{
            height: 32, width: 32, borderRadius: 8, border: "none",
            cursor: hasPendingUploads || !hasContent ? "default" : "pointer",
            background: hasContent && !hasPendingUploads ? "var(--accent)" : "transparent",
            color: hasContent && !hasPendingUploads ? "#fff" : "var(--text-2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 120ms",
          }}>
          {hasPendingUploads
            ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 13 }} />
            : <i className="fa-solid fa-paper-plane" style={{ fontSize: 13 }} />}
        </button>
      </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 4, display: "flex", justifyContent: "space-between", gap: 10 }}>
        {value.length > LARGE_MSG_CHARS ? (
          <span style={{ color: "var(--accent)" }}>
            длинное сообщение — будет отправлено как <strong>message.txt</strong> ({value.length}/{LARGE_MSG_CHARS})
          </span>
        ) : !isMobile ? (
          <span>enter — отправить · shift+enter — перенос · ↑ — редактировать последнее · перетащите файл, чтобы прикрепить</span>
        ) : <span />}
        {attachments.length > 0 && !isMobile && <span>{attachments.length} файл(ов) · макс. 100 МБ</span>}
      </div>
    </div>
  );
}
