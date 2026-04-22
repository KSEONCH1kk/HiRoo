"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { friendsApi, dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { ClanTag } from "@/components/ui/ClanTag";
import { Button } from "@/components/ui/Button";
import { AddFriendModal } from "./AddFriendModal";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { UserPublic, FriendRequest } from "@/types";

const TABS = [
  { id: "online", label: "В сети" },
  { id: "all", label: "Все" },
  { id: "pending", label: "Заявки" },
  { id: "blocked", label: "Заблокированные" },
];

export function FriendsList() {
  const [tab, setTab] = useState("online");
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const isMobile = useIsMobile();

  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: friendsApi.list });
  const { data: pending = [] } = useQuery({ queryKey: ["friends-pending"], queryFn: friendsApi.pending });
  const { data: blocked = [] } = useQuery({
    queryKey: ["friends-blocked"],
    queryFn: friendsApi.blocked,
    // Preload so toggling the tab shows the list immediately.
    staleTime: 10_000,
  });

  // Re-fetch whenever another part of the UI (profile popout, DM member
  // pill, context menu) toggles someone in the block list.
  useEffect(() => {
    const on = () => qc.invalidateQueries({ queryKey: ["friends-blocked"] });
    window.addEventListener("hiroo:blocks-updated", on);
    return () => window.removeEventListener("hiroo:blocks-updated", on);
  }, [qc]);

  const accept = useMutation({ mutationFn: (id: string) => friendsApi.accept(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); qc.invalidateQueries({ queryKey: ["friends-pending"] }); } });
  const reject = useMutation({ mutationFn: (id: string) => friendsApi.reject(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["friends-pending"] }) });
  const remove = useMutation({ mutationFn: (id: string) => friendsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }) });
  const unblock = useMutation({ mutationFn: (id: string) => friendsApi.unblock(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["friends-blocked"] }) });

  const openDm = useMutation({
    mutationFn: (userId: string) => dmsApi.create([userId]),
    onSuccess: (dm) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      router.push(`/dms/${dm.id}`);
    },
  });

  const list: UserPublic[] =
    tab === "online" ? friends.filter((f) => f.status !== "offline")
    : tab === "all" ? friends
    : tab === "blocked" ? blocked
    : [];

  const tabsRow = (
    <div style={{
      display: "flex", gap: 4, overflowX: "auto", overflowY: "hidden",
      padding: isMobile ? "8px 12px" : "0",
      borderBottom: isMobile ? "1px solid var(--line)" : "none",
      background: "var(--bg-1)",
      flexShrink: 0,
    }}>
      {TABS.map((t) => (
        <div key={t.id} onClick={() => setTab(t.id)} style={{
          padding: isMobile ? "6px 12px" : "5px 10px",
          borderRadius: 6, fontSize: 13.5, fontWeight: 500,
          color: tab === t.id ? "var(--text-0)" : "var(--text-2)",
          background: tab === t.id ? "var(--bg-active)" : "transparent",
          cursor: "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}>
          {t.label}
          {t.id === "pending" && pending.length > 0 && (
            <span style={{ minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{pending.length}</span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-1)", minWidth: 0 }}>
      {/* Header */}
      <div style={{ minHeight: 48, flexShrink: 0, padding: "0 14px", borderBottom: isMobile ? "none" : "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-1)" }}>
        <i className="fa-solid fa-user-group" style={{ color: "var(--text-2)", fontSize: 18 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>Друзья</span>
        {!isMobile && <div style={{ width: 1, height: 18, background: "var(--line-strong)" }} />}
        {!isMobile && tabsRow}
        <div style={{ marginLeft: "auto" }}>
          <div
            onClick={() => setAddOpen(true)}
            style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13.5, fontWeight: 500, background: "var(--ok)", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {isMobile ? "+ Добавить" : "+ Добавить друга"}
          </div>
        </div>
      </div>
      {isMobile && tabsRow}

      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 28px" : "20px 28px" }}>
        {tab === "pending" ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
              Входящие — {pending.length}
            </div>
            {pending.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>Нет входящих заявок</div>
            )}
            {pending.map((req: FriendRequest) => (
              <div key={req.id} style={{ padding: "12px 10px", display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)" }}>
                <Avatar name={req.from_user.username} size={38} status={req.from_user.status} shape="circle" avatarUrl={req.from_user.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {req.from_user.display_name ?? req.from_user.username}
                    </span>
                    <ClanTag tag={req.from_user.tag} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>хочет добавить вас в друзья</div>
                </div>
                <Button size="sm" variant="primary" onClick={() => accept.mutate(req.id)}>Принять</Button>
                <Button size="sm" variant="ghost" onClick={() => reject.mutate(req.id)}>Отклонить</Button>
              </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
              {tab === "online" ? "В сети" : tab === "blocked" ? "Заблокированные" : "Все"} — {list.length}
            </div>
            {list.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
                {tab === "blocked" ? "Нет заблокированных пользователей" : tab === "online" ? "Никого нет в сети" : "У вас пока нет друзей"}
              </div>
            )}
            {list.map((f) => (
              <div key={f.id} style={{ padding: "12px 10px", display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Avatar name={f.username} size={38} status={f.status} shape="circle" avatarUrl={f.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.display_name ?? f.username}
                    </span>
                    <ClanTag tag={f.tag} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", fontFamily: "Geist Mono" }}>
                    {f.custom_status || f.status}
                  </div>
                </div>
                {tab === "blocked" ? (
                  <Button size="sm" variant="soft" onClick={() => unblock.mutate(f.id)}>Разблокировать</Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<i className="fa-solid fa-paper-plane" style={{ fontSize: 12 }} />}
                      title="Сообщение"
                      onClick={() => openDm.mutate(f.id)}
                      disabled={openDm.isPending}
                    />
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<i className="fa-solid fa-user-xmark" style={{ fontSize: 12 }} />}
                      title="Удалить из друзей"
                      onClick={() => remove.mutate(f.id)}
                    />
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {addOpen && <AddFriendModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
