"use client";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { RoleAssignModal } from "@/components/modals/RoleAssignModal";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useServerRoles } from "@/hooks/useServerRoles";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { useIsMobile } from "@/hooks/useIsMobile";
import { serversApi, dmsApi } from "@/lib/api";
import type { ServerMember, UserPublic } from "@/types";

interface Props { serverId: string; }

export function MembersPanel({ serverId }: Props) {
  // Rendered always but hidden via CSS class on mobile — avoids hydration mismatch
  return (
    <div className="desktop-only" style={{ display: "flex", minHeight: 0 }}>
      <MembersPanelInner serverId={serverId} />
    </div>
  );
}

export function MembersPanelInner({ serverId }: Props) {
  const { setProfileUser } = useUIStore();
  const { user: me } = useAuthStore();
  const { members, rolesById, getHighestRole, getColor, getLabel } = useServerRoles(serverId);
  const { has } = useServerPermissions(serverId);
  const router = useRouter();
  const qc = useQueryClient();
  const [ctx, setCtx] = useState<{ x: number; y: number; user: UserPublic } | null>(null);
  const [roleModal, setRoleModal] = useState<UserPublic | null>(null);

  const kick = useMutation({
    mutationFn: (userId: string) => serversApi.kickMember(serverId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", serverId] }),
  });
  const ban = useMutation({
    mutationFn: (userId: string) => serversApi.banMember(serverId, userId, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", serverId] }),
  });
  const openDM = useMutation({
    mutationFn: async (userId: string) => {
      const dm = await dmsApi.create([userId]);
      return dm;
    },
    onSuccess: (dm) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      router.push(`/dms/${dm.id}`);
    },
  });

  const { hoistGroups, onlineOthers, offline } = useMemo(() => {
    const hoistMap = new Map<string, { roleName: string; color: string; position: number; members: ServerMember[] }>();
    const onlineOthers: ServerMember[] = [];
    const offline: ServerMember[] = [];

    for (const m of members) {
      if (m.user.status === "offline") { offline.push(m); continue; }
      const r = getHighestRole(m.user_id);
      if (r && r.hoist) {
        if (!hoistMap.has(r.id)) hoistMap.set(r.id, { roleName: r.name, color: r.color, position: r.position, members: [] });
        hoistMap.get(r.id)!.members.push(m);
      } else if (m.role === "owner" || m.role === "admin" || m.role === "moderator") {
        const label = m.role === "owner" ? "Владелец" : m.role === "admin" ? "Админы" : "Модераторы";
        const color = m.role === "owner" ? "#f5c842" : m.role === "admin" ? "#e05c7a" : "#5b8af0";
        const key = `__${m.role}`;
        if (!hoistMap.has(key)) hoistMap.set(key, { roleName: label, color, position: m.role === "owner" ? 1e9 : m.role === "admin" ? 1e8 : 1e7, members: [] });
        hoistMap.get(key)!.members.push(m);
      } else {
        onlineOthers.push(m);
      }
    }
    const hoistGroups = Array.from(hoistMap.values()).sort((a, b) => b.position - a.position);
    return { hoistGroups, onlineOthers, offline };
  }, [members, rolesById]);

  const buildMenu = (u: UserPublic): MenuItem[] => {
    const items: MenuItem[] = [
      { icon: "fa-user", label: "Профиль", onClick: () => setProfileUser(u) },
      { icon: "fa-paper-plane", label: "Личное сообщение", onClick: () => openDM.mutate(u.id) },
      { icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(u.id) },
    ];
    const isSelf = u.id === me?.id;
    if (!isSelf && (has("MANAGE_ROLES") || has("MANAGE_SERVER"))) {
      items.push({ separator: true, label: "" } as MenuItem);
      items.push({ icon: "fa-crown", label: "Управление ролями", onClick: () => setRoleModal(u) });
    }
    if (!isSelf && has("KICK_MEMBERS")) {
      items.push({ icon: "fa-user-minus", label: "Исключить", danger: true, onClick: () => {
        if (confirm(`Исключить ${u.display_name ?? u.username} с сервера?`)) kick.mutate(u.id);
      }});
    }
    if (!isSelf && has("BAN_MEMBERS")) {
      items.push({ icon: "fa-hammer", label: "Забанить", danger: true, onClick: () => {
        if (confirm(`Забанить ${u.display_name ?? u.username}?`)) ban.mutate(u.id);
      }});
    }
    return items;
  };

  const renderMember = (m: ServerMember) => {
    const color = getColor(m.user_id);
    const label = getLabel(m.user_id);
    const displayName = m.nickname || m.user.display_name || m.user.username;
    return (
      <div
        key={m.user.id}
        onClick={() => setProfileUser(m.user)}
        onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, user: m.user }); }}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Avatar name={m.user.username} size={32} status={m.user.status} shape="circle" avatarUrl={m.user.avatar_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: m.user.status === "offline" ? "var(--text-3)" : (color ?? "var(--text-0)"),
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </div>
          {m.user.custom_status && (
            <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.user.custom_status}
            </div>
          )}
        </div>
        {label && (
          <span style={{ fontSize: 10, fontFamily: "Geist Mono", color: color ?? "var(--accent)", background: `${color ?? "var(--accent)"}22`, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
            {label}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: 240, flexShrink: 0, background: "var(--bg-1)", borderLeft: "1px solid var(--line)", overflowY: "auto", padding: "12px 8px" }}>
      {hoistGroups.map((g) => (
        <div key={g.roleName}>
          <div style={{ fontSize: 11, fontWeight: 600, color: g.color, textTransform: "uppercase", letterSpacing: 0.6, padding: "10px 8px 4px" }}>
            {g.roleName} — {g.members.length}
          </div>
          {g.members.map(renderMember)}
        </div>
      ))}
      {onlineOthers.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "10px 8px 4px" }}>
            В сети — {onlineOthers.length}
          </div>
          {onlineOthers.map(renderMember)}
        </>
      )}
      {offline.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "16px 8px 4px" }}>
            Не в сети — {offline.length}
          </div>
          {offline.map(renderMember)}
        </>
      )}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={buildMenu(ctx.user)} onClose={() => setCtx(null)} />}
      {roleModal && <RoleAssignModal serverId={serverId} user={roleModal} onClose={() => setRoleModal(null)} />}
    </div>
  );
}
