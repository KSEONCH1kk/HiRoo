"use client";
import { useEffect, useRef, useState } from "react";

interface Props { src: string; filename?: string; }

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ src, filename }: Props) {
  const vref = useRef<HTMLVideoElement>(null);
  const wref = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [fs, setFs] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [seeking, setSeeking] = useState(false);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    v.volume = vol;
    v.muted = muted;
  }, [vol, muted]);

  useEffect(() => {
    const onFs = () => setFs(document.fullscreenElement === wref.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  useEffect(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (!playing) { setShowControls(true); return; }
    hideTimer.current = setTimeout(() => setShowControls(false), 2200);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [playing]);

  const kickControls = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 2200);
  };

  const toggle = () => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const seekAt = (clientX: number) => {
    const bar = progressRef.current;
    const v = vref.current;
    if (!bar || !v || !isFinite(dur) || dur <= 0) return;
    const r = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    v.currentTime = pct * dur;
  };

  const toggleFullscreen = () => {
    const w = wref.current;
    if (!w) return;
    if (!document.fullscreenElement) w.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const togglePip = async () => {
    const v: any = vref.current;
    if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture();
      else await v.requestPictureInPicture?.();
    } catch {}
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  const bufPct = dur > 0 ? (buffered / dur) * 100 : 0;

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    setCur(v.currentTime);
    try {
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    } catch {}
  };

  return (
    <div
      ref={wref}
      onMouseMove={kickControls}
      onMouseLeave={() => { if (playing) setShowControls(false); }}
      style={{
        position: "relative", display: "inline-block", maxWidth: 560, width: "100%",
        borderRadius: fs ? 0 : 10, overflow: "hidden",
        border: fs ? "none" : "1px solid var(--line)", background: "#000",
      }}
    >
      <video
        ref={vref}
        src={src}
        preload="metadata"
        playsInline
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => setDur((e.target as HTMLVideoElement).duration)}
        style={{ display: "block", width: "100%", maxHeight: fs ? "100vh" : 360, cursor: "pointer" }}
      />

      {!playing && cur === 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          style={{
            position: "absolute", inset: 0, border: "none", cursor: "pointer",
            background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(124,92,255,0.92)", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}>
            <i className="fa-solid fa-play" style={{ color: "#fff", fontSize: 22, marginLeft: 4 }} />
          </div>
        </button>
      )}

      {filename && (
        <div style={{
          position: "absolute", top: 8, left: 8, padding: "4px 8px",
          background: "rgba(0,0,0,0.55)", color: "#fff",
          borderRadius: 6, fontSize: 11.5,
          maxWidth: "calc(100% - 16px)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          pointerEvents: "none",
          opacity: showControls ? 1 : 0,
          transition: "opacity 180ms",
        }}>
          <i className="fa-solid fa-film" style={{ marginRight: 6, opacity: 0.75 }} />
          {filename}
        </div>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: "20px 12px 10px",
          background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, transparent 100%)",
          opacity: showControls ? 1 : 0, transition: "opacity 180ms",
          pointerEvents: showControls ? "auto" : "none",
        }}
      >
        <div
          ref={progressRef}
          onMouseDown={(e) => { setSeeking(true); seekAt(e.clientX); }}
          onMouseMove={(e) => { if (seeking) seekAt(e.clientX); }}
          onMouseUp={() => setSeeking(false)}
          onMouseLeave={() => setSeeking(false)}
          style={{
            position: "relative", height: 6, borderRadius: 3,
            background: "rgba(255,255,255,0.18)", cursor: "pointer",
            marginBottom: 8,
          }}
        >
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%", width: `${bufPct}%`,
            background: "rgba(255,255,255,0.25)", borderRadius: 3,
          }} />
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`,
            background: "var(--accent)", borderRadius: 3,
          }} />
          <div style={{
            position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%, -50%)",
            width: 12, height: 12, borderRadius: "50%", background: "var(--accent)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.4)",
          }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#fff" }}>
          <Btn icon={playing ? "fa-pause" : "fa-play"} onClick={toggle} title={playing ? "Пауза" : "Воспроизвести"} />
          <Btn
            icon={muted || vol === 0 ? "fa-volume-xmark" : vol < 0.5 ? "fa-volume-low" : "fa-volume-high"}
            onClick={() => setMuted((m) => !m)}
            title="Звук"
          />
          <input
            type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol}
            onChange={(e) => { const v = parseFloat(e.target.value); setVol(v); setMuted(v === 0); }}
            style={{ width: 70, accentColor: "var(--accent)", cursor: "pointer" }}
          />
          <span style={{ fontFamily: "Geist Mono", fontSize: 11, marginLeft: 8, color: "rgba(255,255,255,0.85)" }}>
            {fmt(cur)} / {fmt(dur)}
          </span>
          <div style={{ flex: 1 }} />
          {typeof document !== "undefined" && "pictureInPictureEnabled" in document && (
            <Btn icon={pipActive ? "fa-xmark" : "fa-clone"} onClick={togglePip} title="Picture-in-Picture" />
          )}
          <Btn icon={fs ? "fa-compress" : "fa-expand"} onClick={toggleFullscreen} title="Полный экран" />
        </div>
      </div>
    </div>
  );
}

function Btn({ icon, onClick, title }: { icon: string; onClick?: () => void; title?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
        background: "transparent", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <i className={`fa-solid ${icon}`} style={{ fontSize: 12 }} />
    </button>
  );
}
