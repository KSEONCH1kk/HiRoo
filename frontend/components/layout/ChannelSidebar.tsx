"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { serversApi, channelsApi } from "@/lib/api";
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
import { TimeoutModal } from "@/components/modals/TimeoutModal";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { VoiceParticipantMenu } from "@/components/voice/VoiceParticipantMenu";
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
  onPickForum?: (id: string) => void;
}

export function ChannelSidebar({ server, channels, activeChannelId, onPickChannel, onOpenVoice, onPickForum }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [createChannel, setCreateChannel] = useState<"text" | "voice" | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const { setServers, servers, setChannels } = useServerStore();
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
  const [timeoutModalUser, setTimeoutModalUser] = useState<{ id: string; name?: string } | null>(null);

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

  // ── Dynamic categorised rendering ──────────────────────────────
  // Items with parent_id = null are top-level. Categories ordered by
  // position. Their children are looked up via parent_id.
  const byId = new Map(channels.map((c) => [c.id, c]));
  const sorted = [...channels].sort((a, b) => a.position - b.position);
  const topLevel = sorted.filter((c) => !c.parent_id);
  const byParent = new Map<string, Channel[]>();
  for (const c of sorted) {
    if (c.parent_id) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
  }
  const [categoryCtx, setCategoryCtx] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [emptyCtx, setEmptyCtx] = useState<{ x: number; y: number; parentId: string | null } | null>(null);
  const [createType, setCreateType] = useState<"text" | "voice" | "category" | "forum" | null>(null);
  const [createParent, setCreateParent] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; pos: "before" | "after" | "into" } | null>(null);

  const reorder = useMutation({
    mutationFn: (items: { id: string; position: number; parent_id: string | null }[]) => {
      // Optimistic local update — the sender sees the new order immediately
      // even before the server + WS broadcast round-trip completes.
      useServerStore.getState().reorderChannels(server.id, items);
      return channelsApi.reorder(server.id, items);
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["channels", server.id] });
      // Re-pull canonical order (positions may have been re-numbered).
      try {
        const fresh = await channelsApi.list(server.id);
        setChannels(server.id, fresh);
      } catch {}
    },
    onError: async () => {
      // Roll back to server state if the reorder was rejected.
      try {
        const fresh = await channelsApi.list(server.id);
        setChannels(server.id, fresh);
      } catch {}
    },
  });

  function handleDrop(sourceId: string, targetId: string | null, pos: "before" | "after" | "into") {
    const src = byId.get(sourceId);
    if (!src) return;
    const items: { id: string; position: number; parent_id: string | null }[] = [];
    if (pos === "into") {
      const target = targetId ? byId.get(targetId) : null;
      if (!target || target.type !== "category" || src.type === "category") return;
      // Already a direct child of this category → no-op. Otherwise every
      // "into" drop on the same category would re-sort siblings needlessly.
      if ((src.parent_id ?? null) === target.id) return;
      const siblings = (byParent.get(target.id) ?? []).filter((c) => c.id !== sourceId);
      items.push({ id: sourceId, position: siblings.length, parent_id: target.id });
    } else if (targetId === null) {
      // Explicit detach: dropping on the top-level "no category" zone.
      // If src is already at top-level, skip to avoid re-numbering.
      if ((src.parent_id ?? null) === null) return;
      // Use max(currentTopPos)+1 so positions don't clash with any
      // existing top-level item.
      const maxTop = topLevel
        .filter((c) => c.id !== sourceId)
        .reduce((m, c) => Math.max(m, c.position), -1);
      items.push({ id: sourceId, position: maxTop + 1, parent_id: null });
    } else {
      let target = byId.get(targetId);
      if (!target) return;
      // Categories can only live at top-level. If the user dropped a
      // category NEAR a channel inside another category, snap the drop
      // onto the parent category instead.
      if (src.type === "category" && target.parent_id) {
        const parent = byId.get(target.parent_id);
        if (!parent) return;
        // If the "parent" IS the dragged category (user dropped onto one
        // of its own children), abort — there's no sensible action.
        if (parent.id === src.id) return;
        target = parent;
      }
      // Also abort a plain drop where src === target (drops exactly on
      // itself, e.g. from a stale drop target).
      if (target.id === src.id) return;
      const newParent = target.parent_id ?? null;
      const siblings = (newParent ? byParent.get(newParent) ?? [] : topLevel)
        .filter((c) => c.id !== sourceId);
      let insertIdx = siblings.findIndex((c) => c.id === target!.id);
      if (insertIdx < 0) insertIdx = siblings.length;
      if (pos === "after") insertIdx += 1;
      siblings.splice(insertIdx, 0, src);
      siblings.forEach((c, i) => {
        items.push({ id: c.id, position: i, parent_id: newParent });
      });
    }
    if (items.length) reorder.mutate(items);
  }

  const startCreate = (type: "text" | "voice" | "category" | "forum", parent: string | null = null) => {
    setCreateParent(parent);
    setCreateType(type);
  };

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

      <div
        style={{ flex: 1, overflowY: "auto", padding: "10px 6px 14px" }}
        onContextMenu={(e) => {
          // Right-click on blank space inside the sidebar → create menu.
          if ((e.target as HTMLElement).closest("[data-ch-item]")) return;
          if (!has("MANAGE_CHANNELS")) return;
          e.preventDefault();
          setEmptyCtx({ x: e.clientX, y: e.clientY, parentId: null });
        }}
        onDrop={(e) => {
          // Drop on blank space → detach from category.
          const src = e.dataTransfer.getData("hiroo/channel");
          if (!src || !has("MANAGE_CHANNELS")) return;
          e.preventDefault();
          setDragId(null);
          setDropTarget(null);
          handleDrop(src, null, "after");
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("hiroo/channel")) e.preventDefault();
        }}
      >
        {topLevel.map((item) => (
          <SidebarItem
            key={item.id}
            channel={item}
            children={byParent.get(item.id) ?? []}
            activeChannelId={activeChannelId}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            voicePresence={voicePresence}
            membersById={membersById}
            user={user}
            canMove={canMove}
            canManage={has("MANAGE_CHANNELS")}
            onPickChannel={onPickChannel}
            onOpenVoice={onOpenVoice}
            onPickForum={onPickForum}
            onCtx={(x, y, ch) => ch.type === "category"
              ? setCategoryCtx({ x, y, channel: ch })
              : setCtx({ x, y, channel: ch })
            }
            onVoiceUserCtx={(x, y, uid, m, cid) =>
              setVoiceUserCtx({ x, y, userId: uid, userInfo: m, currentChannelId: cid })
            }
            onCreateInCategory={(type, parent) => startCreate(type, parent)}
            dragId={dragId}
            setDragId={setDragId}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            onDrop={handleDrop}
            router={router}
            serverId={server.id}
          />
        ))}
        {/* Persistent detach-from-category drop zone. Kept mounted so the
            drag target doesn't disappear/appear mid-drag (browsers can
            lose the dragover target if the DOM changes during a drag).
            Only rendered when the viewer can actually manage channels. */}
        {has("MANAGE_CHANNELS") && (
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("hiroo/channel")) return;
              e.preventDefault();
              e.stopPropagation();
              setDropTarget({ id: null, pos: "after" });
            }}
            onDragLeave={(ev) => {
              // Only clear when leaving the zone's bounds (avoid flicker).
              const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
              const inside = ev.clientX >= r.left && ev.clientX <= r.right
                && ev.clientY >= r.top && ev.clientY <= r.bottom;
              if (!inside) setDropTarget((t) => (t?.id === null ? null : t));
            }}
            onDrop={(e) => {
              const src = e.dataTransfer.getData("hiroo/channel");
              e.preventDefault();
              e.stopPropagation();
              setDragId(null);
              setDropTarget(null);
              if (src) handleDrop(src, null, "after");
            }}
            style={{
              // When no drag is active the zone collapses to 0-height and
              // becomes invisible+non-interactive — but stays mounted so a
              // freshly-started drag doesn't lose its drop target to a DOM
              // mutation mid-drag.
              marginTop: dragId ? 12 : 0,
              padding: dragId ? "18px 10px" : 0,
              maxHeight: dragId ? 80 : 0,
              overflow: "hidden",
              opacity: dragId ? 1 : 0,
              pointerEvents: dragId ? "auto" : "none",
              borderRadius: 8,
              border: `2px dashed ${dropTarget?.id === null ? "var(--accent)" : "var(--line)"}`,
              background: dropTarget?.id === null ? "rgba(124,92,255,0.15)" : "transparent",
              color: dropTarget?.id === null ? "var(--accent)" : "var(--text-3)",
              fontSize: 11, fontWeight: 600,
              textAlign: "center", letterSpacing: 0.3,
              textTransform: "uppercase",
              transition: "all 140ms",
            }}
          >
            <i className="fa-solid fa-arrow-up-from-bracket" style={{ marginRight: 6 }} />
            Вынести за пределы категории
          </div>
        )}
      </div>

      <SearchBarButton />

      {createChannel && (
        <CreateChannelModal
          serverId={server.id}
          initialType={createChannel}
          onClose={() => setCreateChannel(null)}
        />
      )}

      {createType && (
        <CreateChannelModal
          serverId={server.id}
          initialType={createType}
          parentId={createParent}
          onClose={() => { setCreateType(null); setCreateParent(null); }}
        />
      )}

      {categoryCtx && (() => {
        const cat = categoryCtx.channel;
        const items: MenuItem[] = [
          { icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(cat.id) },
        ];
        if (has("MANAGE_CHANNELS")) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({ icon: "fa-hashtag", label: "Создать текстовый канал", onClick: () => startCreate("text", cat.id) });
          items.push({ icon: "fa-volume-high", label: "Голосовой канал", onClick: () => startCreate("voice", cat.id) });
          items.push({ icon: "fa-comments", label: "Форум", onClick: () => startCreate("forum", cat.id) });
        }
        if (has("MANAGE_ROLES") || has("MANAGE_SERVER")) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({ icon: "fa-shield-halved", label: "Права доступа", onClick: () => setPermsModal(cat) });
        }
        if (has("MANAGE_CHANNELS")) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({
            icon: "fa-trash", label: "Удалить категорию", danger: true,
            onClick: async () => {
              if (!confirm(`Удалить категорию «${cat.name}»? Каналы внутри сохранятся.`)) return;
              try { await channelsApi.delete(server.id, cat.id); qc.invalidateQueries({ queryKey: ["channels", server.id] }); } catch {}
            },
          });
        }
        return <ContextMenu x={categoryCtx.x} y={categoryCtx.y} items={items} onClose={() => setCategoryCtx(null)} />;
      })()}

      {emptyCtx && (() => {
        const items: MenuItem[] = [];
        items.push({ icon: "fa-layer-group", label: "Создать категорию", onClick: () => startCreate("category", null) });
        items.push({ icon: "fa-hashtag", label: "Текстовый канал", onClick: () => startCreate("text", emptyCtx.parentId) });
        items.push({ icon: "fa-volume-high", label: "Голосовой канал", onClick: () => startCreate("voice", emptyCtx.parentId) });
        items.push({ icon: "fa-comments", label: "Форум", onClick: () => startCreate("forum", emptyCtx.parentId) });
        return <ContextMenu x={emptyCtx.x} y={emptyCtx.y} items={items} onClose={() => setEmptyCtx(null)} />;
      })()}

      {ctx && (() => {
        const iconName = ctx.channel.type === "voice" ? "fa-volume-high"
          : ctx.channel.type === "forum" ? "fa-comments" : "fa-hashtag";
        const items: MenuItem[] = [
          { icon: iconName, label: "Открыть", onClick: () => ctx.channel.type === "voice" ? onOpenVoice(ctx.channel.id) : onPickChannel(ctx.channel.id) },
          { icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(ctx.channel.id) },
        ];
        if (has("MANAGE_ROLES") || has("MANAGE_SERVER")) {
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({ icon: "fa-shield-halved", label: "Права доступа", onClick: () => setPermsModal(ctx.channel) });
        }
        if (has("MANAGE_CHANNELS")) {
          if (ctx.channel.type !== "voice") {
            items.push({ icon: "fa-plug", label: "Вебхуки", onClick: () => setWebhooksModal(ctx.channel) });
          }
          items.push({ separator: true, label: "" } as MenuItem);
          items.push({
            icon: "fa-pen", label: "Переименовать канал",
            onClick: async () => {
              const name = prompt("Новое название канала", ctx.channel.name);
              if (!name || name.trim() === ctx.channel.name) return;
              try { await channelsApi.update(server.id, ctx.channel.id, { name: name.trim() }); qc.invalidateQueries({ queryKey: ["channels", server.id] }); } catch {}
            },
          });
          items.push({
            icon: "fa-trash", label: "Удалить канал", danger: true,
            onClick: async () => {
              if (!confirm(`Удалить канал «${ctx.channel.name}»?`)) return;
              try { await channelsApi.delete(server.id, ctx.channel.id); qc.invalidateQueries({ queryKey: ["channels", server.id] }); } catch {}
            },
          });
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
        if (!isSelf && has("MODERATE_MEMBERS")) {
          // Always read the freshest member record from the live members
          // Map — voiceUserCtx.userInfo is a snapshot captured on right-click
          // and can be stale after a timeout is applied/cleared.
          const liveMember = membersById.get(userId) ?? userInfo;
          const isTimedOut = !!(liveMember?.timeout_until
            && new Date(liveMember.timeout_until).getTime() > Date.now());
          if (isTimedOut) {
            items.push({
              icon: "fa-hourglass-end", label: "Отменить тайм-аут",
              onClick: async () => {
                try { await serversApi.clearTimeout(server.id, userId); qc.invalidateQueries({ queryKey: ["members", server.id] }); } catch {}
              },
            });
          } else {
            const displayName = liveMember?.nickname || u?.display_name || u?.username;
            items.push({
              icon: "fa-hourglass-half", label: "Тайм-аут…",
              onClick: () => setTimeoutModalUser({ id: userId, name: displayName }),
            });
          }
        }
        if (!isSelf && has("KICK_MEMBERS")) {
          items.push({ icon: "fa-user-minus", label: "Исключить с сервера", danger: true,
            onClick: () => { if (confirm("Исключить участника?")) kickMember.mutate(userId); } });
        }
        if (!isSelf && has("BAN_MEMBERS")) {
          items.push({ icon: "fa-hammer", label: "Забанить", danger: true,
            onClick: () => { if (confirm("Забанить участника?")) banMember.mutate(userId); } });
        }
        const name = userInfo?.nickname || u?.display_name || u?.username;
        if (isSelf) {
          // Own tile — keep the simple menu (no volume slider for yourself).
          return <ContextMenu x={voiceUserCtx.x} y={voiceUserCtx.y} items={items} onClose={() => setVoiceUserCtx(null)} />;
        }
        return (
          <VoiceParticipantMenu
            x={voiceUserCtx.x}
            y={voiceUserCtx.y}
            userId={userId}
            displayName={name}
            extraItems={items}
            onClose={() => setVoiceUserCtx(null)}
          />
        );
      })()}

      {voiceRoleModal && (
        <RoleAssignModal
          serverId={server.id}
          user={voiceRoleModal}
          onClose={() => setVoiceRoleModal(null)}
        />
      )}

      {timeoutModalUser && (
        <TimeoutModal
          serverId={server.id}
          userId={timeoutModalUser.id}
          displayName={timeoutModalUser.name}
          onClose={() => setTimeoutModalUser(null)}
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

// ── Sidebar item renderer (category + channel, both draggable) ─────────

interface SidebarItemProps {
  channel: Channel;
  children: Channel[];
  activeChannelId: string | null;
  collapsed: Record<string, boolean>;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  voicePresence: Record<string, string[]>;
  membersById: Map<string, any>;
  user: any;
  canMove: boolean;
  canManage: boolean;
  onPickChannel: (id: string) => void;
  onOpenVoice: (id: string) => void;
  onPickForum?: (id: string) => void;
  onCtx: (x: number, y: number, ch: Channel) => void;
  onVoiceUserCtx: (x: number, y: number, uid: string, m: any, cid: string) => void;
  onCreateInCategory: (type: "text" | "voice" | "forum", parentId: string) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  dropTarget: { id: string | null; pos: "before" | "after" | "into" } | null;
  setDropTarget: (t: { id: string | null; pos: "before" | "after" | "into" } | null) => void;
  onDrop: (src: string, target: string | null, pos: "before" | "after" | "into") => void;
  router: any;
  serverId: string;
}

function SidebarItem(props: SidebarItemProps) {
  const { channel: ch, children, canManage, onCreateInCategory } = props;
  const isCategory = ch.type === "category";
  const isVoice = ch.type === "voice";
  const isForum = ch.type === "forum";
  const isText = ch.type === "text" || ch.type === "announcement";

  if (isCategory) {
    const isCollapsed = !!props.collapsed[`cat:${ch.id}`];
    const hl = props.dropTarget?.id === ch.id ? props.dropTarget.pos : null;
    return (
      <div
        data-ch-item
        draggable={canManage}
        onDragStart={(e) => {
          // If the drag was started on a nested child row, its own
          // dragstart already fired — don't let this one overwrite the
          // dataTransfer payload via bubbling.
          if ((e.target as HTMLElement) !== e.currentTarget
              && (e.target as HTMLElement).closest("[data-ch-item]") !== e.currentTarget) {
            return;
          }
          if (!canManage) return;
          e.dataTransfer.setData("hiroo/channel", ch.id);
          e.dataTransfer.effectAllowed = "move";
          props.setDragId(ch.id);
        }}
        onDragEnd={() => { props.setDragId(null); props.setDropTarget(null); }}
        onDragOver={(e) => {
          // Fires only on gaps/header within the category — child items call
          // stopPropagation so they override this when hovered directly.
          if (!e.dataTransfer.types.includes("hiroo/channel")) return;
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - r.top;
          // Top edge strip (~header area) → before. Bottom thin strip → after.
          // Everything else → "into" (child area).
          if (y < 14) props.setDropTarget({ id: ch.id, pos: "before" });
          else if (y > r.height - 6) props.setDropTarget({ id: ch.id, pos: "after" });
          else props.setDropTarget({ id: ch.id, pos: "into" });
        }}
        onDragLeave={(e) => {
          // Only clear when leaving the whole category, not when crossing
          // between its children.
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const inside =
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom;
          if (!inside && props.dropTarget?.id === ch.id) props.setDropTarget(null);
        }}
        onDrop={(e) => {
          const src = e.dataTransfer.getData("hiroo/channel");
          e.preventDefault();
          const pos = props.dropTarget?.id === ch.id ? props.dropTarget.pos : "into";
          props.setDropTarget(null);
          if (src && src !== ch.id) props.onDrop(src, ch.id, pos);
        }}
        style={{
          position: "relative", marginBottom: 2,
          background: hl === "into" ? "rgba(124,92,255,0.06)" : "transparent",
          borderRadius: 8,
        }}
      >
        {hl === "before" && <DropLine />}
        <div
          onClick={() => props.setCollapsed((s) => ({ ...s, [`cat:${ch.id}`]: !s[`cat:${ch.id}`] }))}
          onContextMenu={(e) => { e.preventDefault(); props.onCtx(e.clientX, e.clientY, ch); }}
          style={{
            padding: "10px 6px 6px 4px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            color: "var(--text-2)", cursor: "pointer",
            borderRadius: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, flex: 1, minWidth: 0 }}>
            <i className={`fa-solid fa-chevron-${isCollapsed ? "right" : "down"}`} style={{ fontSize: 9, marginRight: 3 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
          </div>
          {canManage && (
            <button
              onClick={(e) => { e.stopPropagation(); onCreateInCategory("text", ch.id); }}
              title="Создать канал в этой категории"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 2 }}
            >
              <i className="fa-solid fa-plus" style={{ fontSize: 12, opacity: 0.6 }} />
            </button>
          )}
        </div>
        {!isCollapsed && children.map((c) => (
          <SidebarItem key={c.id} {...props} channel={c} children={[]} />
        ))}
        {hl === "after" && <DropLine />}
      </div>
    );
  }

  // Channel row (text / voice / forum)
  const isActive = ch.id === props.activeChannelId;
  const participants = isVoice ? (props.voicePresence[`channel:${ch.id}`] ?? []) : [];
  const Icon = () => isVoice
    ? <i className="fa-solid fa-volume-high" style={{ fontSize: 15 }} />
    : isForum
    ? <i className="fa-solid fa-comments" style={{ fontSize: 15 }} />
    : ch.is_private
    ? <i className="fa-solid fa-lock" style={{ fontSize: 15 }} />
    : <i className="fa-solid fa-hashtag" style={{ fontSize: 15 }} />;
  const hl = props.dropTarget?.id === ch.id ? props.dropTarget.pos : null;

  return (
    <div
      data-ch-item
      draggable={canManage}
      onDragStart={(e) => {
        if (!canManage) return;
        e.dataTransfer.setData("hiroo/channel", ch.id);
        e.dataTransfer.effectAllowed = "move";
        props.setDragId(ch.id);
      }}
      onDragEnd={() => { props.setDragId(null); props.setDropTarget(null); }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("hiroo/channel")) return;
        e.preventDefault();
        e.stopPropagation();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - r.top;
        props.setDropTarget({ id: ch.id, pos: y < r.height / 2 ? "before" : "after" });
      }}
      onDragLeave={() => props.setDropTarget(props.dropTarget?.id === ch.id ? null : props.dropTarget)}
      onDrop={(e) => {
        const src = e.dataTransfer.getData("hiroo/channel");
        e.preventDefault();
        e.stopPropagation();
        const pos = props.dropTarget?.id === ch.id ? props.dropTarget.pos : "after";
        props.setDropTarget(null);
        if (src && src !== ch.id) props.onDrop(src, ch.id, pos as any);
      }}
      style={{ position: "relative" }}
    >
      {hl === "before" && <DropLine />}
      <div
        onClick={() => {
          if (isVoice) props.onOpenVoice(ch.id);
          else if (isForum) {
            if (props.onPickForum) props.onPickForum(ch.id);
            else props.router.push(`/servers/${props.serverId}/forum/${ch.id}`);
          }
          else props.onPickChannel(ch.id);
        }}
        onContextMenu={(e) => { e.preventDefault(); props.onCtx(e.clientX, e.clientY, ch); }}
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
        const m = props.membersById.get(uid);
        const name = m?.nickname || m?.user.display_name || m?.user.username || uid.slice(0, 6);
        return (
          <div
            key={uid}
            onContextMenu={(e) => { e.preventDefault(); props.onVoiceUserCtx(e.clientX, e.clientY, uid, m, ch.id); }}
            style={{ padding: "3px 8px 3px 30px", display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-1)" }}
          >
            <Avatar name={m?.user.username ?? name} size={20} shape="circle" avatarUrl={m?.user.avatar_url ?? null} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          </div>
        );
      })}
      {hl === "after" && <DropLine />}
    </div>
  );
}

function DropLine() {
  return (
    <div style={{
      position: "absolute", left: 2, right: 2, height: 0,
      borderTop: "2px solid var(--accent)", pointerEvents: "none",
      zIndex: 5,
    }} />
  );
}
