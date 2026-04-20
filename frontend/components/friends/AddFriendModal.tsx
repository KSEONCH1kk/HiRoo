"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendsApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export function AddFriendModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [success, setSuccess] = useState(false);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: () => friendsApi.sendRequest(username.trim()),
    onSuccess: () => { setSuccess(true); qc.invalidateQueries({ queryKey: ["friends-pending"] }); },
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, borderRadius: 16, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 6, letterSpacing: -0.4 }}>Добавить друга</div>
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 20 }}>Введите имя пользователя для отправки заявки</div>

        {success ? (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(62,207,142,0.1)", border: "1px solid rgba(62,207,142,0.3)", color: "var(--ok)", fontSize: 14, marginBottom: 16 }}>
            Заявка отправлена пользователю <strong>{username}</strong>!
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={username} onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send.mutate(); }}
              placeholder="имя_пользователя"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit" }}
            />
            <Button variant="primary" onClick={() => send.mutate()} disabled={!username.trim() || send.isPending}>
              {send.isPending ? "…" : "Отправить"}
            </Button>
          </div>
        )}

        {send.isError && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>
            {(send.error as any)?.response?.data?.detail ?? "Не удалось отправить заявку"}
          </p>
        )}

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
}
