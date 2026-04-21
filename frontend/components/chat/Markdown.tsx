"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useServerStore } from "@/store/serverStore";
import { InlineCode } from "./CodeBlock";
import type { UserPublic } from "@/types";

// ── Types ─────────────────────────────────────────────────────

type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "spoiler"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "url"; href: string; label?: string }
  | { type: "mention"; name: string };

type Block =
  | { type: "heading"; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "paragraph"; children: InlineNode[] };

// ── Block parsing ─────────────────────────────────────────────

function parseBlocks(text: string): Block[] {
  const raw = text.replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      blocks.push({
        type: "heading",
        level: h[1].length as 1 | 2 | 3,
        children: parseInline(h[2]),
      });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const qlines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qlines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", children: parseInline(qlines.join("\n")) });
      continue;
    }

    const isUnordered = /^\s*[-*]\s+/.test(line);
    const isOrdered = /^\s*\d+\.\s+/.test(line);
    if (isUnordered || isOrdered) {
      const ordered = isOrdered;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const m = ordered
          ? lines[i].match(/^\s*\d+\.\s+(.*)$/)
          : lines[i].match(/^\s*[-*]\s+(.*)$/);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(paraLines.join("\n")) });
  }
  return blocks;
}

// ── Inline parsing ────────────────────────────────────────────

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) { nodes.push({ type: "text", value: buf }); buf = ""; }
  };

  const findClose = (target: string, from: number): number => {
    let p = from;
    while (p < text.length) {
      if (text[p] === "\\") { p += 2; continue; }
      if (text.slice(p, p + target.length) === target) return p;
      p++;
    }
    return -1;
  };

  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);

    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if ("\\`*_~|[]()".includes(next)) { buf += next; i += 2; continue; }
    }

    if (ch === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i + 1) {
        flush();
        nodes.push({ type: "code", value: text.slice(i + 1, close) });
        i = close + 1; continue;
      }
    }

    if (two === "||") {
      const close = findClose("||", i + 2);
      if (close > i + 2) {
        flush();
        nodes.push({ type: "spoiler", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2; continue;
      }
    }

    if (two === "~~") {
      const close = findClose("~~", i + 2);
      if (close > i + 2) {
        flush();
        nodes.push({ type: "strike", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2; continue;
      }
    }

    if (two === "__") {
      const close = findClose("__", i + 2);
      if (close > i + 2) {
        flush();
        nodes.push({ type: "underline", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2; continue;
      }
    }

    if (two === "**") {
      const close = findClose("**", i + 2);
      if (close > i + 2) {
        flush();
        nodes.push({ type: "bold", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2; continue;
      }
    }

    if ((ch === "*" || ch === "_") && text[i + 1] !== ch) {
      // Match corresponding single char, but skip over double-pairs
      let j = i + 1;
      let found = -1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === ch) {
          if (text[j + 1] === ch) { j += 2; continue; }
          if (text[j - 1] === ch) { j++; continue; }
          found = j; break;
        }
        j++;
      }
      if (found > i + 1) {
        flush();
        nodes.push({ type: "italic", children: parseInline(text.slice(i + 1, found)) });
        i = found + 1; continue;
      }
    }

    if (ch === "[") {
      const closeB = text.indexOf("]", i + 1);
      if (closeB > i && text[closeB + 1] === "(") {
        const closeP = text.indexOf(")", closeB + 2);
        if (closeP > closeB) {
          const label = text.slice(i + 1, closeB);
          const href = text.slice(closeB + 2, closeP);
          if (/^https?:\/\//i.test(href)) {
            flush();
            nodes.push({ type: "url", href, label });
            i = closeP + 1; continue;
          }
        }
      }
    }

    // Bare URL
    if (ch === "h" || ch === "H") {
      const m = text.slice(i).match(/^https?:\/\/[^\s<>"]+/i);
      if (m) {
        flush();
        let url = m[0];
        const trail = url.match(/[.,;:!?)]+$/);
        if (trail) url = url.slice(0, url.length - trail[0].length);
        nodes.push({ type: "url", href: url });
        i += url.length; continue;
      }
    }

    if (ch === "@" && (i === 0 || /[\s(\[{]/.test(text[i - 1]))) {
      const m = text.slice(i + 1).match(/^([a-zA-Z0-9_]+|everyone|all)\b/);
      if (m) {
        flush();
        nodes.push({ type: "mention", name: m[1] });
        i += 1 + m[1].length; continue;
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return nodes;
}

// ── Rendering ─────────────────────────────────────────────────

interface Props { text: string; }

export function Markdown({ text }: Props) {
  const blocks = parseBlocks(text);
  const ctx = useInlineCtx();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14.5, color: "var(--text-0)", lineHeight: 1.45, wordBreak: "break-word" }}>
      {blocks.map((b, i) => <BlockView key={i} block={b} ctx={ctx} />)}
    </div>
  );
}

function useInlineCtx() {
  const { user } = useAuthStore();
  const { setProfileUser } = useUIStore();
  const { activeServerId } = useServerStore();
  const { members } = useServerRoles(activeServerId);
  const map = new Map<string, UserPublic>();
  for (const m of members) map.set(m.user.username.toLowerCase(), m.user);
  return { meUsername: user?.username ?? null, setProfileUser, membersByUsername: map };
}

type Ctx = ReturnType<typeof useInlineCtx>;

function BlockView({ block, ctx }: { block: Block; ctx: Ctx }) {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? 22 : block.level === 2 ? 18 : 16;
      const Tag = (`h${block.level}`) as keyof JSX.IntrinsicElements;
      return (
        <Tag style={{ fontSize: size, fontWeight: 700, margin: "4px 0 2px", color: "var(--text-0)", lineHeight: 1.25 }}>
          <Inline nodes={block.children} ctx={ctx} />
        </Tag>
      );
    }
    case "quote":
      return (
        <div style={{ borderLeft: "3px solid var(--line-strong)", paddingLeft: 10, color: "var(--text-1)", whiteSpace: "pre-wrap" }}>
          <Inline nodes={block.children} ctx={ctx} />
        </div>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag style={{ paddingLeft: 22, margin: "2px 0" }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ margin: "2px 0" }}>
              <Inline nodes={item} ctx={ctx} />
            </li>
          ))}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <div style={{ whiteSpace: "pre-wrap" }}>
          <Inline nodes={block.children} ctx={ctx} />
        </div>
      );
  }
}

function Inline({ nodes, ctx }: { nodes: InlineNode[]; ctx: Ctx }) {
  return <>{nodes.map((n, i) => <InlineNodeView key={i} node={n} ctx={ctx} />)}</>;
}

function InlineNodeView({ node, ctx }: { node: InlineNode; ctx: Ctx }) {
  switch (node.type) {
    case "text":
      return <>{node.value}</>;
    case "bold":
      return <strong style={{ fontWeight: 700 }}><Inline nodes={node.children} ctx={ctx} /></strong>;
    case "italic":
      return <em style={{ fontStyle: "italic" }}><Inline nodes={node.children} ctx={ctx} /></em>;
    case "underline":
      return <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}><Inline nodes={node.children} ctx={ctx} /></span>;
    case "strike":
      return <span style={{ textDecoration: "line-through" }}><Inline nodes={node.children} ctx={ctx} /></span>;
    case "spoiler":
      return <Spoiler><Inline nodes={node.children} ctx={ctx} /></Spoiler>;
    case "code":
      return <InlineCode code={node.value} />;
    case "url": {
      const display = node.label && node.label.length ? node.label : node.href;
      return (
        <a href={node.href} target="_blank" rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--accent)", textDecoration: "underline", wordBreak: "break-all" }}>
          {display}
        </a>
      );
    }
    case "mention": {
      const lower = node.name.toLowerCase();
      const isSpecial = lower === "everyone" || lower === "all";
      const target = isSpecial ? null : ctx.membersByUsername.get(lower);
      const isMe = !isSpecial && ctx.meUsername?.toLowerCase() === lower;
      return (
        <span
          onClick={target ? (e) => { e.stopPropagation(); ctx.setProfileUser(target); } : undefined}
          title={isSpecial ? "Все участники" : undefined}
          style={{
            display: "inline-block", padding: "1px 5px", margin: "0 1px", borderRadius: 4,
            background: isMe || isSpecial ? "rgba(124,92,255,0.3)" : "rgba(124,92,255,0.14)",
            color: "var(--accent)", fontWeight: 500,
            cursor: target ? "pointer" : "default",
          }}
        >@{node.name}</span>
      );
    }
  }
}

function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
      title={revealed ? undefined : "Показать скрытое"}
      style={{
        padding: "1px 4px", borderRadius: 4, cursor: revealed ? "text" : "pointer",
        background: revealed ? "var(--bg-3)" : "#000",
        color: revealed ? "var(--text-0)" : "transparent",
        transition: "background 160ms, color 160ms",
        boxShadow: revealed ? "none" : "inset 0 0 0 9999px #1a1a1f",
      }}
    >
      {children}
    </span>
  );
}
