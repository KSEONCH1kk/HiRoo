"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Props { youtubeUrl: string; }

interface Info {
  title?: string | null;
  uploader?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
}

interface Signed {
  stream_url: string;
  info_url: string;
  expires_at: number;
}

export function ProxiedVideo({ youtubeUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  const [signed, setSigned] = useState<Signed | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Signed>(`/api/proxy/yt/sign`, { params: { url: youtubeUrl } })
      .then((r) => { if (!cancelled) setSigned(r.data); })
      .catch(() => { if (!cancelled) setError("Не удалось подписать ссылку"); });
    return () => { cancelled = true; };
  }, [youtubeUrl]);

  useEffect(() => {
    if (!signed) return;
    const ctrl = new AbortController();
    fetch(`${API_BASE}${signed.info_url}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setInfo)
      .catch(() => {});
    return () => ctrl.abort();
  }, [signed]);

  const src = signed ? `${API_BASE}${signed.stream_url}` : "";

  const fmtDur = (s: number | null | undefined) => {
    if (!s) return null;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div
      style={{
        width: "100%", maxWidth: 520,
        borderRadius: 10, overflow: "hidden",
        background: "#000", border: "1px solid var(--line)",
      }}
    >
      {playing && src ? (
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          playsInline
          onError={() => setError("Не удалось загрузить видео")}
          style={{ width: "100%", maxHeight: 360, display: "block", background: "#000" }}
        />
      ) : (
        <button
          onClick={() => { if (signed) setPlaying(true); }}
          disabled={!signed}
          title={signed ? "Воспроизвести через прокси" : "Подпись ссылки…"}
          style={{
            position: "relative", width: "100%", aspectRatio: "16/9",
            border: "none", cursor: signed ? "pointer" : "wait", padding: 0,
            background: info?.thumbnail
              ? `#000 url(${info.thumbnail}) center/cover no-repeat`
              : "#111",
          }}
        >
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 68, height: 48, borderRadius: 12,
              background: "rgba(88,101,242,0.95)",
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
            letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <i className="fa-solid fa-shield-halved" style={{ color: "var(--accent)" }} />
            PROXY · YOUTUBE
          </div>
          {info?.duration ? (
            <div style={{
              position: "absolute", bottom: 8, right: 8, padding: "2px 7px",
              background: "rgba(0,0,0,0.75)", color: "#fff",
              borderRadius: 5, fontSize: 11, fontFamily: "Geist Mono",
            }}>
              {fmtDur(info.duration)}
            </div>
          ) : null}
        </button>
      )}
      {info?.title ? (
        <div style={{ padding: "8px 12px", background: "var(--bg-2)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {info.title}
          </div>
          {info.uploader ? (
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}>
              {info.uploader}
            </div>
          ) : null}
        </div>
      ) : null}
      {error && (
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--danger)", background: "var(--bg-2)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
