"use client";
import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useVoice, type VoiceParticipant } from "@/hooks/useVoice";
import { Avatar } from "@/components/ui/Avatar";
import { getSocket } from "@/lib/socket";
import { useCallStore } from "@/store/callStore";
import { usersApi } from "@/lib/api";
import { playCall, stopCall } from "@/lib/sounds";
import type { UserPublic } from "@/types";

export function VoiceCall() {
  const { active, maximized, setMaximized, endCall, setControls } = useCallStore();
  const voice = useVoice();

  const joinedRef = useRef<string | null>(null);
  const [ringing, setRinging] = useState<boolean>(false);

  const handleLeave = async () => {
    if (ringing && active?.ringUserIds) {
      for (const target of active.ringUserIds) {
        getSocket().emit("voice_ring_cancel", { target_user_id: target, room_id: active.roomId });
      }
    }
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
    if (ringing) playCall(); else stopCall();
    return () => { stopCall(); };
  }, [ringing]);

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
    return <FloatingCall title={active.title} voice={voice} userMap={userMap} onMax={() => setMaximized(true)} onLeave={handleLeave} />;
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", background: "var(--bg-0)" }}>
      <div style={{ height: 48, flexShrink: 0, padding: "0 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-1)" }}>
        <i className={`fa-solid ${voice.isVideo || voice.isSharing ? "fa-video" : "fa-phone"}`} style={{ color: "var(--ok)", fontSize: 16 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>{active.title}</span>
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
        <CircleBtn icon="fa-display" accent={voice.isSharing} onClick={voice.toggleScreenShare} title="Демонстрация экрана" />
        <CircleBtn icon={voice.isDeafened ? "fa-volume-xmark" : "fa-headphones"} danger={voice.isDeafened} onClick={voice.toggleDeafen} title="Звук" />
        <div style={{ width: 1, height: 24, background: "var(--line-strong)", margin: "0 2px" }} />
        <CircleBtn icon="fa-phone-slash" danger onClick={handleLeave} title="Отключиться" />
      </div>
      <div style={{ height: 84 }} />
    </div>
  );
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    const track = p.screenTrack ?? p.cameraTrack;
    if (el && track) el.srcObject = new MediaStream([track]);
  }, [p.cameraTrack, p.screenTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (el && p.audioTrack && !self) el.srcObject = new MediaStream([p.audioTrack]);
  }, [p.audioTrack, self]);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const hue = 268;
  const video = !!(p.screenTrack || p.cameraTrack);
  const displayName = profile?.display_name ?? profile?.username ?? p.name;
  return (
    <div
      ref={containerRef}
      onDoubleClick={video ? toggleFullscreen : undefined}
      style={{
        borderRadius: 14, overflow: "hidden",
        background: `linear-gradient(160deg, oklch(35% 0.08 ${hue}), oklch(18% 0.04 ${(hue + 30) % 360}))`,
        border: `1px solid ${p.isSpeaking ? "var(--ok)" : "var(--line)"}`,
        position: "relative", minHeight: 140,
        boxShadow: p.isSpeaking ? "0 0 0 2px var(--ok)" : "none",
        cursor: video ? "pointer" : "default",
        transition: "box-shadow 120ms, border-color 120ms",
      }}>
      {video ? (
        <video ref={videoRef} autoPlay playsInline muted={self} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Avatar name={profile?.username ?? p.name} size={76} shape="circle" avatarUrl={profile?.avatar_url} />
        </div>
      )}
      {!self && <audio ref={audioRef} autoPlay />}
      {video && (
        <button
          onClick={toggleFullscreen}
          title="Раскрыть"
          style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <i className="fa-solid fa-expand" style={{ fontSize: 12 }} />
        </button>
      )}
      <div style={{ position: "absolute", left: 10, bottom: 10, padding: "4px 9px", borderRadius: 6, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#fff" }}>
        {p.isMuted && <i className="fa-solid fa-microphone-slash" style={{ fontSize: 10, color: "var(--danger)" }} />}
        {displayName}
        {self && <span style={{ fontSize: 10, opacity: 0.7, fontFamily: "Geist Mono" }}>· вы</span>}
      </div>
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
