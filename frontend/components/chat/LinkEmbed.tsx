"use client";
import { useQuery } from "@tanstack/react-query";
import { unfurlApi, type UnfurlData } from "@/lib/api";
import { useImageViewerStore } from "@/store/imageViewerStore";

interface Props { url: string; }

export function LinkEmbed({ url }: Props) {
  const { data, isLoading } = useQuery<UnfurlData>({
    queryKey: ["unfurl", url],
    queryFn: () => unfurlApi.get(url),
    staleTime: 5 * 60_000,
    retry: 0,
  });

  if (isLoading) {
    return (
      <div style={{ maxWidth: 420, padding: 10, borderLeft: "3px solid var(--line-strong)", background: "var(--bg-2)", borderRadius: 6, fontSize: 12, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
        загрузка предпросмотра…
      </div>
    );
  }

  if (!data) return null;

  if (data.kind === "image" && data.image) {
    const open = useImageViewerStore.getState().open;
    return (
      <img
        src={data.image}
        alt=""
        loading="lazy"
        onClick={(e) => { e.stopPropagation(); open(data.image!, null); }}
        style={{ maxWidth: 420, maxHeight: 360, borderRadius: 8, border: "1px solid var(--line)", display: "block", cursor: "zoom-in" }}
      />
    );
  }

  // No meaningful meta? skip
  if (!data.title && !data.description && !data.image) return null;

  const host = (() => { try { return new URL(data.resolved_url).hostname.replace(/^www\./, ""); } catch { return data.site_name ?? ""; } })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        display: "flex", maxWidth: 440, overflow: "hidden",
        borderRadius: 8, borderLeft: "3px solid var(--accent)",
        background: "var(--bg-2)", textDecoration: "none", color: "var(--text-0)",
      }}
    >
      <div style={{ flex: 1, padding: 12, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", textTransform: "uppercase", letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data.site_name || host}
        </div>
        {data.title && (
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--accent)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {data.title}
          </div>
        )}
        {data.description && (
          <div style={{ fontSize: 12.5, color: "var(--text-1)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
            {data.description}
          </div>
        )}
      </div>
      {data.image && (
        <div style={{ width: 120, flexShrink: 0, background: "#000" }}>
          <img src={data.image} alt="" loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
    </a>
  );
}
