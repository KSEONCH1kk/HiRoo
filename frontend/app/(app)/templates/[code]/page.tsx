"use client";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, serversApi, type ServerTemplate } from "@/lib/api";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { Button } from "@/components/ui/Button";
import type { Server } from "@/types";

/** Landing page for a shared template link. Two paths:
 *   - "Create new server" — spins up a fresh server with our structure
 *   - "Import into existing" — merge into a server the viewer owns
 *     (append channels/roles or replace everything) */
export default function TemplateLandingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const code = params?.code ?? "";

  const { data: tpl, isLoading, error } = useQuery<ServerTemplate>({
    queryKey: ["template-preview", code],
    queryFn: () => templatesApi.preview(code),
    retry: false,
  });

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [targetServerId, setTargetServerId] = useState<string | null>(null);
  const [applyMode, setApplyMode] = useState<"append" | "replace">("append");
  const [err, setErr] = useState<string | null>(null);

  const { data: myServers } = useQuery<Server[]>({
    queryKey: ["my-servers"],
    queryFn: () => serversApi.list(),
    staleTime: 30_000,
  });

  const createNew = useMutation({
    mutationFn: () => templatesApi.createServer(code, newName.trim() || tpl?.name || ""),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      router.push(`/servers/${res.id}`);
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Не удалось создать сервер"),
  });

  const applyExisting = useMutation({
    mutationFn: () => templatesApi.applyToExisting(code, targetServerId!, applyMode),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["server", res.id] });
      qc.invalidateQueries({ queryKey: ["channels", res.id] });
      qc.invalidateQueries({ queryKey: ["roles", res.id] });
      router.push(`/servers/${res.id}`);
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Не удалось применить шаблон"),
  });

  if (isLoading) {
    return <Center><div style={{ color: "var(--text-2)", fontSize: 14 }}>Загружаем шаблон…</div></Center>;
  }
  if (error || !tpl) {
    return (
      <Center>
        <div style={{
          width: 420, maxWidth: "92vw", padding: 28, borderRadius: 14,
          background: "var(--bg-2)", border: "1px solid var(--line-strong)",
          textAlign: "center",
        }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 30, color: "var(--danger)", marginBottom: 10 }} />
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-0)", marginBottom: 6 }}>
            Шаблон не найден
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>
            Возможно, его удалил автор или ссылка неверная.
          </div>
          <Button variant="soft" onClick={() => router.push("/")}>На главную</Button>
        </div>
      </Center>
    );
  }

  const chCount = tpl.payload?.channels?.length ?? 0;
  const roleCount = tpl.payload?.roles?.filter((r) => !r.is_everyone).length ?? 0;
  const ovrCount = tpl.payload?.channel_role_overrides?.length ?? 0;

  const manageable = (myServers ?? []).filter((s) => s.owner_id /* owner always manages */);

  return (
    <Center>
      <div style={{
        width: 580, maxWidth: "96vw",
        background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
      }}>
        <div style={{
          padding: "22px 24px 18px",
          background: "linear-gradient(135deg, var(--accent), #5b8af0)",
          color: "#fff",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.85, marginBottom: 4 }}>ШАБЛОН СЕРВЕРА</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{tpl.name}</div>
          {tpl.description && (
            <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 6, lineHeight: 1.5 }}>{tpl.description}</div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--line)", display: "flex", gap: 18, fontSize: 12.5, color: "var(--text-2)", fontFamily: "Geist Mono" }}>
          <span><i className="fa-solid fa-hashtag" style={{ marginRight: 5 }} />{chCount} каналов</span>
          <span><i className="fa-solid fa-shield" style={{ marginRight: 5 }} />{roleCount} ролей</span>
          <span><i className="fa-solid fa-sliders" style={{ marginRight: 5 }} />{ovrCount} переопределений</span>
          <span style={{ marginLeft: "auto" }}><i className="fa-solid fa-bolt" style={{ marginRight: 5 }} />{tpl.usage_count}× использован</span>
        </div>

        {/* Mode switcher */}
        <div style={{ padding: "18px 24px 8px", display: "flex", gap: 8 }}>
          <ModeChip active={mode === "new"} onClick={() => { setMode("new"); setErr(null); }}>
            <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
            Создать новый сервер
          </ModeChip>
          <ModeChip active={mode === "existing"} onClick={() => { setMode("existing"); setErr(null); }}>
            <i className="fa-solid fa-right-to-bracket" style={{ marginRight: 6 }} />
            Импортировать в существующий
          </ModeChip>
        </div>

        <div style={{ padding: "12px 24px 22px" }}>
          {mode === "new" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                Имя нового сервера
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value.slice(0, 100))}
                placeholder={tpl.name}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  background: "var(--bg-0)", border: "1px solid var(--line-strong)",
                  color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit",
                }}
              />
              {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <Button variant="ghost" onClick={() => router.push("/")}>Отмена</Button>
                <Button
                  variant="primary"
                  onClick={() => createNew.mutate()}
                  disabled={createNew.isPending}
                >
                  {createNew.isPending ? "Создаём…" : "Создать сервер"}
                </Button>
              </div>
            </div>
          ) : (
            <ExistingImportPanel
              servers={myServers ?? []}
              targetServerId={targetServerId}
              setTargetServerId={setTargetServerId}
              applyMode={applyMode}
              setApplyMode={setApplyMode}
              err={err}
              pending={applyExisting.isPending}
              onCancel={() => router.push("/")}
              onApply={() => {
                if (!targetServerId) { setErr("Выберите сервер"); return; }
                if (applyMode === "replace" && !confirm("Заменить все каналы и роли выбранного сервера? Действие необратимо.")) return;
                applyExisting.mutate();
              }}
            />
          )}
        </div>
      </div>
    </Center>
  );
}

