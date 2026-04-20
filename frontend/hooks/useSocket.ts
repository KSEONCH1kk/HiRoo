"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
// presence updates
import { getSocket, connectSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { useVoiceStore } from "@/store/voiceStore";
import { useServerStore } from "@/store/serverStore";
import { useUnreadStore } from "@/store/unreadStore";
import { useVoicePresenceStore } from "@/store/voicePresenceStore";
import type { Message, DMMessageType, VoiceState } from "@/types";

export function useSocket() {
  const { user } = useAuthStore();
  const { addMessage, updateMessage, deleteMessage, addDMMessage, updateDMMessage, deleteDMMessage, setTyping, addReaction, removeReaction, addDMReaction, removeDMReaction } = useChatStore();
  const { updateRemoteState } = useVoiceStore();
  const qc = useQueryClient();
  const bound = useRef(false);

  useEffect(() => {
    if (!user || bound.current) return;
    bound.current = true;

    const s = getSocket();
    connectSocket();

    const onMessageCreate = (msg: Message & { server_id?: string }) => {
      addMessage(msg);
      const me = useAuthStore.getState().user;
      if (!me?.username) return;
      if (msg.author?.id === me.id) return;

      const content = msg.content || "";
      const escaped = me.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mentioned =
        new RegExp(`(^|[^\\w])@${escaped}\\b`, "i").test(content) ||
        /(^|[^\w])@(everyone|all)\b/i.test(content);
      if (!mentioned) return;

      const { activeChannelId } = useServerStore.getState();
      let serverId: string | undefined = msg.server_id;
      if (!serverId) {
        const { channels } = useServerStore.getState();
        for (const [sid, chs] of Object.entries(channels)) {
          if (chs.some((c) => c.id === msg.channel_id)) { serverId = sid; break; }
        }
      }
      if (serverId && msg.channel_id !== activeChannelId) {
        useUnreadStore.getState().addServerMention(serverId);
      }
    };
    const onMessageUpdate = (msg: Message) => updateMessage(msg);
    const onMessageDelete = ({ message_id, channel_id }: { message_id: string; channel_id: string }) =>
      deleteMessage(channel_id, message_id);
    const onDMMessage = (msg: DMMessageType) => {
      addDMMessage(msg);
      qc.invalidateQueries({ queryKey: ["dms"] });
      // Every DM message increments unread unless currently viewing it
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const isActive = path === `/dms/${msg.dm_id}`;
      if (!isActive && msg.author?.id !== user?.id) {
        useUnreadStore.getState().addDmUnread(msg.dm_id);
      }
    };
    const onDMMessageUpdate = (msg: DMMessageType) => updateDMMessage(msg);
    const onDMMessageDelete = ({ dm_id, message_id }: any) => deleteDMMessage(dm_id, message_id);
    const onDMReactionAdd = ({ dm_id, message_id, user_id, emoji }: any) => {
      if (user?.id) addDMReaction(dm_id, message_id, emoji, user_id, user.id);
    };
    const onDMReactionRemove = ({ dm_id, message_id, user_id, emoji }: any) => {
      if (user?.id) removeDMReaction(dm_id, message_id, emoji, user_id, user.id);
    };
    const onTyping = ({ user_id, channel_id, is_typing }: any) =>
      setTyping(channel_id, user_id, is_typing);
    const onReactionAdd = ({ message_id, user_id, emoji, channel_id }: any) => {
      if (user?.id && channel_id) addReaction(channel_id, message_id, emoji, user_id, user.id);
    };
    const onReactionRemove = ({ message_id, user_id, emoji, channel_id }: any) => {
      if (user?.id && channel_id) removeReaction(channel_id, message_id, emoji, user_id, user.id);
    };
    const onVoiceState = (vs: VoiceState) => updateRemoteState(vs);
    const onVoiceSnapshot = ({ rooms }: { rooms: Record<string, string[]> }) => {
      const store = useVoicePresenceStore.getState();
      for (const [roomId, users] of Object.entries(rooms)) {
        store.setRoom(roomId, users);
      }
    };
    const onVoiceRoomJoined = ({ room_id, peers }: { room_id: string; peers: string[] }) => {
      if (!user?.id) return;
      useVoicePresenceStore.getState().setRoom(room_id, [...peers, user.id]);
    };
    const onVoicePeerJoined = ({ room_id, user_id }: { room_id: string; user_id: string }) => {
      useVoicePresenceStore.getState().join(room_id, user_id);
    };
    const onVoicePeerLeft = ({ room_id, user_id }: { room_id: string; user_id: string }) => {
      useVoicePresenceStore.getState().leave(room_id, user_id);
    };
    const onPresence = ({ user_id, status }: { user_id: string; status: string }) => {
      // Invalidate any member lists so their status refreshes
      qc.setQueriesData({ queryKey: ["members"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m: any) => m?.user?.id === user_id ? { ...m, user: { ...m.user, status } } : m);
      });
      qc.setQueriesData({ queryKey: ["friends"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((f: any) => f?.id === user_id ? { ...f, status } : f);
      });
    };
    const onFriendRequest = () => qc.invalidateQueries({ queryKey: ["friends-pending"] });
    const onReady = () => {};

    s.on("message_create", onMessageCreate);
    s.on("message_update", onMessageUpdate);
    s.on("message_delete", onMessageDelete);
    s.on("dm_message_create", onDMMessage);
    s.on("dm_message_update", onDMMessageUpdate);
    s.on("dm_message_delete", onDMMessageDelete);
    s.on("dm_reaction_add", onDMReactionAdd);
    s.on("dm_reaction_remove", onDMReactionRemove);
    s.on("typing", onTyping);
    s.on("reaction_add", onReactionAdd);
    s.on("reaction_remove", onReactionRemove);
    s.on("voice_state_update", onVoiceState);
    s.on("presence_update", onPresence);
    s.on("voice_snapshot", onVoiceSnapshot);
    s.on("voice_room_joined", onVoiceRoomJoined);
    s.on("voice_peer_joined", onVoicePeerJoined);
    s.on("voice_peer_left", onVoicePeerLeft);
    s.on("friend_request", onFriendRequest);
    s.on("ready", onReady);

    return () => {
      s.off("message_create", onMessageCreate);
      s.off("message_update", onMessageUpdate);
      s.off("message_delete", onMessageDelete);
      s.off("dm_message_create", onDMMessage);
      s.off("dm_message_update", onDMMessageUpdate);
      s.off("dm_message_delete", onDMMessageDelete);
      s.off("dm_reaction_add", onDMReactionAdd);
      s.off("dm_reaction_remove", onDMReactionRemove);
      s.off("typing", onTyping);
      s.off("reaction_add", onReactionAdd);
      s.off("reaction_remove", onReactionRemove);
      s.off("voice_state_update", onVoiceState);
      s.off("presence_update", onPresence);
      s.off("voice_snapshot", onVoiceSnapshot);
      s.off("voice_room_joined", onVoiceRoomJoined);
      s.off("voice_peer_joined", onVoicePeerJoined);
      s.off("voice_peer_left", onVoicePeerLeft);
      s.off("friend_request", onFriendRequest);
      s.off("ready", onReady);
      bound.current = false;
    };
  }, [user]);
}
