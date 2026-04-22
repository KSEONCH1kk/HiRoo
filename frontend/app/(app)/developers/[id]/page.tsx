"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { applicationsApi, commandsApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// Intent flags — mirror backend/app/services/intents.py.
const INTENTS: { flag: number; label: string; privileged?: boolean }[] = [
  { flag: 1 << 0, label: "Guilds" },
  { flag: 1 << 1, label: "Guild Members", privileged: true },
  { flag: 1 << 2, label: "Guild Bans" },
  { flag: 1 << 3, label: "Voice States" },
  { flag: 1 << 4, label: "Presences", privileged: true },
  { flag: 1 << 5, label: "Guild Messages" },
  { flag: 1 << 6, label: "Message Reactions" },
  { flag: 1 << 7, label: "Typing" },
  { flag: 1 << 8, label: "Direct Messages" },
  { flag: 1 << 15, label: "Message Content", privileged: true },
];

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: app } = useQuery({
    queryKey: ["app", id],
    queryFn: () => applicationsApi.get(id),
  });
  const { data: commands } = useQuery({
    queryKey: ["app-commands", id],
    queryFn: () => commandsApi.listForApp(id),
    enabled: !!id,
  });

  const [tab, setTab] = useState<"general" | "bot" | "oauth2" | "commands">("general");
  const [botToken, setBotToken] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const patch = useMutation({
    mutationFn: (body: any) => applicationsApi.patch(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app", id] }),
  });
  const createBot = useMutation({
    mutationFn: () => applicationsApi.createBot(id),
    onSuccess: (d) => {
      setBotToken(d.token);
      qc.invalidateQueries({ queryKey: ["app", id] });
    },
  });
  const resetToken = useMutation({
    mutationFn: () => applicationsApi.resetBotToken(id),
    onSuccess: (d) => setBotToken(d.token),
  });
  const resetSecret = useMutation({
    mutationFn: () => applicationsApi.resetSecret(id),
    onSuccess: (d) => setNewSecret(d.client_secret),
  });
  const remove = useMutation({
    mutationFn: () => applicationsApi.remove(id),
    onSuccess: () => router.push("/developers"),
  });

  if (!app) return null;

  const iconSrc = app.icon_url ? `${API_BASE}${app.icon_url}` : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 60px", maxWidth: 900, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 10 }}>
        <Link href="/developers" style={{ fontSize: 12, color: "var(--text-2)", textDecoration: "none" }}>
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
          К списку приложений
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <label style={{ position: "relative", cursor: "pointer" }}>
          {iconSrc ? (
            <img src={iconSrc} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 14, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="fa-solid fa-cube" style={{ color: "var(--text-2)", fontSize: 22 }} />
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              try { await applicationsApi.uploadIcon(id, f); qc.invalidateQueries({ queryKey: ["app", id] }); }
              finally { setUploading(false); }
            }}
          />
          <div style={{ position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: "50%", background: "var(--bg-0)", border: "1px solid var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
            <i className="fa-solid fa-pen" />
          </div>
        </label>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-0)", margin: 0 }}>{app.name}</h1>
          <div style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "Geist Mono", marginTop: 4 }}>
            client_id: {app.client_id}
          </div>
        </div>
      </div>

      <Tabs tab={tab} setTab={setTab} />

      {tab === "general" && (
        <Section title="Основное">
          <Field label="Имя">
            <TextInput defaultValue={app.name} onCommit={(v) => patch.mutate({ name: v })} />
          </Field>
          <Field label="Описание">
            <TextInput defaultValue={app.description ?? ""} multiline onCommit={(v) => patch.mutate({ description: v })} />
          </Field>
          <Field label="client_secret">
            <div style={{ display: "flex", gap: 8 }}>
              <code style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: "var(--bg-0)", border: "1px solid var(--line)", fontSize: 12, fontFamily: "Geist Mono", color: "var(--text-2)" }}>
                {newSecret ?? "••••••••  (показывается только после сброса)"}
              </code>
              {newSecret && <Button size="sm" variant="soft" onClick={() => navigator.clipboard?.writeText(newSecret)}>Copy</Button>}
              <Button size="sm" variant="danger" onClick={() => resetSecret.mutate()} disabled={resetSecret.isPending}>
                Сбросить
              </Button>
            </div>
          </Field>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ff7a7a", marginBottom: 6 }}>Danger zone</div>
            <Button variant="danger" onClick={() => { if (confirm("Удалить приложение навсегда?")) remove.mutate(); }}>
              Удалить приложение
            </Button>
          </div>
        </Section>
      )}

      {tab === "bot" && (
        <Section title="Бот">
          {!app.has_bot ? (
            <div>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 12 }}>
                У приложения ещё нет привязанного бот-юзера. Создайте его, чтобы получить токен
                для WebSocket-gateway и API.
              </div>
              <Button onClick={() => createBot.mutate()} disabled={createBot.isPending}>
                <i className="fa-solid fa-robot" style={{ marginRight: 6 }} />
                Создать бота
              </Button>
            </div>
          ) : (
            <>
              <Field label="Bot token">
                <div style={{ display: "flex", gap: 8 }}>
                  <code style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: "var(--bg-0)", border: "1px solid var(--line)", fontSize: 12, fontFamily: "Geist Mono", color: "var(--text-2)" }}>
                    {botToken ?? "••••••••  (показывается только после сброса)"}
                  </code>
                  {botToken && <Button size="sm" variant="soft" onClick={() => navigator.clipboard?.writeText(botToken)}>Copy</Button>}
                  <Button size="sm" variant="danger" onClick={() => resetToken.mutate()} disabled={resetToken.isPending}>
                    Сбросить
                  </Button>
                </div>
              </Field>

              <Field label="Публичный бот">
                <Toggle
                  checked={app.public_bot}
                  onChange={(v) => patch.mutate({ public_bot: v })}
                  hint="Если включено — любой юзер может пригласить бота на свой сервер."
                />
              </Field>

              <Field label="Intents">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {INTENTS.map((it) => (
                    <label key={it.flag} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 8px", borderRadius: 6, background: (app.intents & it.flag) ? "var(--bg-active)" : "transparent" }}>
                      <input
                        type="checkbox"
                        checked={(app.intents & it.flag) !== 0}
                        onChange={(e) => {
                          const next = e.target.checked ? (app.intents | it.flag) : (app.intents & ~it.flag);
                          patch.mutate({ intents: next });
                        }}
                      />
                      <span style={{ fontSize: 13, color: "var(--text-0)", flex: 1 }}>{it.label}</span>
                      {it.privileged && <span style={{ fontSize: 10, color: "#fcbf49", fontWeight: 700 }}>PRIVILEGED</span>}
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}
        </Section>
      )}

      {tab === "oauth2" && (
        <Section title="OAuth2">
          <Field label="Redirect URIs" hint="По одному на строку. Должны точно совпадать с тем, что передаёт клиент.">
            <TextInput
              defaultValue={(app.redirect_uris ?? []).join("\n")}
              multiline
              onCommit={(v) => patch.mutate({ redirect_uris: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
              placeholder="https://example.com/oauth/callback"
            />
          </Field>

          <Field label="Пример URL авторизации">
            <CodeBlock value={`${typeof window !== "undefined" ? window.location.origin : ""}/oauth2/authorize?client_id=${app.client_id}&scope=${encodeURIComponent("identify guilds")}&redirect_uri=${encodeURIComponent((app.redirect_uris ?? [""])[0] || "")}&response_type=code`} />
          </Field>

          {app.has_bot && (
            <Field label="Invite бота на сервер">
              <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, width: "100%" }}>
                <a
                  href={`/oauth2/authorize?client_id=${app.client_id}&scope=${encodeURIComponent("bot applications.commands")}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none", flexShrink: 0 }}
                >
                  <Button>
                    <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                    Пригласить
                  </Button>
                </a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CodeBlock value={`${typeof window !== "undefined" ? window.location.origin : ""}/oauth2/authorize?client_id=${app.client_id}&scope=${encodeURIComponent("bot applications.commands")}`} />
                </div>
              </div>
            </Field>
          )}
        </Section>
      )}

      {tab === "commands" && (
        <Section title="Команды">
          <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 14 }}>
            Команды регистрируются ботом через <code>POST /api/commands/applications/&#123;app_id&#125;/commands</code>
            с <code>Authorization: Bot &lt;token&gt;</code>. Ниже — уже зарегистрированные.
          </div>
          {commands && commands.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {commands.map((c) => (
                <div key={c.id} style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code style={{ fontFamily: "Geist Mono", color: "var(--accent)", fontWeight: 700 }}>/{c.name}</code>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{c.type}</span>
                    {c.guild_id && <span style={{ fontSize: 10, color: "#fcbf49", fontFamily: "Geist Mono" }}>GUILD</span>}
                  </div>
                  {c.description && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>{c.description}</div>}
                  {c.options.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {c.options.map((o, i) => (
                        <span key={i} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--bg-3)", color: "var(--text-2)", fontFamily: "Geist Mono" }}>
                          {o.name}{o.required ? "*" : ""}: {TYPE_NAMES[o.type] ?? o.type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>Команды ещё не зарегистрированы.</div>
          )}
        </Section>
      )}
    </div>
  );
}

const TYPE_NAMES: Record<number, string> = {
  1: "subcmd", 2: "group", 3: "str", 4: "int", 5: "bool",
  6: "user", 7: "channel", 8: "role", 10: "number",
};

function Tabs({ tab, setTab }: { tab: string; setTab: (t: any) => void }) {
  const list: { id: string; label: string; icon: string }[] = [
    { id: "general", label: "Основное", icon: "fa-sliders" },
    { id: "bot",     label: "Bot",      icon: "fa-robot" },
    { id: "oauth2",  label: "OAuth2",   icon: "fa-key" },
    { id: "commands",label: "Команды",  icon: "fa-slash" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--line)" }}>
      {list.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            padding: "10px 14px", border: "none", cursor: "pointer",
            background: "transparent", color: tab === t.id ? "var(--text-0)" : "var(--text-2)",
            fontSize: 13, fontWeight: 600,
            borderBottom: `2px solid ${tab === t.id ? "var(--accent)" : "transparent"}`,
            marginBottom: -1,
          }}
        >
          <i className={`fa-solid ${t.icon}`} style={{ marginRight: 6, fontSize: 12 }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function TextInput({ defaultValue, onCommit, multiline, placeholder }: { defaultValue: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(defaultValue);
  const Cmp: any = multiline ? "textarea" : "input";
  return (
    <Cmp
      value={v}
      onChange={(e: any) => setV(e.target.value)}
      onBlur={() => { if (v !== defaultValue) onCommit(v); }}
      placeholder={placeholder}
      rows={multiline ? 4 : undefined}
      style={{
        width: "100%", padding: "9px 11px", borderRadius: 7,
        background: "var(--bg-0)", border: "1px solid var(--line-strong)",
        color: "var(--text-0)", fontSize: 13, resize: multiline ? "vertical" : undefined,
        fontFamily: "inherit",
      }}
    />
  );
}

function Toggle({ checked, onChange, hint }: { checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: 13, color: "var(--text-0)" }}>{checked ? "Включено" : "Выключено"}</span>
      </label>
      {hint && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, minWidth: 0, width: "100%" }}>
      <code style={{
        flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 6,
        background: "var(--bg-0)", border: "1px solid var(--line)",
        fontSize: 11.5, fontFamily: "Geist Mono", color: "var(--text-1)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </code>
      <Button size="sm" variant="soft" onClick={() => navigator.clipboard?.writeText(value)}>Copy</Button>
    </div>
  );
}
