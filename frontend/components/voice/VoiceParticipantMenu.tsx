"use client";
import { useEffect } from "react";
import { useSoundboardStore } from "@/store/soundboardStore";
import { useVoiceVolumeStore } from "@/store/voiceVolumeStore";
import type { MenuItem } from "@/components/ui/ContextMenu";

interface Props {
  x: number;
  y: number;
  userId: string;
  displayName?: string;
  /** Optional admin actions shown below the soundboard row (profile, mute,
   * kick, …). Use `{separator:true,label:""}` to draw a divider. */
  extraItems?: MenuItem[];
  onClose: () => void;
}

/** Right-click popover on a voice tile.
 *
 * - Per-user volume slider (0 – 200%). Values above 100% are applied via a
 *   WebAudio GainNode in RemoteAudio (see VoiceCall.tsx).
 * - Toggle to mute incoming soundboard sounds from this user only. */
export function VoiceParticipantMenu({ x, y, userId, displayName, extraItems, onClose }: Props) {
  const sbMuted = useSoundboardStore((s) => s.mutedUserIds.includes(userId));
  const toggleSb = useSoundboardStore((s) => s.toggleMuted);
  const volume = useVoiceVolumeStore((s) => s.getVolume(userId));
  const setVolume = useVoiceVolumeStore((s) => s.setVolume);
  const resetVolume = useVoiceVolumeStore((s) => s.reset);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const width = 260;
  const estHeight = 190 + (extraItems?.length ?? 0) * 32;
  let left = x, top = y;
  if (typeof window !== "undefined") {
    if (left + width > window.innerWidth) left = window.innerWidth - width - 8;
    if (top + estHeight > window.innerHeight) top = window.innerHeight - estHeight - 8;
  }

  const pct = Math.round(volume * 100);

  return (
    <>
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 200 }}
      />
      <div style={{
        position: "fixed", left, top, zIndex: 201,
        width, background: "var(--bg-2)",
        border: "1px solid var(--line-strong)", borderRadius: 10,
        boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        padding: 8, fontSize: 13.5,
        animation: "fadeIn 90ms ease-out",
      }}>
        {displayName && (
          <div style={{
            fontSize: 11, fontWeight: 600, color: "var(--text-2)",
            textTransform: "uppercase", letterSpacing: 0.6,
            padding: "4px 6px 6px",
          }}>
            {displayName}
          </div>
        )}

        {/* Volume slider */}
        <div style={{ padding: "6px 8px 10px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 12, color: "var(--text-1)", marginBottom: 6,
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i className="fa-solid fa-volume-high" style={{ fontSize: 11, color: "var(--text-2)" }} />
              Громкость
            </span>
            <span style={{ fontFamily: "Geist Mono", color: pct > 100 ? "var(--accent)" : "var(--text-2)" }}>
              {pct}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={pct}
            onChange={(e) => setVolume(userId, Number(e.target.value) / 100)}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "var(--text-3)", fontFamily: "Geist Mono",
            marginTop: 2,
          }}>
            <span>0%</span>
            <span>100%</span>
            <span>200%</span>
          </div>
          {volume !== 1 && (
            <button
              onClick={() => resetVolume(userId)}
              style={{
                marginTop: 6, padding: "4px 10px", borderRadius: 6, border: "none",
                background: "transparent", color: "var(--text-2)",
                fontSize: 11.5, cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Сбросить до 100%
            </button>
          )}
        </div>

        <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />

        {/* Soundboard mute toggle */}
        <div
          onClick={() => toggleSb(userId)}
          style={{
            padding: "7px 10px", borderRadius: 6, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
            color: sbMuted ? "var(--danger)" : "var(--text-1)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = sbMuted ? "rgba(255,80,80,0.1)" : "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <i
            className={`fa-solid ${sbMuted ? "fa-volume-xmark" : "fa-volume-high"}`}
            style={{ width: 14, fontSize: 12, textAlign: "center" }}
          />
          <span style={{ flex: 1 }}>
            {sbMuted ? "Разрешить звуковую панель" : "Заглушить звуковую панель"}
          </span>
          {sbMuted && <i className="fa-solid fa-check" style={{ fontSize: 11 }} />}
        </div>

        {extraItems && extraItems.length > 0 && (
          <>
            {extraItems.map((it, i) => {
              if (it.separator) {
                return <div key={`sep-${i}`} style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />;
              }
              return (
                <div
                  key={`${it.label}-${i}`}
                  onClick={() => { if (!it.disabled) { it.onClick(); onClose(); } }}
                  style={{
                    padding: "7px 10px", borderRadius: 6, cursor: it.disabled ? "default" : "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    color: it.disabled ? "var(--text-3)" : (it.danger ? "var(--danger)" : "var(--text-1)"),
                    opacity: it.disabled ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = it.danger ? "rgba(255,80,80,0.1)" : "var(--bg-hover)"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {it.icon && <i className={`fa-solid ${it.icon}`} style={{ width: 14, fontSize: 12, textAlign: "center" }} />}
                  <span style={{ flex: 1 }}>{it.label}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
