import { create } from "zustand";

export interface IncomingRing {
  roomId: string;
  fromUserId: string;
  fromUsername: string;
  fromDisplayName?: string | null;
  fromAvatarUrl?: string | null;
  video: boolean;
}

export interface ActiveCall {
  roomId: string;
  title: string;
  dmId?: string;
  channelId?: string;
  serverId?: string;
  ringUserId?: string;
  video?: boolean;
}

export interface VoiceControls {
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  isMuted: boolean;
  isDeafened: boolean;
  isSharing: boolean;
  isVideo: boolean;
}

interface CallState {
  incoming: IncomingRing | null;
  active: ActiveCall | null;
  maximized: boolean;
  controls: VoiceControls | null;

  setIncoming: (r: IncomingRing | null) => void;
  startCall: (c: ActiveCall) => void;
  endCall: () => void;
  setMaximized: (v: boolean) => void;
  setControls: (c: VoiceControls | null) => void;
}

export const useCallStore = create<CallState>((set) => ({
  incoming: null,
  active: null,
  maximized: true,
  controls: null,
  setIncoming: (incoming) => set({ incoming }),
  startCall: (active) => set({ active, incoming: null, maximized: true }),
  endCall: () => set({ active: null, maximized: false, controls: null }),
  setMaximized: (maximized) => set({ maximized }),
  setControls: (controls) => set({ controls }),
}));
