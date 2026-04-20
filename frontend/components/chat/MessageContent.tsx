"use client";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useServerStore } from "@/store/serverStore";
import type { UserPublic } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a)(\?.*)?$/i;

const MENTION_RE = /(?:^|(?<=\s))@([a-zA-Z0-9_]+|everyone|all)\b/g;

function absolutize(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

function isAttachmentUrl(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("/uploads/attachments/") ||
    trimmed.match(/^https?:\/\/[^\s]+\/uploads\/attachments\//) != null
  );
}

function filenameFromUrl(url: string): string {
  const parts = url.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? "file");
}

interface Props { content: string; }

export function MessageContent({ content }: Props) {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const attachments: string[] = [];

  for (const line of lines) {
    if (isAttachmentUrl(line)) attachments.push(line.trim());
    else textLines.push(line);
  }

  const text = textLines.join("\n").trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {text && <RichText text={text} />}
      {attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map((url, i) => (
            <Attachment key={`${url}-${i}`} url={url} />
          ))}
        </div>
      )}
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const { user } = useAuthStore();
  const { setProfileUser } = useUIStore();
  const { activeServerId } = useServerStore();
  const { members } = useServerRoles(activeServerId);

  const membersByUsername = new Map<string, UserPublic>();
  for (const m of members) membersByUsername.set(m.user.username.toLowerCase(), m.user);

  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > last) parts.push(text.slice(last, start));

    const name = match[1];
    const lower = name.toLowerCase();
    const isSpecial = lower === "everyone" || lower === "all";
    const target = isSpecial ? null : membersByUsername.get(lower);
    const isMe = !isSpecial && user?.username.toLowerCase() === lower;

    parts.push(
      <span
        key={`m-${start}`}
        onClick={target ? (e) => { e.stopPropagation(); setProfileUser(target); } : undefined}
        title={isSpecial ? "Все участники" : undefined}
        style={{
          display: "inline-block",
          padding: "1px 5px",
          margin: "0 1px",
          borderRadius: 4,
          background: isMe || isSpecial ? "rgba(124,92,255,0.3)" : "rgba(124,92,255,0.14)",
          color: "var(--accent)",
          fontWeight: 500,
          cursor: target ? "pointer" : "default",
        }}
      >
        @{name}
      </span>,
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <div style={{ fontSize: 14.5, color: "var(--text-0)", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts}
    </div>
  );
}

function Attachment({ url }: { url: string }) {
  const full = absolutize(url);
  const name = filenameFromUrl(url);

  if (IMG_EXT.test(url)) {
    return (
      <a href={full} target="_blank" rel="noreferrer" style={{ display: "inline-block", maxWidth: 420 }}>
        <img
          src={full}
          alt={name}
          style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid var(--line)", display: "block" }}
        />
      </a>
    );
  }

  if (VIDEO_EXT.test(url)) {
    return (
      <video src={full} controls style={{ maxWidth: 420, maxHeight: 360, borderRadius: 8, border: "1px solid var(--line)" }} />
    );
  }

  if (AUDIO_EXT.test(url)) {
    return <audio src={full} controls style={{ maxWidth: 420 }} />;
  }

  return (
    <a
      href={full}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8,
        background: "var(--bg-3)", border: "1px solid var(--line-strong)",
        textDecoration: "none", color: "var(--text-0)", maxWidth: 320,
      }}
    >
      <i className="fa-solid fa-file" style={{ fontSize: 18, color: "var(--text-2)" }} />
      <span style={{ flex: 1, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <i className="fa-solid fa-arrow-down" style={{ fontSize: 12, color: "var(--text-2)" }} />
    </a>
  );
}
