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
import { useVoiceAdminStore } from "@/store/voiceAdminStore";
import { useCallStore } from "@/store/callStore";
import { useEphemeralToastStore } from "@/store/ephemeralToastStore";
import { playNotify } from "@/lib/sounds";
import type { Message, DMMessageType, VoiceState, DirectMessage, Channel } from "@/types";

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
        const me2 = useAuthStore.getState().user;
        const level = me2?.notif_level ?? "mentions";
        if (level === "none") return;                       // suppresses sound + toast
        if (me2?.notif_sound !== false) playNotify();
        if (me2?.notif_desktop === false) return;
        const title = msg.author?.display_name ?? msg.author?.username ?? "HiRoo";
        const trimmed = content.slice(0, 180);
        // Desktop (Electron) — native Windows/macOS/Linux toast.
        try {
          const w = typeof window !== "undefined" ? (window as any).hiroo : undefined;
          if (w?.isDesktop && !document.hasFocus()) w.notify(title, trimmed);
        } catch {}
        // Mobile (Capacitor) — Android / iOS local notification.
        try {
          const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
          const ln = cap?.Plugins?.LocalNotifications;
          if (ln && cap.isNativePlatform()) {
            ln.schedule({ notifications: [{
              id: Math.floor(Math.random() * 2_000_000_000),
              title, body: trimmed,
            }] }).catch(() => {});
          }
        } catch {}
      }
    };
    const onMessageUpdate = (msg: Message) => updateMessage(msg);
    const onMessageDelete = ({ message_id, channel_id }: { message_id: string; channel_id: string }) =>
      deleteMessage(channel_id, message_id);
    const onDMMessage = (msg: DMMessageType) => {
      addDMMessage(msg);
      qc.invalidateQueries({ queryKey: ["dms"] });
      if (msg.type === "call_log") return;
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const isActive = path === `/dms/${msg.dm_id}`;
      const me = useAuthStore.getState().user;
      if (isActive || !me || msg.author?.id === me.id) return;

      const dms = (qc.getQueryData(["dms"]) as DirectMessage[] | undefined) ?? [];
      const dm = dms.find((d) => d.id === msg.dm_id);
      const isGroup = dm?.is_group ?? false;

      if (!isGroup) {
        useUnreadStore.getState().addDmUnread(msg.dm_id);
        const me3 = useAuthStore.getState().user;
        const level3 = me3?.notif_level ?? "mentions";
        if (level3 === "none") return;
        if (me3?.notif_sound !== false) playNotify();
        if (me3?.notif_desktop === false) return;
        const title = msg.author?.display_name ?? msg.author?.username ?? "HiRoo";
        const trimmed = (msg.content || "").slice(0, 180);
        try {
          const w = typeof window !== "undefined" ? (window as any).hiroo : undefined;
          if (w?.isDesktop && !document.hasFocus()) w.notify(title, trimmed);
        } catch {}
        try {
          const cap = typeof window !== "undefined" ? (window as any).Capacitor : undefined;
          const ln = cap?.Plugins?.LocalNotifications;
          if (ln && cap.isNativePlatform()) {
            ln.schedule({ notifications: [{
              id: Math.floor(Math.random() * 2_000_000_000),
              title, body: trimmed,
            }] }).catch(() => {});
          }
        } catch {}
        return;
      }

      const content = msg.content || "";
      const escaped = me.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mentioned =
        new RegExp(`(^|[^\\w])@${escaped}\\b`, "i").test(content) ||
        /(^|[^\w])@(everyone|all)\b/i.test(content);
      if (mentioned) {
        useUnreadStore.getState().addDmUnread(msg.dm_id);
        playNotify();
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
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const onTyping = ({ user_id, username, display_name, channel_id, dm_id, is_typing }: any) => {
      const roomKey = dm_id ?? channel_id;
      if (!roomKey || !user_id) return;
      const me = useAuthStore.getState().user;
      if (me?.id === user_id) return;
      const entry = { userId: user_id, username: username ?? "", displayName: display_name ?? null };
      const k = `${roomKey}:${user_id}`;
      const prev = typingTimers.get(k);
      if (prev) { clearTimeout(prev); typingTimers.delete(k); }
      if (is_typing) {
        setTyping(roomKey, entry, true);
        typingTimers.set(k, setTimeout(() => {
          setTyping(roomKey, entry, false);
          typingTimers.delete(k);
        }, 6000));
      } else {
        setTyping(roomKey, entry, false);
      }
    };
    const onReactionAdd = ({ message_id, user_id, emoji, channel_id }: any) => {
      if (user?.id && channel_id) addReaction(channel_id, message_id, emoji, user_id, user.id);
    };
    const onReactionRemove = ({ message_id, user_id, emoji, channel_id }: any) => {
      if (user?.id && channel_id) removeReaction(channel_id, message_id, emoji, user_id, user.id);
    };
    const onVoiceState = (vs: VoiceState) => updateRemoteState(vs);
    const onVoiceSnapshot = ({ rooms, muted_users, deafened_users }: { rooms: Record<string, string[]>; muted_users?: string[]; deafened_users?: string[] }) => {
      const store = useVoicePresenceStore.getState();
      for (const [roomId, users] of Object.entries(rooms)) {
        store.setRoom(roomId, users);
      }
      useVoiceAdminStore.getState().setBulk(muted_users ?? [], deafened_users ?? []);
    };
    const onVoiceUserState = ({ user_id, server_muted, server_deafened }: { user_id: string; server_muted: boolean; server_deafened: boolean }) => {
      useVoiceAdminStore.getState().setMuted(user_id, !!server_muted);
      useVoiceAdminStore.getState().setDeafened(user_id, !!server_deafened);
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
    const onChannelCreate = (ch: Channel) => {
      useServerStore.getState().addChannel(ch);
    };
    const onChannelUpdate = (ch: Channel) => {
      useServerStore.getState().updateChannel(ch);
    };
    const onChannelDelete = ({ server_id, channel_id }: { server_id: string; channel_id: string }) => {
      useServerStore.getState().removeChannel(server_id, channel_id);
    };
    const onChannelReorder = (payload: any) => {
      // Backend now sends { server_id, items: [{id, position, parent_id}] }.
      // Fall back to legacy { ordered_ids } for older servers.
      const sid = payload?.server_id;
      if (!sid) return;
      let items: { id: string; position: number; parent_id: string | null }[] = [];
      if (Array.isArray(payload.items)) {
        items = payload.items.map((i: any) => ({
          id: String(i.id),
          position: Number(i.position ?? 0),
          parent_id: i.parent_id ?? null,
        }));
      } else if (Array.isArray(payload.ordered_ids)) {
        items = payload.ordered_ids.map((id: string, idx: number) => ({
          id, position: idx, parent_id: null,
        }));
      }
      if (items.length) {
        useServerStore.getState().reorderChannels(sid, items);
      }
      // Also invalidate the react-query channel cache so components using it
      // (ChannelSidebar, ChannelsTab) re-fetch canonical state.
      qc.invalidateQueries({ queryKey: ["channels", sid] });
    };
    const onChannelPermissionsUpdate = () => {
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    };
    const onServersReorder = (payload: any) => {
      const orderedIds: string[] = Array.isArray(payload?.ordered_ids) ? payload.ordered_ids : [];
      if (!orderedIds.length) return;
      const st = useServerStore.getState();
      const byId = new Map(st.servers.map((s) => [s.id, s]));
      const next: typeof st.servers = [];
      for (const id of orderedIds) {
        const s = byId.get(id);
        if (s) { next.push(s); byId.delete(id); }
      }
      for (const leftover of byId.values()) next.push(leftover);
      st.setServers(next);
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    };

    const onAuditLogCreate = (payload: any) => {
      const sid = payload?.server_id;
      if (!sid) return;
      qc.invalidateQueries({ queryKey: ["audit-log", sid] });
    };

    const onMemberBanChange = (payload: any) => {
      const sid = payload?.server_id;
      if (!sid) return;
      // Refresh both the ban list (Bans tab) and members list so UIs that
      // render "this user is banned" stay accurate.
      qc.invalidateQueries({ queryKey: ["server-bans", sid] });
      qc.invalidateQueries({ queryKey: ["members", sid] });
    };

    const onRoleChange = (payload: any) => {
      // payload for role_create/role_update is the RoleResponse object with
      // server_id; role_delete/roles_reorder also include server_id.
      const sid = payload?.server_id;
      if (!sid) return;
      qc.invalidateQueries({ queryKey: ["roles", sid] });
      qc.invalidateQueries({ queryKey: ["my-permissions", sid] });
    };

    const onVoiceForceDisconnect = async () => {
      const { active, controls, endCall } = useCallStore.getState();
      if (!active) return;
      if (controls?.leave) {
        try { await controls.leave(); return; } catch {}
      }
      try { getSocket().emit("voice_leave", {}); } catch {}
      endCall();
    };
    const onVoiceForceMute = () => {
      useCallStore.getState().setServerMuted(true);
      const c = useCallStore.getState().controls;
      if (c && !c.isMuted) c.toggleMute();
    };
    const onVoiceForceUnmute = () => {
      useCallStore.getState().setServerMuted(false);
    };
    const onVoiceForceDeafen = () => {
      useCallStore.getState().setServerDeafened(true);
      const c = useCallStore.getState().controls;
      if (c && !c.isDeafened) c.toggleDeafen();
    };
    const onVoiceForceUndeafen = () => {
      useCallStore.getState().setServerDeafened(false);
    };
    const onVoiceForceMove = ({ to_room_id }: { to_room_id: string }) => {
      if (!to_room_id) return;
      let title = "Голосовой канал";
      if (to_room_id.startsWith("channel:")) {
        const chId = to_room_id.slice("channel:".length);
        const { channels } = useServerStore.getState();
        for (const list of Object.values(channels)) {
          const match = (list as any[]).find((c) => c.id === chId);
          if (match) { title = `#${match.name}`; break; }
        }
      } else if (to_room_id.startsWith("dm:")) {
        title = "Звонок";
      }
      useCallStore.getState().startCall({ roomId: to_room_id, title });
    };
    const onDMUpdate = (dm: any) => {
      if (!dm?.id) return;
      qc.setQueryData(["dm", dm.id], dm);
      qc.invalidateQueries({ queryKey: ["dms"] });
    };
    const onDMMemberLeft = ({ dm_id, user_id, kicked }: { dm_id: string; user_id: string; kicked?: boolean }) => {
      const me = useAuthStore.getState().user;
      if (me?.id === user_id) {
        qc.invalidateQueries({ queryKey: ["dms"] });
        qc.removeQueries({ queryKey: ["dm", dm_id] });
        if (typeof window !== "undefined" && window.location.pathname === `/dms/${dm_id}`) {
          window.location.href = "/dms";
        }
        return;
      }
      qc.invalidateQueries({ queryKey: ["dm", dm_id] });
      qc.invalidateQueries({ queryKey: ["dms"] });
    };
    const onReady = (data: any) => {
      if (!data) return;
      useCallStore.getState().setServerMuted(!!data.server_muted);
      useCallStore.getState().setServerDeafened(!!data.server_deafened);
    };
    const onInteractionEphemeral = (data: { content?: string; embeds?: any[] }) => {
      if (!data) return;
      // Show as a transient toast — only the invoking user sees it.
      useEphemeralToastStore.getState().push({
        id: `${Date.now()}-${Math.random()}`,
        content: data.content ?? "",
      });
    };
    const onInteractionDeferred = (_data: any) => {
      // Could wire up a subtle "bot is thinking" indicator; no-op for now.
    };

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
    s.on("voice_user_state", onVoiceUserState);
    s.on("voice_room_joined", onVoiceRoomJoined);
    s.on("voice_peer_joined", onVoicePeerJoined);
    s.on("voice_peer_left", onVoicePeerLeft);
    s.on("friend_request", onFriendRequest);
    s.on("channel_create", onChannelCreate);
    s.on("channel_update", onChannelUpdate);
    s.on("channel_delete", onChannelDelete);
    s.on("channel_reorder", onChannelReorder);
    s.on("servers_reorder", onServersReorder);
    s.on("audit_log_create", onAuditLogCreate);
    s.on("member_banned", onMemberBanChange);
    s.on("member_unbanned", onMemberBanChange);
    s.on("role_create", onRoleChange);
    s.on("role_update", onRoleChange);
    s.on("role_delete", onRoleChange);
    s.on("roles_reorder", onRoleChange);
    s.on("channel_permissions_update", onChannelPermissionsUpdate);
    s.on("channel_permissions_delete", onChannelPermissionsUpdate);
    s.on("voice_force_move", onVoiceForceMove);
    s.on("voice_force_disconnect", onVoiceForceDisconnect);
    s.on("voice_force_mute", onVoiceForceMute);
    s.on("voice_force_unmute", onVoiceForceUnmute);
    s.on("voice_force_deafen", onVoiceForceDeafen);
    s.on("voice_force_undeafen", onVoiceForceUndeafen);
    s.on("dm_update", onDMUpdate);
    s.on("dm_member_left", onDMMemberLeft);
    s.on("ready", onReady);
    s.on("interaction_ephemeral", onInteractionEphemeral);
    s.on("interaction_deferred", onInteractionDeferred);

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
    s.off("interaction_ephemeral", onInteractionEphemeral);
    s.off("interaction_deferred", onInteractionDeferred);
      s.off("voice_snapshot", onVoiceSnapshot);
      s.off("voice_user_state", onVoiceUserState);
      s.off("voice_room_joined", onVoiceRoomJoined);
      s.off("voice_peer_joined", onVoicePeerJoined);
      s.off("voice_peer_left", onVoicePeerLeft);
      s.off("friend_request", onFriendRequest);
      s.off("channel_create", onChannelCreate);
      s.off("channel_update", onChannelUpdate);
      s.off("channel_delete", onChannelDelete);
      s.off("channel_reorder", onChannelReorder);
      s.off("servers_reorder", onServersReorder);
      s.off("audit_log_create", onAuditLogCreate);
      s.off("member_banned", onMemberBanChange);
      s.off("member_unbanned", onMemberBanChange);
      s.off("role_create", onRoleChange);
      s.off("role_update", onRoleChange);
      s.off("role_delete", onRoleChange);
      s.off("roles_reorder", onRoleChange);
      s.off("channel_permissions_update", onChannelPermissionsUpdate);
      s.off("channel_permissions_delete", onChannelPermissionsUpdate);
      s.off("voice_force_move", onVoiceForceMove);
      s.off("voice_force_disconnect", onVoiceForceDisconnect);
      s.off("voice_force_mute", onVoiceForceMute);
      s.off("voice_force_unmute", onVoiceForceUnmute);
      s.off("voice_force_deafen", onVoiceForceDeafen);
      s.off("voice_force_undeafen", onVoiceForceUndeafen);
      s.off("dm_update", onDMUpdate);
      s.off("dm_member_left", onDMMemberLeft);
      s.off("ready", onReady);
      bound.current = false;
    };
  }, [user]);
}
