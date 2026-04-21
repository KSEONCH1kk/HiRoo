"use client";
import { useEffect, useRef } from "react";
import { useVoiceSettingsStore, type ScreenRes, type ScreenFps } from "@/store/voiceSettingsStore";
import { useCallStore } from "@/store/callStore";

interface Props { onClose: () => void; }

const RESOLUTIONS: { id: ScreenRes; label: string; hint: string }[] = [
  { id: "720", label: "720p", hint: "1280 × 720" },
  { id: "1080", label: "1080p", hint: "1920 × 1080" },
  { id: "1440", label: "1440p", hint: "2560 × 1440" },
];
const FPS: ScreenFps[] = [30, 60];

export function ScreenQualityPopover({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { screenResolution, screenFps, setScreenResolution, setScreenFps } = useVoiceSettingsStore();
  const controls = useCallStore((s) => s.controls);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const pickRes = (v: ScreenRes) => {
    setScreenResolution(v);
    controls?.restartScreenShare?.();
  };
  const pickFps = (v: ScreenFps) => {
    setScreenFps(v);
    controls?.restartScreenShare?.();
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", bottom: 56, left: "50%", transform: "translateX(-50%)",
        zIndex: 20, minWidth: 220,
        background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        padding: "10px 8px", animation: "fadeIn 120ms ease-out",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px 6px" }}>
        Разрешение
      </div>
      {RESOLUTIONS.map((r) => (
        <div
          key={r.id}
          onClick={() => pickRes(r.id)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 6,
            cursor: "pointer",
            background: screenResolution === r.id ? "var(--bg-active)" : "transparent",
            color: "var(--text-0)", fontSize: 13,
          }}
          onMouseEnter={(e) => { if (screenResolution !== r.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { if (screenResolution !== r.id) e.currentTarget.style.background = "transparent"; }}
        >
          <i className={`fa-solid ${screenResolution === r.id ? "fa-circle-check" : "fa-circle"}`} style={{ fontSize: 11, color: screenResolution === r.id ? "var(--accent)" : "var(--text-3)" }} />
          <span style={{ flex: 1, fontWeight: 600 }}>{r.label}</span>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>{r.hint}</span>
        </div>
      ))}

      <div style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />

      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px 6px" }}>
        Частота кадров
      </div>
      <div style={{ display: "flex", gap: 6, padding: "2px 8px 6px" }}>
        {FPS.map((f) => (
          <button
            key={f}
            onClick={() => pickFps(f)}
            style={{
              flex: 1, padding: "8px 10px", border: "1px solid",
              borderColor: screenFps === f ? "var(--accent)" : "var(--line)",
              background: screenFps === f ? "var(--bg-active)" : "transparent",
              color: "var(--text-0)", borderRadius: 6, cursor: "pointer",
              fontSize: 13, fontFamily: "Geist Mono",
            }}
          >
            {f} fps
          </button>
        ))}
      </div>
    </div>
  );
}
