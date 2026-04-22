"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { CreateServerModal } from "@/components/modals/CreateServerModal";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { Avatar } from "@/components/ui/Avatar";
import { serversApi, dmsApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { useUnreadStore } from "@/store/unreadStore";
import { useAuthStore } from "@/store/authStore";
import { dmTitle } from "@/lib/dm";
import type { Server, DirectMessage } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) return url;
  return `${API_BASE}${url}`;
}

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

interface ServerRailProps {
  servers: Server[];
  activeServerId: string | null;
  activeMode: string;
  onPickServer: (id: string) => void;
  onPickMode: (mode: string) => void;
}

export function ServerRail({ servers, activeServerId, activeMode, onPickServer, onPickMode }: ServerRailProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; server: Server } | null>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const { servers: storeServers, setServers } = useServerStore();
  const mentionsByServer = useUnreadStore((s) => s.mentionsByServer);
  const unreadByDm = useUnreadStore((s) => s.unreadByDm);
  const { user } = useAuthStore();

  const hasUnread = Object.keys(unreadByDm).length > 0;
  const { data: dms = [] } = useQuery<DirectMessage[]>({
    queryKey: ["dms"],
    queryFn: dmsApi.list,
    enabled: hasUnread,
    staleTime: 30_000,
  });

  const unreadDms = dms
    .filter((d) => (unreadByDm[d.id] ?? 0) > 0)
    .map((d) => {
      const other = d.participants.find((p) => p.user.id !== user?.id) ?? d.participants[0];
      return { dm: d, other, count: unreadByDm[d.id] };
    });

  const leave = useMutation({
    mutationFn: (id: string) => serversApi.leave(id),
    onSuccess: (_, id) => {
      setServers(storeServers.filter((s) => s.id !== id));
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      if (activeServerId === id) router.push("/friends");
    },
  });

  const buildMenu = (server: Server): MenuItem[] => [
    { icon: "fa-hashtag", label: "Открыть сервер", onClick: () => onPickServer(server.id) },
    { icon: "fa-gear", label: "Настройки сервера", onClick: () => router.push(`/servers/${server.id}/settings`) },
    { icon: "fa-user-plus", label: "Пригласить людей", onClick: () => router.push(`/servers/${server.id}/settings/invites`) },
    { icon: "fa-copy", label: "Скопировать ID", onClick: () => navigator.clipboard?.writeText(server.id) },
    { separator: true, label: "" } as MenuItem,
    { icon: "fa-right-from-bracket", label: "Покинуть сервер", onClick: () => { if (confirm(`Покинуть «${server.name}»?`)) leave.mutate(server.id); }, danger: true },
  ];

  const pill = (
    id: string, label: string | React.ReactNode, active: boolean,
    notif?: number, onClick?: () => void, hue?: number,
  ) => (
    <div key={id} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 52 }}>
      <div style={{
        position: "absolute", left: 0, top: "50%",
        transform: `translateY(-50%) scaleY(${active ? 1 : notif ? 0.4 : 0})`,
        width: 3, height: active ? 36 : 12, borderRadius: "0 3px 3px 0",
        background: "var(--accent)", transition: "all 220ms cubic-bezier(.3,.8,.3,1)",
      }} />
      <button onClick={onClick} style={{
        width: 44, height: 44,
        borderRadius: active ? 14 : 18,
        border: "none", cursor: "pointer",
        background: active
          ? "var(--accent)"
          : hue !== undefined
          ? `linear-gradient(135deg, oklch(35% 0.06 ${hue}), oklch(22% 0.03 ${hue}))`
          : "var(--bg-3)",
        color: active ? "#fff" : "var(--text-1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: typeof label === "string" ? 13 : 18, fontWeight: 600,
        transition: "all 200ms cubic-bezier(.3,.8,.3,1)",
        boxShadow: active ? "0 6px 14px oklch(from var(--accent) l c h / 0.35)" : "0 1px 2px rgba(0,0,0,0.2)",
        position: "relative",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.borderRadius = "14px"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.borderRadius = "18px"; }}
      >
        {label}
      </button>
      {notif ? (
        <div style={{
          position: "absolute", left: "58%", bottom: 2,
          minWidth: 18, height: 18, borderRadius: 10, padding: "0 5px",
          background: "var(--danger)", color: "#fff",
          fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 0 3px var(--bg-0)",
        }}>{notif > 99 ? "99+" : notif}</div>
      ) : null}
    </div>
  );

  return (<>
    <div style={{
      width: 72, flexShrink: 0, background: "var(--bg-0)",
      borderRight: "1px solid var(--line)",
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 10, gap: 2, overflowY: "auto", overflowX: "hidden",
      minHeight: 0, height: "100%",
      WebkitOverflowScrolling: "touch" as any,
      overscrollBehavior: "contain",
    }}>
      {/* Logo */}
      <div style={{ position: "relative", height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button onClick={() => onPickMode("dms")} style={{
          width: 44, height: 44, borderRadius: activeMode === "dms" ? 14 : 22,
          border: "none", cursor: "pointer",
          background: activeMode === "dms" ? "var(--accent)" : "var(--bg-3)",
          color: activeMode === "dms" ? "#fff" : "var(--text-0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Instrument Serif", fontSize: 22, fontWeight: 600, letterSpacing: -1,
          transition: "all 200ms cubic-bezier(.3,.8,.3,1)",
        }}>
          H<span style={{ marginLeft: -2, fontStyle: "italic", opacity: 0.85 }}>r</span>
        </button>
      </div>

      <div style={{ width: 32, height: 1, background: "var(--line-strong)", margin: "4px 0" }} />

      {unreadDms.map(({ dm, other, count }) => {
        const title = dmTitle(dm, user?.id ?? null);
        const groupIconUrl = dm.icon_url ? resolveIcon(dm.icon_url) : undefined;
        return (
          <div key={`dm-${dm.id}`} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 52 }}>
            <div style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
              width: 3, height: 12, borderRadius: "0 3px 3px 0", background: "var(--text-0)",
            }} />
            <button
              onClick={() => router.push(`/dms/${dm.id}`)}
              title={title}
              style={{
                width: 44, height: 44, borderRadius: 22, border: "none", cursor: "pointer",
                background: "var(--bg-3)", padding: 0, overflow: "hidden",
                transition: "border-radius 200ms cubic-bezier(.3,.8,.3,1)",
                position: "relative",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderRadius = "14px")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderRadius = "22px")}
            >
              {dm.is_group ? (
                groupIconUrl ? (
                  <img src={groupIconUrl} alt={title} style={{ width: 44, height: 44, objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: 44, height: 44,
                    background: "linear-gradient(135deg, oklch(55% 0.17 268), oklch(40% 0.12 300))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff",
                  }}>
                    <i className="fa-solid fa-users" style={{ fontSize: 17 }} />
                  </div>
                )
              ) : (
                <Avatar name={other?.user.username ?? "?"} size={44} shape="circle" avatarUrl={other?.user.avatar_url} status={other?.user.status} />
              )}
            </button>
            <div style={{
              position: "absolute", left: "58%", bottom: 2,
              minWidth: 18, height: 18, borderRadius: 10, padding: "0 5px",
              background: "var(--danger)", color: "#fff",
              fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 0 3px var(--bg-0)",
            }}>
              {count > 99 ? "99+" : count}
            </div>
          </div>
        );
      })}
      {unreadDms.length > 0 && <div style={{ width: 32, height: 1, background: "var(--line-strong)", margin: "4px 0" }} />}

      {servers.map((s) => (
        <div
          key={s.id}
          onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, server: s }); }}
        >
          {pill(
            s.id,
            s.icon_url
              ? <img src={resolveIcon(s.icon_url)} style={{ width: 44, height: 44, borderRadius: "inherit", objectFit: "cover" }} alt={s.name} />
              : s.name.slice(0, 2).toUpperCase(),
            activeMode === "server" && activeServerId === s.id,
            mentionsByServer[s.id] || undefined,
            () => onPickServer(s.id),
            hueFromId(s.id),
          )}
        </div>
      ))}

      {pill("add", <i className="fa-solid fa-plus" style={{ color: "var(--ok)", fontSize: 20 }} />, false, undefined, () => setCreateOpen(true))}
      {pill("explore", <i className={`fa-solid fa-compass`} style={{ color: activeMode === "explore" ? "#fff" : "var(--ok)", fontSize: 20 }} />, activeMode === "explore", undefined, () => onPickMode("explore"))}

      <div style={{ flex: 1 }} />

      {pill("inbox", <i className="fa-solid fa-inbox" style={{ fontSize: 18 }} />, activeMode === "inbox", undefined, () => onPickMode("inbox"))}
      {pill("friends", <i className="fa-solid fa-user-group" style={{ fontSize: 18 }} />, activeMode === "friends", undefined, () => onPickMode("friends"))}
      {pill("settings", <i className="fa-solid fa-gear" style={{ fontSize: 18 }} />, activeMode === "settings", undefined, () => { onPickMode("settings"); router.push("/settings"); })}

      <div style={{ height: 10 }} />
    </div>

    {createOpen && <CreateServerModal onClose={() => setCreateOpen(false)} />}
    {ctx && (
      <ContextMenu x={ctx.x} y={ctx.y} items={buildMenu(ctx.server)} onClose={() => setCtx(null)} />
    )}
  </>);
}
