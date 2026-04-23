"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { messagesApi, dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { MessageContent } from "./MessageContent";
import { formatMessageTime } from "@/lib/utils";
import type { Message, DMMessageType } from "@/types";

interface Props {
  kind: "channel" | "dm";
  id: string;
  /** Optional override. Default: scroll to the message in the current chat
   * by its `data-msgid` attribute, with a brief highlight. */
  onJumpTo?: (messageId: string) => void;
  /** When provided, shows an "Открепить" button on each item. */
  canUnpin?: boolean;
}

function defaultJumpTo(messageId: string) {
  const el = document.querySelector(`[data-msgid="${messageId}"]`) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.transition = "background 200ms";
  const prev = el.style.background;
  el.style.background = "var(--bg-active)";
  setTimeout(() => { el.style.background = prev; }, 1200);
}

export function PinnedDropdown({ kind, id, onJumpTo, canUnpin = true }: Props) {
  const jumpTo = onJumpTo ?? defaultJumpTo;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery<Array<Message | DMMessageType>>({
    queryKey: ["pinned", kind, id],
    queryFn: () =>
      kind === "channel" ? messagesApi.listPinned(id) : dmsApi.listPinned(id),
    staleTime: 30_000,
    enabled: open, // only fetch when opened
  });

  const unpin = useMutation({
    mutationFn: async (messageId: string): Promise<void> => {
      if (kind === "channel") await messagesApi.unpin(id, messageId);
      else await dmsApi.unpinMessage(id, messageId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pinned", kind, id] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-pinned-dropdown]")) return;
      if (target.closest("[data-pinned-anchor]")) return;
      setOpen(false);
    };
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={anchorRef}
        data-pinned-anchor
        onClick={() => setOpen((v) => !v)}
        title="Закреплённые сообщения"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: open ? "var(--accent)" : "var(--text-2)",
          width: 30, height: 30, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.color = "var(--text-0)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = "var(--text-2)"; }}
      >
        <i className="fa-solid fa-thumbtack" style={{ fontSize: 14 }} />
      </button>
      {open && (
        <div
          data-pinned-dropdown
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 100,
            width: 380, maxWidth: "calc(100vw - 24px)",
            maxHeight: 480,
            background: "var(--bg-2)", border: "1px solid var(--line-strong)",
            borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 90ms ease-out",
          }}
        >
          <div style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--line)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <i className="fa-solid fa-thumbtack" style={{ fontSize: 12, color: "var(--accent)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>
              Закреплённые сообщения
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
            {isLoading && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Загрузка…
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                <i className="fa-solid fa-thumbtack" style={{ fontSize: 20, marginBottom: 8, display: "block" }} />
                В этом {kind === "channel" ? "канале" : "чате"} пока нет закреплённых сообщений.
              </div>
            )}
            {items.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                  background: "var(--bg-0)", border: "1px solid var(--line)",
                  display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.author && (
                    <Avatar
                      name={m.author.username}
                      size={22}
                      shape="circle"
                      avatarUrl={m.author.avatar_url}
                    />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-0)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.author?.display_name ?? m.author?.username ?? "?"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
                    {formatMessageTime(m.created_at)}
                  </span>
                </div>
                <div
                  style={{
                    maxHeight: 160, overflow: "hidden",
                    fontSize: 13.5, color: "var(--text-1)",
                    cursor: "pointer",
                  }}
                  onClick={() => { jumpTo(m.id); setOpen(false); }}
                >
                  <MessageContent content={m.content} embeds={(m as any).embeds ?? null} />
                </div>
                {canUnpin && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      onClick={() => { jumpTo(m.id); setOpen(false); }}
                      style={{
                        padding: "3px 10px", borderRadius: 6, border: "1px solid var(--line)",
                        background: "transparent", color: "var(--text-2)",
                        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Перейти
                    </button>
                    <button
                      onClick={() => unpin.mutate(m.id)}
                      disabled={unpin.isPending}
                      style={{
                        padding: "3px 10px", borderRadius: 6, border: "1px solid var(--line)",
                        background: "transparent", color: "var(--danger)",
                        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Открепить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
