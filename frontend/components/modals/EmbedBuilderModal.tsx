"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { EmbedCard } from "@/components/chat/EmbedCard";
import type { Embed, EmbedField } from "@/types";

interface Props { webhookId: string; webhookToken: string; onClose: () => void; }

function hexToInt(hex: string): number | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return parseInt(m, 16);
}

export function EmbedBuilderModal({ webhookId, webhookToken, onClose }: Props) {
  const [content, setContent] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [colorHex, setColorHex] = useState("#7c5cff");
  const [timestamp, setTimestamp] = useState<string>("");
  const [authorName, setAuthorName] = useState("");
  const [authorIcon, setAuthorIcon] = useState("");
  const [authorUrl, setAuthorUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [footerIcon, setFooterIcon] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [fields, setFields] = useState<EmbedField[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addField = () => setFields((f) => [...f, { name: "", value: "", inline: false }]);
  const updateField = (i: number, patch: Partial<EmbedField>) =>
    setFields((f) => f.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeField = (i: number) => setFields((f) => f.filter((_, idx) => idx !== i));

  const preview: Embed = {
    title: title || null,
    description: description || null,
    url: url || null,
    color: hexToInt(colorHex),
    timestamp: timestamp ? new Date(timestamp).toISOString() : null,
    author: authorName ? { name: authorName, icon_url: authorIcon || null, url: authorUrl || null } : null,
    footer: footerText ? { text: footerText, icon_url: footerIcon || null } : null,
    image: imageUrl ? { url: imageUrl } : null,
    thumbnail: thumbUrl ? { url: thumbUrl } : null,
    fields: fields.filter((f) => f.name && f.value),
  };

  const send = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const cleanEmbed: any = {};
      for (const [k, v] of Object.entries(preview)) {
        if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
        cleanEmbed[k] = v;
      }
      const body: any = { content: content };
      if (username.trim()) body.username = username.trim();
      if (avatarUrl.trim()) body.avatar_url = avatarUrl.trim();
      if (Object.keys(cleanEmbed).length > 0) body.embeds = [cleanEmbed];
      await api.post(`/api/webhooks/${webhookId}/${webhookToken}`, body);
      setSuccess("Отправлено ✓");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось отправить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 160ms ease-out",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-panel" style={{
        width: 900, maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: "var(--bg-1)", border: "1px solid var(--line-strong)",
        borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-bolt" style={{ color: "var(--text-2)", fontSize: 13 }} />
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>Конструктор embed сообщения</div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 28, height: 28, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-2)", borderRadius: 6 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="modal-two-pane" style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
          {/* Form */}
          <div style={{ overflowY: "auto", padding: "14px 20px", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
            <Section title="Сообщение">
              <Field label="Текст" value={content} onChange={setContent} multiline maxLen={2000} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Имя (переопределить)" value={username} onChange={setUsername} maxLen={80} />
                <Field label="Аватар URL (переопределить)" value={avatarUrl} onChange={setAvatarUrl} maxLen={255} />
              </div>
            </Section>

            <Section title="Embed">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
                <Field label="Заголовок" value={title} onChange={setTitle} maxLen={200} />
                <div>
                  <Label>Цвет</Label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)}
                      style={{ width: 32, height: 32, border: "none", cursor: "pointer", background: "transparent", padding: 0 }} />
                    <input type="text" value={colorHex} onChange={(e) => setColorHex(e.target.value)}
                      style={{ flex: 1, ...inputStyle, fontFamily: "Geist Mono", fontSize: 12 }} />
                  </div>
                </div>
              </div>
              <Field label="URL заголовка" value={url} onChange={setUrl} maxLen={500} />
              <Field label="Описание" value={description} onChange={setDescription} multiline maxLen={2000} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="URL миниатюры (справа)" value={thumbUrl} onChange={setThumbUrl} maxLen={500} />
                <Field label="URL картинки (снизу)" value={imageUrl} onChange={setImageUrl} maxLen={500} />
              </div>
              <Field label="Timestamp (ISO)" value={timestamp} onChange={setTimestamp} placeholder="например, 2026-01-15T12:00" type="datetime-local" />
            </Section>

            <Section title="Автор">
              <Field label="Имя" value={authorName} onChange={setAuthorName} maxLen={120} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Иконка URL" value={authorIcon} onChange={setAuthorIcon} maxLen={500} />
                <Field label="Ссылка URL" value={authorUrl} onChange={setAuthorUrl} maxLen={500} />
              </div>
            </Section>

            <Section title="Футер">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Текст" value={footerText} onChange={setFooterText} maxLen={200} />
                <Field label="Иконка URL" value={footerIcon} onChange={setFooterIcon} maxLen={500} />
              </div>
            </Section>

            <Section title={`Поля · ${fields.length}/25`}>
              {fields.map((f, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", fontFamily: "Geist Mono" }}>#{i + 1}</span>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-1)", cursor: "pointer" }}>
                      <input type="checkbox" checked={!!f.inline} onChange={(e) => updateField(i, { inline: e.target.checked })} />
                      Inline
                    </label>
                    <button onClick={() => removeField(i)} style={{ marginLeft: "auto", width: 22, height: 22, border: "none", cursor: "pointer", background: "transparent", color: "var(--danger)" }}>
                      <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
                    </button>
                  </div>
                  <Field label="Название" value={f.name} onChange={(v) => updateField(i, { name: v })} maxLen={80} />
                  <Field label="Значение" value={f.value} onChange={(v) => updateField(i, { value: v })} multiline maxLen={1024} />
                </div>
              ))}
              {fields.length < 25 && (
                <Button variant="soft" onClick={addField} icon={<i className="fa-solid fa-plus" style={{ fontSize: 11 }} />}>Добавить поле</Button>
              )}
            </Section>
          </div>

          {/* Preview */}
          <div style={{ overflowY: "auto", padding: "14px 20px", background: "var(--bg-0)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Предпросмотр</div>
            {content && (
              <div style={{ fontSize: 14, color: "var(--text-0)", whiteSpace: "pre-wrap", marginBottom: 8 }}>
                {content}
              </div>
            )}
            <EmbedCard embed={preview} />
          </div>
        </div>

        {(error || success) && (
          <div style={{ padding: "8px 20px", fontSize: 12.5, color: error ? "var(--danger)" : "var(--ok)" }}>
            {error ?? success}
          </div>
        )}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
          <Button variant="primary" onClick={send} disabled={busy}
            icon={<i className="fa-solid fa-paper-plane" style={{ fontSize: 11 }} />}
          >
            {busy ? "Отправка…" : "Отправить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg-2)", border: "1px solid var(--line)",
  borderRadius: 6, padding: "6px 9px", color: "var(--text-0)", fontSize: 12.5, outline: "none",
  fontFamily: "inherit",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>{children}</div>;
}

function Field({ label, value, onChange, multiline, maxLen, placeholder, type }: {
  label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; maxLen?: number; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}{maxLen ? ` · ${value.length}/${maxLen}` : ""}</Label>
      {multiline ? (
        <textarea
          value={value} onChange={(e) => onChange(e.target.value)}
          rows={3} maxLength={maxLen} placeholder={placeholder}
          style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
        />
      ) : (
        <input
          type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)}
          maxLength={maxLen} placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  );
}
