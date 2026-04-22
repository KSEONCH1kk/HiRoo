"use client";
import { useState, useRef, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { dmsApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { ImageCropModal } from "@/components/modals/ImageCropModal";
import type { DirectMessage } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) return url;
  return `${API_BASE}${url}`;
}

interface Props { dm: DirectMessage; onClose: () => void; }

type Tab = "overview" | "members";

export function GroupDMSettings({ dm, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const { user } = useAuthStore();
  const isOwner = user?.id === dm.owner_id;

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
        className="modal-panel"
        style={{
          width: 560, maxHeight: "86vh", display: "flex", flexDirection: "column",
          background: "var(--bg-1)", border: "1px solid var(--line-strong)",
          borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-gear" style={{ color: "var(--text-2)", fontSize: 14 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-0)" }}>Настройки группы</div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", borderRadius: 6 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--line)", padding: "0 16px", gap: 2 }}>
          <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>Обзор</TabBtn>
          <TabBtn active={tab === "members"} onClick={() => setTab("members")}>Участники · {dm.participants.length}</TabBtn>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "overview" && <OverviewTab dm={dm} isOwner={isOwner} onClose={onClose} />}
          {tab === "members" && <MembersTab dm={dm} isOwner={isOwner} currentUserId={user?.id ?? null} />}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 14px", border: "none", background: "transparent",
        cursor: "pointer", fontSize: 13.5, fontWeight: 600,
        color: active ? "var(--text-0)" : "var(--text-2)",
        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        transition: "color 120ms, border-color 120ms",
      }}
    >
      {children}
    </button>
  );
}

function OverviewTab({ dm, isOwner, onClose }: { dm: DirectMessage; isOwner: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(dm.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(dm.name ?? ""); }, [dm.id, dm.name]);

  const save = async () => {
    if (!isOwner) return;
    setSaving(true);
    setError(null);
    try {
      await dmsApi.update(dm.id, { name: name.trim() || null });
      qc.invalidateQueries({ queryKey: ["dm", dm.id] });
      qc.invalidateQueries({ queryKey: ["dms"] });
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const pickIcon = () => fileRef.current?.click();
  const uploadIcon = useMutation({
    mutationFn: (file: File) => dmsApi.uploadIcon(dm.id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm", dm.id] });
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Не удалось загрузить"),
  });
  const deleteIcon = useMutation({
    mutationFn: () => dmsApi.deleteIcon(dm.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm", dm.id] });
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: (myId: string) => dmsApi.leave(dm.id, myId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      onClose();
      if (typeof window !== "undefined") window.location.href = "/dms";
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Не удалось выйти"),
  });

  const iconUrl = resolveIcon(dm.icon_url);
  const { user } = useAuthStore();

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Аватар группы
        </label>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 76, height: 76, borderRadius: "50%", overflow: "hidden",
            background: "linear-gradient(135deg, oklch(55% 0.17 268), oklch(40% 0.12 300))",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            position: "relative",
          }}>
            {iconUrl ? (
              <img src={iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <i className="fa-solid fa-users" style={{ fontSize: 28 }} />
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPendingCrop(f); }}
            />
            <Button variant="soft" onClick={pickIcon} disabled={!isOwner || uploadIcon.isPending}>
              {uploadIcon.isPending ? "Загрузка…" : "Загрузить"}
            </Button>
            {dm.icon_url && (
              <Button variant="ghost" onClick={() => deleteIcon.mutate()} disabled={!isOwner || deleteIcon.isPending}>
                Удалить
              </Button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>
          JPG / PNG / WEBP, до 5 МБ. Только владелец группы может менять.
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Название
        </label>
        <input
          type="text" maxLength={100} value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwner}
          placeholder="Название группы"
          style={{
            width: "100%", marginTop: 6, background: "var(--bg-2)", border: "1px solid var(--line)",
            borderRadius: 8, padding: "9px 12px", color: "var(--text-0)", fontSize: 14,
            outline: "none", opacity: isOwner ? 1 : 0.6,
          }}
        />
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        {user?.id && (
          <Button
            variant="danger"
            onClick={() => { if (confirm("Покинуть группу?")) leaveMutation.mutate(user.id); }}
            disabled={leaveMutation.isPending}
            icon={<i className="fa-solid fa-right-from-bracket" />}
          >
            Покинуть группу
          </Button>
        )}
        <Button variant="primary" onClick={save} disabled={!isOwner || saving || name === (dm.name ?? "")}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>

      {pendingCrop && (
        <ImageCropModal
          file={pendingCrop}
          title="Обрезать аватар группы"
          onConfirm={(blob, filename) => {
            uploadIcon.mutate(new File([blob], filename, { type: "image/jpeg" }));
          }}
          onClose={() => setPendingCrop(null)}
        />
      )}
    </div>
  );
}

function MembersTab({ dm, isOwner, currentUserId }: { dm: DirectMessage; isOwner: boolean; currentUserId: string | null }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const kick = useMutation({
    mutationFn: (userId: string) => dmsApi.kickMember(dm.id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dm", dm.id] }),
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Не удалось"),
  });

  const sorted = [...dm.participants].sort((a, b) => {
    const aOwner = a.user.id === dm.owner_id ? 0 : 1;
    const bOwner = b.user.id === dm.owner_id ? 0 : 1;
    if (aOwner !== bOwner) return aOwner - bOwner;
    return (a.user.display_name ?? a.user.username).localeCompare(b.user.display_name ?? b.user.username);
  });

  return (
    <div style={{ padding: "10px 8px" }}>
      {error && <div style={{ padding: "6px 14px", fontSize: 12.5, color: "var(--danger)" }}>{error}</div>}
      {sorted.map((p) => {
        const isOwnerRow = p.user.id === dm.owner_id;
        const isSelfRow = p.user.id === currentUserId;
        const canKick = isOwner && !isOwnerRow;
        return (
          <div key={p.user.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8,
          }}>
            <Avatar name={p.user.username} size={36} shape="circle" status={p.user.status} avatarUrl={p.user.avatar_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", display: "flex", alignItems: "center", gap: 6 }}>
                {p.user.display_name ?? p.user.username}
                {isOwnerRow && (
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--accent)", color: "#fff", fontFamily: "Geist Mono", fontWeight: 600 }}>
                    OWNER
                  </span>
                )}
                {isSelfRow && <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "Geist Mono" }}>вы</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono" }}>@{p.user.username}</div>
            </div>
            {canKick && (
              <button
                onClick={() => { if (confirm(`Исключить ${p.user.display_name ?? p.user.username}?`)) kick.mutate(p.user.id); }}
                disabled={kick.isPending}
                title="Исключить"
                style={{
                  width: 30, height: 30, borderRadius: 6, border: "none", cursor: "pointer",
                  background: "transparent", color: "var(--danger)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <i className="fa-solid fa-user-xmark" style={{ fontSize: 13 }} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
