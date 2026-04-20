"use client";
import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useServerStore } from "@/store/serverStore";
import { useSocket } from "@/hooks/useSocket";
import { serversApi, channelsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ServerRail } from "@/components/layout/ServerRail";
import { ChannelSidebar } from "@/components/layout/ChannelSidebar";
import { UserTray } from "@/components/layout/UserTray";
import { IncomingCall } from "@/components/modals/IncomingCall";
import { CommandPalette } from "@/components/modals/CommandPalette";
import { ProfilePopout } from "@/components/modals/ProfilePopout";
import { VoiceCall } from "@/components/voice/VoiceCall";
import { useCallStore } from "@/store/callStore";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { mode, setMode, cmdOpen, setCmdOpen } = useUIStore();
  const { active: activeCall, endCall, setMaximized } = useCallStore();
  const { servers, setServers, channels, setChannels, activeServerId, setActiveServer, activeChannelId, setActiveChannel } = useServerStore();
  const inVoice = !!activeCall;
  const [isMuted, setMuted] = useState(false);
  const [isDeafened, setDeafened] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useSocket();

  // Keep mode in sync with URL so sidebars render correctly
  const lastPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/servers/")) setMode("server");
    else if (pathname.startsWith("/dms")) setMode("dms");
    else if (pathname.startsWith("/friends")) setMode("friends");
    else if (pathname.startsWith("/inbox")) setMode("inbox");
    else if (pathname.startsWith("/settings")) setMode("settings");
    else if (pathname.startsWith("/explore")) setMode("explore");
    // Collapse the call when user navigates (but not on initial mount)
    if (lastPathRef.current !== null && lastPathRef.current !== pathname) {
      setMaximized(false);
    }
    lastPathRef.current = pathname;
  }, [pathname]);

  // Load servers from backend
  const { data: fetchedServers } = useQuery({
    queryKey: ["my-servers"],
    queryFn: serversApi.list,
    enabled: !!user,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (fetchedServers) setServers(fetchedServers);
  }, [fetchedServers]);

  // Load channels when active server changes
  useEffect(() => {
    if (!activeServerId) return;
    channelsApi.list(activeServerId).then((chs) => {
      setChannels(activeServerId, chs);
      if (!activeChannelId) {
        const first = chs.find((c) => c.type === "text");
        if (first) setActiveChannel(first.id);
      }
    });
  }, [activeServerId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(!cmdOpen); }
      if (e.key === "Escape") { setCmdOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cmdOpen]);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const activeChannels = activeServerId ? (channels[activeServerId] ?? []) : [];

  const handlePickServer = useCallback((id: string) => {
    setActiveServer(id);
    setMode("server");
    router.push(`/servers/${id}`);
  }, []);

  const handlePickMode = useCallback((m: string) => {
    setMode(m as any);
    if (m === "friends") router.push("/friends");
    else if (m === "inbox") router.push("/inbox");
    else if (m === "dms") router.push("/dms");
    else if (m === "explore") router.push("/explore");
  }, []);

  const handleOpenVoice = useCallback((channelId: string) => {
    setActiveChannel(channelId);
    const ch = (channels[activeServerId ?? ""] ?? []).find((c) => c.id === channelId);
    useCallStore.getState().startCall({
      roomId: `channel:${channelId}`,
      title: ch?.name ? `#${ch.name}` : "Голосовой канал",
    });
  }, [activeServerId, channels]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-0)" }}>
      {/* Mac-style title bar */}
      <div style={{ height: 28, flexShrink: 0, background: "var(--bg-0)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", userSelect: "none" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", letterSpacing: 0.3 }}>HiRoo</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>hiroo · 1.0.0</div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left column: rail + user tray */}
        <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-0)", width: 72, flexShrink: 0 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ServerRail
              servers={servers}
              activeServerId={activeServerId}
              activeMode={mode}
              onPickServer={handlePickServer}
              onPickMode={handlePickMode}
            />
          </div>
          {user && (
            <UserTray
              me={user}
              isMuted={isMuted} setMuted={setMuted}
              isDeafened={isDeafened} setDeafened={setDeafened}
              onSettings={() => { setMode("settings"); router.push("/settings"); }}
              inVoice={inVoice}
              onHangup={() => endCall()}
            />
          )}
        </div>

        {/* Sidebar */}
        {mode === "server" && activeServer && activeChannels.length > 0 && (
          <ChannelSidebar
            server={activeServer}
            channels={activeChannels}
            activeChannelId={activeChannelId}
            onPickChannel={(id) => { setActiveChannel(id); router.push(`/servers/${activeServerId}/channels/${id}`); }}
            onOpenVoice={handleOpenVoice}
          />
        )}

        {/* Main content — call overlays on top when maximized, minimized floats */}
        <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, position: "relative" }}>
          {children}
          <VoiceCall />
        </div>
      </div>

      <IncomingCall />
      <CommandPalette show={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ProfilePopout />

      {/* Quick helpers */}
      <div style={{ position: "fixed", left: 88, bottom: 14, zIndex: 30, display: "flex", gap: 8 }}>
        <div onClick={() => setCmdOpen(true)} style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(20,22,30,0.8)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 11.5, color: "var(--text-2)", fontFamily: "Geist Mono", cursor: "pointer" }}>
          ⌘K · поиск
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <AppShell>{children}</AppShell>
    </QueryClientProvider>
  );
}
