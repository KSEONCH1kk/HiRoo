"use client";
import { useState } from "react";

interface Props { videoId: string; originalUrl: string; }

export function YouTubeEmbed({ videoId, originalUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div style={{
      position: "relative", width: "100%", maxWidth: 480,
      aspectRatio: "16/9", borderRadius: 10, overflow: "hidden",
      background: "#000", border: "1px solid var(--line)",
    }}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          title="Воспроизвести"
          style={{
            position: "absolute", inset: 0, border: "none", cursor: "pointer",
            background: `#000 url(${thumb}) center/cover no-repeat`, padding: 0,
          }}
        >
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 68, height: 48, borderRadius: 12,
              background: "rgba(255,0,0,0.9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}>
              <i className="fa-solid fa-play" style={{ color: "#fff", fontSize: 20, marginLeft: 3 }} />
            </div>
          </div>
          <div style={{
            position: "absolute", top: 8, left: 8, padding: "3px 7px",
            background: "rgba(0,0,0,0.7)", color: "#fff",
            borderRadius: 6, fontSize: 10.5, fontFamily: "Geist Mono",
            letterSpacing: 0.3,
          }}>
            <i className="fa-brands fa-youtube" style={{ color: "#ff0033", marginRight: 5 }} />
            YOUTUBE
          </div>
        </button>
      )}
    </div>
  );
}

export function parseYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}
