"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room, RoomEvent, Track, RemoteParticipant, LocalParticipant,
  ConnectionState, TrackPublication, RemoteTrackPublication, LocalTrackPublication,
} from "livekit-client";
import { voiceApi } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { useVoicePresenceStore } from "@/store/voicePresenceStore";
import { useCallStore } from "@/store/callStore";

export interface VoiceParticipant {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  audioTrack: MediaStreamTrack | null;
  cameraTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;
}

function participantFromLK(p: RemoteParticipant | LocalParticipant): VoiceParticipant {
  const audio = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
  const cam = p.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack ?? null;
  const screen = p.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack ?? null;
  const mic = p.getTrackPublication(Track.Source.Microphone);
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isSpeaking: p.isSpeaking,
    isMuted: !mic || mic.isMuted || !audio,
    audioTrack: audio,
    cameraTrack: cam,
    screenTrack: screen,
  };
}

export function useVoice() {
  const roomRef = useRef<Room | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<VoiceParticipant[]>([]);
  const [me, setMe] = useState<VoiceParticipant | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideo, setIsVideo] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const currentRoom = useRef<string | null>(null);

  const refresh = () => {
    const r = roomRef.current;
    if (!r) { setMe(null); setRemotes([]); return; }
    setMe(participantFromLK(r.localParticipant));
    setRemotes(Array.from(r.remoteParticipants.values()).map(participantFromLK));
  };

  const joinRoom = useCallback(async (roomName: string, opts?: { video?: boolean }) => {
    if (currentRoom.current === roomName && roomRef.current) return;
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Медиа-устройства недоступны — требуется HTTPS");
      return;
    }

    // Cleanly leave the previous room so we stop hearing old peers
    // and so others see us leave it.
    if (roomRef.current) {
      const leaving = currentRoom.current;
      try { await roomRef.current.disconnect(); } catch {}
      try { getSocket().emit("voice_leave", {}); } catch {}
      const myId = useAuthStore.getState().user?.id;
      if (myId && leaving) useVoicePresenceStore.getState().leave(leaving, myId);
      roomRef.current = null;
      currentRoom.current = null;
      setJoined(false);
      setMe(null);
      setRemotes([]);
      setIsMuted(false); setIsDeafened(false); setIsVideo(false); setIsSharing(false);
    }

    let token: string, url: string;
    try {
      const res = await voiceApi.token(roomName);
      token = res.token; url = res.url;
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Голосовой сервер не сконфигурирован");
      return;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: { dtx: true },
    });

    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.Disconnected, () => {
        setJoined(false);
        setMe(null);
        setRemotes([]);
        currentRoom.current = null;
      });

    try {
      await room.connect(url, token);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось подключиться");
      try { await room.disconnect(); } catch {}
      return;
    }
    // Media publishing may fail if token doesn't allow it (no SPEAK_VOICE/VIDEO).
    // Don't abort — remain connected in listen-only mode.
    try { await room.localParticipant.setMicrophoneEnabled(true); }
    catch { setIsMuted(true); }
    if (opts?.video) {
      try {
        await room.localParticipant.setCameraEnabled(true);
        setIsVideo(true);
      } catch {}
    }

    roomRef.current = room;
    currentRoom.current = roomName;
    setJoined(true);
    refresh();

    // Broadcast presence to our WS so others see this user in the room
    try { getSocket().emit("voice_join", { room_id: roomName }); } catch {}
  }, [joined]);

  const leaveRoom = useCallback(async () => {
    const r = roomRef.current;
    const leavingRoom = currentRoom.current;
    if (r) {
      try { await r.disconnect(); } catch {}
    }
    try { getSocket().emit("voice_leave", {}); } catch {}
    // Remove self from local presence store (server broadcasts voice_peer_left to *others*)
    const myId = useAuthStore.getState().user?.id;
    if (myId && leavingRoom) {
      useVoicePresenceStore.getState().leave(leavingRoom, myId);
    }
    roomRef.current = null;
    currentRoom.current = null;
    setJoined(false); setMe(null); setRemotes([]);
    setIsMuted(false); setIsDeafened(false); setIsVideo(false); setIsSharing(false);
  }, []);

  const toggleMute = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !isMuted;
    if (!next && useCallStore.getState().serverMuted) {
      setError("Вы заглушены администратором");
      return;
    }
    try {
      await r.localParticipant.setMicrophoneEnabled(!next);
      setIsMuted(next);
    } catch (e: any) {
      setError("Нет права говорить в этом канале");
      setIsMuted(true);
    }
  }, [isMuted]);

  const toggleDeafen = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !isDeafened;
    if (!next && useCallStore.getState().serverDeafened) {
      setError("Звук отключён администратором");
      return;
    }
    setIsDeafened(next);
    // Mute all remote audio tracks locally
    r.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        const rpub = pub as RemoteTrackPublication;
        if (pub.kind === Track.Kind.Audio) {
          rpub.setSubscribed(!next);
        }
      });
    });
    if (next && !isMuted) {
      try { await r.localParticipant.setMicrophoneEnabled(false); } catch {}
      setIsMuted(true);
    }
  }, [isDeafened, isMuted]);

  const toggleVideo = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !isVideo;
    try {
      await r.localParticipant.setCameraEnabled(next);
      setIsVideo(next);
    } catch (e: any) {
      setError(e?.message ?? "Камера недоступна");
    }
  }, [isVideo]);

  const toggleScreenShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !isSharing;
    try {
      await r.localParticipant.setScreenShareEnabled(next, { audio: true });
      setIsSharing(next);
    } catch (e: any) {
      setError(e?.message ?? "Отмена демонстрации");
    }
  }, [isSharing]);

  useEffect(() => {
    return () => {
      if (roomRef.current) { try { roomRef.current.disconnect(); } catch {} }
    };
  }, []);

  return {
    joinRoom, leaveRoom,
    toggleMute, toggleDeafen, toggleVideo, toggleScreenShare,
    joined, error,
    me, remotes,
    isMuted, isDeafened, isVideo, isSharing,
  };
}
