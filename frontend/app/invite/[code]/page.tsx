"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { serversApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth";
import { useAuthStore } from "@/store/authStore";
import { useServerStore } from "@/store/serverStore";
import { Button } from "@/components/ui/Button";
import type { Server } from "@/types";

type State =
  | { status: "loading" }
  | { status: "success"; server: Server }
  | { status: "already"; serverId: string }
  | { status: "error"; message: string }
  | { status: "auth-required" };

export default function InvitePage({ params }: { params: { code: string } }) {
  const { code } = params;
  const router = useRouter();
  const { servers, setServers } = useServerStore();
  const { accessToken } = useAuthStore();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // Sync tokenStore from persisted auth
    const token = tokenStore.get() || accessToken;
    if (token && !tokenStore.get()) tokenStore.set(token);

    if (!token) {
      sessionStorage.setItem("pendingInvite", code);
      setState({ status: "auth-required" });
      return;
    }

    serversApi.join(code)
      .then((server) => {
        setServers([...servers.filter((s) => s.id !== server.id), server]);
        setState({ status: "success", server });
      })
      .catch((e) => {
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;

        if (status === 409) {
          // Already a member — try to find server id from their server list
          serversApi.list().then((srvs) => {
            const s = srvs.find((x) => x.invite_code === code);
            if (s) setState({ status: "already", serverId: s.id });
            else setState({ status: "error", message: "Вы уже участник этого сервера" });
          }).catch(() => setState({ status: "error", message: "Вы уже участник этого сервера" }));
        } else if (status === 404) {
          setState({ status: "error", message: "Ссылка недействительна или сервер удалён" });
        } else if (status === 410) {
          setState({ status: "error", message: "Срок действия ссылки истёк" });
        } else {
          setState({ status: "error", message: detail ?? "Не удалось присоединиться к серверу" });
        }
      });
  }, [code]);

  const card: React.CSSProperties = {
    width: 420, padding: 28, borderRadius: 16, background: "var(--bg-2)",
    border: "1px solid var(--line-strong)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
    textAlign: "center",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-0)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={card}>
        {state.status === "loading" && (
          <>
            <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 28, color: "var(--accent)" }} />
            <div style={{ marginTop: 14, fontSize: 14, color: "var(--text-2)" }}>Проверка приглашения…</div>
          </>
        )}

        {state.status === "auth-required" && (
          <>
            <i className="fa-solid fa-lock" style={{ fontSize: 32, color: "var(--text-2)" }} />
            <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, color: "var(--text-0)" }}>Войдите в HiRoo</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-2)" }}>
              Чтобы принять приглашение, нужно войти или зарегистрироваться
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center" }}>
              <Button variant="primary" onClick={() => router.push("/login")}>Войти</Button>
              <Button variant="soft" onClick={() => router.push("/register")}>Регистрация</Button>
            </div>
          </>
        )}

        {state.status === "success" && (
          <>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", background: "rgba(62,207,142,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
            }}>
              <i className="fa-solid fa-check" style={{ fontSize: 28, color: "var(--ok)" }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)" }}>Добро пожаловать!</div>
            <div style={{ marginTop: 6, fontSize: 14, color: "var(--text-2)" }}>
              Вы вступили на сервер <strong style={{ color: "var(--text-0)" }}>{state.server.name}</strong>
            </div>
            <Button
              variant="primary"
              style={{ marginTop: 18, width: "100%" }}
              onClick={() => router.push(`/servers/${state.server.id}`)}
            >
              Перейти на сервер
            </Button>
          </>
        )}

        {state.status === "already" && (
          <>
            <i className="fa-solid fa-circle-info" style={{ fontSize: 32, color: "var(--accent)" }} />
            <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, color: "var(--text-0)" }}>Вы уже участник</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-2)" }}>
              Этот сервер уже есть в вашем списке
            </div>
            <Button
              variant="primary"
              style={{ marginTop: 18, width: "100%" }}
              onClick={() => router.push(`/servers/${state.serverId}`)}
            >
              Перейти
            </Button>
          </>
        )}

        {state.status === "error" && (
          <>
            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 32, color: "var(--danger)" }} />
            <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, color: "var(--text-0)" }}>Не получилось</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-2)" }}>{state.message}</div>
            <Button
              variant="ghost"
              style={{ marginTop: 18, width: "100%" }}
              onClick={() => router.push("/friends")}
            >
              На главную
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
