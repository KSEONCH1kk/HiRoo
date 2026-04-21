"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { serversApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { ImageCropModal } from "@/components/modals/ImageCropModal";
import type { Server } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`;
}

export function OverviewTab({ server }: { server: Server }) {
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [iconError, setIconError] = useState<string | null>(null);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const router = useRouter();

  const toggleDiscover = useMutation({
    mutationFn: (v: boolean) => serversApi.update(server.id, { is_discoverable: v } as Partial<Server>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", server.id] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
  });

  const uploadIcon = useMutation({
    mutationFn: (file: File) => serversApi.uploadIcon(server.id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", server.id] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      setIconError(null);
    },
    onError: (e: any) => setIconError(e?.response?.data?.detail ?? "Не удалось загрузить"),
  });

  const removeIcon = useMutation({
    mutationFn: () => serversApi.deleteIcon(server.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["server", server.id] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setIconError("Выберите изображение"); return; }
    if (file.size > 5 * 1024 * 1024) { setIconError("Файл больше 5 МБ"); return; }
    setIconError(null);
    setPendingCrop(file);
  };

  const iconUrl = resolveIcon(server.icon_url);

  const save = useMutation({
    mutationFn: () => serversApi.update(server.id, { name, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-servers"] }),
  });

  const del = useMutation({
    mutationFn: () => serversApi.delete(server.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      router.push("/friends");
    },
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)",
    border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      {/* Icon */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 10 }}>
          Иконка сервера
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            onClick={() => fileInput.current?.click()}
            style={{
              width: 96, height: 96, borderRadius: 24, cursor: "pointer", position: "relative",
              background: iconUrl ? "#000" : "linear-gradient(135deg, var(--accent), #5b8af0)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", border: "1px solid var(--line-strong)",
              color: "#fff", fontSize: 32, fontWeight: 700, letterSpacing: -1,
            }}
            title="Загрузить иконку"
          >
            {iconUrl ? (
              <img src={iconUrl} alt={server.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              server.name.slice(0, 2).toUpperCase()
            )}
            <div style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 10, fontWeight: 600, letterSpacing: 0.6, opacity: 0, transition: "opacity 150ms",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
            >
              {uploadIcon.isPending ? "…" : "ИЗМЕНИТЬ"}
            </div>
          </div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} style={{ display: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Button type="button" size="sm" variant="soft" onClick={() => fileInput.current?.click()} disabled={uploadIcon.isPending}>
              {uploadIcon.isPending ? "Загрузка…" : "Загрузить изображение"}
            </Button>
            {server.icon_url && (
              <Button type="button" size="sm" variant="ghost" onClick={() => removeIcon.mutate()} disabled={removeIcon.isPending}>
                Удалить
              </Button>
            )}
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono" }}>PNG/JPG/GIF · до 5 МБ</div>
          </div>
        </div>
        {iconError && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>{iconError}</div>}
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Название сервера
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Описание
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {save.isSuccess && <span style={{ fontSize: 13, color: "var(--ok)", alignSelf: "center" }}>Сохранено</span>}
        <Button
          variant="primary"
          onClick={() => save.mutate()}
          disabled={save.isPending || (name === server.name && description === (server.description ?? ""))}
        >
          {save.isPending ? "…" : "Сохранить"}
        </Button>
      </div>

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>Публичный сервер</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
            Показывать в разделе «Обзор», чтобы любой желающий мог вступить
          </div>
        </div>
        <Toggle on={server.is_discoverable} onChange={(v) => toggleDiscover.mutate(v)} />
      </div>

      <div style={{ marginTop: 20, padding: 20, borderRadius: 12, border: "1px solid rgba(255,80,80,0.3)", background: "rgba(255,80,80,0.05)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>Опасная зона</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>
          Удаление сервера нельзя отменить. Все каналы, сообщения и роли будут удалены навсегда.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            placeholder={`Введите "${server.name}"`}
            style={inputStyle}
          />
          <Button variant="danger" disabled={confirmDelete !== server.name || del.isPending} onClick={() => del.mutate()}>
            Удалить
          </Button>
        </div>
      </div>

      {pendingCrop && (
        <ImageCropModal
          file={pendingCrop}
          title="Обрезать иконку сервера"
          onConfirm={(blob, filename) => {
            uploadIcon.mutate(new File([blob], filename, { type: "image/jpeg" }));
          }}
          onClose={() => setPendingCrop(null)}
        />
      )}
    </div>
  );
}
