"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerStore } from "@/store/serverStore";
import { useAuthStore } from "@/store/authStore";
import { dmsApi, friendsApi, serversApi } from "@/lib/api";
import { dmTitle, dmOthers } from "@/lib/dm";
import { Avatar } from "@/components/ui/Avatar";
import type { DirectMessage, UserPublic, Server } from "@/types";

type Result =
  | { kind: "channel"; id: string; serverId: string; name: string; type: "text" | "voice" | "announcement" }
  | { kind: "dm"; id: string; title: string; isGroup: boolean; iconUrl: string | null; avatarUrl: string | null; other: UserPublic | null }
  | { kind: "user"; id: string; user: UserPublic }
  | { kind: "server"; id: string; name: string; iconUrl: string | null };

export function CommandPalette({ show, onClose }: { show: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { channels, activeServerId, servers } = useServerStore();
  const { user } = useAuthStore();

  const { data: dms = [] } = useQuery<DirectMessage[]>({
    queryKey: ["dms"],
    queryFn: dmsApi.list,
    enabled: show,
    staleTime: 30_000,
  });
  const { data: friends = [] } = useQuery<UserPublic[]>({
    queryKey: ["friends"],
    queryFn: friendsApi.list,
    enabled: show,
    staleTime: 30_000,
  });

  useEffect(() => { if (show) { setQ(""); setActive(0); } }, [show]);

  const allChannels = useMemo(() => {
    const result: { ch: Result & { kind: "channel" } }[] = [];
    for (const sid of Object.keys(channels)) {
      const server = servers.find((s) => s.id === sid);
      for (const c of (channels[sid] ?? [])) {
        result.push({ ch: { kind: "channel", id: c.id, serverId: sid, name: c.name + (server ? ` · ${server.name}` : ""), type: c.type } });
      }
    }
    return result.map((r) => r.ch);
  }, [channels, servers]);

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    const list: Result[] = [];

    for (const s of servers) {
      list.push({ kind: "server", id: s.id, name: s.name, iconUrl: s.icon_url });
    }
    for (const ch of allChannels) {
      list.push(ch);
    }
    for (const d of dms) {
      const others = dmOthers(d, user?.id ?? null);
      const title = dmTitle(d, user?.id ?? null);
      list.push({
        kind: "dm", id: d.id, title, isGroup: d.is_group,
        iconUrl: d.icon_url, avatarUrl: others[0]?.avatar_url ?? null,
        other: others[0] ?? null,
      });
    }
    for (const f of friends) {
      list.push({ kind: "user", id: f.id, user: f });
    }

    if (!query) {
      return list
        .sort((a, b) => order(a) - order(b))
        .slice(0, 40);
    }
    const scored = list
      .map((r) => ({ r, score: score(r, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || order(a.r) - order(b.r));
    return scored.slice(0, 40).map((x) => x.r);
  }, [q, allChannels, dms, friends, servers, user?.id]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1))); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[active];
        if (r) pick(r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, results, active, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = async (r: Result) => {
    if (r.kind === "channel") {
      router.push(`/servers/${r.serverId}/channels/${r.id}`);
    } else if (r.kind === "dm") {
      router.push(`/dms/${r.id}`);
    } else if (r.kind === "user") {
      try {
        const dm = await dmsApi.create([r.id]);
        qc.invalidateQueries({ queryKey: ["dms"] });
        router.push(`/dms/${dm.id}`);
      } catch {}
    } else if (r.kind === "server") {
      const chs = channels[r.id] ?? [];
      const first = chs.find((c) => c.type === "text") ?? chs[0];
      if (first) router.push(`/servers/${r.id}/channels/${first.id}`);
    }
    onClose();
  };

  if (!show) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 100, animation: "fadeIn 140ms ease-out" }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-panel" style={{ width: 620, maxHeight: "70vh", display: "flex", flexDirection: "column", borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ color: "var(--text-2)", fontSize: 16 }} />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по каналам, серверам, друзьям и ЛС…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-0)", fontSize: 16, fontFamily: "inherit" }}
          />
          <span style={{ fontSize: 11, fontFamily: "Geist Mono", padding: "2px 6px", borderRadius: 4, background: "var(--bg-3)", color: "var(--text-2)" }}>esc</span>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {results.length === 0 && (
            <div style={{ padding: "20px 12px", fontSize: 13, color: "var(--text-2)", textAlign: "center" }}>
              Ничего не найдено
            </div>
          )}
          {results.map((r, i) => (
            <ResultRow key={`${r.kind}-${r.id}`} r={r} active={i === active} idx={i} onHover={() => setActive(i)} onPick={() => pick(r)} />
          ))}
        </div>

        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 16, fontSize: 11, color: "var(--text-2)", fontFamily: "Geist Mono" }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> навигация</span>
          <span><kbd style={kbdStyle}>↵</kbd> открыть</span>
          <span><kbd style={kbdStyle}>esc</kbd> закрыть</span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = { padding: "1px 5px", borderRadius: 3, background: "var(--bg-3)", marginRight: 4 };

