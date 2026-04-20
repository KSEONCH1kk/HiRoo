"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi, rolesApi, type Role } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { ServerMember } from "@/types";

export function MembersTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ServerMember | null>(null);

  const { data: members = [] } = useQuery<ServerMember[]>({
    queryKey: ["members", serverId],
    queryFn: () => serversApi.listMembers(serverId),
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles", serverId],
    queryFn: () => rolesApi.list(serverId),
  });

  const kick = useMutation({
    mutationFn: (userId: string) => serversApi.kickMember(serverId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", serverId] }),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      serversApi.updateMember(serverId, userId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", serverId] }),
  });

  const filtered = members.filter((m) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return m.user.username.toLowerCase().includes(needle) ||
      (m.user.display_name ?? "").toLowerCase().includes(needle) ||
      (m.nickname ?? "").toLowerCase().includes(needle);
  });

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
        <input
          placeholder="Поиск участников…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, maxWidth: 400, padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 14, outline: "none" }}
        />
        <span style={{ alignSelf: "center", fontSize: 13, color: "var(--text-2)" }}>{filtered.length} из {members.length}</span>
      </div>

      <div style={{ background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
        {filtered.map((m, i) => (
          <div key={m.user.id} style={{
            padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
            borderBottom: i === filtered.length - 1 ? "none" : "1px solid var(--line)",
          }}>
            <Avatar name={m.user.username} size={36} shape="circle" avatarUrl={m.user.avatar_url} status={m.user.status} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>
                {m.nickname || m.user.display_name || m.user.username}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-2)", fontFamily: "Geist Mono" }}>@{m.user.username}</div>
            </div>
            <select
              value={m.role}
              onChange={(e) => changeRole.mutate({ userId: m.user.id, role: e.target.value })}
              disabled={m.role === "owner"}
              style={{ padding: "5px 10px", borderRadius: 6, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 12.5, outline: "none", cursor: "pointer" }}
            >
              <option value="member">Участник</option>
              <option value="moderator">Модератор</option>
              <option value="admin">Админ</option>
              {m.role === "owner" && <option value="owner">Владелец</option>}
            </select>
            <Button size="sm" variant="soft" onClick={() => setEditing(m)}>Роли</Button>
            {m.role !== "owner" && (
              <button
                onClick={() => { if (confirm(`Исключить ${m.user.username}?`)) kick.mutate(m.user.id); }}
                title="Исключить"
                style={{ border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer", padding: 6 }}
              >
                <i className="fa-solid fa-user-xmark" style={{ fontSize: 13 }} />
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>Никого не найдено</div>}
      </div>

      {editing && (
        <MemberRolesModal
          serverId={serverId}
          member={editing}
          roles={roles}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MemberRolesModal({ serverId, member, roles, onClose }: { serverId: string; member: ServerMember; roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: current = [] } = useQuery<string[]>({
    queryKey: ["member-roles", serverId, member.user.id],
    queryFn: () => rolesApi.memberRoles(serverId, member.user.id),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [init, setInit] = useState(false);
  if (!init && current.length > 0) { setSelected(new Set(current)); setInit(true); }

  const save = useMutation({
    mutationFn: () => rolesApi.setMemberRoles(serverId, member.user.id, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-roles", serverId, member.user.id] });
      qc.invalidateQueries({ queryKey: ["members", serverId] });
      onClose();
    },
  });

  const assignable = roles.filter((r) => !r.is_everyone);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 4 }}>Роли участника</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>@{member.user.username}</div>
        <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0", display: "flex", flexDirection: "column", gap: 4 }}>
          {assignable.map((r) => {
            const on = selected.has(r.id);
            return (
              <label key={r.id} style={{
                padding: "8px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                background: on ? "var(--bg-active)" : "var(--bg-3)",
                border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
              }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const next = new Set(selected);
                    if (on) next.delete(r.id); else next.add(r.id);
                    setSelected(next);
                  }}
                />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color }} />
                <span style={{ fontSize: 13.5, color: "var(--text-0)", flex: 1 }}>{r.name}</span>
              </label>
            );
          })}
          {assignable.length === 0 && <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>Сначала создайте роли</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
