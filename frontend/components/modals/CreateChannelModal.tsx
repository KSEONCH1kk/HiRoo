"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { channelsApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { Button } from "@/components/ui/Button";

interface Props { serverId: string; onClose: () => void; initialType?: "text" | "voice"; }

export function CreateChannelModal({ serverId, onClose, initialType = "text" }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">(initialType);
  const [topic, setTopic] = useState("");
  const addChannel = useServerStore((s) => s.addChannel);

  const create = useMutation({
    mutationFn: () => channelsApi.create(serverId, { name: name.trim().toLowerCase().replace(/\s+/g, "-"), type, topic: topic.trim() || undefined }),
    onSuccess: (channel) => {
      addChannel(channel);
      onClose();
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, borderRadius: 16, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 20, letterSpacing: -0.4 }}>Создать канал</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["text", "voice"] as const).map((t) => (
            <div
              key={t}
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${type === t ? "var(--accent)" : "var(--line-strong)"}`,
                background: type === t ? "rgba(124,92,255,0.1)" : "var(--bg-0)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <i className={`fa-solid ${t === "voice" ? "fa-volume-high" : "fa-hashtag"}`} style={{ color: type === t ? "var(--accent)" : "var(--text-2)", fontSize: 14 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: type === t ? "var(--text-0)" : "var(--text-1)" }}>
                  {t === "text" ? "Текстовый" : "Голосовой"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                  {t === "text" ? "Отправляйте сообщения" : "Голосовой и видеочат"}
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
              placeholder={type === "text" ? "новый-канал" : "голосовой-канал"}
              style={inputStyle} autoFocus
            />
          </div>
          {type === "text" && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                Тема
              </label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="О чём этот канал?" style={inputStyle} />
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
            {create.isPending ? "…" : "Создать канал"}
          </Button>
        </div>
      </div>
    </div>
  );
}
