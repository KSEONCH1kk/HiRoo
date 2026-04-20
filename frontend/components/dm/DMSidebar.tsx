"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/authStore";
import { useUnreadStore } from "@/store/unreadStore";
import type { DirectMessage } from "@/types";

export function DMSidebar() {
  const router = useRouter();
  const params = useParams();
  const activeDmId = params?.dmId as string | undefined;
  const { user } = useAuthStore();
  const { unreadByDm } = useUnreadStore();

  const { data: dms = [] } = useQuery<DirectMessage[]>({
    queryKey: ["dms"],
    queryFn: dmsApi.list,
    staleTime: 30_000,
  });

  return (
    <div style={{ width: 240, flexShrink: 0, background: "var(--bg-1)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 48, padding: "0 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>Личные сообщения</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px 4px" }}>
          Прямые сообщения
        </div>
        {dms.map((dm) => {
          const isActive = dm.id === activeDmId;
          const other = dm.participants.find((p) => p.user.id !== user?.id) ?? dm.participants[0];
          return (
            <div
              key={dm.id}
              onClick={() => router.push(`/dms/${dm.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                background: isActive ? "var(--bg-active)" : "transparent",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <Avatar name={other?.user.username ?? "?"} size={32} status={other?.user.status} shape="circle" avatarUrl={other?.user.avatar_url} />
              <span style={{ fontSize: 13.5, fontWeight: (unreadByDm[dm.id] ?? 0) > 0 ? 700 : 500, color: isActive ? "var(--text-0)" : ((unreadByDm[dm.id] ?? 0) > 0 ? "var(--text-0)" : "var(--text-1)"), flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {other?.user.display_name ?? other?.user.username ?? "Unknown"}
              </span>
              {(unreadByDm[dm.id] ?? 0) > 0 && (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--danger)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {unreadByDm[dm.id] > 99 ? "99+" : unreadByDm[dm.id]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
