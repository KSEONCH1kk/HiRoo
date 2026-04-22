"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { soundboardApi, serversApi, type SoundboardSound } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Server } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function toAbsolute(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface Props {
  roomId: string;
  onClose: () => void;
}

/** Grid of every soundboard sound from every server the user is on.
 * Click → play locally + WS broadcast to room peers. Searchable and
 * grouped by server. */
export function SoundboardModal({ roomId, onClose }: Props) {
  const [q, setQ] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data: sounds = [], isLoading } = useQuery<SoundboardSound[]>({
    queryKey: ["soundboard-mine"],
    queryFn: () => soundboardApi.listMine(),
  });

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["my-servers"],
    queryFn: () => serversApi.list(),
    staleTime: 30_000,
  });
  const serverById = useMemo(
    () => Object.fromEntries(servers.map((s) => [s.id, s] as const)),
    [servers],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sounds;
    return sounds.filter(
      (s) =>
        s.name.toLowerCase().includes(needle)
        || (s.emoji && s.emoji.includes(q.trim()))
        || (serverById[s.server_id]?.name.toLowerCase().includes(needle)),
    );
  }, [sounds, q, serverById]);

  // Group by server
  const grouped = useMemo(() => {
    const groups: Record<string, SoundboardSound[]> = {};
    for (const s of filtered) {
      (groups[s.server_id] ??= []).push(s);
    }
    return groups;
  }, [filtered]);

  const play = (sound: SoundboardSound) => {
    // Local playback so the sender hears it too
    const audio = new Audio(toAbsolute(sound.url));
    setPlayingId(sound.id);
    audio.addEventListener("ended", () => setPlayingId((id) => (id === sound.id ? null : id)));
    audio.addEventListener("error", () => setPlayingId((id) => (id === sound.id ? null : id)));
    audio.play().catch(() => setPlayingId(null));

    // Broadcast to peers in the same voice room
    getSocket().send("soundboard_play", { sound_id: sound.id, room_id: roomId });
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640, maxWidth: "96vw", maxHeight: "80vh",
          background: "var(--bg-1)",
          border: "1px solid var(--line-strong)",
          borderRadius: 14,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <i className="fa-solid fa-music" style={{ color: "var(--accent)", fontSize: 17 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-0)" }}>Звуковая панель</div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
              background: "transparent", color: "var(--text-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ position: "relative" }}>
            <i className="fa-solid fa-magnifying-glass" style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--text-3)", fontSize: 12,
            }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по названию или серверу…"
              style={{
                width: "100%", padding: "9px 12px 9px 32px",
                borderRadius: 8, background: "var(--bg-2)",
                border: "1px solid var(--line-strong)",
                color: "var(--text-0)", fontSize: 13.5,
                outline: "none", fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        <div style={{
          flex: 1, overflowY: "auto", padding: 14,
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          {isLoading ? (
            <div style={{ color: "var(--text-2)", fontSize: 13, padding: 20 }}>Загрузка…</div>
          ) : sounds.length === 0 ? (
            <EmptyState />
          ) : Object.keys(grouped).length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 24 }}>
              Ничего не найдено
            </div>
          ) : (
            Object.entries(grouped).map(([sid, items]) => (
              <div key={sid}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-2)",
                  textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8,
                }}>
                  {serverById[sid]?.name ?? "Сервер"} — {items.length}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                  gap: 8,
                }}>
                  {items.map((s) => (
                    <SoundButton
                      key={s.id}
                      sound={s}
                      playing={playingId === s.id}
                      onClick={() => play(s)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: "8px 14px", borderTop: "1px solid var(--line)",
          fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>ESC — закрыть</span>
          <span>{sounds.length} звуков · {Object.keys(grouped).length} серверов</span>
        </div>
      </div>
    </div>
  );
}

function SoundButton({ sound, playing, onClick }: {
  sound: SoundboardSound;
  playing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={sound.name}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "14px 10px", borderRadius: 10,
        background: playing ? "var(--accent)" : "var(--bg-2)",
        border: playing ? "1px solid var(--accent)" : "1px solid var(--line)",
        color: playing ? "#fff" : "var(--text-0)",
        cursor: "pointer",
        transition: "background 140ms, transform 80ms",
        minHeight: 84,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseEnter={(e) => { if (!playing) e.currentTarget.style.background = "var(--bg-hover)"; }}
    >
      <div style={{ fontSize: 26, lineHeight: 1 }}>
        {sound.emoji || <i className="fa-solid fa-volume-high" style={{ fontSize: 20, opacity: 0.85 }} />}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600,
        textAlign: "center", overflow: "hidden",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        wordBreak: "break-word",
      }}>
        {sound.name}
      </div>
      <div style={{ fontSize: 10, fontFamily: "Geist Mono", opacity: 0.7 }}>
        {(sound.duration_ms / 1000).toFixed(1)}с
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <i className="fa-solid fa-music" style={{ fontSize: 40, color: "var(--text-3)", marginBottom: 14 }} />
      <div style={{ fontSize: 14, color: "var(--text-1)", marginBottom: 6 }}>
        У вас ещё нет звуков
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5, maxWidth: 360, margin: "0 auto" }}>
        Загрузите их на своих серверах: Настройки сервера → «Звуковая панель».
        Все звуки с ваших серверов появятся здесь.
      </div>
    </div>
  );
}
