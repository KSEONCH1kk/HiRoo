"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room, RoomEvent, Track, RemoteParticipant, LocalParticipant,
  ConnectionState, TrackPublication, RemoteTrackPublication, LocalTrackPublication,
  VideoPresets, ScreenSharePresets,
} from "livekit-client";
import { HiRooKeyProvider } from "@/lib/e2eeKeyProvider";
import { dmsApi, voiceApi, usersApi } from "@/lib/api";
import {
  deriveSharedKey, deriveGroupKey, safetyCode, bytesToB64,
  randomSessionKey, sealTo, openSealed,
} from "@/lib/e2ee";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { useVoicePresenceStore } from "@/store/voicePresenceStore";
import { useCallStore } from "@/store/callStore";
import { useVoiceSettingsStore, screenResolutionSize, screenBitrate } from "@/store/voiceSettingsStore";

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
  const [e2eeActive, setE2eeActive] = useState(false);
  const [e2eeSafety, setE2eeSafety] = useState<string | null>(null);
  const currentRoom = useRef<string | null>(null);
  const pendingRoom = useRef<string | null>(null);
  const joinGen = useRef(0);
  const keyProviderRef = useRef<HiRooKeyProvider | null>(null);
  const currentDmRef = useRef<{ id: string; isGroup: boolean } | null>(null);
  const mySessionKey = useRef<Uint8Array | null>(null);
  const peerKeys = useRef<Map<string, Uint8Array>>(new Map());

  const refresh = () => {
    const r = roomRef.current;
    if (!r) { setMe(null); setRemotes([]); return; }
    setMe(participantFromLK(r.localParticipant));
    setRemotes(Array.from(r.remoteParticipants.values()).map(participantFromLK));
  };

  const joinRoom = useCallback(async (roomName: string, opts?: { video?: boolean }) => {
    if (currentRoom.current === roomName && roomRef.current) return;
    if (pendingRoom.current === roomName) return;
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Медиа-устройства недоступны — требуется HTTPS");
      return;
    }

    const myGen = ++joinGen.current;
    pendingRoom.current = roomName;

    if (roomRef.current) {
      const leaving = currentRoom.current;
      const oldRoom = roomRef.current;
      roomRef.current = null;
      currentRoom.current = null;
      try { await oldRoom.disconnect(); } catch {}
      try { getSocket().emit("voice_leave", {}); } catch {}
      const myId = useAuthStore.getState().user?.id;
      if (myId && leaving) useVoicePresenceStore.getState().leave(leaving, myId);
      setJoined(false);
      setMe(null);
      setRemotes([]);
      setIsMuted(false); setIsDeafened(false); setIsVideo(false); setIsSharing(false);
    }
    if (joinGen.current !== myGen) return;

    let token: string, url: string;
    try {
      const res = await voiceApi.token(roomName);
      token = res.token; url = res.url;
    } catch (e: any) {
      if (joinGen.current === myGen) {
        setError(e?.response?.data?.detail ?? "Голосовой сервер не сконфигурирован");
        pendingRoom.current = null;
      }
      return;
    }
    if (joinGen.current !== myGen) return;

    // E2EE setup. Two modes:
    //   • DM rooms — static key derived from participants' identity pubkeys.
    //   • Channel rooms — per-sender keys: each peer has its own random session key
    //     and shares it with others via sealed_box (anonymous PK encryption).
    let e2eeKey: Uint8Array | null = null;
    let e2eeKeyProvider: HiRooKeyProvider | null = null;
    let e2eeWorker: Worker | null = null;
    let e2eeMode: "dm-static" | "channel-per-sender" | null = null;
    currentDmRef.current = null;
    mySessionKey.current = null;
    peerKeys.current.clear();
    setE2eeActive(false);
    setE2eeSafety(null);
    if (roomName.startsWith("dm:")) {
      try {
        const dmId = roomName.slice(3);
        const dm = await dmsApi.get(dmId);
        const myId = useAuthStore.getState().user?.id;
        if (myId && dm.participants.length >= 2) {
          currentDmRef.current = { id: dmId, isGroup: dm.is_group };
          const others = dm.participants.filter((p) => p.user.id !== myId);
          if (!dm.is_group && others.length === 1 && others[0].user.public_key) {
            e2eeKey = await deriveSharedKey(others[0].user.public_key);
          } else {
            const pks = dm.participants
              .map((p) => p.user.public_key)
              .filter((k): k is string => !!k)
              .sort();
            if (pks.length >= 2) e2eeKey = await deriveGroupKey(dmId, pks);
          }
        }
      } catch {}
      if (e2eeKey) {
        try {
          e2eeWorker = new Worker(
            new URL("livekit-client/e2ee-worker", import.meta.url),
            { type: "module" },
          );
          e2eeKeyProvider = new HiRooKeyProvider();
          await e2eeKeyProvider.setKey(await bytesToB64(e2eeKey));
          keyProviderRef.current = e2eeKeyProvider;
          e2eeMode = "dm-static";
          setE2eeActive(true);
          safetyCode(e2eeKey).then((c) => setE2eeSafety(c));
        } catch {
          e2eeKey = null;
          e2eeKeyProvider = null;
          e2eeWorker = null;
          keyProviderRef.current = null;
        }
      }
    } else if (roomName.startsWith("channel:")) {
      try {
        const sessionKey = randomSessionKey();
        mySessionKey.current = sessionKey;
        e2eeWorker = new Worker(
          new URL("livekit-client/e2ee-worker", import.meta.url),
          { type: "module" },
        );
        e2eeKeyProvider = new HiRooKeyProvider();
        await e2eeKeyProvider.setKey(await bytesToB64(sessionKey));
        keyProviderRef.current = e2eeKeyProvider;
        e2eeMode = "channel-per-sender";
        setE2eeActive(true);
      } catch {
        mySessionKey.current = null;
        e2eeKeyProvider = null;
        e2eeWorker = null;
        keyProviderRef.current = null;
      }
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        dtx: true,
        red: true,
        videoCodec: "h264",
        videoEncoding: { ...VideoPresets.h720.encoding, maxFramerate: 60 },
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        // No simulcast for screen share — publish a single high-quality layer
        // so viewers always get the full resolution the sharer picked, not
        // a 720p15 fallback chosen by the SFU adaptive logic.
        screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 60 },
        screenShareSimulcastLayers: [],
      },
      videoCaptureDefaults: {
        resolution: { ...VideoPresets.h720.resolution, frameRate: 60 },
      },
      ...(e2eeKeyProvider && e2eeWorker ? { e2ee: { keyProvider: e2eeKeyProvider, worker: e2eeWorker } } : {}),
    });

    if (e2eeKeyProvider) {
      try { await room.setE2EEEnabled(true); } catch {}
    }

    // ── Per-sender key distribution (channel rooms only) ──────────────────
    const sock = getSocket();
    const sendMyKeyTo = async (targetUserId: string) => {
      const key = mySessionKey.current;
      const kp = keyProviderRef.current;
      if (!key || !kp || e2eeMode !== "channel-per-sender") return;
      try {
        const u = await usersApi.get(targetUserId);
        if (!u.public_key) return;
        const sealed = sealTo(key, u.public_key);
        sock.emit("voice_key_distribute", {
          room_id: roomName,
          target_user_id: targetUserId,
          sealed,
        });
      } catch {}
    };

    const onKeyDistribute = async (msg: { room_id: string; from_user_id: string; sealed: string }) => {
      if (msg.room_id !== roomName) return;
      if (e2eeMode !== "channel-per-sender") return;
      const kp = keyProviderRef.current;
      if (!kp) return;
      const opened = openSealed(msg.sealed);
      if (!opened) return;
      const hadBefore = peerKeys.current.has(msg.from_user_id);
      peerKeys.current.set(msg.from_user_id, opened);
      try {
        await kp.setKey(await bytesToB64(opened), msg.from_user_id);
      } catch {}
      // Reciprocate if we haven't yet sent our key to them (covers the race
      // where their ParticipantConnected fires on us before their voice_join
      // reaches the server).
      if (!hadBefore) sendMyKeyTo(msg.from_user_id);
    };

    sock.on("voice_key_distribute", onKeyDistribute);
    const detachKey = () => { sock.off("voice_key_distribute", onKeyDistribute); };

    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        if (e2eeMode === "channel-per-sender" && p?.identity) {
          sendMyKeyTo(p.identity);
        }
        refresh();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        if (p?.identity) peerKeys.current.delete(p.identity);
        refresh();
      })
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
        keyProviderRef.current = null;
        mySessionKey.current = null;
        peerKeys.current.clear();
        detachKey();
      });

    try {
      await room.connect(url, token);
    } catch (e: any) {
      if (joinGen.current === myGen) {
        setError(e?.message ?? "Не удалось подключиться");
        pendingRoom.current = null;
      }
      try { await room.disconnect(); } catch {}
      return;
    }
    if (joinGen.current !== myGen) {
      try { await room.disconnect(); } catch {}
      return;
    }

    const vs = useVoiceSettingsStore.getState();
    if (vs.inputDeviceId && vs.inputDeviceId !== "default") {
      try { await room.switchActiveDevice("audioinput", vs.inputDeviceId); } catch {}
    }
    if (vs.outputDeviceId && vs.outputDeviceId !== "default") {
      try { await room.switchActiveDevice("audiooutput", vs.outputDeviceId); } catch {}
    }

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
    pendingRoom.current = null;
    setJoined(true);
    refresh();

    try { getSocket().emit("voice_join", { room_id: roomName }); } catch {}

    if (e2eeMode === "channel-per-sender") {
      for (const p of room.remoteParticipants.values()) {
        if (p.identity) sendMyKeyTo(p.identity);
      }
    }
  }, [joined]);

  const leaveRoom = useCallback(async () => {
    joinGen.current += 1;
    pendingRoom.current = null;
    const r = roomRef.current;
    const leavingRoom = currentRoom.current;
    roomRef.current = null;
    currentRoom.current = null;
    if (r) {
      try { await r.disconnect(); } catch {}
    }
    try { getSocket().emit("voice_leave", {}); } catch {}
    const myId = useAuthStore.getState().user?.id;
    if (myId && leavingRoom) {
      useVoicePresenceStore.getState().leave(leavingRoom, myId);
    }
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
      await r.localParticipant.setCameraEnabled(next, {
        resolution: { ...VideoPresets.h720.resolution, frameRate: 60 },
      });
      setIsVideo(next);
    } catch (e: any) {
      setError(e?.message ?? "Камера недоступна");
    }
  }, [isVideo]);

  const switchAudioInput = useCallback(async (deviceId: string) => {
    const r = roomRef.current;
    if (!r) return;
    try { await r.switchActiveDevice("audioinput", deviceId === "default" ? "" : deviceId); } catch {}
  }, []);

  const switchAudioOutput = useCallback(async (deviceId: string) => {
    const r = roomRef.current;
    if (!r) return;
    try { await r.switchActiveDevice("audiooutput", deviceId === "default" ? "" : deviceId); } catch {}
  }, []);

  const startScreenShareWithQuality = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const vs = useVoiceSettingsStore.getState();
    const size = screenResolutionSize(vs.screenResolution);
    try {
      await r.localParticipant.setScreenShareEnabled(true, {
        audio: true,
        resolution: { ...size, frameRate: vs.screenFps },
        contentHint: "motion",
      }, {
        videoCodec: "h264",
        screenShareEncoding: {
          maxBitrate: screenBitrate(vs.screenResolution, vs.screenFps),
          maxFramerate: vs.screenFps,
          priority: "high",
        },
        screenShareSimulcastLayers: [],
      });
      setIsSharing(true);
    } catch (e: any) {
      setError(e?.message ?? "Отмена демонстрации");
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    if (isSharing) {
      try { await r.localParticipant.setScreenShareEnabled(false); } catch {}
      setIsSharing(false);
      return;
    }
    await startScreenShareWithQuality();
  }, [isSharing, startScreenShareWithQuality]);

  const restartScreenShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r || !isSharing) return;
    try { await r.localParticipant.setScreenShareEnabled(false); } catch {}
    await startScreenShareWithQuality();
  }, [isSharing, startScreenShareWithQuality]);

  useEffect(() => {
    return () => {
      if (roomRef.current) { try { roomRef.current.disconnect(); } catch {} }
    };
  }, []);

  return {
    joinRoom, leaveRoom,
    toggleMute, toggleDeafen, toggleVideo, toggleScreenShare,
    switchAudioInput, switchAudioOutput, restartScreenShare,
    joined, error,
    me, remotes,
    isMuted, isDeafened, isVideo, isSharing,
    e2eeActive, e2eeSafety,
  };
}
