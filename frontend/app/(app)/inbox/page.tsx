"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inboxApi } from "@/lib/api";
import { formatMessageTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { Notification } from "@/types";

export default function InboxPage() {
  const qc = useQueryClient();
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["inbox"],
    queryFn: () => inboxApi.list(),
    staleTime: 15_000,
  });

  const markAll = useMutation({
    mutationFn: inboxApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => inboxApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const unread = notifications.filter((n) => !n.is_read);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-1)", minWidth: 0 }}>
      <div style={{ height: 48, flexShrink: 0, padding: "0 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-1)" }}>
        <i className="fa-solid fa-bell" style={{ color: "var(--text-2)", fontSize: 18 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>Входящие</span>
        {unread.length > 0 && (
          <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "var(--danger)", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {unread.length}
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
              Отметить все прочитанными
            </Button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {notifications.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 }}>
            <i className="fa-regular fa-bell" style={{ fontSize: 48, color: "var(--text-3)" }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-0)" }}>Нет уведомлений</div>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>Новые уведомления появятся здесь</div>
          </div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => { if (!n.is_read) markOne.mutate(n.id); }}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 10, marginBottom: 4, cursor: "pointer",
              background: n.is_read ? "transparent" : "rgba(124,92,255,0.07)",
              border: n.is_read ? "1px solid transparent" : "1px solid rgba(124,92,255,0.2)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = n.is_read ? "transparent" : "rgba(124,92,255,0.07)")}
          >
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`fa-solid ${n.kind === "mention" ? "fa-at" : n.kind === "friend_request" ? "fa-user-plus" : "fa-bell"}`} style={{ fontSize: 14, color: "var(--accent)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: "var(--text-0)", lineHeight: 1.5 }}>{n.content}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 3 }}>
                {formatMessageTime(n.created_at)}
              </div>
            </div>
            {!n.is_read && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 6 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
