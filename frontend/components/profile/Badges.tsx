"use client";
import type { BadgeId } from "@/types";

interface BadgeMeta {
  label: string;
  hint: string;
  icon: string;    // fa-solid class
  bg: string;      // background tint
  fg: string;      // icon / text color
}

const META: Record<string, BadgeMeta> = {
  platform_admin: {
    label: "Admin платформы",
    hint: "Админ всей платформы HiRoo",
    icon: "fa-shield-halved",
    bg: "rgba(255, 99, 99, 0.18)",
    fg: "#ff7a7a",
  },
  verified: {
    label: "Verified",
    hint: "Верифицированный аккаунт",
    icon: "fa-certificate",
    bg: "rgba(88, 152, 255, 0.20)",
    fg: "#6fa8ff",
  },
  server_owner: {
    label: "Owner сервера",
    hint: "Владелец одного или нескольких серверов",
    icon: "fa-crown",
    bg: "rgba(252, 191, 73, 0.22)",
    fg: "#fcbf49",
  },
  early_user: {
    label: "Ранний юзер",
    hint: "Один из первых участников платформы",
    icon: "fa-seedling",
    bg: "rgba(88, 207, 140, 0.22)",
    fg: "#6fd99a",
  },
  bot: {
    label: "Bot",
    hint: "Автоматизированный бот-аккаунт",
    icon: "fa-robot",
    bg: "rgba(124, 92, 255, 0.22)",
    fg: "#a18cff",
  },
  bot_supports_commands: {
    label: "Supports Commands",
    hint: "Бот поддерживает slash-команды",
    icon: "fa-slash",
    bg: "rgba(88, 152, 255, 0.20)",
    fg: "#6fa8ff",
  },
  bot_supports_voice: {
    label: "Supports Voice",
    hint: "Бот может подключаться к голосовым каналам",
    icon: "fa-microphone",
    bg: "rgba(88, 207, 140, 0.22)",
    fg: "#6fd99a",
  },
  bot_verified: {
    label: "Verified Bot",
    hint: "Подтверждённый бот",
    icon: "fa-certificate",
    bg: "rgba(252, 191, 73, 0.22)",
    fg: "#fcbf49",
  },
};

export function Badges({ ids, size = "md" }: { ids?: BadgeId[] | null; size?: "sm" | "md" }) {
  if (!ids || ids.length === 0) return null;

  const known = ids.filter((id) => META[id as string]);
  if (known.length === 0) return null;

  const pad = size === "sm" ? "3px 7px" : "4px 9px";
  const iconSize = size === "sm" ? 10 : 11.5;
  const fontSize = size === "sm" ? 10.5 : 11.5;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {known.map((id) => {
        const m = META[id as string];
        return (
          <span
            key={id}
            title={m.hint}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: pad, borderRadius: 6,
              background: m.bg, color: m.fg,
              fontSize, fontWeight: 600, letterSpacing: 0.1,
              cursor: "help", userSelect: "none",
            }}
          >
            <i className={`fa-solid ${m.icon}`} style={{ fontSize: iconSize }} />
            {m.label}
          </span>
        );
      })}
    </div>
  );
}
