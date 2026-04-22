"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { dmsApi } from "@/lib/api";
import { useUIStore } from "@/store/uiStore";
import { useBlocksStore } from "@/store/blocksStore";
import { useAuthStore } from "@/store/authStore";
import type { UserPublic } from "@/types";

interface Props {
  user: UserPublic;
  /** DM id — passed so the owner can kick members. */
  dmId?: string;
  /** True when the viewer owns the group DM; enables the "kick" item. */
  isOwner?: boolean;
  /** Layout variant. "pill" = compact chip, "row" = full-width list item. */
  variant?: "pill" | "row";
}

export function DMMemberPill({ user, dmId, isOwner, variant = "pill" }: Props) {
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const { user: me } = useAuthStore();
  const { setProfileUser, setMode } = useUIStore();
  const { isBlocked, block, unblock } = useBlocksStore();
  const router = useRouter();
  const qc = useQueryClient();
  const blocked = isBlocked(user.id);
  const isSelf = me?.id === user.id;

  const openDm = useMutation({
    mutationFn: () => dmsApi.create([user.id]),
    onSuccess: (dm) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      setMode("dms");
      router.push(`/dms/${dm.id}`);
    },
  });

  const kick = useMutation({
    mutationFn: () => dmsApi.kickMember(dmId!, user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm", dmId] });
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
  });

  const items: MenuItem[] = [
    { icon: "fa-user", label: "Профиль", onClick: () => setProfileUser(user) },
  ];
  if (!isSelf) {
    items.push({ icon: "fa-paper-plane", label: "Написать", onClick: () => openDm.mutate() });
    items.push({
      icon: blocked ? "fa-user-check" : "fa-ban",
      label: blocked ? "Разблокировать" : "Заблокировать",
      danger: !blocked,
      onClick: () => (blocked ? unblock(user.id) : block(user.id)),
    });
    if (isOwner && dmId) {
      items.push({
        icon: "fa-user-minus", label: "Исключить из группы", danger: true,
        onClick: () => { if (confirm(`Исключить ${user.display_name ?? user.username}?`)) kick.mutate(); },
      });
    }
  }

  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY });
  };

  if (variant === "row") {
    return (
      <>
        <div
          onContextMenu={onCtx}
          onClick={() => setProfileUser(user)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
            borderRadius: 6, cursor: "pointer",
            opacity: user.status === "offline" ? 0.55 : 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Avatar name={user.username} size={28} shape="circle" status={user.status} avatarUrl={user.avatar_url} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: "var(--text-0)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.display_name ?? user.username}
              {isSelf && <span style={{ color: "var(--text-3)", fontWeight: 400 }}> · вы</span>}
            </div>
            {user.custom_status && (
              <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.custom_status}
              </div>
            )}
          </div>
          {blocked && <i className="fa-solid fa-ban" style={{ fontSize: 11, color: "var(--danger)" }} title="Заблокирован" />}
        </div>
        {ctx && <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={items} />}
      </>
    );
  }

  return (
    <>
      <div
        onContextMenu={onCtx}
        onClick={() => setProfileUser(user)}
        title={user.display_name ?? user.username}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 8px 3px 4px", borderRadius: 999,
          background: "var(--bg-2)", border: "1px solid var(--line)",
          cursor: "pointer",
        }}
      >
        <Avatar name={user.username} size={18} shape="circle" status={user.status} avatarUrl={user.avatar_url} />
        <span style={{ fontSize: 11.5, color: "var(--text-1)" }}>
          {user.display_name ?? user.username}
          {isSelf && <span style={{ color: "var(--text-3)" }}> · вы</span>}
        </span>
      </div>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={items} />}
    </>
  );
}
