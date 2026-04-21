import type { DirectMessage, UserPublic } from "@/types";

export function dmOthers(dm: DirectMessage, currentUserId: string | null): UserPublic[] {
  return dm.participants
    .filter((p) => p.user.id !== currentUserId)
    .map((p) => p.user);
}

export function dmTitle(dm: DirectMessage, currentUserId: string | null): string {
  if (dm.is_group) {
    if (dm.name && dm.name.trim()) return dm.name;
    const others = dmOthers(dm, currentUserId);
    if (others.length === 0) return "Группа";
    const names = others.map((u) => u.display_name ?? u.username);
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} и ещё ${names.length - 3}`;
  }
  const other = dmOthers(dm, currentUserId)[0] ?? dm.participants[0]?.user;
  return other?.display_name ?? other?.username ?? "Пользователь";
}

export function dmAvatarProps(dm: DirectMessage, currentUserId: string | null): {
  name: string;
  status?: UserPublic["status"];
  avatarUrl: string | null;
} {
  const other = dmOthers(dm, currentUserId)[0] ?? dm.participants[0]?.user;
  return {
    name: other?.username ?? "?",
    status: other?.status,
    avatarUrl: other?.avatar_url ?? null,
  };
}
