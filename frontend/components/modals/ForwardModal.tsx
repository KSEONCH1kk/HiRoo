"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { serversApi, dmsApi, channelsApi, messagesApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { wrapForward } from "@/lib/forward";
import type { Server, Channel, DirectMessage, UserPublic } from "@/types";

/** Minimal shape the modal needs — covers both server Message and DMMessageType. */
export interface ForwardableMessage {
  content: string;
  author: UserPublic | null;
}

interface Props {
  message: ForwardableMessage;
  onClose: () => void;
}

type Target =
  | { kind: "channel"; serverId: string; channelId: string; name: string; serverName: string }
  | { kind: "dm"; dmId: string; name: string };

function targetKey(t: Target): string {
  return t.kind === "channel" ? `ch:${t.channelId}` : `dm:${t.dmId}`;
}

function dmDisplayName(dm: DirectMessage, myUserId: string | undefined): string {
  if (dm.name) return dm.name;
  const others = dm.participants.filter((p) => p.user_id !== myUserId);
  if (others.length === 0) return "Вы";
  return others.map((p) => p.user.display_name || p.user.username).join(", ");
}

function dmIconName(dm: DirectMessage, myUserId: string | undefined): string {
  const others = dm.participants.filter((p) => p.user_id !== myUserId);
  return others[0]?.user.username ?? dm.name ?? "?";
}

function dmIconUrl(dm: DirectMessage, myUserId: string | undefined): string | null {
  if (dm.icon_url) return dm.icon_url;
  const others = dm.participants.filter((p) => p.user_id !== myUserId);
  return others[0]?.user.avatar_url ?? null;
}

export function ForwardModal({ message, onClose }: Props) {
  const { user } = useAuthStore();
  const myId = user?.id;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["my-servers"],
    queryFn: serversApi.list,
  });
  const { data: dms = [] } = useQuery<DirectMessage[]>({
    queryKey: ["dms"],
    queryFn: dmsApi.list,
  });

  // Fetch channels only for expanded servers. Lazy — we don't want to hammer
  // the API for a user with 50 servers just to render the forward picker.
  const q = query.trim().toLowerCase();

  const filteredDMs = useMemo(() => {
    if (!q) return dms;
    return dms.filter((d) => dmDisplayName(d, myId).toLowerCase().includes(q));
  }, [dms, q, myId]);

  const filteredServers = useMemo(() => {
    if (!q) return servers;
    // Keep a server if its name matches — its channels can be inspected on expand
    return servers.filter((s) => s.name.toLowerCase().includes(q));
  }, [servers, q]);

  const toggleServer = (serverId: string) => {
    setExpanded((s) => ({ ...s, [serverId]: !s[serverId] }));
  };

  const sendTo = async (t: Target) => {
    if (sending) return;
    setErr(null);
    setSending(targetKey(t));
    try {
      const authorName = message.author?.display_name ?? message.author?.username ?? "кто-то";
      const authorUsername = message.author?.username ?? "";
      // wrapForward preserves the ORIGINAL author when re-forwarding an
      // already-forwarded message. Otherwise stacking sentinels would leak
      // the inner marker as plain text on the next client that rendered it
      // (the receiver's parser only strips one header).
      const fwd = wrapForward(message.content ?? "", { n: authorName, u: authorUsername });
      if (t.kind === "channel") {
        await messagesApi.send(t.channelId, fwd);
      } else {
        await dmsApi.sendMessage(t.dmId, fwd);
      }
      setSent((prev) => [...prev, targetKey(t)]);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Не удалось переслать");
    } finally {
      setSending(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "100%",
          maxHeight: "80vh",
          background: "var(--bg-2)",
          border: "1px solid var(--line-strong)",
          borderRadius: 14,
          padding: 0,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "18px 22px 12px",
          borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: "rgba(124,92,255,0.12)",
              color: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <i className="fa-solid fa-share" style={{ fontSize: 14 }} />
            </div>
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "var(--text-0)", letterSpacing: -0.3 }}>
              Переслать сообщение
            </div>
            <button
              onClick={onClose}
              title="Закрыть"
              style={{
                width: 28, height: 28, borderRadius: 6, border: "none",
                background: "transparent", color: "var(--text-2)", cursor: "pointer",
              }}
            >
              <i className="fa-solid fa-xmark" style={{ fontSize: 14 }} />
            </button>
          </div>
          <div style={{
            marginTop: 8, padding: "8px 10px", borderRadius: 8,
            background: "var(--bg-0)", border: "1px solid var(--line)",
            fontSize: 12.5, color: "var(--text-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <i className="fa-solid fa-quote-left" style={{ fontSize: 10, color: "var(--text-3)" }} />
            <span style={{ fontWeight: 600, color: "var(--text-1)" }}>
              {message.author?.display_name ?? message.author?.username ?? "?"}
            </span>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {message.content || "(без текста)"}
            </span>
          </div>
          <input
            type="text"
            placeholder="Найти сервер, канал или чат…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              marginTop: 12, width: "100%",
              padding: "9px 12px", borderRadius: 8,
              background: "var(--bg-0)", border: "1px solid var(--line-strong)",
              color: "var(--text-0)", fontSize: 13.5, outline: "none",
              fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 14px" }}>
          {err && (
            <div style={{
              margin: "0 10px 10px", padding: "8px 12px", borderRadius: 8,
              background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
              color: "var(--danger)", fontSize: 13,
            }}>
              {err}
            </div>
          )}

          {filteredDMs.length > 0 && (
            <SectionHeader label="Личные сообщения" />
          )}
          {filteredDMs.map((dm) => {
            const t: Target = { kind: "dm", dmId: dm.id, name: dmDisplayName(dm, myId) };
            const key = targetKey(t);
            const isSent = sent.includes(key);
            const isSending = sending === key;
            return (
              <Row
                key={dm.id}
                icon={
                  <Avatar
                    name={dmIconName(dm, myId)}
                    avatarUrl={dmIconUrl(dm, myId)}
                    size={28}
                    shape={dm.is_group ? "squircle" : "circle"}
                  />
                }
                label={t.name}
                hint={dm.is_group ? `Группа · ${dm.participants.length}` : "Личные сообщения"}
                isSent={isSent}
                isSending={isSending}
                onClick={() => sendTo(t)}
              />
            );
          })}

          {filteredServers.length > 0 && (
            <SectionHeader label="Серверы" />
          )}
          {filteredServers.map((s) => (
            <ServerBlock
              key={s.id}
              server={s}
              forceExpand={!!q && q.length > 0}
              expanded={expanded[s.id]}
              onToggle={() => toggleServer(s.id)}
              query={q}
              sent={sent}
              sending={sending}
              onSend={sendTo}
            />
          ))}

          {filteredDMs.length === 0 && filteredServers.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              Ничего не найдено
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 22px",
          borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10,
        }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {sent.length > 0 ? `Отправлено: ${sent.length}` : "Нажмите на адресата для пересылки"}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {sent.length > 0 ? "Готово" : "Отмена"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: "10px 12px 6px",
      fontSize: 11, fontWeight: 600, color: "var(--text-2)",
      textTransform: "uppercase", letterSpacing: 0.6,
    }}>
      {label}
    </div>
  );
}

