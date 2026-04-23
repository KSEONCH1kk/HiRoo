"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi, usersApi, type ServerBan } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { UserPublic } from "@/types";

export function BansTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: bans = [], isLoading } = useQuery<ServerBan[]>({
    queryKey: ["server-bans", serverId],
    queryFn: () => serversApi.listBans(serverId),
  });

  const unban = useMutation({
    mutationFn: (userId: string) => serversApi.unbanMember(serverId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["server-bans", serverId] }),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Список забаненных пользователей. Разбан вернёт доступ — участник сможет заново вступить по приглашению.
      </div>

      <div style={{ position: "relative" }}>
        <i className="fa-solid fa-magnifying-glass" style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-3)", fontSize: 12,
        }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени или причине…"
          style={{
            width: "100%", padding: "9px 12px 9px 32px", borderRadius: 8,
            background: "var(--bg-0)", border: "1px solid var(--line-strong)",
            color: "var(--text-0)", fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {isLoading && <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>}
        {!isLoading && bans.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13, borderRadius: 8, background: "var(--bg-2)", border: "1px dashed var(--line)" }}>
            Нет забаненных.
          </div>
        )}
        {bans.map((b) => (
          <BanRow
            key={b.user_id}
            ban={b}
            filter={q.trim().toLowerCase()}
            onUnban={() => {
              if (confirm("Разбанить пользователя?")) unban.mutate(b.user_id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BanRow({ ban, filter, onUnban }: {
  ban: ServerBan; filter: string; onUnban: () => void;
}) {
  const { data: u } = useQuery<UserPublic>({
    queryKey: ["user-profile", ban.user_id],
    queryFn: () => usersApi.get(ban.user_id),
    staleTime: 60_000,
  });

  // Simple client-side filter
  const hay = useMemo(() => [
    u?.username, u?.display_name, ban.reason, ban.user_id,
  ].filter(Boolean).join(" ").toLowerCase(), [u, ban]);
  if (filter && !hay.includes(filter)) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      background: "var(--bg-2)", border: "1px solid var(--line)",
    }}>
      {u ? (
        <Avatar name={u.username} size={36} shape="circle" avatarUrl={u.avatar_url} />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", background: "var(--bg-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-2)", flexShrink: 0,
        }}>
          <i className="fa-solid fa-user-slash" style={{ fontSize: 14 }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {u?.display_name ?? u?.username ?? "Удалён"}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {u?.username ? `@${u.username} · ` : ""}
          {new Date(ban.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
        </div>
        {ban.reason && (
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ban.reason}
          </div>
        )}
      </div>
      <Button size="sm" variant="soft" onClick={onUnban}>
        <i className="fa-solid fa-user-check" style={{ marginRight: 6 }} />
        Разбанить
      </Button>
    </div>
  );
}
