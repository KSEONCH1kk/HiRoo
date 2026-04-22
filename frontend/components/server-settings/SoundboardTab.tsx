"use client";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { soundboardApi, type SoundboardSound } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { useAuthStore } from "@/store/authStore";

const MAX_BYTES = 1 * 1024 * 1024;
const MAX_DURATION_S = 30;

export function SoundboardTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const { user: me } = useAuthStore();
  const { has } = useServerPermissions(serverId);
  const canUpload = has("UPLOAD_SOUNDBOARD") || has("MANAGE_SOUNDBOARD");
  const canManage = has("MANAGE_SOUNDBOARD");

  const { data: sounds, isLoading } = useQuery<SoundboardSound[]>({
    queryKey: ["soundboard", serverId],
    queryFn: () => soundboardApi.listServer(serverId),
  });

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["soundboard", serverId] });
    qc.invalidateQueries({ queryKey: ["soundboard-mine"] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => soundboardApi.delete(serverId, id),
    onSuccess: refetch,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 720 }}>
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Звуки длительностью до {MAX_DURATION_S} секунд, которые участники смогут проигрывать
        в голосовых каналах. Лимит: {(MAX_BYTES / 1024 / 1024).toFixed(1)} МБ на файл.
      </div>

      {canUpload ? (
        <UploadForm serverId={serverId} onUploaded={refetch} />
      ) : (
        <div style={{ color: "var(--text-3)", fontSize: 13, fontStyle: "italic" }}>
          Нет права загружать звуки на этот сервер.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>
          Все звуки — {sounds?.length ?? 0}
        </div>
        {isLoading ? (
          <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>
        ) : !sounds || sounds.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13, borderRadius: 8, background: "var(--bg-2)", border: "1px dashed var(--line)" }}>
            Пока нет звуков.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sounds.map((s) => (
              <SoundRow
                key={s.id}
                sound={s}
                canDelete={canManage || (!!me && s.uploader_id === me.id)}
                onDelete={() => {
                  if (!confirm(`Удалить «${s.name}»?`)) return;
                  remove.mutate(s.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SoundRow({ sound, canDelete, onDelete }: {
  sound: SoundboardSound;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
  const src = sound.url.startsWith("http") ? sound.url : `${API_BASE}${sound.url}`;

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
      audioRef.current.addEventListener("pause", () => setPlaying(false));
    }
    if (audioRef.current.paused) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    } else {
      audioRef.current.pause();
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      background: "var(--bg-2)", border: "1px solid var(--line)",
    }}>
      <button
        onClick={toggle}
        title={playing ? "Пауза" : "Прослушать"}
        style={{
          width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
          background: playing ? "var(--accent)" : "var(--bg-3)",
          color: playing ? "#fff" : "var(--text-0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <i className={`fa-solid ${playing ? "fa-pause" : "fa-play"}`} style={{ fontSize: 13 }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sound.emoji && <span style={{ fontSize: 16 }}>{sound.emoji}</span>}
          {sound.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
          {(sound.duration_ms / 1000).toFixed(1)}с
        </div>
      </div>
      {canDelete && (
        <button
          onClick={onDelete}
          title="Удалить"
          style={{
            width: 32, height: 32, borderRadius: 6, border: "none", cursor: "pointer",
            background: "transparent", color: "var(--danger)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,80,80,0.1)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
        </button>
      )}
    </div>
  );
}

function UploadForm({ serverId, onUploaded }: { serverId: string; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [probedDur, setProbedDur] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: () => soundboardApi.upload(serverId, file!, name.trim(), emoji.trim() || undefined),
    onSuccess: () => {
      setFile(null); setName(""); setEmoji(""); setProbedDur(null); setErr(null);
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    },
    onError: (e: any) => setErr(e?.response?.data?.detail || "Ошибка загрузки"),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setErr(null);
    if (!f) { setFile(null); setProbedDur(null); return; }
    if (f.size > MAX_BYTES) { setErr(`Файл больше ${(MAX_BYTES / 1024 / 1024).toFixed(1)} МБ`); return; }
    if (!f.type.startsWith("audio/") && !/\.(mp3|ogg|opus|wav|webm|m4a|aac)$/i.test(f.name)) {
      setErr("Ожидается аудиофайл"); return;
    }
    // Client-side duration sanity check — backend re-verifies with ffprobe.
    const url = URL.createObjectURL(f);
    const a = new Audio(url);
    const dur: number | null = await new Promise((r) => {
      a.addEventListener("loadedmetadata", () => r(a.duration));
      a.addEventListener("error", () => r(null));
      setTimeout(() => r(null), 3000);
    });
    URL.revokeObjectURL(url);
    if (dur !== null) {
      if (dur > MAX_DURATION_S) {
        setErr(`Длительность больше ${MAX_DURATION_S} секунд (${dur.toFixed(1)}с)`);
        return;
      }
      setProbedDur(dur);
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 32));
  };

  const canSubmit = !!file && name.trim().length > 0 && !upload.isPending;
  const inputStyle: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)",
    border: "1px solid var(--line-strong)", color: "var(--text-0)",
    fontSize: 14, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: "var(--bg-2)", border: "1px solid var(--line)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-0)" }}>
        <i className="fa-solid fa-upload" style={{ marginRight: 8, color: "var(--accent)" }} />
        Загрузить звук
      </div>

      {/* Hidden native input — the Chrome/WebView-styled button it renders
          by default looks out of place, so we drive it from our own styled
          dropzone below. */}
      <input
        ref={fileInput}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/ogg,audio/opus,audio/wav,audio/webm,audio/mp4,audio/aac,audio/*,.mp3,.ogg,.opus,.wav,.webm,.m4a,.aac"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 16px", borderRadius: 10,
          background: file ? "var(--bg-0)" : "var(--bg-1)",
          border: `1px dashed ${file ? "var(--accent)" : "var(--line-strong)"}`,
          color: "var(--text-0)", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit", fontSize: 14,
          transition: "background 120ms, border-color 120ms",
        }}
        onMouseEnter={(e) => { if (!file) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { if (!file) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-1)"; }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: file ? "var(--accent)" : "var(--bg-3)",
          color: file ? "#fff" : "var(--text-1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className={`fa-solid ${file ? "fa-music" : "fa-upload"}`} style={{ fontSize: 14 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file ? file.name : "Выбрать аудиофайл"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 2 }}>
            {file
              ? `${((file.size ?? 0) / 1024).toFixed(1)} КБ${probedDur != null ? ` · ${probedDur.toFixed(1)}с` : ""}`
              : `MP3 / OGG / WAV · до 30с · до ${(MAX_BYTES / 1024 / 1024).toFixed(1)} МБ`
            }
          </div>
        </div>
        {file && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setFile(null); setProbedDur(null); setErr(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            title="Убрать файл"
            style={{
              width: 28, height: 28, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-2)",
            }}
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: 12 }} />
          </span>
        )}
      </button>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 32))}
          placeholder="Название (до 32 символов)"
          maxLength={32}
          style={{ ...inputStyle, flex: "1 1 200px", minWidth: 0, boxSizing: "border-box" }}
        />
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
          placeholder="😎"
          maxLength={8}
          style={{ ...inputStyle, width: 84, flex: "0 0 84px", textAlign: "center", fontSize: 18, boxSizing: "border-box" }}
        />
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="primary"
          disabled={!canSubmit}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? "Загрузка…" : "Добавить звук"}
        </Button>
      </div>
    </div>
  );
}
