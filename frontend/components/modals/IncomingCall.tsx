"use client";
import { useEffect } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useCallStore } from "@/store/callStore";
import { getSocket } from "@/lib/socket";
import { playCall, stopCall } from "@/lib/sounds";

export function IncomingCall() {
  const { incoming, setIncoming, startCall } = useCallStore();

  useEffect(() => {
    const s = getSocket();
    const onRing = (d: any) => {
      setIncoming({
        roomId: d.room_id,
        fromUserId: d.from_user_id,
        fromUsername: d.from_username,
        fromDisplayName: d.from_display_name,
        fromAvatarUrl: d.from_avatar_url,
        video: !!d.video,
      });
    };
    const onCancel = () => { stopCall(); setIncoming(null); };
    s.on("voice_ring", onRing);
    s.on("voice_ring_cancel", onCancel);
    return () => { s.off("voice_ring", onRing); s.off("voice_ring_cancel", onCancel); };
  }, [setIncoming]);

  useEffect(() => {
    if (!incoming) { stopCall(); return; }
    playCall();
    return () => { stopCall(); };
  }, [incoming?.roomId]);

  if (!incoming) return null;

  const name = incoming.fromDisplayName ?? incoming.fromUsername;

  const accept = () => {
    stopCall();
    startCall({
      roomId: incoming.roomId,
      title: name,
      video: incoming.video,
    });
  };
  const decline = () => {
    stopCall();
    getSocket().emit("voice_ring_decline", { target_user_id: incoming.fromUserId });
    setIncoming(null);
  };

  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 120, width: 320,
      borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)",
      boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: 16,
      animation: "fadeIn 240ms ease-out",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ animation: "ringPulse 1.6s infinite" }}>
          <Avatar name={incoming.fromUsername} size={54} shape="circle" avatarUrl={incoming.fromAvatarUrl ?? null} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "Geist Mono", letterSpacing: 0.3 }}>
            Входящий {incoming.video ? "видеозвонок" : "звонок"}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-0)", marginTop: 2 }}>{name}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="danger" style={{ flex: 1 }} icon={<i className="fa-solid fa-phone-slash" style={{ fontSize: 13 }} />} onClick={decline}>Отклонить</Button>
        <Button style={{ flex: 1, background: "var(--ok)", color: "#fff" }} icon={<i className="fa-solid fa-phone" style={{ fontSize: 13 }} />} onClick={accept}>Принять</Button>
      </div>
    </div>
  );
}
