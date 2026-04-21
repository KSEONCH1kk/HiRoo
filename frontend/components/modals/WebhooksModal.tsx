"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webhooksApi, type Webhook } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { EmbedBuilderModal } from "@/components/modals/EmbedBuilderModal";
import type { Channel } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function fullUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

interface Props { serverId: string; channel: Channel; onClose: () => void; }

export function WebhooksModal({ serverId, channel, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [builder, setBuilder] = useState<Webhook | null>(null);

  const { data: hooks = [] } = useQuery<Webhook[]>({
    queryKey: ["webhooks", channel.id],
    queryFn: () => webhooksApi.list(serverId, channel.id),
  });

  const create = useMutation({
    mutationFn: () => webhooksApi.create(serverId, channel.id, { name: name.trim(), avatar_url: avatarUrl.trim() || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks", channel.id] }); setName(""); setAvatarUrl(""); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Не удалось создать"),
  });
  const del = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(serverId, channel.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", channel.id] }),
  });
  const regen = useMutation({
    mutationFn: (id: string) => webhooksApi.regenerate(serverId, channel.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", channel.id] }),
  });

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(fullUrl(url));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 620, maxHeight: "86vh", display: "flex", flexDirection: "column",
        background: "var(--bg-1)", border: "1px solid var(--line-strong)",
        borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-plug" style={{ color: "var(--text-2)", fontSize: 13 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>Вебхуки</span>
            <span style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono" }}>#{channel.name}</span>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", borderRadius: 6 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-2)" }}>
            Создайте URL, на который внешние сервисы могут отправлять POST-запросы и сообщения появятся в этом канале.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" maxLength={80} placeholder="Имя (например, «GitHub Bot»)"
              value={name} onChange={(e) => setName(e.target.value)}
              style={{ flex: 1, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", color: "var(--text-0)", fontSize: 13, outline: "none" }}
            />
            <input
              type="text" maxLength={255} placeholder="URL аватара (необязательно)"
              value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
              style={{ flex: 1, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", color: "var(--text-0)", fontSize: 13, outline: "none" }}
            />
            <Button variant="primary" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Создать
            </Button>
          </div>
          {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {hooks.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>
              Пока нет вебхуков.
            </div>
          )}
          {hooks.map((w) => (
            <div key={w.id} style={{
              display: "flex", flexDirection: "column", gap: 8,
              padding: "12px 14px", borderRadius: 10, margin: "6px 4px",
              background: "var(--bg-2)", border: "1px solid var(--line)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={w.name} size={34} shape="circle" avatarUrl={w.avatar_url ?? null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                    создан {new Date(w.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
                <button
                  onClick={() => regen.mutate(w.id)}
                  title="Сгенерировать новый токен"
                  disabled={regen.isPending}
                  style={{ width: 30, height: 30, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)" }}
                >
                  <i className="fa-solid fa-rotate" style={{ fontSize: 12 }} />
                </button>
                <button
                  onClick={() => { if (confirm(`Удалить вебхук «${w.name}»?`)) del.mutate(w.id); }}
                  title="Удалить"
                  disabled={del.isPending}
                  style={{ width: 30, height: 30, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "var(--danger)" }}
                >
                  <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{
                  flex: 1, padding: "7px 10px", borderRadius: 6,
                  background: "var(--bg-3)", border: "1px solid var(--line)",
                  fontSize: 11.5, color: "var(--text-1)", fontFamily: "Geist Mono",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {fullUrl(w.url)}
                </div>
                <Button variant="soft" onClick={() => copy(w.id, w.url)}>
                  {copiedId === w.id ? "Скопировано" : "Копировать"}
                </Button>
                <Button variant="soft" onClick={() => setBuilder(w)} icon={<i className="fa-solid fa-bolt" style={{ fontSize: 11 }} />}>
                  Embed
                </Button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                POST с JSON: <code style={{ background: "var(--bg-3)", padding: "1px 5px", borderRadius: 3, fontFamily: "Geist Mono" }}>{`{"content": "текст", "username": "необяз.", "avatar_url": "необяз."}`}</code>
              </div>
            </div>
          ))}
        </div>
      </div>

      {builder && (
        <EmbedBuilderModal
          webhookId={builder.id}
          webhookToken={builder.token}
          onClose={() => setBuilder(null)}
        />
      )}
    </div>
  );
}
