/** Forward-marker helpers shared by ForwardModal (producer) and
 * MessageContent (consumer).
 *
 * Format: a ZWSP-wrapped JSON sentinel on its own line at the very start
 * of the content, immediately followed by `\n` and the actual body. The
 * ZWSP delimiters keep the marker invisible in any client that doesn't
 * know to parse it. */

export interface ForwardMeta {
  /** Display name of the original author (never overwritten by re-forwards). */
  n: string;
  /** Username of the original author. */
  u?: string;
}

const ZWSP = "​"; // U+200B
const FORWARD_HEADER_RE = /^​HiRooFwd:(\{.*?\})​\n?/;

export function parseForwardHeader(content: string): { meta: ForwardMeta | null; rest: string } {
  const m = content.match(FORWARD_HEADER_RE);
  if (!m) return { meta: null, rest: content };
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed || typeof parsed.n !== "string") return { meta: null, rest: content };
    return { meta: parsed, rest: content.slice(m[0].length) };
  } catch {
    return { meta: null, rest: content };
  }
}

export function encodeForwardHeader(meta: ForwardMeta): string {
  return `${ZWSP}HiRooFwd:${JSON.stringify(meta)}${ZWSP}`;
}

/** Wrap content as forwarded. If the source already carries a forward
 * marker, preserve the ORIGINAL author (Telegram-style) instead of
 * layering a second sentinel — that would leak the inner marker as
 * plain text on the receiving side, since the renderer only strips
 * one header. */
export function wrapForward(sourceContent: string, fallback: ForwardMeta): string {
  const { meta, rest } = parseForwardHeader(sourceContent);
  const header = encodeForwardHeader(meta ?? fallback);
  return `${header}\n${rest}`;
}
