"use client";
import { useQuery } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

export function useServerPermissions(serverId: string | null | undefined) {
  const { data: permissions = 0 } = useQuery({
    queryKey: ["my-permissions", serverId],
    queryFn: () => serversApi.myPermissions(serverId!),
    enabled: !!serverId,
    staleTime: 30_000,
  });

  const has = (key: PermissionKey) => (permissions & PERMISSIONS[key]) !== 0;

  return { permissions, has };
}
