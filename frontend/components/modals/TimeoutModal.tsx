"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface Props {
  serverId: string;
  userId: string;
  displayName?: string;
  onClose: () => void;
}

const DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 60, label: "60 секунд" },
  { seconds: 5 * 60, label: "5 минут" },
  { seconds: 10 * 60, label: "10 минут" },
  { seconds: 60 * 60, label: "1 час" },
  { seconds: 24 * 60 * 60, label: "1 день" },
  { seconds: 7 * 24 * 60 * 60, label: "1 неделя" },
];

export function TimeoutModal({ serverId, userId, displayName, onClose }: Props) {
  const qc = useQueryClient();
  const [duration, setDuration] = useState<number>(5 * 60);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: () => serversApi.setTimeout(serverId, userId, duration, reason.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", serverId] });
      onClose();
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Не удалось выдать тайм-аут"),
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: "100%",
          background: "var(--bg-2)",
          border: "1px solid var(--line-strong)",
          borderRadius: 14,
          padding: 22,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "rgba(255,80,80,0.12)",
            color: "var(--danger)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className="fa-solid fa-hourglass-half" style={{ fontSize: 14 }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", letterSpacing: -0.3 }}>
            Выдать тайм-аут
          </div>
        </div>
        {displayName && (
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
            Участнику <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>{displayName}</strong> —
            он не сможет писать в чат, постить на форумах и подключаться к голосовым каналам.
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
          Длительность
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 6, marginBottom: 16,
        }}>
          {DURATIONS.map((d) => (
            <button
              key={d.seconds}
              onClick={() => setDuration(d.seconds)}
              style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: duration === d.seconds ? "rgba(124,92,255,0.15)" : "var(--bg-1)",
                border: duration === d.seconds ? "1px solid var(--accent)" : "1px solid var(--line)",
                color: duration === d.seconds ? "var(--accent)" : "var(--text-1)",
                fontSize: 13.5, fontWeight: 600,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>
          Причина (необязательно)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          placeholder="Спам, реклама, оскорбления…"
          rows={2}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: "var(--bg-0)", border: "1px solid var(--line-strong)",
            color: "var(--text-0)", fontSize: 13.5, outline: "none",
            fontFamily: "inherit", boxSizing: "border-box", resize: "vertical",
            marginBottom: 14,
          }}
        />

        {err && (
          <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "var(--danger)", fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => apply.mutate()} disabled={apply.isPending}>
            {apply.isPending ? "…" : "Выдать тайм-аут"}
          </Button>
        </div>
      </div>
    </div>
  );
}
