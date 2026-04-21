"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/authStore";
import { useUnreadStore } from "@/store/unreadStore";
import { CreateDMModal } from "./CreateDMModal";
import { SearchBarButton } from "@/components/layout/SearchBarButton";
import { dmTitle, dmAvatarProps } from "@/lib/dm";
import type { DirectMessage } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

export function DMSidebar() {
  const router = useRouter();
  const params = useParams();
  const activeDmId = params?.dmId as string | undefined;
  const { user } = useAuthStore();
  const { unreadByDm } = useUnreadStore();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: dms = [] } = useQuery<DirectMessage[]>({
    queryKey: ["dms"],
    queryFn: dmsApi.list,
    staleTime: 30_000,
  });

  return (
    <div style={{ width: 240, flexShrink: 0, background: "var(--bg-1)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 48, padding: "0 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", flex: 1 }}>Личные сообщения</span>
        <button
          onClick={() => setModalOpen(true)}
          title="Новое сообщение"
          style={{
            width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
            background: "var(--bg-3)", color: "var(--text-1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 120ms, color 120ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-3)"; e.currentTarget.style.color = "var(--text-1)"; }}
        >
          <i className="fa-solid fa-plus" style={{ fontSize: 12 }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px 4px" }}>
          Прямые сообщения
        </div>
        {dms.length === 0 && (
          <div style={{ padding: "14px 10px", fontSize: 12, color: "var(--text-3)" }}>
            Пусто. Нажми «+» чтобы написать кому-нибудь.
          </div>
        )}
        {dms.map((dm) => {
          const isActive = dm.id === activeDmId;
          const title = dmTitle(dm, user?.id ?? null);
          const ava = dmAvatarProps(dm, user?.id ?? null);
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
              {dm.is_group ? (
                dm.icon_url ? (
                  <img src={resolveIcon(dm.icon_url)} alt={title} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "linear-gradient(135deg, oklch(55% 0.17 268), oklch(40% 0.12 300))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    <i className="fa-solid fa-users" style={{ fontSize: 13 }} />
                  </div>
                )
              ) : (
                <Avatar name={ava.name} size={32} status={ava.status} shape="circle" avatarUrl={ava.avatarUrl} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: (unreadByDm[dm.id] ?? 0) > 0 ? 700 : 500, color: isActive ? "var(--text-0)" : ((unreadByDm[dm.id] ?? 0) > 0 ? "var(--text-0)" : "var(--text-1)"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </div>
                {dm.is_group && (
                  <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 1 }}>
                    {dm.participants.length} участн.
                  </div>
                )}
              </div>
              {(unreadByDm[dm.id] ?? 0) > 0 && (
                <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--danger)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {unreadByDm[dm.id] > 99 ? "99+" : unreadByDm[dm.id]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <SearchBarButton />

      {modalOpen && <CreateDMModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