function order(r: Result): number {
  if (r.kind === "channel") return 0;
  if (r.kind === "dm") return 1;
  if (r.kind === "server") return 2;
  return 3;
}

function score(r: Result, q: string): number {
  const fields: string[] = [];
  if (r.kind === "channel") fields.push(r.name);
  if (r.kind === "dm") fields.push(r.title);
  if (r.kind === "user") { fields.push(r.user.username); fields.push(r.user.display_name ?? ""); }
  if (r.kind === "server") fields.push(r.name);
  let best = 0;
  for (const f of fields) {
    const low = f.toLowerCase();
    if (!low) continue;
    if (low === q) best = Math.max(best, 100);
    else if (low.startsWith(q)) best = Math.max(best, 70);
    else if (low.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) return url;
  return `${API_BASE}${url}`;
}

function ResultRow({ r, active, idx, onHover, onPick }: { r: Result; active: boolean; idx: number; onHover: () => void; onPick: () => void }) {
  let icon: React.ReactNode;
  let primary: string;
  let secondary: string;

  if (r.kind === "channel") {
    icon = <i className={`fa-solid ${r.type === "voice" ? "fa-volume-high" : "fa-hashtag"}`} style={{ fontSize: 13, color: "var(--text-2)", width: 28, textAlign: "center" }} />;
    primary = r.name;
    secondary = r.type === "voice" ? "Голосовой канал" : "Канал";
  } else if (r.kind === "dm") {
    icon = r.isGroup ? (
      r.iconUrl ? (
        <img src={resolveIcon(r.iconUrl)} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, oklch(55% 0.17 268), oklch(40% 0.12 300))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <i className="fa-solid fa-users" style={{ fontSize: 12 }} />
        </div>
      )
    ) : (
      <Avatar name={r.other?.username ?? "?"} size={28} shape="circle" avatarUrl={r.avatarUrl} status={r.other?.status} />
    );
    primary = r.title;
    secondary = r.isGroup ? "Групповой чат" : "Личные сообщения";
  } else if (r.kind === "user") {
    icon = <Avatar name={r.user.username} size={28} shape="circle" avatarUrl={r.user.avatar_url} status={r.user.status} />;
    primary = r.user.display_name ?? r.user.username;
    secondary = `@${r.user.username} · новое ЛС`;
  } else {
    icon = r.iconUrl ? (
      <img src={resolveIcon(r.iconUrl)} alt="" style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover" }} />
    ) : (
      <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-1)", fontWeight: 700 }}>
        {r.name.slice(0, 2).toUpperCase()}
      </div>
    );
    primary = r.name;
    secondary = "Сервер";
  }

  return (
    <div
      data-idx={idx}
      onMouseEnter={onHover}
      onClick={onPick}
      style={{
        padding: "7px 10px", borderRadius: 6, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10,
        background: active ? "var(--bg-active)" : "transparent",
      }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{primary}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono" }}>{secondary}</div>
      </div>
      {active && <i className="fa-solid fa-arrow-turn-down fa-rotate-90" style={{ fontSize: 11, color: "var(--text-2)" }} />}
    </div>
  );
}
