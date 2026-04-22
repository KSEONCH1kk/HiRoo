"use client";
import { useState } from "react";
import { interactionsApi } from "@/lib/api";

interface ActionRow {
  type: 1;
  components: (ButtonSpec | SelectSpec)[];
}
interface ButtonSpec {
  type: 2;
  label: string;
  style: 1 | 2 | 3 | 4 | 5;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  emoji?: string | null;
}
interface SelectSpec {
  type: 3;
  custom_id: string;
  placeholder?: string | null;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  options: { label: string; value: string; description?: string | null; default?: boolean }[];
}

interface Props {
  components: ActionRow[];
  messageId: string;
  channelId?: string | null;
  dmId?: string | null;
  guildId?: string | null;
  applicationId?: string | null;
}

const STYLE_BG: Record<number, string> = {
  1: "var(--accent)",      // primary
  2: "var(--bg-3)",        // secondary
  3: "#3ecf8e",            // success
  4: "var(--danger)",      // danger
  5: "var(--bg-3)",        // link
};
const STYLE_FG: Record<number, string> = {
  1: "#fff", 2: "var(--text-0)", 3: "#fff", 4: "#fff", 5: "var(--accent)",
};

export function MessageComponents({ components, messageId, channelId, dmId, guildId, applicationId }: Props) {
  if (!components || components.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {components.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {row.components.map((c, j) => (
            c.type === 2 ? (
              <ComponentButton
                key={`${c.custom_id ?? c.label}-${j}`}
                spec={c}
                messageId={messageId}
                channelId={channelId ?? null}
                dmId={dmId ?? null}
                guildId={guildId ?? null}
                applicationId={applicationId ?? null}
              />
            ) : (
              <ComponentSelect
                key={`${c.custom_id}-${j}`}
                spec={c}
                messageId={messageId}
                channelId={channelId ?? null}
                dmId={dmId ?? null}
                guildId={guildId ?? null}
                applicationId={applicationId ?? null}
              />
            )
          ))}
        </div>
      ))}
    </div>
  );
}

function ComponentButton({ spec, messageId, channelId, dmId, guildId, applicationId }: { spec: ButtonSpec } & Omit<Props, "components">) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (spec.style === 5 && spec.url) {
      if (!/^https?:\/\//i.test(spec.url)) return;
      window.open(spec.url, "_blank", "noopener");
      return;
    }
    if (!spec.custom_id || loading) return;
    setLoading(true);
    try {
      await interactionsApi.send({
        type: "component",
        custom_id: spec.custom_id,
        message_id: messageId,
        channel_id: channelId,
        dm_id: dmId,
        guild_id: guildId,
        application_id: applicationId,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={spec.disabled || loading}
      style={{
        padding: "6px 12px", borderRadius: 6, border: "none", cursor: spec.disabled ? "not-allowed" : "pointer",
        background: STYLE_BG[spec.style], color: STYLE_FG[spec.style],
        fontSize: 12.5, fontWeight: 600, opacity: spec.disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {spec.emoji && <span>{spec.emoji}</span>}
      {spec.label}
      {loading && <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: 10 }} />}
    </button>
  );
}

function ComponentSelect({ spec, messageId, channelId, dmId, guildId, applicationId }: { spec: SelectSpec } & Omit<Props, "components">) {
  const [value, setValue] = useState(spec.options.find((o) => o.default)?.value ?? "");
  const [loading, setLoading] = useState(false);

  const onChange = async (v: string) => {
    setValue(v);
    if (!v) return;
    setLoading(true);
    try {
      await interactionsApi.send({
        type: "component",
        custom_id: spec.custom_id,
        message_id: messageId,
        channel_id: channelId,
        dm_id: dmId,
        guild_id: guildId,
        application_id: applicationId,
        values: [v],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={spec.disabled || loading}
      style={{
        padding: "6px 10px", borderRadius: 6,
        background: "var(--bg-3)", border: "1px solid var(--line)",
        color: "var(--text-0)", fontSize: 12.5, minWidth: 180,
      }}
    >
      {!value && <option value="">{spec.placeholder ?? "Выберите…"}</option>}
      {spec.options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
