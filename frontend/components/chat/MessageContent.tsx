"use client";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { LinkEmbed } from "./LinkEmbed";
import { ViewerImage } from "./ViewerImage";
import { YouTubeEmbed, parseYouTubeId } from "./YouTubeEmbed";
import { ProxiedVideo } from "./ProxiedVideo";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";
import { EmbedCard } from "./EmbedCard";
import { parseForwardHeader } from "@/lib/forward";
import type { Embed } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|weba)(\?.*)?$/i;
// Voice-message attachments come from VoiceRecorderButton as
// `voice-message-{timestamp}.{webm|m4a|ogg}`. The `.webm` variant
// overlaps with VIDEO_EXT, so we key off the filename prefix to
// route them into AudioPlayer regardless of container.
const VOICE_MESSAGE_RE = /\/voice-message-[^/]+\.(webm|weba|m4a|ogg|mp3)(\?.*)?$/i;

const CODE_BLOCK_RE = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;

function ForwardBadge({ name, username }: { name: string; username?: string }) {
  return (
    <div style={{
      borderLeft: "3px solid var(--accent)",
      paddingLeft: 10,
      margin: "2px 0 4px",
      display: "flex", flexDirection: "column", gap: 1,
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 10.5, color: "var(--accent)", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: 0.6,
      }}>
        <i className="fa-solid fa-share" style={{ fontSize: 9 }} />
        Переслано от
      </div>
      <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>
        {name}
        {username && (
          <span style={{ color: "var(--text-3)", fontWeight: 400, marginLeft: 5 }}>
            @{username}
          </span>
        )}
      </div>
    </div>
  );
}

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
  const raw = parts[parts.length - 1] ?? "file";
  try { return decodeURIComponent(raw.split("?")[0]); } catch { return raw; }
}

function isSameOrigin(u: string): boolean {
  try {
    if (!API_BASE) return false;
    const parsed = new URL(u);
    const base = new URL(API_BASE);
    return parsed.host === base.host;
  } catch { return false; }
}

interface Props { content: string; embeds?: Embed[] | null; }

// Extracts "!pr <youtube-url>" lines (anywhere in the message) and returns
// the cleaned content + list of youtube URLs to proxy.
function extractProxiedYouTube(content: string): { text: string; proxyUrls: string[] } {
  const proxyUrls: string[] = [];
  const lines = content.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*!pr\s+(\S+)\s*$/);
    if (m) {
      const url = m[1];
      if (parseYouTubeId(url)) { proxyUrls.push(url); continue; }
    }
    kept.push(line);
  }
  return { text: kept.join("\n"), proxyUrls };
}

export function MessageContent({ content, embeds }: Props) {
  const { meta: forwardMeta, rest: afterForward } = parseForwardHeader(content);
  const { text: strippedContent, proxyUrls } = extractProxiedYouTube(afterForward);
  const lines = strippedContent.split("\n");
  const textLines: string[] = [];
  const attachments: string[] = [];

  for (const line of lines) {
    if (isAttachmentUrl(line)) attachments.push(line.trim());
    else textLines.push(line);
  }

  const text = textLines.join("\n").trim();
  const segments = splitByCodeBlocks(text);
  const externalUrls = collectExternalUrls(text);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {forwardMeta && <ForwardBadge name={forwardMeta.n} username={forwardMeta.u} />}
      {segments.map((seg, i) =>
        seg.type === "code"
          ? <CodeBlock key={`cb-${i}`} code={seg.content} lang={seg.lang} />
          : seg.content.trim() ? <Markdown key={`t-${i}`} text={seg.content} /> : null
      )}
      {proxyUrls.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {proxyUrls.map((u, i) => <ProxiedVideo key={`p-${i}-${u}`} youtubeUrl={u} />)}
        </div>
      )}
      {embeds && embeds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {embeds.map((e, i) => <EmbedCard key={`emb-${i}`} embed={e} />)}
        </div>
      )}
      {attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map((url, i) => (
            <Attachment key={`${url}-${i}`} url={url} />
          ))}
        </div>
      )}
      {externalUrls.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          {externalUrls.slice(0, 3).map((u, i) => <ExternalUrlBlock key={`e-${i}-${u}`} url={u} />)}
        </div>
      )}
    </div>
  );
}

interface Segment { type: "text" | "code"; content: string; lang?: string; }

function splitByCodeBlocks(text: string): Segment[] {
  const segs: Segment[] = [];
  const re = new RegExp(CODE_BLOCK_RE.source, CODE_BLOCK_RE.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: "text", content: text.slice(last, m.index) });
    segs.push({ type: "code", content: m[2].replace(/\n$/, ""), lang: m[1] || undefined });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: "text", content: text.slice(last) });
  if (segs.length === 0) segs.push({ type: "text", content: text });
  return segs;
}

function collectExternalUrls(text: string): string[] {
  // Strip code blocks and inline code before scanning URLs
  const withoutCode = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
  const out: string[] = [];
  const re = /(https?:\/\/[^\s<>"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutCode)) !== null) {
    let u = m[1].replace(/[.,;:!?)]+$/, "");
    if (isSameOrigin(u) && u.includes("/uploads/")) continue;
    out.push(u);
  }
  return Array.from(new Set(out));
}

function ExternalUrlBlock({ url }: { url: string }) {
  const yt = parseYouTubeId(url);
  if (yt) return <YouTubeEmbed videoId={yt} originalUrl={url} />;
  if (IMG_EXT.test(url)) return <ViewerImage src={url} filename={filenameFromUrl(url)} />;
  if (VOICE_MESSAGE_RE.test(url) || AUDIO_EXT.test(url)) return <AudioPlayer src={url} filename={filenameFromUrl(url)} />;
  if (VIDEO_EXT.test(url)) return <VideoPlayer src={url} filename={filenameFromUrl(url)} />;
  return <LinkEmbed url={url} />;
}

function Attachment({ url }: { url: string }) {
  const full = absolutize(url);
  const name = filenameFromUrl(url);

  if (IMG_EXT.test(url)) return <ViewerImage src={full} filename={name} />;
  if (VOICE_MESSAGE_RE.test(url) || AUDIO_EXT.test(url)) return <AudioPlayer src={full} filename={name} />;
  if (VIDEO_EXT.test(url)) return <VideoPlayer src={full} filename={name} />;

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
