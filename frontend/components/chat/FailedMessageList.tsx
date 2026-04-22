"use client";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { Avatar } from "@/components/ui/Avatar";

interface Props {
  roomKey: string; // channel_id | dm_id
}

/**
 * Discord-style "Your message wasn't delivered" placeholder. Rendered at
 * the end of the message list, only the sender sees these (they never
 * leave the client). Clicking the X removes them, clicking retry puts the
 * text back into the composer (via a custom event composer listens for).
 */
export function FailedMessageList({ roomKey }: Props) {
  const { failed, dismissFailed } = useChatStore();
  const { user } = useAuthStore();
  const list = failed[roomKey] ?? [];

  if (list.length === 0) return null;

  return (
    <div style={{ padding: "4px 0 8px" }}>
      {list.map((m) => (
        <div key={m.id} style={{
          position: "relative",
          padding: "8px 16px 8px 16px",
          margin: "4px 10px",
          borderLeft: "3px solid var(--accent)",
          background: "rgba(124,92,255,0.08)",
          borderRadius: "0 8px 8px 0",
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Avatar name={user?.username ?? "?"} size={28} shape="circle" avatarUrl={user?.avatar_url ?? null} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-0)" }}>
                  {user?.display_name ?? user?.username ?? "Вы"}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 4,
                  background: "var(--accent)", color: "#fff", letterSpacing: 0.4,
                }}>
                  НЕ ДОСТАВЛЕНО
                </span>
              </div>
              <div style={{ fontSize: 14, color: "var(--text-0)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {m.content}
              </div>
              <div style={{
                marginTop: 6, fontSize: 12, color: "var(--accent)",
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 11 }} />
                <span>
                  Ваше сообщение не было доставлено. Обычно это случается, если
                  получатель заблокировал вас или вы его — или вам нельзя писать в этот чат.
                </span>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("hiroo:retry-failed", {
                      detail: { roomKey, content: m.content, id: m.id },
                    }));
                  }}
                  style={{
                    background: "transparent", border: "1px solid var(--accent)",
                    color: "var(--accent)", borderRadius: 4,
                    padding: "2px 8px", fontSize: 11.5, fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Попробовать снова
                </button>
                <button
                  onClick={() => dismissFailed(roomKey, m.id)}
                  style={{
                    background: "transparent", border: "none",
                    color: "var(--text-2)", cursor: "pointer",
                    fontSize: 11.5, fontWeight: 600,
                  }}
                >
                  Скрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
