"use client";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { getStatusColor } from "@/lib/utils";

export function ProfilePopout() {
  const { profileUser, setProfileUser, setMode } = useUIStore();
  const { user } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  const openDm = useMutation({
    mutationFn: (userId: string) => dmsApi.create([userId]),
    onSuccess: (dm) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      setProfileUser(null);
      setMode("dms");
      router.push(`/dms/${dm.id}`);
    },
  });

  if (!profileUser) return null;

  const statusLabels: Record<string, string> = {
    online: "В сети",
    idle: "Не активен",
    dnd: "Не беспокоить",
    offline: "Не в сети",
  };

  const isSelf = user?.id === profileUser.id;

  return (
    <>
      <div onClick={() => setProfileUser(null)} style={{ position: "fixed", inset: 0, zIndex: 89 }} />
      <div style={{ position: "fixed", bottom: 80, left: 88, zIndex: 90, width: 300, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", animation: "fadeIn 160ms ease-out" }}>
        <div style={{ height: 60, background: "linear-gradient(135deg, var(--accent) 0%, #5b8af0 100%)" }} />
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -28, marginBottom: 12 }}>
            <Avatar name={profileUser.username} size={56} shape="circle" avatarUrl={profileUser.avatar_url} status={profileUser.status} ring />
            {!isSelf && (
              <Button
                size="sm"
                variant="soft"
                icon={<i className="fa-solid fa-paper-plane" style={{ fontSize: 12 }} />}
                disabled={openDm.isPending}
                onClick={() => openDm.mutate(profileUser.id)}
              >
                {openDm.isPending ? "…" : "Написать"}
              </Button>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", letterSpacing: -0.3 }}>
            {profileUser.display_name ?? profileUser.username}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", fontFamily: "Geist Mono", marginBottom: 4 }}>@{profileUser.username}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: getStatusColor(profileUser.status) }} />
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{statusLabels[profileUser.status] ?? profileUser.status}</span>
          </div>
          {profileUser.custom_status && (
            <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "var(--bg-3)", fontSize: 13, color: "var(--text-1)" }}>
              {profileUser.custom_status}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
