import { create } from "zustand";
import type { VoiceState } from "@/types";

interface VoiceStoreState {
  inVoice: boolean;
  channelId: string | null;
  serverId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSharingScreen: boolean;
  isVideo: boolean;
  voiceStates: Record<string, VoiceState>; // userId -> state

  setVoiceChannel: (channelId: string | null, serverId: string | null) => void;
  joinVoice: (channelId: string, video?: boolean, serverId?: string | null) => void;
  setMuted: (v: boolean) => void;
  setDeafened: (v: boolean) => void;
  setSharingScreen: (v: boolean) => void;
  setVideo: (v: boolean) => void;
  updateRemoteState: (state: VoiceState) => void;
  leaveVoice: () => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  inVoice: false,
  channelId: null,
  serverId: null,
  isMuted: false,
  isDeafened: false,
  isSharingScreen: false,
  isVideo: false,
  voiceStates: {},

  setVoiceChannel: (channelId, serverId) =>
    set({ inVoice: !!channelId, channelId, serverId }),
  joinVoice: (channelId, video = false, serverId = null) =>
    set({ inVoice: true, channelId, serverId, isVideo: video }),
  setMuted: (isMuted) => set({ isMuted }),
  setDeafened: (isDeafened) => set({ isDeafened }),
  setSharingScreen: (isSharingScreen) => set({ isSharingScreen }),
  setVideo: (isVideo) => set({ isVideo }),
  updateRemoteState: (state) =>
    set((s) => ({ voiceStates: { ...s.voiceStates, [state.user_id]: state } })),
  leaveVoice: () =>
    set({ inVoice: false, channelId: null, serverId: null, isSharingScreen: false, isVideo: false }),
}));
