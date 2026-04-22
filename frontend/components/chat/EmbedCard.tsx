"use client";
import type { Embed } from "@/types";

function colorToCss(color: number | null | undefined): string {
  if (color == null) return "var(--accent)";
  const hex = color.toString(16).padStart(6, "0");
  return `#${hex}`;
}

function safeHref(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  return /^https?:\/\//i.test(u) ? u : undefined;
}

function safeImg(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  return /^https?:\/\//i.test(u) || u.startsWith("/") ? u : undefined;
}

export function EmbedCard({ embed }: { embed: Embed }) {
  const accent = colorToCss(embed.color);
  const hasImage = !!embed.image?.url;
  const hasThumbnail = !!embed.thumbnail?.url;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: hasThumbnail ? "1fr auto" : "1fr", gap: 14,
      maxWidth: 520, padding: "10px 14px",
      borderLeft: `4px solid ${accent}`, borderRadius: 6,
      background: "var(--bg-2)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {embed.author && (() => {
          const authorHref = safeHref(embed.author.url);
          const authorIcon = safeImg(embed.author.icon_url);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-0)" }}>
              {authorIcon && (
                <img src={authorIcon} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
              )}
              {authorHref ? (
                <a href={authorHref} target="_blank" rel="noreferrer noopener" style={{ color: "var(--text-0)", textDecoration: "none", fontWeight: 600 }}>{embed.author!.name}</a>
              ) : (
                <span style={{ fontWeight: 600 }}>{embed.author!.name}</span>
              )}
            </div>
          );
        })()}
        {embed.title && (() => {
          const titleHref = safeHref(embed.url);
          return titleHref ? (
            <a href={titleHref} target="_blank" rel="noreferrer noopener"
               style={{ fontSize: 14.5, fontWeight: 700, color: "var(--accent)", textDecoration: "none" }}>
              {embed.title}
            </a>
          ) : (
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>{embed.title}</div>
          );
        })()}
        {embed.description && (
          <div style={{ fontSize: 13.5, color: "var(--text-1)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {embed.description}
          </div>
        )}
        {embed.fields && embed.fields.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 2 }}>
            {embed.fields.map((f, i) => (
              <div
                key={i}
                style={{
                  gridColumn: f.inline ? "span 1" : "1 / -1",
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-0)", marginBottom: 2 }}>{f.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-1)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{f.value}</div>
              </div>
            ))}
          </div>
        )}
        {hasImage && (() => {
          const imgSrc = safeImg(embed.image!.url);
          return imgSrc ? (
            <a href={imgSrc} target="_blank" rel="noreferrer noopener" style={{ display: "inline-block", marginTop: 2 }}>
              <img src={imgSrc} alt="" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 6, display: "block" }} />
            </a>
          ) : null;
        })()}
        {(embed.footer || embed.timestamp) && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
            {embed.footer?.icon_url && safeImg(embed.footer.icon_url) && (
              <img src={safeImg(embed.footer.icon_url)!} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
            )}
            {embed.footer?.text && <span>{embed.footer.text}</span>}
            {embed.footer?.text && embed.timestamp && <span>·</span>}
            {embed.timestamp && (
              <span style={{ fontFamily: "Geist Mono" }}>
                {new Date(embed.timestamp).toLocaleString("ru-RU", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
      </div>
      {hasThumbnail && (() => {
        const thumbSrc = safeImg(embed.thumbnail!.url);
        return thumbSrc ? (
          <a href={thumbSrc} target="_blank" rel="noreferrer noopener" style={{ display: "block" }}>
            <img src={thumbSrc} alt="" style={{ width: 80, height: 80, borderRadius: 6, objectFit: "cover" }} />
          </a>
        ) : null;
      })()}
    </div>
  );
}
