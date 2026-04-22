"use client";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

export interface VideoQuality { label: string; src: string; height?: number; }

interface Props {
  src: string;
  filename?: string;
  qualities?: VideoQuality[];
  currentLabel?: string;
  onQualityChange?: (q: VideoQuality) => void;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ src, filename, qualities, currentLabel, onQualityChange }: Props) {
  const isMobile = useIsMobile();
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
  const [qMenuOpen, setQMenuOpen] = useState(false);
  const resumeAtRef = useRef<{ time: number; playing: boolean } | null>(null);

  // Attach src to <video>, using hls.js when the URL is an HLS playlist and
  // native HLS isn't available (Chromium/Firefox). Preserve currentTime + play
  // state across src swaps (quality change).
  useEffect(() => {
    const v = vref.current;
    if (!v || !src) return;

    const isHls = /\.m3u8(\?|$)/i.test(src);
    const restore = resumeAtRef.current;
    resumeAtRef.current = null;
    const applyRestore = () => {
      if (!restore) return;
      try { v.currentTime = restore.time; } catch {}
      if (restore.playing) v.play().catch(() => {});
    };

    if (!isHls) {
      v.src = src;
      const onMeta = () => { applyRestore(); v.removeEventListener("loadedmetadata", onMeta); };
      v.addEventListener("loadedmetadata", onMeta);
      return () => v.removeEventListener("loadedmetadata", onMeta);
    }

    // HLS path
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / iOS — native HLS.
      v.src = src;
      const onMeta = () => { applyRestore(); v.removeEventListener("loadedmetadata", onMeta); };
      v.addEventListener("loadedmetadata", onMeta);
      return () => v.removeEventListener("loadedmetadata", onMeta);
    }

    // Dynamic-import hls.js so it's not in the main bundle.
    let cancelled = false;
    let hlsInstance: any = null;
    (async () => {
      const { default: Hls } = await import("hls.js");
      if (cancelled) return;
      if (!Hls.isSupported()) {
        v.src = src;
        return;
      }
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(v);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, applyRestore);
    })();

    return () => {
      cancelled = true;
      if (hlsInstance) { try { hlsInstance.destroy(); } catch {} }
    };
  }, [src]);

  const switchQuality = (q: VideoQuality) => {
    const v = vref.current;
    if (v) resumeAtRef.current = { time: v.currentTime, playing: !v.paused };
    setQMenuOpen(false);
    onQualityChange?.(q);
  };

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
        position: "relative", display: "block",
        maxWidth: fs ? "100vw" : (isMobile ? "100%" : 560),
        width: "100%",
        borderRadius: fs ? 0 : 10, overflow: "hidden",
        border: fs ? "none" : "1px solid var(--line)", background: "#000",
      }}
    >
      <video
        ref={vref}
        preload="metadata"
        playsInline
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => setDur((e.target as HTMLVideoElement).duration)}
        style={{ display: "block", width: "100%", maxHeight: fs ? "100vh" : (isMobile ? "60vh" : 360), cursor: "pointer" }}
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
          {qualities && qualities.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setQMenuOpen((v) => !v); }}
                title="Качество"
                style={{
                  height: 28, padding: "0 8px", borderRadius: 6, border: "none",
                  cursor: "pointer", background: qMenuOpen ? "rgba(255,255,255,0.14)" : "transparent",
                  color: "#fff", fontSize: 11, fontFamily: "Geist Mono",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                <i className="fa-solid fa-gear" style={{ fontSize: 11 }} />
                {currentLabel ?? "авто"}
              </button>
              {qMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute", bottom: 36, right: 0, minWidth: 120,
                    background: "var(--bg-2)", border: "1px solid var(--line-strong)",
                    borderRadius: 8, padding: 4,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)", zIndex: 5,
                  }}
                >
                  {qualities.map((q) => {
                    const active = q.label === currentLabel;
                    return (
                      <button
                        key={q.label}
                        onClick={() => switchQuality(q)}
                        style={{
                          display: "flex", width: "100%", alignItems: "center", gap: 8,
                          padding: "6px 10px", borderRadius: 5, border: "none",
                          background: active ? "var(--bg-active)" : "transparent",
                          color: "var(--text-0)", cursor: "pointer",
                          fontSize: 12, fontFamily: "Geist Mono", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                      >
                        <i
                          className={`fa-solid ${active ? "fa-circle-check" : "fa-circle"}`}
                          style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-3)" }}
                        />
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
