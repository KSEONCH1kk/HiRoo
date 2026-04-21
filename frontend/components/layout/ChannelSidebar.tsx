"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { serversApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { useVoicePresenceStore } from "@/store/voicePresenceStore";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";
import { CreateChannelModal } from "@/components/modals/CreateChannelModal";
import { ChannelPermissionsModal } from "@/components/modals/ChannelPermissionsModal";
import { WebhooksModal } from "@/components/modals/WebhooksModal";
import { RoleAssignModal } from "@/components/modals/RoleAssignModal";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { useUIStore } from "@/store/uiStore";
import { useVoiceAdminStore } from "@/store/voiceAdminStore";
import { SearchBarButton } from "@/components/layout/SearchBarButton";
import { Avatar } from "@/components/ui/Avatar";
import type { Server, Channel } from "@/types";

interface Props {
  server: Server;
  channels: Channel[];
  activeChannelId: string | null;
  onPickChannel: (id: string) => void;
  onOpenVoice: (id: string) => void;
}

export function ChannelSidebar({ server, channels, activeChannelId, onPickChannel, onOpenVoice }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [createChannel, setCreateChannel] = useState<"text" | "voice" | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const { setServers, servers } = useServerStore();
  const { has } = useServerPermissions(server.id);
  const voicePresence = useVoicePresenceStore((s) => s.byRoom);
  const { membersById } = useServerRoles(server.id);
  const { user } = useAuthStore();
  const [dragOverChannel, setDragOverChannel] = useState<string | null>(null);
  const canMove = has("MOVE_MEMBERS") || has("MANAGE_SERVER");
  const [ctx, setCtx] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [voiceUserCtx, setVoiceUserCtx] = useState<{ x: number; y: number; userId: string; userInfo?: any; currentChannelId: string } | null>(null);
  const [permsModal, setPermsModal] = useState<Channel | null>(null);
  const [webhooksModal, setWebhooksModal] = useState<Channel | null>(null);
  const [voiceRoleModal, setVoiceRoleModal] = useState<any>(null);

  const kickMember = useMutation({
    mutationFn: (uid: string) => serversApi.kickMember(server.id, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", server.id] }),
  });
  const banMember = useMutation({
    mutationFn: (uid: string) => serversApi.banMember(server.id, uid, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", server.id] }),
  });

  const leave = useMutation({
    mutationFn: () => serversApi.leave(server.id),
    onSuccess: () => {
      setServers(servers.filter((s) => s.id !== server.id));
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      router.push("/friends");
    },
  });

  const regen = useMutation({
    mutationFn: () => serversApi.regenerateInvite(server.id),
    onSuccess: (res) => { (server as any).invite_code = res.invite_code; setMenuOpen(false); setShowInvite(true); },
  });

  const copyInvite = async () => {
    const link = `${window.location.origin}/invite/${server.invite_code}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      else {
        const ta = document.createElement("textarea");
        ta.value = link; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const text = channels.filter((c) => c.type === "text" || c.type === "announcement");
  const voice = channels.filter((c) => c.type === "voice");

  const renderGroup = (label: string, groupKey: "text" | "voice", chs: Channel[]) => (
    <div key={label} style={{ marginBottom: 4 }}>
      <div style={{ padding: "10px 6px 6px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-2)" }}>
        <div onClick={() => setCollapsed((s) => ({ ...s, [label]: !s[label] }))} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer", flex: 1 }}>
          <i className={`fa-solid fa-chevron-${collapsed[label] ? "right" : "down"}`} style={{ fontSize: 9, marginRight: 3 }} />
          {label}
        </div>
        {has("MANAGE_CHANNELS") && (
          <button
            onClick={() => setCreateChannel(groupKey)}
            title={`Создать ${groupKey === "voice" ? "голосовой" : "текстовый"} канал`}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 2, borderRadius: 4 }}
          >
            <i className="fa-solid fa-plus" style={{ fontSize: 12, opacity: 0.6 }} />
          </button>
        )}
      </div>
      {!collapsed[label] && chs.map((ch) => {
        const isActive = ch.id === activeChannelId;
        const isVoice = ch.type === "voice";
        const participants = isVoice ? (voicePresence[`channel:${ch.id}`] ?? []) : [];
        const Icon = () => isVoice
          ? <i className="fa-solid fa-volume-high" style={{ fontSize: 15 }} />
          : ch.is_private
          ? <i className="fa-solid fa-lock" style={{ fontSize: 15 }} />
          : <i className="fa-solid fa-hashtag" style={{ fontSize: 15 }} />;
        const channelDnD = isVoice && canMove
          ? {
              onDragOver: (e: React.DragEvent) => {
                if (!e.dataTransfer.types.includes("text/plain")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverChannel(ch.id);
              },
              onDragLeave: () => setDragOverChannel((v) => (v === ch.id ? null : v)),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                setDragOverChannel(null);
                const uid = e.dataTransfer.getData("text/plain");
                if (!uid) return;
                try {
                  getSocket().emit("voice_force_move", {
                    target_user_id: uid,
                    to_room_id: `channel:${ch.id}`,
                  });
                } catch {}
              },
            }
          : {};
        const showDrop = isVoice && canMove && dragOverChannel === ch.id;
        return (
          <div key={ch.id} {...channelDnD}
            style={{ borderRadius: 6, outline: showDrop ? "2px dashed var(--accent)" : "none", outlineOffset: -2, transition: "outline-color 120ms" }}
          >
            <div
              onClick={() => isVoice ? onOpenVoice(ch.id) : onPickChannel(ch.id)}
              onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, channel: ch }); }}
              style={{
              padding: "6px 8px", borderRadius: 6,
              display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
              background: isActive ? "var(--bg-active)" : "transparent",
              color: isActive ? "var(--text-0)" : "var(--text-2)",
              fontSize: 14, fontWeight: isActive ? 500 : 400,
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
              {isVoice && participants.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "Geist Mono" }}>{participants.length}</span>
              )}
            </div>
            {isVoice && participants.map((uid) => {
              const m = membersById.get(uid);
              const name = m?.nickname || m?.user.display_name || m?.user.username || uid.slice(0, 6);
              const isSelf = uid === user?.id;
              const dragProps = canMove && !isSelf
                ? {
                    draggable: true,
                    onDragStart: (e: React.DragEvent) => {
                      e.dataTransfer.setData("text/plain", uid);
                      e.dataTransfer.effectAllowed = "move";
                    },
                    title: "Перетащите в другой канал",
                  }
                : {};
              return (
                <div
                  key={uid}
                  {...dragProps}
                  onContextMenu={(e) => { e.preventDefault(); setVoiceUserCtx({ x: e.clientX, y: e.clientY, userId: uid, userInfo: m, currentChannelId: ch.id }); }}
                  style={{ padding: "3px 8px 3px 30px", display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-1)", cursor: canMove && !isSelf ? "grab" : "default" }}
                >
                  <Avatar name={m?.user.username ?? name} size={20} shape="circle" avatarUrl={m?.user.avatar_url ?? null} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const menuItem = (icon: string, label: string, onClick: () => void, danger = false) => (
    <div onClick={onClick} style={{
      padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderRadius: 6, margin: "0 4px",
      color: danger ? "var(--danger)" : "var(--text-1)", fontSize: 13.5,
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(255,80,80,0.1)" : "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
      <i className={`fa-solid ${icon}`} style={{ fontSize: 12, opacity: 0.8 }} />
    </div>
  );

  return (
    <div style={{
      width: 252, flexShrink: 0, background: "var(--bg-1)",
      borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden",
      position: "relative",
    }}>
      {/* Server header */}
      <div
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          height: 48, padding: "0 14px", borderBottom: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
          background: menuOpen ? "var(--bg-hover)" : "transparent",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server.name}</div>
        <i className={`fa-solid fa-${menuOpen ? "xmark" : "chevron-down"}`} style={{ fontSize: 13, color: "var(--text-2)" }} />
      </div>

      {/* Server dropdown menu */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{
            position: "absolute", top: 52, left: 6, right: 6, zIndex: 50,
            background: "var(--bg-2)", border: "1px solid var(--line-strong)",
            borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            padding: "6px 0", animation: "fadeIn 120ms ease-out",
          }}>
            {has("CREATE_INVITE") && menuItem("fa-user-plus", "Пригласить людей", () => { setMenuOpen(false); setShowInvite(true); })}
            {has("MANAGE_CHANNELS") && menuItem("fa-hashtag", "Создать канал", () => { setMenuOpen(false); setCreateChannel("text"); })}
            {has("MANAGE_CHANNELS") && menuItem("fa-volume-high", "Голосовой канал", () => { setMenuOpen(false); setCreateChannel("voice"); })}
            {(has("MANAGE_SERVER") || has("MANAGE_ROLES") || has("MANAGE_CHANNELS") || has("KICK_MEMBERS")) &&
              menuItem("fa-gear", "Настройки сервера", () => { setMenuOpen(false); router.push(`/servers/${server.id}/settings`); })}
            {has("MANAGE_SERVER") && menuItem("fa-rotate", "Новая ссылка-приглашение", () => regen.mutate())}
            <div style={{ height: 1, background: "var(--line)", margin: "6px 0" }} />
            {menuItem("fa-right-from-bracket", "Покинуть сервер", () => { if (confirm(`Покинуть «${server.name}»?`)) leave.mutate(); }, true)}
          </div>
        </>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 6px 14px" }}>
        {renderGroup("текстовые каналы", "text", text)}
        {renderGroup("голосовые", "voice", voice)}
      </div>

      <SearchBarButton />

      {createChannel && (
        <CreateChannelModal
          serverId={server.id}
          initialType={createChannel}
          onClose={() => setCreateChannel(null)}
        />
      )}

      {ctx && (() => {
        const items: MenuItem[] = [
          { icon: "fa-hashtag", label: "Открыть", onClick: () => ctx.channel.type === "voice" ? onOpenVoice(ctx.channel.id) : onPickChannel(ctx.channel.id) },
          { icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(ctx.channel.id) },
        ];
        if (has("MANAGE_ROLES") || has("MANAGE_SERVER")) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({ icon: "fa-shield-halved", label: "Расширенные права", onClick: () => setPermsModal(ctx.channel) });
        }
        if (has("MANAGE_CHANNELS")) {
          if (ctx.channel.type !== "voice") {
            items.push({ icon: "fa-plug", label: "Вебхуки", onClick: () => setWebhooksModal(ctx.channel) });
          }
          items.push({ icon: "fa-pen", label: "Редактировать канал", onClick: () => router.push(`/servers/${server.id}/settings/channels`) });
          items.push({ icon: "fa-trash", label: "Удалить канал", danger: true, onClick: () => router.push(`/servers/${server.id}/settings/channels`) });
        }
        return <ContextMenu x={ctx.x} y={ctx.y} items={items} onClose={() => setCtx(null)} />;
      })()}

      {permsModal && (
        <ChannelPermissionsModal
          server={{ id: server.id }}
          channel={permsModal}
          onClose={() => setPermsModal(null)}
        />
      )}

      {webhooksModal && (
        <WebhooksModal
          serverId={server.id}
          channel={webhooksModal}
          onClose={() => setWebhooksModal(null)}
        />
      )}

      {voiceUserCtx && (() => {
        const { userId, userInfo, currentChannelId } = voiceUserCtx;
        const isSelf = userId === user?.id;
        const u = userInfo?.user;
        const items: MenuItem[] = [];
        if (u) {
          items.push({ icon: "fa-user", label: "Профиль", onClick: () => useUIStore.getState().setProfileUser(u) });
        }
        items.push({ icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(userId) });

        if (!isSelf && canMove) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({
            icon: "fa-phone-slash", label: "Отключить от голосового", danger: true,
            onClick: () => { try { getSocket().emit("voice_force_disconnect", { target_user_id: userId }); } catch {} },
          });
          // Move-to destinations
          const voiceChannels = voice.filter((c) => c.id !== currentChannelId);
          for (const vc of voiceChannels) {
            items.push({
              icon: "fa-volume-high", label: `Перенести в #${vc.name}`,
              onClick: () => { try { getSocket().emit("voice_force_move", { target_user_id: userId, to_room_id: `channel:${vc.id}` }); } catch {} },
            });
          }
        }
        const adminState = useVoiceAdminStore.getState();
        const isMuted = !!adminState.muted[userId];
        const isDeafened = !!adminState.deafened[userId];
        if (!isSelf && has("MUTE_MEMBERS")) {
          items.push({
            icon: isMuted ? "fa-microphone" : "fa-microphone-slash",
            label: isMuted ? "Разглушить микрофон" : "Заглушить микрофон",
            onClick: () => {
              try { getSocket().emit(isMuted ? "voice_force_unmute" : "voice_force_mute", { target_user_id: userId }); } catch {}
            },
          });
        }
        if (!isSelf && has("DEAFEN_MEMBERS")) {
          items.push({
            icon: isDeafened ? "fa-volume-high" : "fa-volume-xmark",
            label: isDeafened ? "Вернуть звук" : "Отключить звук",
            onClick: () => {
              try { getSocket().emit(isDeafened ? "voice_force_undeafen" : "voice_force_deafen", { target_user_id: userId }); } catch {}
            },
          });
        }
        if (!isSelf && (has("MANAGE_ROLES") || has("MANAGE_SERVER")) && u) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({ icon: "fa-crown", label: "Управление ролями", onClick: () => setVoiceRoleModal(u) });
        }
        if (!isSelf && has("KICK_MEMBERS")) {
          items.push({ icon: "fa-user-minus", label: "Исключить с сервера", danger: true,
            onClick: () => { if (confirm("Исключить участника?")) kickMember.mutate(userId); } });
        }
        if (!isSelf && has("BAN_MEMBERS")) {
          items.push({ icon: "fa-hammer", label: "Забанить", danger: true,
            onClick: () => { if (confirm("Забанить участника?")) banMember.mutate(userId); } });
        }
        return <ContextMenu x={voiceUserCtx.x} y={voiceUserCtx.y} items={items} onClose={() => setVoiceUserCtx(null)} />;
      })()}

      {voiceRoleModal && (
        <RoleAssignModal
          serverId={server.id}
          user={voiceRoleModal}
          onClose={() => setVoiceRoleModal(null)}
        />
      )}

      {showInvite && (
        <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 4 }}>Пригласить на «{server.name}»</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>Отправьте эту ссылку друзьям</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${server.invite_code}`}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 13, fontFamily: "Geist Mono", outline: "none" }}
              />
              <button onClick={copyInvite} style={{ padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
