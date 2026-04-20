"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useServerStore } from "@/store/serverStore";
import { useUIStore } from "@/store/uiStore";

export default function AppHome() {
  const router = useRouter();
  const { activeServerId, activeChannelId } = useServerStore();
  const { setMode } = useUIStore();

  useEffect(() => {
    if (activeServerId && activeChannelId) {
      router.replace(`/servers/${activeServerId}/channels/${activeChannelId}`);
    } else {
      setMode("friends");
      router.replace("/friends");
    }
  }, []);

  return null;
}
