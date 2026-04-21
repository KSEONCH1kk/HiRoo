"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { messagesApi, dmsApi, serversApi, type SearchParams } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { formatMessageTime } from "@/lib/utils";
import type { Message, DMMessageType, ServerMember, DMParticipant, UserPublic } from "@/types";

type SearchCtx =
  | { type: "channel"; channelId: string; serverId: string }
  | { type: "dm"; dmId: string; participants: DMParticipant[] };

interface Props { ctx: SearchCtx; onClose: () => void; }

export function MessageSearchModal({ ctx, onClose }: Props) {
  const [q, setQ] = useState("");
  const [authorId, setAuthorId] = useState<string>("");
  const [has, setHas] = useState<"" | "link" | "file" | "image">("");
  const [after, setAfter] = useState<string>("");
  const [before, setBefore] = useState<string>("");
  const [submitted, setSubmitted] = useState<SearchParams | null>(null);

  const { data: members = [] } = useQuery<ServerMember[]>({
    queryKey: ["members", ctx.type === "channel" ? ctx.serverId : null],
    queryFn: () => serversApi.members((ctx as any).serverId),
    enabled: ctx.type === "channel",
    staleTime: 60_000,
  });

  const authorList: UserPublic[] = useMemo(() => {
    if (ctx.type === "channel") return members.map((m) => m.user);
    return ctx.participants.map((p) => p.user);
  }, [ctx, members]);

  const { data: results, isFetching, error } = useQuery({
    queryKey: ["search", ctx, submitted],
    queryFn: async () => {
      if (!submitted) return { items: [] as (Message | DMMessageType)[] };
      if (ctx.type === "channel") {
        const r = await messagesApi.search(ctx.channelId, submitted);
        return { items: r.items };
      }
      const r = await dmsApi.search(ctx.dmId, submitted);
      return { items: r.items };
    },
    enabled: !!submitted,
  });

  const runSearch = () => {
    const params: SearchParams = {};
    if (q.trim()) params.q = q.trim();
    if (authorId) params.author_id = authorId;
    if (has) params.has = has;
    if (after) params.after = new Date(after).toISOString();
    if (before) {
      const d = new Date(before);
      d.setHours(23, 59, 59, 999);
      params.before = d.toISOString();
    }
    setSubmitted(params);
  };

  const reset = () => {
    setQ(""); setAuthorId(""); setHas(""); setAfter(""); setBefore("");
    setSubmitted(null);
  };

  const goToMessage = (msgId: string) => {
    const el = document.querySelector(`[data-msgid="${msgId}"]`) as HTMLElement | null;
    onClose();
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const prev = el.style.background;
      el.style.transition = "background 200ms";
      el.style.background = "var(--bg-active)";
      setTimeout(() => { el.style.background = prev; }, 1200);
    }, 80);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 160ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620, maxHeight: "86vh", display: "flex", flexDirection: "column",
          background: "var(--bg-1)", border: "1px solid var(--line-strong)",
          borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ color: "var(--text-2)", fontSize: 13 }} />
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>Поиск сообщений</div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", borderRadius: 6 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            autoFocus
            type="text" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="Текст сообщения…"
            style={{
              width: "100%", background: "var(--bg-2)", border: "1px solid var(--line)",
              borderRadius: 8, padding: "9px 12px", color: "var(--text-0)", fontSize: 14, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={authorId} onChange={(e) => setAuthorId(e.target.value)}
              style={chipStyle}
            >
              <option value="">Любой автор</option>
              {authorList.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name ?? u.username}</option>
              ))}
            </select>
            <select value={has} onChange={(e) => setHas(e.target.value as any)} style={chipStyle}>
              <option value="">Любой контент</option>
              <option value="link">Со ссылкой</option>
              <option value="image">С изображением</option>
              <option value="file">С файлом</option>
            </select>
            <label style={{ ...chipStyle, cursor: "text", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-3)", fontSize: 11, fontFamily: "Geist Mono" }}>ОТ</span>
              <input type="date" value={after} onChange={(e) => setAfter(e.target.value)}
                style={{ background: "transparent", border: "none", color: "var(--text-0)", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            </label>
            <label style={{ ...chipStyle, cursor: "text", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-3)", fontSize: 11, fontFamily: "Geist Mono" }}>ДО</span>
              <input type="date" value={before} onChange={(e) => setBefore(e.target.value)}
                style={{ background: "transparent", border: "none", color: "var(--text-0)", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            </label>
            <Button variant="ghost" onClick={reset}>Сбросить</Button>
            <Button variant="primary" onClick={runSearch} icon={<i className="fa-solid fa-magnifying-glass" style={{ fontSize: 11 }} />}>
              Искать
            </Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px 12px" }}>
          {!submitted && (
            <div style={{ padding: "24px 18px", fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>
              Введите запрос или выберите фильтры и нажмите «Искать».
            </div>
          )}
          {isFetching && (
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-2)", textAlign: "center", fontFamily: "Geist Mono" }}>
              ищу…
            </div>
          )}
          {error && (
            <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--danger)" }}>
              Не удалось выполнить поиск.
            </div>
          )}
          {submitted && !isFetching && results?.items.length === 0 && (
            <div style={{ padding: "24px 18px", fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>
              Ничего не нашли.
            </div>
          )}
          {results?.items.map((m: any) => (
            <div
              key={m.id}
              onClick={() => goToMessage(m.id)}
              style={{
                display: "flex", gap: 10, padding: "10px 14px", borderRadius: 8,
                cursor: "pointer", transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar name={m.author?.username ?? "?"} size={30} shape="circle" avatarUrl={m.author?.avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)" }}>
                    {m.author?.display_name ?? m.author?.username ?? "Неизвестный"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                    {formatMessageTime(m.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 6,
  background: "var(--bg-2)",
  border: "1px solid var(--line)",
  color: "var(--text-0)",
  fontSize: 12.5,
  outline: "none",
  fontFamily: "inherit",
};
