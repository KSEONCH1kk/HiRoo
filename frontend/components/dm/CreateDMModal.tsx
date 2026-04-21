"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { friendsApi, dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { UserPublic } from "@/types";

interface Props { onClose: () => void; }

export function CreateDMModal({ onClose }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: friends = [] } = useQuery<UserPublic[]>({
    queryKey: ["friends"],
    queryFn: friendsApi.list,
    staleTime: 30_000,
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, UserPublic>>({});
  const [groupName, setGroupName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedList = Object.values(selected);
  const isGroup = selectedList.length > 1;

  const filtered = friends.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      f.username.toLowerCase().includes(q) ||
      (f.display_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const toggle = (u: UserPublic) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });
  };

  const submit = async () => {
    if (selectedList.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const dm = await dmsApi.create(
        selectedList.map((u) => u.id),
        isGroup && groupName.trim() ? groupName.trim() : undefined,
      );
      qc.invalidateQueries({ queryKey: ["dms"] });
      onClose();
      router.push(`/dms/${dm.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось создать диалог");
    } finally {
      setSubmitting(false);
    }
  };

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
        className="modal-panel"
        style={{
          width: 480, maxHeight: "80vh", display: "flex", flexDirection: "column",
          background: "var(--bg-1)", border: "1px solid var(--line-strong)",
          borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-0)" }}>Новое сообщение</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>
            Выберите друзей — до 9 человек. Групповой чат создаётся автоматически.
          </div>
        </div>

        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--line)" }}>
          <input
            type="text"
            placeholder="Поиск по друзьям…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              width: "100%", background: "var(--bg-2)", border: "1px solid var(--line)",
              borderRadius: 8, padding: "8px 10px", color: "var(--text-0)", fontSize: 13.5,
              outline: "none",
            }}
          />
        </div>

        {selectedList.length > 0 && (
          <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectedList.map((u) => (
              <div key={u.id} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 4px 3px 6px", borderRadius: 999,
                background: "var(--bg-active)", border: "1px solid var(--accent)",
                fontSize: 12.5,
              }}>
                <span style={{ color: "var(--text-0)" }}>{u.display_name ?? u.username}</span>
                <button
                  onClick={() => toggle(u)}
                  style={{
                    width: 18, height: 18, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(255,255,255,0.1)", color: "var(--text-1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <i className="fa-solid fa-xmark" style={{ fontSize: 9 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-2)" }}>
              {friends.length === 0 ? "У вас ещё нет друзей. Добавьте их на вкладке «Друзья»." : "Никого не нашли."}
            </div>
          )}
          {filtered.map((u) => {
            const isSel = !!selected[u.id];
            return (
              <div
                key={u.id}
                onClick={() => toggle(u)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                  background: isSel ? "var(--bg-active)" : "transparent",
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <Avatar name={u.username} size={32} shape="circle" status={u.status} avatarUrl={u.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.display_name ?? u.username}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                    @{u.username}
                  </div>
                </div>
                <span style={{
                  width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSel ? "var(--accent)" : "var(--line-strong)"}`,
                  background: isSel ? "var(--accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSel && <i className="fa-solid fa-check" style={{ fontSize: 10, color: "#fff" }} />}
                </span>
              </div>
            );
          })}
        </div>

        {isGroup && (
          <div style={{ padding: "10px 20px", borderTop: "1px solid var(--line)" }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Название группы (необязательно)
            </label>
            <input
              type="text"
              maxLength={100}
              placeholder="например, «Проект HiRoo»"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              style={{
                width: "100%", marginTop: 6, background: "var(--bg-2)", border: "1px solid var(--line)",
                borderRadius: 8, padding: "7px 10px", color: "var(--text-0)", fontSize: 13.5,
                outline: "none",
              }}
            />
          </div>
        )}

        {error && (
          <div style={{ padding: "8px 20px", fontSize: 12.5, color: "var(--danger)" }}>{error}</div>
        )}

        <div style={{ padding: "12px 20px 14px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--bg-1)" }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={selectedList.length === 0 || selectedList.length > 9 || submitting}
          >
            {submitting ? "Создаём…" : isGroup ? `Создать группу (${selectedList.length})` : "Написать"}
          </Button>
        </div>
      </div>
    </div>
  );
}
