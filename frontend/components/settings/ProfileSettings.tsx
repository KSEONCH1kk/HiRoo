"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ImageCropModal } from "@/components/modals/ImageCropModal";
import { TagPicker } from "@/components/settings/TagPicker";

const schema = z.object({
  display_name: z.string().max(50).optional(),
  custom_status: z.string().max(100).optional(),
});
type Form = z.infer<typeof schema>;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileSettings() {
  const { user, updateUser } = useAuthStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: user?.display_name ?? "", custom_status: user?.custom_status ?? "" },
  });

  const update = useMutation({
    mutationFn: (data: Form) => usersApi.updateMe(data),
    onSuccess: (updated) => updateUser(updated),
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => usersApi.uploadAvatar(file),
    onSuccess: (updated) => { updateUser(updated); setUploadError(null); },
    onError: (e: any) => setUploadError(e?.response?.data?.detail ?? "Не удалось загрузить аватар"),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Выберите изображение");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setUploadError("Размер файла не должен превышать 5 МБ");
      return;
    }
    setUploadError(null);
    setPendingCrop(file);
  };

  if (!user) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit((d) => update.mutate(d))} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
        <div style={{ position: "relative", cursor: "pointer" }} onClick={() => fileInput.current?.click()} title="Загрузить аватар">
          <Avatar name={user.username} size={64} shape="circle" avatarUrl={user.avatar_url} status={user.status} />
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 11, fontWeight: 600, opacity: 0, transition: "opacity 150ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
          >
            {uploadAvatar.isPending ? "…" : "ИЗМЕНИТЬ"}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-0)" }}>{user.display_name ?? user.username}</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", fontFamily: "Geist Mono" }}>@{user.username}</div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>{user.email}</div>
        </div>
        <Button type="button" variant="soft" size="sm" onClick={() => fileInput.current?.click()} disabled={uploadAvatar.isPending}>
          {uploadAvatar.isPending ? "Загрузка…" : "Сменить аватар"}
        </Button>
      </div>
      {uploadError && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "var(--danger)", fontSize: 13 }}>
          {uploadError}
        </div>
      )}

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Отображаемое имя
        </label>
        <input {...register("display_name")} style={inputStyle} placeholder={user.username} />
        {errors.display_name && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{errors.display_name.message}</p>}
      </div>

      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Статус
        </label>
        <input {...register("custom_status")} style={inputStyle} placeholder="Чем сейчас занимаетесь?" />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {update.isSuccess && <span style={{ fontSize: 13, color: "var(--ok)", alignSelf: "center" }}>Сохранено</span>}
        <Button type="submit" variant="primary" disabled={!isDirty || update.isPending}>
          {update.isPending ? "…" : "Сохранить"}
        </Button>
      </div>

      <TagPicker />

      {pendingCrop && (
        <ImageCropModal
          file={pendingCrop}
          title="Обрезать аватар"
          onConfirm={(blob, filename) => {
            uploadAvatar.mutate(new File([blob], filename, { type: "image/jpeg" }));
          }}
          onClose={() => setPendingCrop(null)}
        />
      )}
    </form>
  );
}
