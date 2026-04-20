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
import type { PermissionKey } from "@/lib/permissions";
import type { Server } from "@/types";

const TABS: { id: string; label: string; icon: string; perm?: PermissionKey }[] = [
  { id: "overview", label: "Обзор", icon: "fa-circle-info", perm: "MANAGE_SERVER" },
  { id: "roles", label: "Роли", icon: "fa-shield", perm: "MANAGE_ROLES" },
  { id: "channels", label: "Каналы", icon: "fa-hashtag", perm: "MANAGE_CHANNELS" },
  { id: "members", label: "Участники", icon: "fa-users", perm: "KICK_MEMBERS" },
  { id: "invites", label: "Приглашения", icon: "fa-link", perm: "CREATE_INVITE" },
];

export default function ServerSettingsPage({ params }: { params: { serverId: string; tab?: string[] } }) {
  const { serverId } = params;
  const active = params.tab?.[0] ?? "overview";
  const router = useRouter();
  const { has } = useServerPermissions(serverId);

  const { data: server, isLoading } = useQuery<Server>({
    queryKey: ["server", serverId],
    queryFn: () => serversApi.get(serverId),
  });

  const visibleTabs = TABS.filter((t) => !t.perm || has(t.perm));

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((t) => t.id === active)) {
      router.replace(`/servers/${serverId}/settings/${visibleTabs[0].id}`);
    }
  }, [active, visibleTabs.length]);

  const canView = (tabId: string) => {
    const tab = TABS.find((t) => t.id === tabId);
    return !tab?.perm || has(tab.perm);
  };

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, background: "var(--bg-1)" }}>
      {/* Sidebar */}
      <div style={{ width: 240, flexShrink: 0, padding: "20px 8px", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", background: "var(--bg-0)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 10px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {server?.name ?? "Сервер"}
        </div>
        {visibleTabs.map((t) => (
          <div
            key={t.id}
            onClick={() => router.push(`/servers/${serverId}/settings/${t.id}`)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
              background: active === t.id ? "var(--bg-active)" : "transparent",
              color: active === t.id ? "var(--text-0)" : "var(--text-1)",
              fontSize: 14, fontWeight: active === t.id ? 600 : 400,
            }}
            onMouseEnter={(e) => { if (active !== t.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (active !== t.id) e.currentTarget.style.background = "transparent"; }}
          >
            <i className={`fa-solid ${t.icon}`} style={{ width: 16, textAlign: "center", fontSize: 13 }} />
            {t.label}
          </div>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <div
            onClick={() => router.push(`/servers/${serverId}`)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", fontSize: 13 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <i className="fa-solid fa-arrow-left" style={{ width: 16, textAlign: "center", fontSize: 12 }} />
            Назад к серверу
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 40px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-0)", marginBottom: 24, letterSpacing: -0.4 }}>
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
          </>
        )}
      </div>
    </div>
  );
}
