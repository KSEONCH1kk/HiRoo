"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { oauth2Api, serversApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export default function Page() {
  return (
    <Suspense>
      <AuthorizePage />
    </Suspense>
  );
}

const SCOPE_COPY: Record<string, string> = {
  identify: "видеть ваш профиль",
  email: "видеть ваш email",
  guilds: "видеть список ваших серверов",
  "guilds.join": "добавить вас на сервер",
  bot: "добавить своего бота на сервер",
  "applications.commands": "регистрировать slash-команды",
  "dms.read": "читать ваши личные сообщения",
};

function AuthorizePage() {
  const sp = useSearchParams();
  const client_id = sp.get("client_id") ?? "";
  const redirect_uri = sp.get("redirect_uri") ?? "";
  const scope = sp.get("scope") ?? "identify";
  const state = sp.get("state") ?? undefined;
  const response_type = sp.get("response_type") ?? "code";

  const wantsBot = scope.split(" ").includes("bot");

  const { data: info, isLoading, error } = useQuery({
    queryKey: ["authorize-info", client_id, scope, redirect_uri],
    queryFn: () => oauth2Api.authorizeInfo({ client_id, scope, redirect_uri }),
    enabled: !!client_id,
    retry: false,
  });

  const { data: myServers } = useQuery({
    queryKey: ["my-servers"],
    queryFn: () => serversApi.list(),
    enabled: wantsBot,
  });

  const [guildId, setGuildId] = useState<string>("");
  useEffect(() => {
    if (wantsBot && myServers && myServers.length && !guildId) setGuildId(myServers[0].id);
  }, [wantsBot, myServers, guildId]);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ message: string; guildId?: string | null } | null>(null);

  const onAuthorize = async () => {
    setSubmitting(true);
    try {
      const body: any = { client_id, scope };
      if (redirect_uri) body.redirect_uri = redirect_uri;
      if (state) body.state = state;
      if (wantsBot && guildId) body.guild_id = guildId;
      const res = await oauth2Api.authorize(body);
      if (res.location) {
        window.location.href = res.location;
        return;
      }
      setSuccess({
        message: res.message ?? "Готово",
        guildId: res.guild_id ?? guildId,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDeny = () => {
    const sep = redirect_uri.includes("?") ? "&" : "?";
    const loc = `${redirect_uri}${sep}error=access_denied${state ? `&state=${state}` : ""}`;
    window.location.href = loc;
  };

  if (response_type && response_type !== "code") {
    return <Center><ErrorCard>Unsupported response_type: {response_type}</ErrorCard></Center>;
  }

  if (success) {
    return (
      <Center>
        <div style={{
          width: 420, maxWidth: "92vw",
          background: "var(--bg-2)", borderRadius: 14,
          border: "1px solid var(--line-strong)",
          padding: 28, textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(88, 207, 140, 0.18)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className="fa-solid fa-check" style={{ color: "#6fd99a", fontSize: 24 }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 6 }}>
            {success.message}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>
            Можно закрыть это окно.
          </div>
          <Button
            onClick={() => {
              if (success.guildId) window.location.href = `/servers/${success.guildId}`;
              else window.close();
            }}
          >
            {success.guildId ? "Перейти к серверу" : "Закрыть"}
          </Button>
        </div>
      </Center>
    );
  }

  if (isLoading) return <Center><div style={{ color: "var(--text-2)" }}>Загружаем…</div></Center>;
  if (error || !info) return <Center><ErrorCard>Не удалось получить метаданные приложения. Проверьте client_id и redirect_uri.</ErrorCard></Center>;

  const scopes = info.scope;

  return (
    <Center>
      <div style={{
        width: 440, maxWidth: "92vw",
        background: "var(--bg-2)", borderRadius: 14,
        border: "1px solid var(--line-strong)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        <div style={{ padding: 24, borderBottom: "1px solid var(--line)", textAlign: "center" }}>
          {info.application.icon_url ? (
            <img src={info.application.icon_url} alt="" style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 12px" }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--bg-3)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="fa-solid fa-cube" style={{ color: "var(--text-2)", fontSize: 24 }} />
            </div>
          )}
          <div style={{ fontSize: 19, fontWeight: 700, color: "var(--text-0)", letterSpacing: -0.2 }}>
            {info.application.name}
            {info.application.is_verified && (
              <i className="fa-solid fa-certificate" title="Verified" style={{ color: "#6fa8ff", marginLeft: 6, fontSize: 14 }} />
            )}
          </div>
          {info.application.description && (
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>{info.application.description}</div>
          )}
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 13, color: "var(--text-1)", marginBottom: 14 }}>
            <b>{info.application.name}</b> хочет:
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {scopes.map((s) => (
              <li key={s} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <i className="fa-solid fa-circle-check" style={{ color: "var(--ok)", fontSize: 13, marginTop: 2 }} />
                <span style={{ fontSize: 13, color: "var(--text-0)" }}>
                  {SCOPE_COPY[s] ?? s}
                </span>
              </li>
            ))}
          </ul>

          {wantsBot && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Сервер
              </div>
              <select
                value={guildId}
                onChange={(e) => setGuildId(e.target.value)}
                style={{ width: "100%", padding: "9px 11px", borderRadius: 7, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 13 }}
              >
                {(myServers ?? []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>
                Нужно право <code>MANAGE_SERVER</code> на выбранном сервере.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <Button variant="ghost" onClick={onDeny} disabled={submitting} style={{ flex: 1 }}>Отмена</Button>
            <Button onClick={onAuthorize} disabled={submitting || (wantsBot && !guildId)} style={{ flex: 1 }}>
              {submitting ? "…" : wantsBot ? "Добавить" : "Разрешить"}
            </Button>
          </div>
        </div>
      </div>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--bg-0)" }}>
      {children}
    </div>
  );
}

function ErrorCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, borderRadius: 10, background: "rgba(255, 80, 80, 0.1)", color: "var(--danger)", fontSize: 13, maxWidth: 400 }}>
      {children}
    </div>
  );
}
