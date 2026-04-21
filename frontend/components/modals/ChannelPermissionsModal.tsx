"use client";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsApi, rolesApi, type Role, type ChannelRoleOverride } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { PERMISSIONS, PERMISSION_GROUPS, type PermissionKey } from "@/lib/permissions";
import type { Channel } from "@/types";

type TriState = "allow" | "deny" | "inherit";

function triOf(key: PermissionKey, allow: number, deny: number): TriState {
  const bit = PERMISSIONS[key];
  if ((allow & bit) !== 0) return "allow";
  if ((deny & bit) !== 0) return "deny";
  return "inherit";
}
function withTri(key: PermissionKey, allow: number, deny: number, tri: TriState): { allow: number; deny: number } {
  const bit = PERMISSIONS[key];
  let a = allow & ~bit;
  let d = deny & ~bit;
  if (tri === "allow") a |= bit;
  else if (tri === "deny") d |= bit;
  return { allow: a, deny: d };
}

interface Props { server: { id: string }; channel: Channel; onClose: () => void; }

export function ChannelPermissionsModal({ server, channel, onClose }: Props) {
  const qc = useQueryClient();
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles", server.id],
    queryFn: () => rolesApi.list(server.id),
  });
  const { data: overrides = [] } = useQuery<ChannelRoleOverride[]>({
    queryKey: ["channel-overrides", channel.id],
    queryFn: () => channelsApi.listOverrides(server.id, channel.id),
  });

  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => {
      if (a.is_everyone) return -1;
      if (b.is_everyone) return 1;
      return b.position - a.position;
    });
  }, [roles]);

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  useEffect(() => {
    if (!selectedRoleId && sortedRoles.length > 0) setSelectedRoleId(sortedRoles[0].id);
  }, [sortedRoles, selectedRoleId]);

  const current = overrides.find((o) => o.role_id === selectedRoleId);
  const [allow, setAllow] = useState(0);
  const [deny, setDeny] = useState(0);
  useEffect(() => {
    setAllow(current?.allow ?? 0);
    setDeny(current?.deny ?? 0);
  }, [selectedRoleId, current?.allow, current?.deny]);

  const save = useMutation({
    mutationFn: () => channelsApi.setOverride(server.id, channel.id, selectedRoleId, { allow, deny }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channel-overrides", channel.id] }); },
  });
  const remove = useMutation({
    mutationFn: () => channelsApi.deleteOverride(server.id, channel.id, selectedRoleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channel-overrides", channel.id] }); setAllow(0); setDeny(0); },
  });

  const dirty = (current?.allow ?? 0) !== allow || (current?.deny ?? 0) !== deny;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 160ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720, maxHeight: "86vh", display: "flex", flexDirection: "column",
          background: "var(--bg-1)", border: "1px solid var(--line-strong)",
          borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-lock" style={{ color: "var(--text-2)", fontSize: 13 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>Права канала</span>
            <span style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
              {channel.type === "voice" ? "голосовой" : "текстовый"} · #{channel.name}
            </span>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", borderRadius: 6 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 220, borderRight: "1px solid var(--line)", overflowY: "auto", padding: "8px 6px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 10px" }}>
              Роли
            </div>
            {sortedRoles.map((r) => {
              const has = overrides.some((o) => o.role_id === r.id);
              const active = selectedRoleId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  style={{
                    padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    background: active ? "var(--bg-active)" : "transparent",
                    color: active ? "var(--text-0)" : "var(--text-1)",
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.is_everyone ? "@everyone" : r.name}
                  </span>
                  {has && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />}
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
            {!selectedRoleId && (
              <div style={{ padding: 20, fontSize: 13, color: "var(--text-3)" }}>Выберите роль слева.</div>
            )}
            {selectedRoleId && (
              <>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 14 }}>
                  Для каждого права: <strong>✗</strong> запретить, <strong>/</strong> наследовать, <strong>✓</strong> разрешить.
                </div>
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.title} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      {g.title}
                    </div>
                    {g.items.map((item) => {
                      const tri = triOf(item.key, allow, deny);
                      return (
                        <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "var(--text-0)" }}>{item.label}</div>
                            {item.hint && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{item.hint}</div>}
                          </div>
                          <TriToggle value={tri} onChange={(v) => {
                            const next = withTri(item.key, allow, deny, v);
                            setAllow(next.allow); setDeny(next.deny);
                          }} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 8, background: "var(--bg-1)" }}>
          <Button
            variant="ghost"
            onClick={() => remove.mutate()}
            disabled={!current || remove.isPending}
          >
            <i className="fa-solid fa-trash" style={{ fontSize: 11, marginRight: 6, color: "var(--danger)" }} />
            Удалить override
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Закрыть</Button>
            <Button variant="primary" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TriToggle({ value, onChange }: { value: TriState; onChange: (v: TriState) => void }) {
  const base = {
    width: 34, height: 28, border: "1px solid var(--line)",
    cursor: "pointer", fontFamily: "Geist Mono", fontSize: 13,
    display: "flex", alignItems: "center", justifyContent: "center",
  } as const;
  const cells: { v: TriState; icon: string; color: string }[] = [
    { v: "deny", icon: "fa-xmark", color: "var(--danger)" },
    { v: "inherit", icon: "fa-slash", color: "var(--text-3)" },
    { v: "allow", icon: "fa-check", color: "var(--ok)" },
  ];
  return (
    <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", background: "var(--bg-2)" }}>
      {cells.map((c, i) => {
        const active = value === c.v;
        return (
          <button
            key={c.v}
            onClick={() => onChange(c.v)}
            style={{
              ...base,
              background: active ? c.color : "transparent",
              color: active ? "#fff" : c.color,
              borderLeft: i === 0 ? "1px solid var(--line)" : "none",
              borderRight: "1px solid var(--line)",
              borderTopLeftRadius: i === 0 ? 6 : 0,
              borderBottomLeftRadius: i === 0 ? 6 : 0,
              borderTopRightRadius: i === 2 ? 6 : 0,
              borderBottomRightRadius: i === 2 ? 6 : 0,
            }}
          >
            <i className={`fa-solid ${c.icon}`} style={{ fontSize: 11 }} />
          </button>
        );
      })}
    </div>
  );
}
