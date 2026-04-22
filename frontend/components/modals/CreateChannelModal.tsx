"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { Button } from "@/components/ui/Button";

type ChType = "text" | "voice" | "forum" | "category";

interface Props {
  serverId: string;
  onClose: () => void;
  initialType?: ChType;
  parentId?: string | null;
}

const META: Record<ChType, { icon: string; label: string; hint: string }> = {
  text:     { icon: "fa-hashtag",      label: "Текстовый",  hint: "Отправляйте сообщения" },
  voice:    { icon: "fa-volume-high",  label: "Голосовой",  hint: "Голосовой и видеочат" },
  forum:    { icon: "fa-comments",     label: "Форум",      hint: "Организованные обсуждения с тэгами" },
  category: { icon: "fa-layer-group",  label: "Категория",  hint: "Группирует каналы" },
};

export function CreateChannelModal({ serverId, onClose, initialType = "text", parentId = null }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ChType>(initialType);
  const [topic, setTopic] = useState("");
  const addChannel = useServerStore((s) => s.addChannel);
  const qc = useQueryClient();

  // Categories can't be nested; clear parent if user flipped to category.
  const effectiveParent = type === "category" ? null : parentId ?? null;

  const create = useMutation({
    mutationFn: () => channelsApi.create(serverId, {
      name: name.trim().toLowerCase().replace(/\s+/g, "-"),
      type,
      topic: topic.trim() || undefined,
      parent_id: effectiveParent,
    }),
    onSuccess: (channel) => {
      addChannel(channel);
      qc.invalidateQueries({ queryKey: ["channels", serverId] });
      onClose();
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  const types: ChType[] = ["text", "voice", "forum", "category"];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-panel" style={{ width: 480, maxWidth: "94vw", borderRadius: 16, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 6, letterSpacing: -0.4 }}>
          Создать {type === "category" ? "категорию" : "канал"}
        </div>
        {parentId && type !== "category" && (
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, fontFamily: "Geist Mono" }}>
            в категории
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {types.map((t) => (
            <div
              key={t}
              onClick={() => setType(t)}
              style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${type === t ? "var(--accent)" : "var(--line-strong)"}`,
                background: type === t ? "rgba(124,92,255,0.1)" : "var(--bg-0)",
                display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <i className={`fa-solid ${META[t].icon}`} style={{ color: type === t ? "var(--accent)" : "var(--text-2)", fontSize: 14, width: 18 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: type === t ? "var(--text-0)" : "var(--text-1)" }}>
                  {META[t].label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {META[t].hint}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
              Название *
            </label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder={
                type === "category" ? "новая-категория"
                  : type === "forum" ? "вопросы-и-ответы"
                  : type === "voice" ? "голосовой-канал"
                  : "новый-канал"
              }
              style={inputStyle} autoFocus
            />
          </div>
          {(type === "text" || type === "forum") && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                {type === "forum" ? "Правила / описание" : "Тема"}
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={type === "forum" ? "Кратко — что можно постить" : "О чём этот канал?"}
                style={inputStyle}
              />
            </div>
          )}
        </div>

        {create.isError && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>
            {(create.error as any)?.response?.data?.detail ?? "Ошибка создания"}
          </p>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "…" : `Создать ${type === "category" ? "категорию" : "канал"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
