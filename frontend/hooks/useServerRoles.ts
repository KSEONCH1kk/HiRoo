"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { rolesApi, serversApi, type Role } from "@/lib/api";
import type { ServerMember } from "@/types";

export function useServerRoles(serverId: string | null | undefined) {
  const { data: members = [] } = useQuery<ServerMember[]>({
    queryKey: ["members", serverId],
    queryFn: () => serversApi.listMembers(serverId!),
    enabled: !!serverId,
    staleTime: 30_000,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles", serverId],
    queryFn: () => rolesApi.list(serverId!),
    enabled: !!serverId,
    staleTime: 60_000,
  });

  const membersById = useMemo(() => {
    const m = new Map<string, ServerMember>();
    for (const x of members) m.set(x.user_id, x);
    return m;
  }, [members]);

  const rolesById = useMemo(() => {
    const m = new Map<string, Role>();
    for (const r of roles) m.set(r.id, r);
    return m;
  }, [roles]);

  const getHighestRole = (userId: string): Role | null => {
    const member = membersById.get(userId);
    if (!member) return null;
    const userRoles = (member.role_ids ?? [])
      .map((id) => rolesById.get(id))
      .filter((r): r is Role => !!r && !r.is_everyone);
    if (userRoles.length === 0) return null;
    return userRoles.sort((a, b) => b.position - a.position)[0];
  };

  const getColor = (userId: string): string | null => {
    const member = membersById.get(userId);
    if (member?.role === "owner") return "#f5c842";
    if (member?.role === "admin") return "#e05c7a";
    if (member?.role === "moderator") return "#5b8af0";
    const r = getHighestRole(userId);
    return r?.color ?? null;
  };

  const getLabel = (userId: string): string | null => {
    const member = membersById.get(userId);
    if (member?.role === "owner") return "Владелец";
    if (member?.role === "admin") return "Админ";
    if (member?.role === "moderator") return "Модератор";
    const r = getHighestRole(userId);
    return r?.name ?? null;
  };

  return { members, roles, membersById, rolesById, getHighestRole, getColor, getLabel };
}
