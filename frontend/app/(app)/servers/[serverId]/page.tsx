"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { channelsApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { useUIStore } from "@/store/uiStore";
import type { Channel } from "@/types";

export default function ServerHome({ params }: { params: { serverId: string } }) {
  const { serverId } = params;
  const router = useRouter();
  const { setActiveServer, setChannels } = useServerStore();
  const { setMode } = useUIStore();

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["channels", serverId],
    queryFn: () => channelsApi.list(serverId),
    staleTime: 30_000,
  });

  useEffect(() => {
    setActiveServer(serverId);
    setMode("server");
  }, [serverId]);

  useEffect(() => {
    if (channels.length === 0) return;
    setChannels(serverId, channels);
    const first = channels.find((c) => c.type === "text") ?? channels[0];
    if (first) router.replace(`/servers/${serverId}/channels/${first.id}`);
  }, [channels, serverId]);

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
      {isLoading ? (
        <div style={{ fontSize: 13, color: "var(--text-2)", fontFamily: "Geist Mono" }}>загрузка каналов…</div>
      ) : channels.length === 0 ? (
        <>
          <i className="fa-solid fa-hashtag" style={{ fontSize: 36, color: "var(--text-3)" }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-0)" }}>На сервере пока нет каналов</div>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>Создайте канал через меню сервера</div>
        </>
      ) : null}
    </div>
  );
}
