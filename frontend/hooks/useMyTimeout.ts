"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { ServerMember } from "@/types";

/** Returns the current user's active timeout expiry for a given server,
 * or null if none/expired. Ticks every second so the UI countdown stays
 * accurate without needing a fresh server fetch. */
export function useMyTimeout(serverId: string | undefined | null): Date | null {
  const { user } = useAuthStore();
  const { data: members = [] } = useQuery<ServerMember[]>({
    queryKey: ["members", serverId],
    queryFn: () => serversApi.listMembers(serverId!),
    enabled: !!serverId && !!user,
    staleTime: 30_000,
  });
  const me = members.find((m) => m.user_id === user?.id);
  const rawUntil = me?.timeout_until ? new Date(me.timeout_until) : null;

  const [, tick] = useState(0);
  useEffect(() => {
    if (!rawUntil) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [rawUntil?.getTime()]);

  if (!rawUntil) return null;
  return rawUntil.getTime() > Date.now() ? rawUntil : null;
}

export function formatRemaining(until: Date): string {
  const sec = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 1000));
  if (sec < 60) return `${sec}с`;
  if (sec < 3600) return `${Math.ceil(sec / 60)}м`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m ? `${h}ч ${m}м` : `${h}ч`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return h ? `${d}д ${h}ч` : `${d}д`;
}
