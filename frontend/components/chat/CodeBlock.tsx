"use client";
import { useMemo, useState } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

interface Props { code: string; lang?: string; }

export function CodeBlock({ code, lang }: Props) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => {
    try {
      const resolved = (lang || "").toLowerCase().trim();
      if (resolved && hljs.getLanguage(resolved)) {
        return { html: hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value, lang: resolved };
      }
      const auto = hljs.highlightAuto(code, TOP_LANGS);
      return { html: auto.value, lang: auto.language ?? resolved ?? "" };
    } catch {
      return { html: escapeHtml(code), lang: lang ?? "" };
    }
  }, [code, lang]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div style={{
      position: "relative", maxWidth: "100%",
      margin: "4px 0", borderRadius: 8, overflow: "hidden",
      border: "1px solid var(--line)", background: "#0d1117",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 10px", background: "#161b22",
        borderBottom: "1px solid var(--line)",
        fontSize: 10.5, fontFamily: "Geist Mono", color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: 0.4,
      }}>
        <span>{highlighted.lang || "plain"}</span>
        <button
          onClick={copy}
          title="Скопировать"
          style={{
            height: 22, padding: "0 8px", borderRadius: 4, border: "none", cursor: "pointer",
            background: copied ? "var(--ok)" : "transparent", color: copied ? "#fff" : "var(--text-2)",
            fontSize: 10.5, fontFamily: "Geist Mono", letterSpacing: 0.3,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} style={{ fontSize: 10 }} />
          {copied ? "СКОПИРОВАНО" : "COPY"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: "10px 12px",
        fontSize: 12.5, lineHeight: 1.5,
        fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Consolas, monospace",
        color: "var(--text-0)", overflowX: "auto", whiteSpace: "pre",
      }}>
        <code
          className={`hljs language-${highlighted.lang || "plaintext"}`}
          dangerouslySetInnerHTML={{ __html: highlighted.html }}
          style={{ background: "transparent", padding: 0 }}
        />
      </pre>
    </div>
  );
}

export function InlineCode({ code }: { code: string }) {
  return (
    <code style={{
      padding: "1px 6px", borderRadius: 4,
      background: "var(--bg-3)", border: "1px solid var(--line)",
      fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Consolas, monospace",
      fontSize: "0.88em", color: "var(--text-0)",
    }}>{code}</code>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const TOP_LANGS = [
  "javascript", "typescript", "python", "go", "rust", "java", "c", "cpp",
  "csharp", "kotlin", "swift", "ruby", "php", "bash", "shell", "sql",
  "json", "yaml", "xml", "html", "css", "scss", "markdown",
];
