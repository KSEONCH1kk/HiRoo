"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { OverviewTab } from "@/components/server-settings/OverviewTab";
import { RolesTab } from "@/components/server-settings/RolesTab";
import { ChannelsTab } from "@/components/server-settings/ChannelsTab";
import { MembersTab } from "@/components/server-settings/MembersTab";
import { InvitesTab } from "@/components/server-settings/InvitesTab";
import { TagTab } from "@/components/server-settings/TagTab";
import { SoundboardTab } from "@/components/server-settings/SoundboardTab";
import { TemplatesTab } from "@/components/server-settings/TemplatesTab";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { PermissionKey } from "@/lib/permissions";
import type { Server } from "@/types";

const TABS: { id: string; label: string; icon: string; perm?: PermissionKey }[] = [
  { id: "overview", label: "Обзор", icon: "fa-circle-info", perm: "MANAGE_SERVER" },
  { id: "roles", label: "Роли", icon: "fa-shield", perm: "MANAGE_ROLES" },
  { id: "channels", label: "Каналы", icon: "fa-hashtag", perm: "MANAGE_CHANNELS" },
  { id: "members", label: "Участники", icon: "fa-users", perm: "KICK_MEMBERS" },
  { id: "invites", label: "Приглашения", icon: "fa-link", perm: "CREATE_INVITE" },
  { id: "tag", label: "Тэг сервера", icon: "fa-tag", perm: "MANAGE_SERVER" },
  { id: "soundboard", label: "Звуковая панель", icon: "fa-music" },
  { id: "templates", label: "Шаблоны", icon: "fa-clone", perm: "MANAGE_SERVER" },
];

export default function ServerSettingsPage({ params }: { params: { serverId: string; tab?: string[] } }) {
  const { serverId } = params;
  const router = useRouter();
  const { has } = useServerPermissions(serverId);
  const isMobile = useIsMobile();
  const rawTab = params.tab?.[0];

  const { data: server, isLoading } = useQuery<Server>({
    queryKey: ["server", serverId],
    queryFn: () => serversApi.get(serverId),
  });

  const visibleTabs = TABS.filter((t) => !t.perm || has(t.perm));
  const active = rawTab ?? (isMobile ? "" : (visibleTabs[0]?.id ?? "overview"));

  useEffect(() => {
    if (isMobile) return;
    if (visibleTabs.length === 0) return;
    if (active && !visibleTabs.some((t) => t.id === active)) {
      router.replace(`/servers/${serverId}/settings/${visibleTabs[0].id}`);
    }
  }, [active, visibleTabs.length, isMobile]);

  const canView = (tabId: string) => {
    const tab = TABS.find((t) => t.id === tabId);
    return !tab?.perm || has(tab.perm);
  };

  const isIndex = !active;
  const showSidebar = !isMobile || isIndex;
  const showContent = !isMobile || !isIndex;

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, background: "var(--bg-1)" }}>
      {showSidebar && (
        <div style={{
          width: isMobile ? "100%" : 240, flexShrink: 0, padding: "20px 8px",
          borderRight: isMobile ? "none" : "1px solid var(--line)",
          display: "flex", flexDirection: "column", background: "var(--bg-0)",
          overflowY: "auto", minHeight: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 10px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {server?.name ?? "Сервер"}
          </div>
          {visibleTabs.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push(`/servers/${serverId}/settings/${t.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "11px 12px" : "8px 10px", borderRadius: 8, cursor: "pointer",
                background: active === t.id ? "var(--bg-active)" : "transparent",
                color: active === t.id ? "var(--text-0)" : "var(--text-1)",
                fontSize: isMobile ? 14.5 : 14, fontWeight: active === t.id ? 600 : 400,
              }}
              onMouseEnter={(e) => { if (active !== t.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (active !== t.id) e.currentTarget.style.background = "transparent"; }}
            >
              <i className={`fa-solid ${t.icon}`} style={{ width: 18, textAlign: "center", fontSize: 14 }} />
              <span style={{ flex: 1 }}>{t.label}</span>
              {isMobile && <i className="fa-solid fa-chevron-right" style={{ fontSize: 11, color: "var(--text-3)" }} />}
            </div>
          ))}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div
              onClick={() => router.push(`/servers/${serverId}`)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "11px 12px" : "8px 10px", borderRadius: 8, cursor: "pointer", color: "var(--text-2)", fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="fa-solid fa-arrow-left" style={{ width: 18, textAlign: "center", fontSize: 12 }} />
              Назад к серверу
            </div>
          </div>
        </div>
      )}

      {showContent && (
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 28px" : "28px 40px", minWidth: 0 }}>
          {isMobile && (
            <button
              onClick={() => router.push(`/servers/${serverId}/settings`)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", fontSize: 13, marginBottom: 8, marginLeft: -6 }}
            >
              <i className="fa-solid fa-chevron-left" style={{ fontSize: 12 }} />
              Назад
            </button>
          )}
          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: "var(--text-0)", marginBottom: isMobile ? 16 : 24, letterSpacing: -0.4 }}>
            {TABS.find((t) => t.id === active)?.label}
          </div>
          {isLoading || !server ? (
            <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>
          ) : !canView(active) ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)", fontSize: 14 }}>
              <i className="fa-solid fa-lock" style={{ fontSize: 32, marginBottom: 12 }} /><br />
              Недостаточно прав для этого раздела
            </div>
          ) : (
            <>
              {active === "overview" && <OverviewTab server={server} />}
              {active === "roles" && <RolesTab serverId={serverId} />}
              {active === "channels" && <ChannelsTab serverId={serverId} />}
              {active === "members" && <MembersTab serverId={serverId} />}
              {active === "invites" && <InvitesTab server={server} />}
              {active === "tag" && <TagTab server={server} />}
              {active === "soundboard" && <SoundboardTab serverId={serverId} />}
              {active === "templates" && <TemplatesTab serverId={serverId} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
