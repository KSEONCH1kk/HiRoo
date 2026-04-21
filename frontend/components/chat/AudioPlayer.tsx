"use client";
import { useEffect, useRef, useState } from "react";

interface Props { src: string; filename?: string; }

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, filename }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.volume = vol;
    a.muted = muted;
  }, [vol, muted]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seekAt = (clientX: number) => {
    const bar = barRef.current;
    const a = ref.current;
    if (!bar || !a || !isFinite(dur)) return;
    const r = bar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    a.currentTime = pct * dur;
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px", borderRadius: 10,
      background: "var(--bg-2)", border: "1px solid var(--line)",
      maxWidth: 440, minWidth: 280,
    }}>
      <audio
        ref={ref} src={src} preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        title={playing ? "Пауза" : "Воспроизвести"}
        style={{
          width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "var(--accent)", color: "#fff", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <i className={`fa-solid ${playing ? "fa-pause" : "fa-play"}`} style={{ fontSize: 13, marginLeft: playing ? 0 : 2 }} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {filename && (
          <div style={{ fontSize: 11.5, color: "var(--text-2)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <i className="fa-solid fa-music" style={{ marginRight: 6, color: "var(--text-3)" }} />
            {filename}
          </div>
        )}
        <div
          ref={barRef}
          onMouseDown={(e) => seekAt(e.clientX)}
          style={{
            position: "relative", height: 6, borderRadius: 3,
            background: "var(--bg-3)", cursor: "pointer", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 3 }}>
          <span>{fmt(cur)}</span>
          <span>{fmt(dur)}</span>
        </div>
      </div>

      <button
        onClick={() => setMuted((m) => !m)}
        title={muted ? "Включить звук" : "Отключить"}
        style={{ width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <i className={`fa-solid ${muted || vol === 0 ? "fa-volume-xmark" : vol < 0.5 ? "fa-volume-low" : "fa-volume-high"}`} style={{ fontSize: 12 }} />
      </button>
      <input
        type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol}
        onChange={(e) => { const v = parseFloat(e.target.value); setVol(v); setMuted(v === 0); }}
        style={{ width: 64, accentColor: "var(--accent)" }}
      />
    </div>
  );
}
