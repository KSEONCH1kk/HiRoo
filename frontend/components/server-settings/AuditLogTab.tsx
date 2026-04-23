"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { serversApi, usersApi, type AuditEntry } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import type { UserPublic } from "@/types";

const ACTION_LABELS: Record<string, { text: string; icon: string; color?: string }> = {
  server_update:         { text: "Изменил настройки сервера", icon: "fa-sliders" },
  channel_create:        { text: "Создал канал", icon: "fa-hashtag", color: "var(--ok, #58cf8c)" },
  channel_update:        { text: "Изменил канал", icon: "fa-pen" },
  channel_delete:        { text: "Удалил канал", icon: "fa-trash", color: "var(--danger)" },
  role_create:           { text: "Создал роль", icon: "fa-shield", color: "var(--ok, #58cf8c)" },
  role_update:           { text: "Изменил роль", icon: "fa-shield-halved" },
  role_delete:           { text: "Удалил роль", icon: "fa-shield", color: "var(--danger)" },
  role_reorder:          { text: "Переупорядочил роли", icon: "fa-arrows-up-down" },
  member_kick:           { text: "Исключил участника", icon: "fa-user-minus", color: "var(--danger)" },
  member_ban:            { text: "Забанил участника", icon: "fa-hammer", color: "var(--danger)" },
  member_unban:          { text: "Разбанил участника", icon: "fa-user-check", color: "var(--ok, #58cf8c)" },
  member_timeout:        { text: "Выдал тайм-аут участнику", icon: "fa-hourglass-half", color: "var(--danger)" },
  member_timeout_remove: { text: "Снял тайм-аут с участника", icon: "fa-hourglass-end", color: "var(--ok, #58cf8c)" },
  automod_trigger:       { text: "Автомодерация сработала на", icon: "fa-shield-virus", color: "var(--danger)" },
};

function actionMeta(key: string) {
  return ACTION_LABELS[key] ?? { text: key, icon: "fa-circle-info" };
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} сек`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.round((sec % 86400) / 3600);
  return h ? `${d} д ${h} ч` : `${d} д`;
}

/** Render an extras dict as a terse, human-readable summary.
 * Known keys get friendly labels; unknown keys fall back to `key: value`. */
function formatExtras(action: string, extra: Record<string, any>): string | null {
  const parts: string[] = [];
  const pushed = new Set<string>();
  const push = (k: string, v: string) => { parts.push(v); pushed.add(k); };

  if (typeof extra.duration_seconds === "number") {
    push("duration_seconds", `на ${formatDuration(extra.duration_seconds)}`);
  }
  if (typeof extra.until === "string") {
    try {
      const d = new Date(extra.until);
      push("until", `до ${d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`);
    } catch {}
  }
  if (typeof extra.count === "number") {
    push("count", action === "role_reorder" ? `${extra.count} ролей` : `количество: ${extra.count}`);
  }
  if (extra.type && !pushed.has("type") && !extra.name) {
    const t = extra.type;
    push("type", t === "voice" ? "голосовой" : t === "forum" ? "форум" : t === "category" ? "категория" : String(t));
  }

  // Hide plumbing that isn't useful in a log row.
  const HIDDEN = new Set(["channel_id", "role_id", "user_id", "type", "name"]);
  for (const [k, v] of Object.entries(extra)) {
    if (pushed.has(k) || HIDDEN.has(k)) continue;
    const val = typeof v === "string" ? v : JSON.stringify(v);
    if (val == null || val === "") continue;
    parts.push(`${k}: ${val}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function AuditLogTab({ serverId }: { serverId: string }) {
  const [filter, setFilter] = useState<string>("");
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", serverId, filter],
    queryFn: () => serversApi.auditLog(serverId, { limit: 100, action: filter || undefined }),
  });

  const entries = data?.entries ?? [];

  // Fetch actor profiles lazily — dedupe IDs, fetch each only once.
  const actorIds = useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => { if (e.actor_id) s.add(e.actor_id); });
    return [...s];
  }, [entries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 780 }}>
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Журнал действий администраторов и ботов — каналы, роли, баны, настройки сервера.
        Записи неизменяемы и хранятся пока существует сервер.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["", "Все"],
          ["channel_create", "Каналы +"],
          ["channel_delete", "Каналы −"],
          ["role_create", "Роли"],
          ["member_kick", "Кики"],
          ["member_ban", "Баны"],
          ["member_unban", "Разбаны"],
          ["member_timeout", "Тайм-ауты"],
          ["server_update", "Настройки"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: "5px 12px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${filter === k ? "var(--accent)" : "var(--line-strong)"}`,
              background: filter === k ? "rgba(124,92,255,0.12)" : "transparent",
              color: filter === k ? "var(--accent)" : "var(--text-1)",
              fontSize: 12, fontWeight: 600,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {isLoading && <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>}
        {!isLoading && entries.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13, borderRadius: 8, background: "var(--bg-2)", border: "1px dashed var(--line)" }}>
            Нет записей.
          </div>
        )}
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} />
        ))}
      </div>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = actionMeta(entry.action);
  const { data: actor } = useQuery<UserPublic>({
    queryKey: ["user-profile", entry.actor_id],
    queryFn: () => usersApi.get(entry.actor_id!),
    enabled: !!entry.actor_id,
    staleTime: 60_000,
  });
  const { data: target } = useQuery<UserPublic>({
    queryKey: ["user-profile", entry.target_user_id],
    queryFn: () => usersApi.get(entry.target_user_id!),
    enabled: !!entry.target_user_id,
    staleTime: 60_000,
  });

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px", borderRadius: 8,
      background: "var(--bg-2)", border: "1px solid var(--line)",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: meta.color ? `${meta.color}22` : "var(--bg-3)",
        color: meta.color ?? "var(--text-1)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <i className={`fa-solid ${meta.icon}`} style={{ fontSize: 12 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: "var(--text-0)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {actor && (
            <Avatar name={actor.username} size={18} shape="circle" avatarUrl={actor.avatar_url} />
          )}
          <span style={{ fontWeight: 600 }}>
            {actor?.display_name ?? actor?.username ?? (entry.actor_id ? "Пользователь" : "Система")}
          </span>
          <span style={{ color: "var(--text-2)" }}>{meta.text.toLowerCase()}</span>
          {target && (
            <span style={{ fontWeight: 600, color: "var(--danger)" }}>
              {target.display_name ?? target.username}
            </span>
          )}
          {entry.extra?.name && (
            <span style={{ color: "var(--accent)", fontFamily: "Geist Mono", fontSize: 12 }}>
              {entry.extra.type === "voice" ? "🔊" : entry.extra.type === "forum" ? "💬" : "#"}
              {entry.extra.name}
            </span>
          )}
        </div>
        {entry.reason && (
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 3, fontStyle: "italic" }}>
            Причина: {entry.reason}
          </div>
        )}
        {entry.extra && Object.keys(entry.extra).length > 0 && !entry.extra.name && (() => {
          const summary = formatExtras(entry.action, entry.extra);
          if (!summary) return null;
          return (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </div>
          );
        })()}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", flexShrink: 0, paddingTop: 5 }}>
        {new Date(entry.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
      </div>
    </div>
  );
}
