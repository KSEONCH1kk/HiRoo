"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, type ServerTemplate } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export function TemplatesTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<ServerTemplate[]>({
    queryKey: ["templates", serverId],
    queryFn: () => templatesApi.listServer(serverId),
  });

  const create = useMutation({
    mutationFn: () => templatesApi.create(serverId, { name: name.trim(), description: desc.trim() || undefined }),
    onSuccess: () => {
      setName(""); setDesc(""); setErr(null);
      qc.invalidateQueries({ queryKey: ["templates", serverId] });
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Ошибка"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => templatesApi.deleteOne(serverId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", serverId] }),
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 720 }}>
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Создайте шаблон из текущей структуры сервера — каналы, роли и права будут
        сохранены в одной ссылке. Другие пользователи смогут либо развернуть
        новый сервер из этой ссылки, либо импортировать структуру в существующий.
      </div>

      <div style={{
        padding: 16, borderRadius: 12,
        background: "var(--bg-2)", border: "1px solid var(--line)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)" }}>
          <i className="fa-solid fa-plus" style={{ marginRight: 8, color: "var(--accent)" }} />
          Новый шаблон
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 100))}
          placeholder="Название шаблона"
          maxLength={100}
          style={inputStyle}
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value.slice(0, 500))}
          placeholder="Описание (необязательно)"
          rows={2}
          maxLength={500}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            disabled={name.trim().length === 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Сохраняем…" : "Создать шаблон"}
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>
          Ваши шаблоны — {templates?.length ?? 0}
        </div>
        {isLoading ? (
          <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>
        ) : !templates || templates.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13, borderRadius: 8, background: "var(--bg-2)", border: "1px dashed var(--line)" }}>
            Пока нет шаблонов.
          </div>
        ) : (
          templates.map((t) => (
            <TemplateRow
              key={t.id}
              tpl={t}
              onDelete={() => {
                if (!confirm(`Удалить шаблон «${t.name}»?`)) return;
                remove.mutate(t.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TemplateRow({ tpl, onDelete }: { tpl: ServerTemplate; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard?.writeText(tpl.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: "var(--bg-2)", border: "1px solid var(--line)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: "linear-gradient(135deg, var(--accent), #5b8af0)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff",
      }}>
        <i className="fa-solid fa-clone" style={{ fontSize: 15 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tpl.name}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tpl.url} · использован {tpl.usage_count}×
        </div>
      </div>
      <button
        onClick={copy}
        title={copied ? "Скопировано" : "Скопировать ссылку"}
        style={{
          padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line-strong)",
          background: copied ? "var(--ok, #58cf8c)" : "var(--bg-3)",
          color: copied ? "#fff" : "var(--text-0)",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} style={{ marginRight: 6 }} />
        {copied ? "Скопировано" : "Копировать"}
      </button>
      <button
        onClick={onDelete}
        title="Удалить шаблон"
        style={{
          width: 32, height: 32, borderRadius: 6, border: "none", cursor: "pointer",
          background: "transparent", color: "var(--danger)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,80,80,0.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}
