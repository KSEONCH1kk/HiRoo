"use client";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import type { Server } from "@/types";

export function AutoModTab({ server }: { server: Server }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(!!(server as any).auto_mod_enabled);
  const [wordsText, setWordsText] = useState<string>(
    (((server as any).auto_mod_words as string[] | undefined) ?? []).join("\n"),
  );
  const [mentionThreshold, setMentionThreshold] = useState<number>(
    ((server as any).auto_mod_mention_threshold as number | undefined) ?? 0,
  );
  const [action, setAction] = useState<"delete" | "timeout">(
    ((server as any).auto_mod_action as "delete" | "timeout" | undefined) ?? "delete",
  );
  const [timeoutSec, setTimeoutSec] = useState<number>(
    ((server as any).auto_mod_timeout_seconds as number | undefined) ?? 300,
  );

  useEffect(() => {
    setEnabled(!!(server as any).auto_mod_enabled);
  }, [(server as any).auto_mod_enabled]);

  const save = useMutation({
    mutationFn: () => serversApi.update(server.id, {
      auto_mod_enabled: enabled,
      auto_mod_words: wordsText.split(/\r?\n/).map((w) => w.trim()).filter(Boolean),
      auto_mod_mention_threshold: Math.max(0, Math.min(50, mentionThreshold | 0)),
      auto_mod_action: action,
      auto_mod_timeout_seconds: Math.max(60, Math.min(7 * 24 * 60 * 60, timeoutSec | 0)),
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", server.id] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Автомодерация проверяет сообщения новых участников и удаляет или выдаёт тайм-аут
        за запрещённые слова и спам упоминаниями. Админы и владельцы сервера не попадают под
        проверки — их сообщения всегда пропускаются.
      </div>

      <div style={{
        padding: "14px 16px", borderRadius: 10,
        background: "var(--bg-2)", border: "1px solid var(--line)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>
            Автомодерация включена
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
            Правила ниже применяются только при включённом тумблере
          </div>
        </div>
        <Toggle on={enabled} onChange={setEnabled} />
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Запрещённые слова / фразы (одна на строку)
        </label>
        <textarea
          value={wordsText}
          onChange={(e) => setWordsText(e.target.value)}
          rows={8}
          placeholder="мат-1&#10;мат-2&#10;фраза целиком"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "Geist Mono", fontSize: 13 }}
        />
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
          Без учёта регистра. Совпадение по подстроке. Оставьте пустым чтобы отключить.
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Порог упоминаний в одном сообщении
        </label>
        <input
          type="number"
          min={0} max={50}
          value={mentionThreshold}
          onChange={(e) => setMentionThreshold(parseInt(e.target.value || "0"))}
          style={{ ...inputStyle, width: 120 }}
        />
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
          Если в сообщении ≥ этого числа @mentions — сработает автомод. 0 = отключено.
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 8 }}>
          Действие при срабатывании
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {([
            ["delete", "fa-trash", "Удалить сообщение", "Просто не отправить"],
            ["timeout", "fa-hourglass-half", "Удалить + тайм-аут", "Плюс мут на срок"],
          ] as const).map(([val, icon, title, hint]) => (
            <button
              key={val}
              onClick={() => setAction(val)}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                background: action === val ? "rgba(124,92,255,0.12)" : "var(--bg-2)",
                border: action === val ? "1px solid var(--accent)" : "1px solid var(--line)",
                color: action === val ? "var(--accent)" : "var(--text-1)",
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                <i className={`fa-solid ${icon}`} style={{ fontSize: 12 }} />
                {title}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{hint}</div>
            </button>
          ))}
        </div>
      </div>

      {action === "timeout" && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
            Длительность тайм-аута
          </label>
          <select
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(parseInt(e.target.value))}
            style={{ ...inputStyle, maxWidth: 200 }}
          >
            <option value={60}>60 секунд</option>
            <option value={300}>5 минут</option>
            <option value={600}>10 минут</option>
            <option value={3600}>1 час</option>
            <option value={86400}>1 день</option>
            <option value={604800}>1 неделя</option>
          </select>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {save.isSuccess && <span style={{ fontSize: 13, color: "var(--ok)", alignSelf: "center" }}>Сохранено</span>}
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
