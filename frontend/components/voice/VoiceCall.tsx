"use client";
import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useVoice, type VoiceParticipant } from "@/hooks/useVoice";
import { Avatar } from "@/components/ui/Avatar";
import { getSocket } from "@/lib/socket";
import { useCallStore } from "@/store/callStore";
import { usersApi } from "@/lib/api";
import { playCall, stopCall } from "@/lib/sounds";
import { ScreenQualityPopover } from "@/components/voice/ScreenQualityPopover";
import { SoundboardModal } from "@/components/voice/SoundboardModal";
import { useSoundboardStore } from "@/store/soundboardStore";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import type { UserPublic } from "@/types";

export function VoiceCall() {
  const { active, maximized, setMaximized, endCall, setControls } = useCallStore();
  const voice = useVoice();

  const joinedRef = useRef<string | null>(null);
  const [ringing, setRinging] = useState<boolean>(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);

  const handleLeave = async () => {
    if (ringing && active?.ringUserIds) {
      for (const target of active.ringUserIds) {
        getSocket().emit("voice_ring_cancel", { target_user_id: target, room_id: active.roomId });
      }
    }
    setRinging(false);
    stopCall();
    await voice.leaveRoom();
    endCall();
    joinedRef.current = null;
  };

  useEffect(() => {
    if (!active) { setControls(null); return; }
    setControls({
      toggleMute: voice.toggleMute,
      toggleDeafen: voice.toggleDeafen,
      toggleVideo: voice.toggleVideo,
      toggleScreenShare: voice.toggleScreenShare,
      leave: handleLeave,
      switchAudioInput: voice.switchAudioInput,
      switchAudioOutput: voice.switchAudioOutput,
      restartScreenShare: voice.restartScreenShare,
      isMuted: voice.isMuted,
      isDeafened: voice.isDeafened,
      isSharing: voice.isSharing,
      isVideo: voice.isVideo,
    });
  }, [active, voice.isMuted, voice.isDeafened, voice.isSharing, voice.isVideo, ringing]);

  useEffect(() => {
    if (!active) {
      joinedRef.current = null;
      return;
    }
    if (joinedRef.current === active.roomId) return;
    joinedRef.current = active.roomId;

    voice.joinRoom(active.roomId, { video: active.video });
    const targets = active.ringUserIds ?? [];
    if (targets.length > 0) {
      setRinging(true);
      for (const target of targets) {
        getSocket().emit("voice_ring", {
          target_user_id: target,
          room_id: active.roomId,
          video: !!active.video,
        });
      }
      // Clear ringing state for 1:1 calls when the only peer declines
      if (targets.length === 1) {
        const onDecline = () => { setRinging(false); handleLeave(); };
        getSocket().on("voice_ring_decline", onDecline);
        return () => { getSocket().off("voice_ring_decline", onDecline); };
      }
    }
  }, [active?.roomId]);

  useEffect(() => {
    if (voice.remotes.length > 0) setRinging(false);
  }, [voice.remotes.length]);

  useEffect(() => {
    if (!active) { setRinging(false); stopCall(); }
  }, [active]);

  useEffect(() => {
    if (ringing) playCall(); else stopCall();
    return () => { stopCall(); };
  }, [ringing]);

  // Receive remote soundboard plays and play them locally unless we've
  // muted that user or we're deafened.
  useEffect(() => {
    const sock = getSocket();
    const handler = (d: any) => {
      try {
        if (!active || !d || d.room_id !== active.roomId) return;
        if (voice.isDeafened) return;
        const fromId = String(d.from_user_id);
        if (useSoundboardStore.getState().isMuted(fromId)) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
        const url = String(d.url || "").startsWith("http") ? d.url : `${apiBase}${d.url}`;
        const audio = new Audio(url);
        audio.play().catch(() => {});
      } catch {}
    };
    sock.on("soundboard_play_remote", handler);
    return () => { sock.off("soundboard_play_remote", handler); };
  }, [active?.roomId, voice.isDeafened]);

  // Fetch real user profiles for all voice participants
  const identities = [voice.me?.identity, ...voice.remotes.map((r) => r.identity)].filter(Boolean) as string[];
  const userQueries = useQueries({
    queries: identities.map((id) => ({
      queryKey: ["user", id],
      queryFn: () => usersApi.get(id),
      staleTime: 60_000,
    })),
  });
  const userMap = new Map<string, UserPublic>();
  userQueries.forEach((q, i) => { if (q.data) userMap.set(identities[i], q.data); });

  if (!active) return null;
  const total = (voice.me ? 1 : 0) + voice.remotes.length;

  if (!maximized) {
    return (
      <>
        <HiddenAudioLayer remotes={voice.remotes} />
        <FloatingCall title={active.title} voice={voice} userMap={userMap} onMax={() => setMaximized(true)} onLeave={handleLeave} />
      </>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", background: "var(--bg-0)" }}>
      <HiddenAudioLayer remotes={voice.remotes} />
      <div style={{ height: 48, flexShrink: 0, padding: "0 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-1)" }}>
        <i className={`fa-solid ${voice.isVideo || voice.isSharing ? "fa-video" : "fa-phone"}`} style={{ color: "var(--ok)", fontSize: 16 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>{active.title}</span>
        {voice.e2eeActive && (
          <span
            title={voice.e2eeSafety ? `Safety code: ${voice.e2eeSafety}\nСверьте его с собеседником голосом для защиты от MITM.` : "End-to-end encrypted"}
            style={{
              fontSize: 10.5, padding: "2px 8px", borderRadius: 4,
              background: "rgba(62,207,142,0.15)", color: "var(--ok)",
              fontFamily: "Geist Mono", fontWeight: 600, letterSpacing: 0.4,
              display: "inline-flex", alignItems: "center", gap: 5, cursor: "help",
            }}
          >
            <i className="fa-solid fa-lock" style={{ fontSize: 9 }} />
            E2EE
          </span>
        )}
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: ringing ? "rgba(240,160,80,0.2)" : "var(--ok)", color: ringing ? "#f0a050" : "#fff", fontWeight: 600, letterSpacing: 0.4 }}>
          {ringing ? "ВЫЗОВ" : "В ЭФИРЕ"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-2)", fontFamily: "Geist Mono" }}>{total}</span>
        <button
          onClick={() => setMaximized(false)}
          title="Свернуть"
          style={{ width: 28, height: 28, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <i className="fa-solid fa-down-left-and-up-right-to-center" style={{ fontSize: 12 }} />
        </button>
      </div>

      {voice.error && (
        <div style={{ padding: "10px 16px", background: "rgba(255,80,80,0.1)", color: "var(--danger)", fontSize: 13 }}>
          {voice.error}
        </div>
      )}

      <div style={{ flex: 1, padding: 14, display: "grid", gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, total))}, 1fr)`, gridAutoRows: "minmax(160px, 1fr)", gap: 12, minHeight: 0, overflowY: "auto" }}>
        {voice.me && <Tile p={voice.me} self profile={userMap.get(voice.me.identity)} />}
        {voice.remotes.map((p) => (<Tile key={p.identity} p={p} profile={userMap.get(p.identity)} />))}
      </div>

      <div style={{
        position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--bg-0)", borderRadius: 999, border: "1px solid var(--line-strong)",
        padding: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.45)", zIndex: 10,
      }}>
        <CircleBtn icon={voice.isMuted ? "fa-microphone-slash" : "fa-microphone"} danger={voice.isMuted} onClick={voice.toggleMute} title="Микрофон" />
        <CircleBtn icon={voice.isVideo ? "fa-video" : "fa-video-slash"} active={voice.isVideo} onClick={voice.toggleVideo} title="Камера" />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
          <CircleBtn icon="fa-display" accent={voice.isSharing} onClick={voice.toggleScreenShare} title="Демонстрация экрана" />
          <button
            onClick={() => setQualityOpen((v) => !v)}
            title="Качество демонстрации"
            style={{
              width: 22, height: 42, borderRadius: 12, border: "none", cursor: "pointer",
              background: qualityOpen ? "var(--bg-3)" : "transparent",
              color: "var(--text-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <i className={`fa-solid fa-chevron-${qualityOpen ? "down" : "up"}`} style={{ fontSize: 10 }} />
          </button>
          {qualityOpen && <ScreenQualityPopover onClose={() => setQualityOpen(false)} />}
        </div>
        <CircleBtn icon={voice.isDeafened ? "fa-volume-xmark" : "fa-headphones"} danger={voice.isDeafened} onClick={voice.toggleDeafen} title="Звук" />
        <CircleBtn icon="fa-music" active={soundboardOpen} onClick={() => setSoundboardOpen(true)} title="Звуковая панель" />
        <div style={{ width: 1, height: 24, background: "var(--line-strong)", margin: "0 2px" }} />
        <CircleBtn icon="fa-phone-slash" danger onClick={handleLeave} title="Отключиться" />
      </div>
      {soundboardOpen && active?.roomId && (
        <SoundboardModal roomId={active.roomId} onClose={() => setSoundboardOpen(false)} />
      </div>
      <div style={{ height: 84 }} />
    </div>
  );
}

function HiddenAudioLayer({ remotes }: { remotes: VoiceParticipant[] }) {
  return (
    <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden>
      {remotes.map((p) => (
        <RemoteAudio key={p.identity} track={p.audioTrack} />
      ))}
    </div>
  );
}

function RemoteAudio({ track }: { track: MediaStreamTrack | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (track) el.srcObject = new MediaStream([track]);
    else el.srcObject = null;
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

function FloatingCall({ title, voice, userMap, onMax, onLeave }: { title: string; voice: ReturnType<typeof useVoice>; userMap: Map<string, UserPublic>; onMax: () => void; onLeave: () => Promise<void> }) {
  const speaker = voice.remotes.find((p) => p.isSpeaking) ?? voice.me;
  const profile = speaker ? userMap.get(speaker.identity) : null;
  return (
    <div style={{
      position: "fixed", right: 18, bottom: 18, zIndex: 95, width: 260,
      background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 12,
      boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden",
    }}>
      <div onClick={onMax} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderBottom: "1px solid var(--line)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ok)", boxShadow: "0 0 6px var(--ok)" }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{title}</span>
        <i className="fa-solid fa-up-right-and-down-left-from-center" style={{ fontSize: 11, color: "var(--text-2)" }} />
      </div>
      <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <Avatar name={profile?.username ?? speaker?.name ?? "?"} size={40} shape="circle" avatarUrl={profile?.avatar_url} />
          {speaker?.isSpeaking && (
            <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: "2px solid var(--ok)", animation: "ringPulse 1.2s infinite" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile?.display_name ?? profile?.username ?? speaker?.name ?? "Ждём…"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "Geist Mono" }}>
            {speaker?.isSpeaking ? "говорит" : "тишина"} · {voice.remotes.length + (voice.me ? 1 : 0)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 10px 10px" }}>
        <MiniBtn icon={voice.isMuted ? "fa-microphone-slash" : "fa-microphone"} danger={voice.isMuted} onClick={voice.toggleMute} />
        <MiniBtn icon="fa-display" accent={voice.isSharing} onClick={voice.toggleScreenShare} />
        <MiniBtn icon={voice.isVideo ? "fa-video" : "fa-video-slash"} active={voice.isVideo} onClick={voice.toggleVideo} />
        <MiniBtn icon="fa-phone-slash" danger onClick={onLeave} />
      </div>
    </div>
  );
}

function Tile({ p, self, profile }: { p: VoiceParticipant; self?: boolean; profile?: UserPublic }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const sbMuted = useSoundboardStore((s) => s.mutedUserIds.includes(p.identity));
  const toggleSbMute = useSoundboardStore((s) => s.toggleMuted);

  useEffect(() => {
    const el = videoRef.current;
    const track = p.screenTrack ?? p.cameraTrack;
    if (el && track) el.srcObject = new MediaStream([track]);
  }, [p.cameraTrack, p.screenTrack]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Collapse automatically if the track that made the tile worth expanding
  // goes away (screen share ended, camera turned off, participant left).
  useEffect(() => {
    const hasTrack = !!(p.screenTrack || p.cameraTrack);
    if (expanded && !hasTrack) setExpanded(false);
  }, [expanded, p.screenTrack, p.cameraTrack]);

  const toggleFullscreen = () => setExpanded((v) => !v);

  const hue = 268;
  const video = !!(p.screenTrack || p.cameraTrack);
  const displayName = profile?.display_name ?? profile?.username ?? p.name;

  const baseStyle: React.CSSProperties = {
    borderRadius: 14, overflow: "hidden",
    background: `linear-gradient(160deg, oklch(35% 0.08 ${hue}), oklch(18% 0.04 ${(hue + 30) % 360}))`,
    border: `1px solid ${p.isSpeaking ? "var(--ok)" : "var(--line)"}`,
    position: "relative", minHeight: 140,
    boxShadow: p.isSpeaking ? "0 0 0 2px var(--ok)" : "none",
    cursor: video ? "pointer" : "default",
    transition: "box-shadow 120ms, border-color 120ms",
  };

  const expandedStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 9999,
    borderRadius: 0, border: "none", boxShadow: "none",
    background: "#000",
    minHeight: "100vh", minWidth: "100vw",
    cursor: "default",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={video ? toggleFullscreen : undefined}
      onContextMenu={self ? undefined : (e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
      style={expanded ? expandedStyle : baseStyle}
    >
      {video ? (
        <video
          ref={videoRef}
          autoPlay playsInline muted={self}
          style={{
            width: expanded ? "100vw" : "100%",
            height: expanded ? "100vh" : "100%",
            objectFit: "contain",
            background: "#000",
          }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Avatar name={profile?.username ?? p.name} size={76} shape="circle" avatarUrl={profile?.avatar_url} />
        </div>
      )}
      {video && (
        <button
          onClick={toggleFullscreen}
          title={expanded ? "Свернуть (Esc)" : "Раскрыть"}
          style={{
            position: "absolute",
            top: expanded ? 14 : 8, right: expanded ? 14 : 8,
            width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
            background: "rgba(0,0,0,0.6)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2,
          }}
        >
          <i className={`fa-solid ${expanded ? "fa-compress" : "fa-expand"}`} style={{ fontSize: 13 }} />
        </button>
      )}
      <div style={{
        position: "absolute",
        left: expanded ? 18 : 10,
        bottom: expanded ? 18 : 10,
        padding: "4px 9px", borderRadius: 6,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: expanded ? 14 : 12, fontWeight: 500, color: "#fff",
        zIndex: 2,
      }}>
        {p.isMuted && <i className="fa-solid fa-microphone-slash" style={{ fontSize: 10, color: "var(--danger)" }} />}
        {sbMuted && (
          <i
            className="fa-solid fa-volume-xmark"
            title="Звуковая панель этого пользователя заглушена"
            style={{ fontSize: 10, color: "var(--danger)" }}
          />
        )}
        {displayName}
        {self && <span style={{ fontSize: 10, opacity: 0.7, fontFamily: "Geist Mono" }}>· вы</span>}
      </div>
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            {
              icon: sbMuted ? "fa-volume-high" : "fa-volume-xmark",
              label: sbMuted ? "Разрешить звуковую панель" : "Заглушить звуковую панель",
              onClick: () => toggleSbMute(p.identity),
              danger: !sbMuted,
            } as MenuItem,
          ]}
        />
      )}
    </div>
  );
}

function CircleBtn({ icon, onClick, active, danger, accent, title }: { icon: string; onClick?: () => void; active?: boolean; danger?: boolean; accent?: boolean; title?: string }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer",
      background: danger ? "var(--danger)" : accent ? "var(--accent)" : active ? "var(--bg-3)" : "transparent",
      color: danger || accent ? "#fff" : active ? "var(--text-0)" : "var(--text-1)",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "background 120ms",
    }}>
      <i className={`fa-solid ${icon}`} style={{ fontSize: 17 }} />
    </button>
  );
}

function MiniBtn({ icon, onClick, active, danger, accent }: { icon: string; onClick?: () => void; active?: boolean; danger?: boolean; accent?: boolean }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick?.(); }} style={{
      flex: 1, height: 30, borderRadius: 6, border: "none", cursor: "pointer",
      background: danger ? "var(--danger)" : accent ? "var(--accent)" : active ? "var(--bg-3)" : "var(--bg-3)",
      color: danger || accent ? "#fff" : "var(--text-1)",
    }}>
      <i className={`fa-solid ${icon}`} style={{ fontSize: 12 }} />
    </button>
  );
}
