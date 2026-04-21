"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room, RoomEvent, Track, RemoteParticipant, LocalParticipant,
  ConnectionState, TrackPublication, RemoteTrackPublication, LocalTrackPublication,
  VideoPresets, ScreenSharePresets,
  ExternalE2EEKeyProvider,
} from "livekit-client";
import { dmsApi } from "@/lib/api";
import {
  deriveSharedKey, deriveGroupKey, safetyCode,
  createEphemeralKeypair, signBundle, verifyBundle, deriveEpochKey,
  type SignedBundle,
} from "@/lib/e2ee";
import { voiceApi } from "@/lib/api";
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
  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null);
  const currentDmRef = useRef<{ id: string; isGroup: boolean } | null>(null);
  // MLS-lite state for the current voice session
  const mlsStateRef = useRef<{
    roomId: string;
    myEphPk: Uint8Array;
    myEphPkB64: string;
    peerEphs: Map<string, string>;          // userId -> ephPk (base64)
    signingKeys: Map<string, string>;       // userId -> signing_public_key (base64)
    epoch: number;
  } | null>(null);

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

    // Derive E2EE key for DM rooms (automatic MLS-lite: ephemeral + signed handshake)
    let e2eeKey: Uint8Array | null = null;
    let e2eeKeyProvider: ExternalE2EEKeyProvider | null = null;
    let e2eeWorker: Worker | null = null;
    currentDmRef.current = null;
    mlsStateRef.current = null;
    setE2eeActive(false);
    setE2eeSafety(null);
    if (roomName.startsWith("dm:")) {
      try {
        const dmId = roomName.slice(3);
        const dm = await dmsApi.get(dmId);
        const myId = useAuthStore.getState().user?.id;
        if (myId && dm.participants.length >= 2) {
          // Build map of signing public keys for verification
          const signingKeys = new Map<string, string>();
          for (const p of dm.participants) {
            if (p.user.signing_public_key) signingKeys.set(p.user.id, p.user.signing_public_key);
          }

          // Generate ephemeral keypair for this session
          const eph = await createEphemeralKeypair();
          const myEphB64 = await import("libsodium-wrappers").then((m) =>
            m.default.to_base64(eph.publicKey, m.default.base64_variants.ORIGINAL),
          );

          mlsStateRef.current = {
            roomId: roomName,
            myEphPk: eph.publicKey,
            myEphPkB64: myEphB64,
            peerEphs: new Map(),
            signingKeys,
            epoch: 0,
          };

          // Initial key includes only us — peers will join and rotate
          e2eeKey = await deriveEpochKey(roomName, 0, [myEphB64]);
          currentDmRef.current = { id: dmId, isGroup: dm.is_group };

          // Fallback to identity-derived key if MLS-lite signing keys missing (legacy peers)
          if (signingKeys.size === 0) {
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
        }
      } catch {}
      if (e2eeKey) {
        try {
          e2eeWorker = new Worker(
            new URL("livekit-client/e2ee-worker", import.meta.url),
            { type: "module" },
          );
          e2eeKeyProvider = new ExternalE2EEKeyProvider();
          await e2eeKeyProvider.setKey(e2eeKey);
          keyProviderRef.current = e2eeKeyProvider;
          setE2eeActive(true);
          safetyCode(e2eeKey).then((c) => setE2eeSafety(c));
        } catch {
          e2eeKey = null;
          e2eeKeyProvider = null;
          e2eeWorker = null;
          keyProviderRef.current = null;
        }
      }
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        dtx: true,
        red: true,
        videoCodec: "vp8",
        videoEncoding: { ...VideoPresets.h720.encoding, maxFramerate: 60 },
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 60 },
        screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
      },
      videoCaptureDefaults: {
        resolution: { ...VideoPresets.h720.resolution, frameRate: 60 },
      },
      ...(e2eeKeyProvider && e2eeWorker ? { e2ee: { keyProvider: e2eeKeyProvider, worker: e2eeWorker } } : {}),
    });

    if (e2eeKeyProvider) {
      try { await room.setE2EEEnabled(true); } catch {}
    }

    const recomputeEpochKey = async () => {
      const st = mlsStateRef.current;
      const kp = keyProviderRef.current;
      if (!st || !kp) return;
      const all = [st.myEphPkB64, ...Array.from(st.peerEphs.values())];
      const key = await deriveEpochKey(st.roomId, st.epoch, all);
      try { await kp.setKey(key); } catch {}
      setE2eeSafety(await safetyCode(key));
    };

    const emitOwnBundle = async () => {
      const st = mlsStateRef.current;
      const me = useAuthStore.getState().user;
      if (!st || !me?.id) return;
      try {
        const bundle = await signBundle({
          roomId: st.roomId,
          userId: me.id,
          epoch: st.epoch,
          ephPk: st.myEphPkB64,
          ts: Date.now(),
        });
        getSocket().emit("voice_mls_bundle", { room_id: st.roomId, bundle });
      } catch {}
    };

    const onMlsBundle = async (msg: { room_id: string; from_user_id: string; bundle: SignedBundle }) => {
      const st = mlsStateRef.current;
      if (!st || msg.room_id !== st.roomId) return;
      if (msg.from_user_id === useAuthStore.getState().user?.id) return;
      const signerPk = st.signingKeys.get(msg.from_user_id);
      if (!signerPk) return;
      const ok = await verifyBundle(msg.bundle, signerPk);
      if (!ok) return;
      if (msg.bundle.userId !== msg.from_user_id || msg.bundle.roomId !== st.roomId) return;
      st.peerEphs.set(msg.from_user_id, msg.bundle.ephPk);
      await recomputeEpochKey();
      // Re-emit ours so the new peer also has our ephemeral
      emitOwnBundle();
    };

    const rotateGroupKeyIfNeeded = async () => {
      // Legacy fallback path when MLS-lite not in use
      if (mlsStateRef.current) { await recomputeEpochKey(); return; }
      const dmInfo = currentDmRef.current;
      const kp = keyProviderRef.current;
      if (!dmInfo || !dmInfo.isGroup || !kp) return;
      try {
        const dm = await dmsApi.get(dmInfo.id);
        const pks = dm.participants
          .map((p) => p.user.public_key)
          .filter((k): k is string => !!k)
          .sort();
        if (pks.length < 2) return;
        const newKey = await deriveGroupKey(dmInfo.id, pks);
        await kp.setKey(newKey);
        setE2eeSafety(await safetyCode(newKey));
      } catch {}
    };

    // Subscribe to MLS-lite bundle messages
    const sock = getSocket();
    sock.on("voice_mls_bundle", onMlsBundle);
    // Unsubscribe on disconnect
    const detachMls = () => { sock.off("voice_mls_bundle", onMlsBundle); };

    room
      .on(RoomEvent.ParticipantConnected, () => {
        // new peer — re-broadcast our bundle so they can decrypt us
        emitOwnBundle();
        rotateGroupKeyIfNeeded();
        refresh();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        const st = mlsStateRef.current;
        if (st && p?.identity && st.peerEphs.has(p.identity)) {
          st.peerEphs.delete(p.identity);
          st.epoch += 1;
          recomputeEpochKey();
          emitOwnBundle();
        }
        rotateGroupKeyIfNeeded();
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
        mlsStateRef.current = null;
        keyProviderRef.current = null;
        detachMls();
      });

    try {
      await room.connect(url, token);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось подключиться");
      try { await room.disconnect(); } catch {}
      return;
    }

    // Apply saved device preferences before enabling tracks
    const vs = useVoiceSettingsStore.getState();
    if (vs.inputDeviceId && vs.inputDeviceId !== "default") {
      try { await room.switchActiveDevice("audioinput", vs.inputDeviceId); } catch {}
    }
    if (vs.outputDeviceId && vs.outputDeviceId !== "default") {
      try { await room.switchActiveDevice("audiooutput", vs.outputDeviceId); } catch {}
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
    // Announce our ephemeral key for MLS-lite handshake
    emitOwnBundle();
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
        screenShareEncoding: {
          maxBitrate: screenBitrate(vs.screenResolution, vs.screenFps),
          maxFramerate: vs.screenFps,
        },
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
