"use client";
import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useServerStore } from "@/store/serverStore";
import { useSocket } from "@/hooks/useSocket";
import { useE2EEInit } from "@/hooks/useE2EEInit";
import { useMobileIntegration } from "@/hooks/useMobileIntegration";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useBlocksStore } from "@/store/blocksStore";
import { serversApi, channelsApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ServerRail } from "@/components/layout/ServerRail";
import { ChannelSidebar } from "@/components/layout/ChannelSidebar";
import { MembersPanelInner } from "@/components/chat/MembersPanel";
import { DMSidebar } from "@/components/dm/DMSidebar";
import { UserTray } from "@/components/layout/UserTray";
import { IncomingCall } from "@/components/modals/IncomingCall";
import { ImageViewer } from "@/components/chat/ImageViewer";
import { CommandPalette } from "@/components/modals/CommandPalette";
import { EphemeralToasts } from "@/components/chat/EphemeralToasts";
import { ScreenSharePickerHost } from "@/components/desktop/ScreenSharePicker";
import { ProfilePopout } from "@/components/modals/ProfilePopout";
import { ServerPreviewModal } from "@/components/modals/ServerPreviewModal";
import { VoiceCall } from "@/components/voice/VoiceCall";
import { useCallStore } from "@/store/callStore";
import { usePaletteStore } from "@/store/paletteStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMobileDrawerStore } from "@/store/mobileDrawerStore";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { mode, setMode, previewServerId, setPreviewServerId } = useUIStore();
  const { open: cmdOpen, setOpen: setCmdOpen } = usePaletteStore();
  const { active: activeCall, endCall, setMaximized } = useCallStore();
  const { servers, setServers, channels, setChannels, activeServerId, setActiveServer, activeChannelId, setActiveChannel } = useServerStore();
  const inVoice = !!activeCall;
  const [isMuted, setMuted] = useState(false);
  const [isDeafened, setDeafened] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { leftOpen, rightOpen, closeAll, toggleLeft, toggleRight } = useMobileDrawerStore();

  useSocket();
  useE2EEInit();
  useMobileIntegration();
  useHotkeys();
  useEffect(() => { useBlocksStore.getState().refresh(); }, []);

  // Auto-close drawers on navigation (mobile UX)
  useEffect(() => { if (isMobile) closeAll(); }, [pathname, isMobile]);

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

  const leftColumn = (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-0)", width: 72, flexShrink: 0, height: "100%" }}>
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
  );

  let sidebar: React.ReactNode = null;
  if (mode === "server" && activeServer && activeChannels.length > 0) {
    sidebar = (
      <ChannelSidebar
        server={activeServer}
        channels={activeChannels}
        activeChannelId={activeChannelId}
        onPickChannel={(id) => { setActiveChannel(id); router.push(`/servers/${activeServerId}/channels/${id}`); }}
        onPickForum={(id) => { setActiveChannel(id); router.push(`/servers/${activeServerId}/forum/${id}`); }}
        onOpenVoice={handleOpenVoice}
      />
    );
  } else if (isMobile && mode === "dms") {
    sidebar = <DMSidebar />;
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg-0)" }}>
      {/* Top bar */}
      {!isMobile ? (
        <div style={{ height: 28, flexShrink: 0, background: "var(--bg-0)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", userSelect: "none" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", letterSpacing: 0.3 }}>HiRoo</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>hiroo · 1.0.0</div>
        </div>
      ) : (
        <div style={{ height: 44, flexShrink: 0, background: "var(--bg-1)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}>
          <button onClick={toggleLeft} aria-label="Меню" style={{ width: 36, height: 36, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-0)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="fa-solid fa-bars" style={{ fontSize: 18 }} />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)", letterSpacing: 0.2 }}>HiRoo</div>
          <div style={{ display: "flex", gap: 2 }}>
            <button onClick={() => setCmdOpen(true)} aria-label="Поиск" style={{ width: 36, height: 36, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-0)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 15 }} />
            </button>
            {mode === "server" && activeServer && (
              <button onClick={toggleRight} aria-label="Участники" style={{ width: 36, height: 36, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-0)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="fa-solid fa-users" style={{ fontSize: 15 }} />
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {!isMobile && (
          <>
            {leftColumn}
            {sidebar}
          </>
        )}

        {isMobile && (
          <>
            {/* Backdrop */}
            {(leftOpen || rightOpen) && (
              <div
                onClick={closeAll}
                style={{
                  position: "absolute", inset: 0, zIndex: 40,
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
                }}
              />
            )}
            {/* Left drawer: server rail + channel sidebar */}
            <div
              style={{
                position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 41,
                display: "flex", background: "var(--bg-0)",
                maxWidth: "88vw",
                transform: leftOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 220ms cubic-bezier(.3,.8,.3,1)",
                boxShadow: leftOpen ? "6px 0 24px rgba(0,0,0,0.4)" : "none",
              }}
            >
              {leftColumn}
              {sidebar}
            </div>
            {/* Right drawer: members (server mode only) */}
            {mode === "server" && activeServer && (
              <div
                style={{
                  position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 41,
                  background: "var(--bg-1)", width: 240, maxWidth: "88vw",
                  transform: rightOpen ? "translateX(0)" : "translateX(100%)",
                  transition: "transform 220ms cubic-bezier(.3,.8,.3,1)",
                  boxShadow: rightOpen ? "-6px 0 24px rgba(0,0,0,0.4)" : "none",
                  overflow: "hidden",
                }}
              >
                <MembersPanelInner serverId={activeServer.id} />
              </div>
            )}
          </>
        )}

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, position: "relative" }}>
          {children}
          <VoiceCall />
        </div>
      </div>

      <IncomingCall />
      <ImageViewer />
      <CommandPalette show={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ProfilePopout />
      {previewServerId && (
        <ServerPreviewModal
          serverId={previewServerId}
          onClose={() => setPreviewServerId(null)}
        />
      )}
      <EphemeralToasts />
      <ScreenSharePickerHost />

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
