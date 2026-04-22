"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi, usersApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ClanTag } from "@/components/ui/ClanTag";
import type { Server } from "@/types";

/** Server admins configure a short "clan tag" — an icon + up to 8 characters
 * of label. Members who pick this server as their active tag source will see
 * the pill appear next to their name everywhere. */
export function TagTab({ server }: { server: Server }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(server.tag_label ?? "");
  const [icon, setIcon] = useState(server.tag_icon ?? "");
  const [err, setErr] = useState<string | null>(null);

  const { data: icons } = useQuery({
    queryKey: ["tag-icons"],
    queryFn: () => usersApi.tagIcons(),
    staleTime: 1000 * 60 * 30,
  });

  const save = useMutation({
    mutationFn: () => serversApi.update(server.id, {
      tag_label: label.trim(),
      tag_icon: icon.trim(),
    } as any),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["server", server.id] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Не удалось сохранить"),
  });

  const clear = useMutation({
    mutationFn: () => serversApi.update(server.id, {
      tag_label: "",
      tag_icon: "",
    } as any),
    onSuccess: () => {
      setLabel(""); setIcon("");
      qc.invalidateQueries({ queryKey: ["server", server.id] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
  });

  const canSave = label.trim().length > 0 && label.trim().length <= 8 && !!icon;
  const hasTag = server.tag_label && server.tag_icon;
  const previewTag = canSave
    ? { label: label.trim(), icon: icon.trim(), server_id: server.id, server_name: server.name }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 640 }}>
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Участники сервера смогут выбрать ваш тэг в настройках своего профиля. Он появится
        рядом с их именем во всех сообщениях и списках участников.
      </div>

      {previewTag && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Предпросмотр
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--text-0)" }}>Имя пользователя</span>
            <ClanTag tag={previewTag} nonInteractive />
          </div>
        </div>
      )}

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Текст тэга (до 8 символов)
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 8))}
          placeholder="ELITE"
          maxLength={8}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: "var(--bg-0)", border: "1px solid var(--line-strong)",
            color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 10 }}>
          Иконка
        </label>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
          gap: 6, maxHeight: 280, overflowY: "auto", padding: 2,
        }}>
          {(icons ?? []).map((key) => {
            const selected = key === icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                title={key}
                style={{
                  height: 44, borderRadius: 8, cursor: "pointer",
                  background: selected ? "var(--accent)" : "var(--bg-2)",
                  border: selected ? "1px solid var(--accent)" : "1px solid var(--line)",
                  color: selected ? "#fff" : "var(--text-1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <i className={`fa-solid fa-${key}`} style={{ fontSize: 16 }} />
              </button>
            );
          })}
        </div>
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {hasTag && (
          <Button
            variant="ghost"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
          >
            Удалить тэг
          </Button>
        )}
        <Button
          variant="primary"
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
        >
          {save.isPending ? "…" : (hasTag ? "Обновить" : "Создать тэг")}
        </Button>
      </div>
    </div>
  );
}
