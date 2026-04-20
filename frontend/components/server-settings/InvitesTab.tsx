"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import type { Server } from "@/types";

export function InvitesTab({ server }: { server: Server }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(server.invite_code);

  const regen = useMutation({
    mutationFn: () => serversApi.regenerateInvite(server.id),
    onSuccess: (res) => {
      setCode(res.invite_code);
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
  });

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${code}`;

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      else {
        const ta = document.createElement("textarea");
        ta.value = link; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ padding: "16px 18px", background: "var(--bg-2)", borderRadius: 12, border: "1px solid var(--line)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", marginBottom: 4 }}>Ссылка-приглашение</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>
          Делитесь этой ссылкой, чтобы пригласить новых участников
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            readOnly
            value={link}
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 13, fontFamily: "Geist Mono", outline: "none" }}
          />
          <Button variant="primary" onClick={copy}>
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--text-2)" }}>
          <span>Код: <span style={{ fontFamily: "Geist Mono", color: "var(--text-0)" }}>{code}</span></span>
          <Button size="sm" variant="ghost" onClick={() => regen.mutate()} disabled={regen.isPending}>
            <i className="fa-solid fa-rotate" style={{ marginRight: 6, fontSize: 11 }} />
            {regen.isPending ? "…" : "Новый код"}
          </Button>
        </div>
      </div>
    </div>
  );
}
