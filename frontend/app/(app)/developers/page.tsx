"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { applicationsApi, type DevApplication } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export default function DevelopersIndexPage() {
  const qc = useQueryClient();
  const { data: apps, isLoading } = useQuery({
    queryKey: ["developer-apps"],
    queryFn: () => applicationsApi.list(),
  });

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [justCreated, setJustCreated] = useState<{ app: DevApplication; client_secret: string } | null>(null);

  const create = useMutation({
    mutationFn: () => applicationsApi.create(name, description || undefined),
    onSuccess: (data) => {
      const { client_secret, ...app } = data;
      setJustCreated({ app, client_secret });
      setName("");
      setDescription("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["developer-apps"] });
    },
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 60px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-0)", margin: 0, letterSpacing: -0.3 }}>
            Developer Portal
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
            Ваши приложения: боты, OAuth2, slash-команды.
          </div>
        </div>
        <Button onClick={() => setCreating(true)} icon={<i className="fa-solid fa-plus" />}>
          Новое приложение
        </Button>
      </div>

      {isLoading && <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загружаем…</div>}

      {apps && apps.length === 0 && !creating && (
        <div style={{
          padding: 40, textAlign: "center",
          border: "1px dashed var(--line-strong)", borderRadius: 12,
          color: "var(--text-2)", fontSize: 14,
        }}>
          <i className="fa-solid fa-code" style={{ fontSize: 28, opacity: 0.4, marginBottom: 10 }} />
          <div>У вас нет приложений. Создайте первое, чтобы получить <code>client_id</code> и поднять бота.</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {apps?.map((app) => (
          <Link
            key={app.id}
            href={`/developers/${app.id}`}
            style={{
              display: "block", padding: 16, borderRadius: 12,
              background: "var(--bg-2)", border: "1px solid var(--line)",
              textDecoration: "none", transition: "border-color 120ms, transform 120ms",
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--line)"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              {app.icon_url ? (
                <img src={app.icon_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)" }}>
                  <i className="fa-solid fa-cube" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.client_id}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {app.has_bot && <Tag icon="fa-robot">Bot</Tag>}
              {app.supports_commands && <Tag icon="fa-slash" color="#6fa8ff">Commands</Tag>}
              {app.supports_voice && <Tag icon="fa-microphone" color="#6fd99a">Voice</Tag>}
              {app.is_verified && <Tag icon="fa-certificate" color="#fcbf49">Verified</Tag>}
            </div>
            {app.description && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {app.description}
              </div>
            )}
          </Link>
        ))}
      </div>

      {creating && (
        <Modal title="Новое приложение" onClose={() => setCreating(false)}>
          <Label>Имя приложения</Label>
          <Input value={name} onChange={setName} placeholder="Мой крутой бот" maxLength={80} />
          <Label>Описание (опционально)</Label>
          <Input value={description} onChange={setDescription} placeholder="Что оно делает" maxLength={1000} multiline />
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setCreating(false)}>Отмена</Button>
            <Button onClick={() => create.mutate()} disabled={name.length < 2 || create.isPending}>
              {create.isPending ? "…" : "Создать"}
            </Button>
          </div>
        </Modal>
      )}

      {justCreated && (
        <Modal title="Приложение создано" onClose={() => setJustCreated(null)}>
          <div style={{ fontSize: 13, color: "var(--text-1)", marginBottom: 12 }}>
            Сохраните <b>client_secret</b> — он показывается <u>один раз</u>. Если потеряете — сбросите новый.
          </div>
          <Label>client_id</Label>
          <CopyField value={justCreated.app.client_id} />
          <Label>client_secret</Label>
          <CopyField value={justCreated.client_secret} secret />
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <Link href={`/developers/${justCreated.app.id}`}>
              <Button>Перейти к приложению</Button>
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}


function Tag({ icon, color, children }: { icon: string; color?: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 4,
      background: color ? `${color}22` : "var(--bg-3)",
      color: color ?? "var(--text-2)",
      fontSize: 10.5, fontWeight: 600, letterSpacing: 0.1,
    }}>
      <i className={`fa-solid ${icon}`} style={{ fontSize: 9 }} />
      {children}
    </span>
  );
}


function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100 }} />
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: 440, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto",
        background: "var(--bg-2)", borderRadius: 12,
        border: "1px solid var(--line-strong)", padding: 20, zIndex: 101,
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: "var(--text-0)" }}>{title}</div>
        {children}
      </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 5px" }}>{children}</div>;
}

function Input({ value, onChange, placeholder, maxLength, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; multiline?: boolean }) {
  const Cmp: any = multiline ? "textarea" : "input";
  return (
    <Cmp
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={multiline ? 3 : undefined}
      style={{
        width: "100%", padding: "9px 11px", borderRadius: 7,
        background: "var(--bg-0)", border: "1px solid var(--line-strong)",
        color: "var(--text-0)", fontSize: 13, resize: multiline ? "vertical" : undefined,
      }}
    />
  );
}

function CopyField({ value, secret }: { value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!secret);
  const onCopy = () => {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <code style={{
        flex: 1, padding: "8px 10px", borderRadius: 6,
        background: "var(--bg-0)", border: "1px solid var(--line)",
        fontFamily: "Geist Mono", fontSize: 12, color: "var(--text-0)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {visible ? value : "•".repeat(Math.min(value.length, 32))}
      </code>
      {secret && (
        <Button size="sm" variant="ghost" onClick={() => setVisible((v) => !v)}>
          {visible ? "Hide" : "Show"}
        </Button>
      )}
      <Button size="sm" variant="soft" onClick={onCopy}>{copied ? "Copied" : "Copy"}</Button>
    </div>
  );
}
