"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { VideoPlayer, type VideoQuality } from "./VideoPlayer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Props { youtubeUrl: string; }

interface SignedQuality {
  label: string;
  height: number;
  progressive: boolean;
  stream_url: string;
}

interface Signed {
  qualities: SignedQuality[];
  info_url: string;
  expires_at: number;
  title?: string | null;
  uploader?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
}

export function ProxiedVideo({ youtubeUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  const [signed, setSigned] = useState<Signed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Signed>(`/api/proxy/yt/sign`, { params: { url: youtubeUrl } })
      .then((r) => {
        if (cancelled) return;
        setSigned(r.data);
        // Default quality — prefer 720p, else the best available ≤1080p, else the top.
        const qs = r.data.qualities;
        const prefer = qs.find((q) => q.height === 720)
          ?? qs.find((q) => q.height <= 1080)
          ?? qs[0];
        if (prefer) setCurrentLabel(prefer.label);
      })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail ?? "Не удалось подписать ссылку"); });
    return () => { cancelled = true; };
  }, [youtubeUrl]);

  const qualities: VideoQuality[] = useMemo(() => {
    if (!signed) return [];
    return signed.qualities.map((q) => ({
      label: q.label,
      height: q.height,
      src: `${API_BASE}${q.stream_url}`,
    }));
  }, [signed]);

  const currentSrc = useMemo(() => {
    if (!qualities.length) return "";
    const q = qualities.find((x) => x.label === currentLabel) ?? qualities[0];
    return q.src;
  }, [qualities, currentLabel]);

  const fmtDur = (s: number | null | undefined) => {
    if (!s) return null;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div
      style={{
        width: "100%", maxWidth: 560,
        borderRadius: 10, overflow: "hidden",
        background: "var(--bg-2)", border: "1px solid var(--line)",
      }}
    >
      {playing && currentSrc ? (
        <VideoPlayer
          src={currentSrc}
          filename={signed?.title ?? undefined}
          qualities={qualities}
          currentLabel={currentLabel ?? undefined}
          onQualityChange={(q) => setCurrentLabel(q.label)}
        />
      ) : (
        <button
          onClick={() => { if (signed) setPlaying(true); }}
          disabled={!signed}
          title={signed ? "Воспроизвести через прокси" : "Подпись ссылки…"}
          style={{
            position: "relative", width: "100%", aspectRatio: "16/9",
            border: "none", cursor: signed ? "pointer" : "wait", padding: 0,
            background: signed?.thumbnail
              ? `#000 url(${signed.thumbnail}) center/cover no-repeat`
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
          {signed?.duration ? (
            <div style={{
              position: "absolute", bottom: 8, right: 8, padding: "2px 7px",
              background: "rgba(0,0,0,0.75)", color: "#fff",
              borderRadius: 5, fontSize: 11, fontFamily: "Geist Mono",
            }}>
              {fmtDur(signed.duration)}
            </div>
          ) : null}
        </button>
      )}
      {signed?.title ? (
        <div style={{ padding: "8px 12px", background: "var(--bg-2)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {signed.title}
          </div>
          {signed.uploader ? (
            <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}>
              {signed.uploader}
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