function ExistingImportPanel({
  servers, targetServerId, setTargetServerId,
  applyMode, setApplyMode, err, pending, onCancel, onApply,
}: {
  servers: Server[];
  targetServerId: string | null;
  setTargetServerId: (id: string | null) => void;
  applyMode: "append" | "replace";
  setApplyMode: (m: "append" | "replace") => void;
  err: string | null;
  pending: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  // Only offer servers where the viewer can actually manage — we re-check
  // permissions here so servers the user joined as a guest don't appear.
  const target = servers.find((s) => s.id === targetServerId);
  const { has } = useServerPermissions(target?.id ?? null);
  const canManage = target ? has("MANAGE_SERVER") : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Сервер-цель
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
        {servers.length === 0 ? (
          <div style={{ padding: 14, textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>
            У вас нет серверов
          </div>
        ) : (
          servers.map((s) => (
            <label key={s.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
              background: targetServerId === s.id ? "rgba(124,92,255,0.15)" : "var(--bg-1)",
              border: targetServerId === s.id ? "1px solid var(--accent)" : "1px solid var(--line)",
              cursor: "pointer",
            }}>
              <input
                type="radio"
                name="target"
                checked={targetServerId === s.id}
                onChange={() => setTargetServerId(s.id)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ flex: 1, fontSize: 14, color: "var(--text-0)" }}>{s.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                {s.member_count}
              </span>
            </label>
          ))
        )}
      </div>

      {target && !canManage && (
        <div style={{ fontSize: 13, color: "var(--danger)" }}>
          На этом сервере у вас нет права «Управление сервером».
        </div>
      )}

      <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6 }}>
        Режим импорта
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <ModeRadio
          active={applyMode === "append"}
          title="Добавить"
          desc="Каналы и роли из шаблона добавятся к существующим. Ничего не будет удалено."
          onClick={() => setApplyMode("append")}
        />
        <ModeRadio
          active={applyMode === "replace"}
          title="Заменить"
          desc="Удалит все текущие каналы и роли (кроме @everyone), затем создаст из шаблона. Необратимо."
          onClick={() => setApplyMode("replace")}
          danger
        />
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button
          variant={applyMode === "replace" ? "danger" : "primary"}
          onClick={onApply}
          disabled={pending || !target || !canManage}
        >
          {pending ? "Применяем…" : (applyMode === "replace" ? "Заменить" : "Добавить")}
        </Button>
      </div>
    </div>
  );
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
        background: active ? "rgba(124,92,255,0.15)" : "var(--bg-1)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
        color: active ? "var(--accent)" : "var(--text-1)",
        fontSize: 13.5, fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function ModeRadio({ active, title, desc, onClick, danger }: {
  active: boolean; title: string; desc: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer",
        background: active ? (danger ? "rgba(255,80,80,0.1)" : "rgba(124,92,255,0.15)") : "var(--bg-1)",
        border: active ? `1px solid ${danger ? "var(--danger)" : "var(--accent)"}` : "1px solid var(--line)",
        display: "flex", gap: 10, alignItems: "flex-start",
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: "50%", marginTop: 2,
        border: active
          ? `5px solid ${danger ? "var(--danger)" : "var(--accent)"}`
          : "2px solid var(--line-strong)",
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: danger && active ? "var(--danger)" : "var(--text-0)" }}>
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, minHeight: "100%",
    }}>
      {children}
    </div>
  );
}