function ServerBlock({
  server, expanded, forceExpand, onToggle, query, sent, sending, onSend,
}: {
  server: Server;
  expanded: boolean | undefined;
  forceExpand: boolean;
  onToggle: () => void;
  query: string;
  sent: string[];
  sending: string | null;
  onSend: (t: Target) => void;
}) {
  const isOpen = forceExpand || !!expanded;
  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["channels", server.id],
    queryFn: () => channelsApi.list(server.id),
    enabled: isOpen,
    staleTime: 60_000,
  });

  const textChannels = useMemo(
    () => channels
      .filter((c) => c.type === "text" || c.type === "announcement")
      .filter((c) => !query || c.name.toLowerCase().includes(query))
      .sort((a, b) => a.position - b.position),
    [channels, query],
  );

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", padding: "7px 12px", borderRadius: 6,
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <i
          className={`fa-solid fa-chevron-${isOpen ? "down" : "right"}`}
          style={{ fontSize: 9, color: "var(--text-3)", width: 10 }}
        />
        <Avatar name={server.name} avatarUrl={server.icon_url ?? null} size={22} shape="squircle" />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {server.name}
        </span>
      </button>
      {isOpen && (
        <div style={{ paddingLeft: 12 }}>
          {isLoading && (
            <div style={{ padding: "6px 24px", fontSize: 12, color: "var(--text-3)" }}>Загрузка…</div>
          )}
          {!isLoading && textChannels.length === 0 && (
            <div style={{ padding: "6px 24px", fontSize: 12, color: "var(--text-3)" }}>
              {query ? "Нет подходящих каналов" : "Нет текстовых каналов"}
            </div>
          )}
          {textChannels.map((ch) => {
            const t: Target = {
              kind: "channel",
              serverId: server.id,
              channelId: ch.id,
              name: ch.name,
              serverName: server.name,
            };
            const key = targetKey(t);
            const isSent = sent.includes(key);
            const isSending = sending === key;
            return (
              <Row
                key={ch.id}
                icon={
                  <div style={{
                    width: 22, height: 22, borderRadius: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-2)",
                  }}>
                    <i className={`fa-solid ${ch.type === "announcement" ? "fa-bullhorn" : "fa-hashtag"}`} style={{ fontSize: 12 }} />
                  </div>
                }
                label={ch.name}
                isSent={isSent}
                isSending={isSending}
                onClick={() => onSend(t)}
                indent
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({
  icon, label, hint, isSent, isSending, onClick, indent,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  isSent: boolean;
  isSending: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSending || isSent}
      style={{
        width: "100%", padding: indent ? "6px 12px 6px 24px" : "7px 12px",
        borderRadius: 6, border: "none", cursor: isSending || isSent ? "default" : "pointer",
        background: "transparent",
        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        opacity: isSent ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { if (!isSending && !isSent) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hint}
          </div>
        )}
      </div>
      {isSent ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ok, #58cf8c)", fontFamily: "Geist Mono" }}>
          <i className="fa-solid fa-check" style={{ marginRight: 4 }} />
          отправлено
        </span>
      ) : isSending ? (
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 12, color: "var(--text-2)" }} />
      ) : (
        <i className="fa-solid fa-paper-plane" style={{ fontSize: 12, color: "var(--text-3)" }} />
      )}
    </button>
  );
}
