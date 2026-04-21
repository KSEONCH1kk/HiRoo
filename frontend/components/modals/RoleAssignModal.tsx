"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, type Role } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { UserPublic } from "@/types";

interface Props { serverId: string; user: UserPublic; onClose: () => void; }

export function RoleAssignModal({ serverId, user, onClose }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles", serverId],
    queryFn: () => rolesApi.list(serverId),
  });
  const { data: memberRoles = [] } = useQuery<string[]>({
    queryKey: ["member-roles", serverId, user.id],
    queryFn: () => rolesApi.memberRoles(serverId, user.id),
  });

  useEffect(() => { setSelected(new Set(memberRoles)); }, [memberRoles.join(",")]);

  const assignable = roles.filter((r) => !r.is_everyone).sort((a, b) => b.position - a.position);

  const save = useMutation({
    mutationFn: () => rolesApi.setMemberRoles(serverId, user.id, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-roles", serverId, user.id] });
      qc.invalidateQueries({ queryKey: ["members", serverId] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Не удалось сохранить"),
  });

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-panel" style={{
        width: 460, maxHeight: "80vh", display: "flex", flexDirection: "column",
        background: "var(--bg-1)", border: "1px solid var(--line-strong)",
        borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={user.username} size={28} shape="circle" avatarUrl={user.avatar_url} status={user.status} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)" }}>Роли — {user.display_name ?? user.username}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>@{user.username}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", borderRadius: 6 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {assignable.length === 0 && (
            <div style={{ padding: "20px 12px", fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>
              Ролей нет. Создайте роль в настройках сервера.
            </div>
          )}
          {assignable.map((r) => {
            const on = selected.has(r.id);
            return (
              <div
                key={r.id}
                onClick={() => toggle(r.id)}
                style={{
                  padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  background: on ? "var(--bg-active)" : "transparent",
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-0)" }}>{r.name}</span>
                <span style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--line-strong)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {on && <i className="fa-solid fa-check" style={{ fontSize: 10, color: "#fff" }} />}
                </span>
              </div>
            );
          })}
        </div>

        {error && <div style={{ padding: "0 20px 8px", fontSize: 12, color: "var(--danger)" }}>{error}</div>}

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
