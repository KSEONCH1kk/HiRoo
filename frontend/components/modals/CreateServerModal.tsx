"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { serversApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { Button } from "@/components/ui/Button";

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const router = useRouter();
  const { setServers, servers } = useServerStore();

  const create = useMutation({
    mutationFn: () => serversApi.create({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (server) => {
      setServers([...servers, server]);
      onClose();
      router.push(`/servers/${server.id}`);
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-panel" style={{ width: 460, borderRadius: 16, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 4, letterSpacing: -0.4 }}>Создать сервер</div>
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 20 }}>Ваш сервер — это место где вы встречаетесь с друзьями</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
              Название сервера *
            </label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create.mutate(); }}
              placeholder="Мой сервер"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
              Описание
            </label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="О чём этот сервер?" style={inputStyle} />
          </div>
        </div>

        {create.isError && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>
            {(create.error as any)?.response?.data?.detail ?? "Ошибка создания"}
          </p>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "…" : "Создать"}
          </Button>
        </div>
      </div>
    </div>
  );
}
