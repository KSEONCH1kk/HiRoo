"use client";
import { useState, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { uploadsApi, type UploadResult } from "@/lib/api";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { MentionMenu, type MentionItem } from "./MentionMenu";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";

interface Props {
  placeholder: string;
  channelId?: string;
  serverId?: string;
  dmId?: string;
  onSend?: (content: string) => Promise<void>;
}

interface Pending {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  uploaded?: UploadResult;
  error?: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return genId();
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
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(null);

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
        const err: Pending = { id: genId(), file, progress: 0, error: `Файл ${file.name} больше 25 МБ` };
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
      const content = buildMessage();
      setValue("");
      attachments.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      setAttachments([]);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      isTyping.current = false;
      emitTyping(false);
      await onSend(content);
    } finally {
      setSending(false);
    }
  };

  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{ padding: "0 16px 20px" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
    >
      {attachments.length > 0 && (
        <div style={{
          background: "var(--bg-2)", borderRadius: 12, border: "1px solid var(--line)",
          padding: 10, marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 8,
        }}>
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
      <div style={{
        background: "var(--bg-2)", borderRadius: 12,
        border: `1px solid ${dragOver ? "var(--accent)" : "var(--line)"}`,
        padding: "8px 10px", display: "flex", alignItems: "flex-end", gap: 8,
        transition: "border-color 120ms",
      }}>
        <input
          ref={fileInput}
          type="file"
          multiple
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          title="Прикрепить файл"
          style={{ background: "transparent", border: "none", color: "var(--text-2)", cursor: "pointer", padding: "7px 4px" }}
        >
          <i className="fa-solid fa-plus" style={{ fontSize: 18 }} />
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { handleChange(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          onKeyDown={(e) => {
            if (mention && ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); return; }
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
            color: "var(--text-0)", fontSize: 14.5, padding: "7px 4px",
            fontFamily: "inherit", resize: "none", lineHeight: 1.45, minHeight: 36, maxHeight: 160,
          }}
        />
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
      <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
        <span>enter — отправить · shift+enter — перенос · ↑ — редактировать последнее · перетащите файл, чтобы прикрепить</span>
        {attachments.length > 0 && <span>{attachments.length} файл(ов) · макс. 25 МБ</span>}
      </div>
    </div>
  );
}
