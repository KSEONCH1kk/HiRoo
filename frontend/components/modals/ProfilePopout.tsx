"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { dmsApi, usersApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { getStatusColor } from "@/lib/utils";
import { Badges } from "@/components/profile/Badges";
import { useBlocksStore } from "@/store/blocksStore";

const MONTHS_RU = [
  "янв.", "фев.", "мар.", "апр.", "мая", "июн.",
  "июл.", "авг.", "сен.", "окт.", "ноя.", "дек.",
];

function BlockButton({ userId }: { userId: string }) {
  const { isBlocked, block, unblock } = useBlocksStore();
  const blocked = isBlocked(userId);
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    if (!blocked && !confirm("Заблокировать этого пользователя? Он больше не сможет писать вам.")) return;
    setBusy(true);
    try { blocked ? await unblock(userId) : await block(userId); }
    finally { setBusy(false); }
  };
  return (
    <Button
      size="sm"
      variant={blocked ? "soft" : "danger"}
      icon={<i className={`fa-solid ${blocked ? "fa-user-check" : "fa-ban"}`} style={{ fontSize: 12 }} />}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? "…" : (blocked ? "Разблокировать" : "Заблокировать")}
    </Button>
  );
}


function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

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

  // Re-fetch the full profile to pick up badges, verified flag, created_at.
  // The popout is usually opened with a stripped UserPublic (from a message
  // author / member list) that doesn't carry those fields.
  const { data: fullProfile } = useQuery({
    queryKey: ["user-profile", profileUser?.id],
    queryFn: () => usersApi.get(profileUser!.id),
    enabled: !!profileUser?.id,
    staleTime: 30_000,
  });

  if (!profileUser) return null;
  const p = fullProfile ?? profileUser;

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
      <div style={{ position: "fixed", bottom: 80, left: 88, zIndex: 90, width: 320, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", animation: "fadeIn 160ms ease-out" }}>
        <div style={{ height: 60, background: "linear-gradient(135deg, var(--accent) 0%, #5b8af0 100%)" }} />
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -28, marginBottom: 12 }}>
            <Avatar name={p.username} size={56} shape="circle" avatarUrl={p.avatar_url} status={p.status} ring />
            {!isSelf && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button
                  size="sm"
                  variant="soft"
                  icon={<i className="fa-solid fa-paper-plane" style={{ fontSize: 12 }} />}
                  disabled={openDm.isPending}
                  onClick={() => openDm.mutate(p.id)}
                >
                  {openDm.isPending ? "…" : "Написать"}
                </Button>
                <BlockButton userId={p.id} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", letterSpacing: -0.3, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {p.display_name ?? p.username}
            {p.is_verified && (
              <i
                className="fa-solid fa-circle-check"
                title="Верифицированный аккаунт"
                style={{ fontSize: 14, color: "#6fa8ff" }}
              />
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", fontFamily: "Geist Mono", marginBottom: 6 }}>@{p.username}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: getStatusColor(p.status) }} />
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{statusLabels[p.status] ?? p.status}</span>
          </div>
          {p.custom_status && (
            <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "var(--bg-3)", fontSize: 13, color: "var(--text-1)" }}>
              {p.custom_status}
            </div>
          )}
          {p.badges && p.badges.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Бейджи
              </div>
              <Badges ids={p.badges} size="sm" />
            </div>
          )}
          {p.created_at && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--text-2)" }}>
              <i className="fa-solid fa-calendar-plus" style={{ marginRight: 6, opacity: 0.7 }} />
              На HiRoo с {formatJoinDate(p.created_at)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
