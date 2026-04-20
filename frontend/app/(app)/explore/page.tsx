"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serversApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { Button } from "@/components/ui/Button";
import type { Server } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
}

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const router = useRouter();
  const qc = useQueryClient();
  const { servers, setServers } = useServerStore();

  const { data: discovered = [], isLoading } = useQuery<Server[]>({
    queryKey: ["discover", submitted],
    queryFn: () => serversApi.discover(submitted || undefined),
    staleTime: 15_000,
  });

  const myServerIds = new Set(servers.map((s) => s.id));

  const joinByCode = useMutation({
    mutationFn: (code: string) => serversApi.join(code),
    onSuccess: (s) => {
      setServers([...servers.filter((x) => x.id !== s.id), s]);
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      router.push(`/servers/${s.id}`);
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10, background: "var(--bg-2)",
    border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-1)", padding: "28px 40px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <i className="fa-solid fa-compass" style={{ fontSize: 26, color: "var(--accent)" }} />
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-0)", letterSpacing: -0.5 }}>Обзор серверов</div>
        </div>
        <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 22 }}>
          Найдите сообщества по интересам или вступите по коду приглашения
        </div>

        {/* Join by code */}
        <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line)", marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
            Присоединиться по коду
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.trim())}
              onKeyDown={(e) => { if (e.key === "Enter" && inviteCode) joinByCode.mutate(inviteCode); }}
              placeholder="Код приглашения (например: abc123xy)"
              style={{ ...inputStyle, background: "var(--bg-0)", fontFamily: "Geist Mono" }}
            />
            <Button
              variant="primary"
              onClick={() => inviteCode && joinByCode.mutate(inviteCode)}
              disabled={!inviteCode || joinByCode.isPending}
            >
              {joinByCode.isPending ? "…" : "Вступить"}
            </Button>
          </div>
          {joinByCode.isError && (
            <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>
              {(joinByCode.error as any)?.response?.data?.detail ?? "Неверный код"}
            </p>
          )}
        </div>

        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(query.trim()); }}
          style={{ marginBottom: 18 }}
        >
          <div style={{ position: "relative" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-2)", fontSize: 14 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Искать публичные серверы…"
              style={{ ...inputStyle, paddingLeft: 40 }}
            />
          </div>
        </form>

        {/* Results */}
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          {submitted ? `Результаты: ${submitted}` : "Популярные"} — {discovered.length}
        </div>

        {isLoading ? (
          <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>
        ) : discovered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", background: "var(--bg-2)", borderRadius: 12, border: "1px dashed var(--line-strong)" }}>
            <i className="fa-solid fa-compass" style={{ fontSize: 36, color: "var(--text-3)" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)", marginTop: 10 }}>
              {submitted ? "Ничего не найдено" : "Пока нет публичных серверов"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
              Владельцы могут сделать сервер публичным в настройках
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {discovered.map((s) => {
              const joined = myServerIds.has(s.id);
              return (
                <div key={s.id} style={{ borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ height: 80, background: s.icon_url ? `url(${resolveIcon(s.icon_url)}) center/cover` : "linear-gradient(135deg, var(--accent), #5b8af0)" }} />
                  <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4, minHeight: 34, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {s.description || "Без описания"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-2)", fontFamily: "Geist Mono", display: "flex", alignItems: "center", gap: 5 }}>
                        <i className="fa-solid fa-user" style={{ fontSize: 10 }} />
                        {s.member_count}
                      </span>
                      {joined ? (
                        <Button size="sm" variant="ghost" onClick={() => router.push(`/servers/${s.id}`)}>Открыть</Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={joinByCode.isPending}
                          onClick={() => joinByCode.mutate(s.invite_code)}
                        >
                          Вступить
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
