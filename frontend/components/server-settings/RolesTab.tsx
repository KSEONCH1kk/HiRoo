"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, type Role } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { PERMISSION_GROUPS, hasPerm, togglePerm } from "@/lib/permissions";

const DEFAULT_COLORS = ["#99aab5", "#7c5cff", "#5b8af0", "#3ecf8e", "#f0a050", "#e05c7a", "#f5c842", "#e67e22"];

export function RolesTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Role | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["roles", serverId],
    queryFn: () => rolesApi.list(serverId),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => rolesApi.reorder(serverId, orderedIds),
    onError: () => qc.invalidateQueries({ queryKey: ["roles", serverId] }),
  });

  function handleReorder(sourceId: string, targetId: string, pos: "before" | "after") {
    if (sourceId === targetId) return;
    // sorted goes top → bottom (highest position first).
    const list = [...roles].sort((a, b) => b.position - a.position);
    const src = list.find((r) => r.id === sourceId);
    const tgt = list.find((r) => r.id === targetId);
    if (!src || !tgt) return;
    // @everyone is always at the bottom — don't let it move.
    if (src.is_everyone) return;
    const filtered = list.filter((r) => r.id !== sourceId && !r.is_everyone);
    let idx = filtered.findIndex((r) => r.id === targetId);
    if (idx < 0) idx = filtered.length;
    if (pos === "after") idx += 1;
    filtered.splice(idx, 0, src);
    const everyoneRole = list.find((r) => r.is_everyone);
    const finalOrder = [...filtered.map((r) => r.id)];
    if (everyoneRole) finalOrder.push(everyoneRole.id);
    // Optimistic — update react-query cache for instant visual feedback.
    qc.setQueryData<Role[]>(["roles", serverId], (old) => {
      if (!old) return old;
      const total = finalOrder.length;
      return old.map((r) => {
        const idx = finalOrder.indexOf(r.id);
        if (idx < 0) return r;
        if (r.is_everyone) return { ...r, position: 0 };
        return { ...r, position: total - idx };
      });
    });
    reorder.mutate(finalOrder);
  }

  useEffect(() => {
    if (!selectedId && roles.length > 0) setSelectedId(roles[0].id);
  }, [roles.length]);

  useEffect(() => {
    const r = roles.find((x) => x.id === selectedId);
    setDraft(r ? { ...r } : null);
  }, [selectedId, roles]);

  const create = useMutation({
    mutationFn: () => rolesApi.create(serverId, { name: "Новая роль" }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["roles", serverId] }); setSelectedId(r.id); },
  });

  const save = useMutation({
    mutationFn: (data: Partial<Role>) => rolesApi.update(serverId, selectedId!, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", serverId] }),
  });

  const del = useMutation({
    mutationFn: () => rolesApi.delete(serverId, selectedId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles", serverId] }); setSelectedId(null); },
  });

  const sorted = [...roles].sort((a, b) => b.position - a.position);
  const isDirty = draft && selectedId && JSON.stringify(draft) !== JSON.stringify(roles.find((r) => r.id === selectedId));

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 180px)" }}>
      {/* Roles list */}
      <div style={{ width: 220, flexShrink: 0, background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>Роли</span>
          <button onClick={() => create.mutate()} title="Создать роль" style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer" }}>
            <i className="fa-solid fa-plus" style={{ fontSize: 11 }} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
          {sorted.map((r) => {
            const canDrag = !r.is_everyone;
            const hl = dropTarget?.id === r.id ? dropTarget.pos : null;
            return (
              <div
                key={r.id}
                draggable={canDrag}
                onDragStart={(e) => {
                  if (!canDrag) return;
                  e.dataTransfer.setData("hiroo/role", r.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(r.id);
                }}
                onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("hiroo/role")) return;
                  if (r.is_everyone) return;
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const pos = (e.clientY - rect.top) < rect.height / 2 ? "before" : "after";
                  setDropTarget({ id: r.id, pos });
                }}
                onDragLeave={() => setDropTarget((t) => (t?.id === r.id ? null : t))}
                onDrop={(e) => {
                  const src = e.dataTransfer.getData("hiroo/role");
                  e.preventDefault();
                  const pos = dropTarget?.id === r.id ? dropTarget.pos : "after";
                  setDropTarget(null);
                  setDragId(null);
                  if (src) handleReorder(src, r.id, pos);
                }}
                onClick={() => setSelectedId(r.id)}
                style={{
                  padding: "7px 10px", borderRadius: 6,
                  cursor: canDrag ? "grab" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  background: selectedId === r.id ? "var(--bg-active)" : "transparent",
                  opacity: dragId === r.id ? 0.45 : 1,
                  position: "relative",
                  borderTop: hl === "before" ? "2px solid var(--accent)" : "2px solid transparent",
                  borderBottom: hl === "after" ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => { if (selectedId !== r.id && !dragId) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (selectedId !== r.id) e.currentTarget.style.background = "transparent"; }}
              >
                {canDrag && (
                  <i className="fa-solid fa-grip-vertical" style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, opacity: 0.6 }} />
                )}
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-0)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                {r.is_everyone && <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "Geist Mono" }}>default</span>}
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>Ролей пока нет</div>}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
        {!draft ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)", fontSize: 14 }}>Выберите роль слева</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                Название
              </label>
              <input
                value={draft.name}
                disabled={draft.is_everyone}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                style={{ width: "100%", maxWidth: 320, padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 14, outline: "none", boxSizing: "border-box", opacity: draft.is_everyone ? 0.5 : 1 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                Цвет
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DEFAULT_COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setDraft({ ...draft, color: c })}
                    style={{
                      width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                      border: `3px solid ${draft.color === c ? "var(--text-0)" : "transparent"}`,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", background: "transparent" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <Toggle on={draft.hoist} onChange={(v) => setDraft({ ...draft, hoist: v })} />
                <span style={{ fontSize: 13.5, color: "var(--text-0)" }}>Отображать отдельно в списке</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <Toggle on={draft.mentionable} onChange={(v) => setDraft({ ...draft, mentionable: v })} />
                <span style={{ fontSize: 13.5, color: "var(--text-0)" }}>Можно упоминать</span>
              </label>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Права
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {PERMISSION_GROUPS.map((grp) => (
                  <div key={grp.title}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginBottom: 6, textTransform: "uppercase" }}>{grp.title}</div>
                    <div style={{ background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
                      {grp.items.map((it, i) => (
                        <div key={it.key}
                          style={{
                            padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
                            borderBottom: i === grp.items.length - 1 ? "none" : "1px solid var(--line)",
                          }}>
                          <div>
                            <div style={{ fontSize: 13.5, color: "var(--text-0)" }}>{it.label}</div>
                            {it.hint && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{it.hint}</div>}
                          </div>
                          <Toggle
                            on={hasPerm(draft.permissions, it.key)}
                            onChange={() => setDraft({ ...draft, permissions: togglePerm(draft.permissions, it.key) })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              {!draft.is_everyone ? (
                <Button variant="danger" onClick={() => { if (confirm(`Удалить роль «${draft.name}»?`)) del.mutate(); }}>
                  Удалить роль
                </Button>
              ) : <div />}
              <div style={{ display: "flex", gap: 8 }}>
                {save.isSuccess && !isDirty && <span style={{ fontSize: 13, color: "var(--ok)", alignSelf: "center" }}>Сохранено</span>}
                <Button
                  variant="primary"
                  disabled={!isDirty || save.isPending}
                  onClick={() => save.mutate({ name: draft.name, color: draft.color, permissions: draft.permissions, hoist: draft.hoist, mentionable: draft.mentionable })}
                >
                  {save.isPending ? "…" : "Сохранить"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
