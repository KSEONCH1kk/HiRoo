"use client";
import { useChatStore } from "@/store/chatStore";

interface Props { roomKey: string; }

export function TypingIndicator({ roomKey }: Props) {
  const users = useChatStore((s) => s.typing[roomKey]);

  if (!users || users.length === 0) {
    return <div style={{ height: 22, padding: "0 20px", flexShrink: 0 }} />;
  }

  const names = users.map((u) => u.displayName || u.username || "кто-то");
  let subject: string;
  let verb: string;
  if (names.length === 1) { subject = names[0]; verb = "печатает"; }
  else if (names.length === 2) { subject = `${names[0]} и ${names[1]}`; verb = "печатают"; }
  else { subject = `${names[0]}, ${names[1]} и ещё ${names.length - 2}`; verb = "печатают"; }

  return (
    <div style={{
      height: 22, padding: "0 20px", display: "flex", alignItems: "center", gap: 8,
      fontSize: 12.5, color: "var(--text-2)", flexShrink: 0,
    }}>
      <span style={{ display: "inline-flex", gap: 3, alignItems: "center", marginTop: 2 }}>
        <i style={dotStyle(0)} />
        <i style={dotStyle(1)} />
        <i style={dotStyle(2)} />
      </span>
      <span>
        <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>{subject}</strong>
        <span style={{ marginLeft: 4 }}>{verb}…</span>
      </span>
    </div>
  );
}

function dotStyle(i: number): React.CSSProperties {
  return {
    width: 4, height: 4, borderRadius: "50%", background: "var(--text-2)",
    animation: `typingDot 1.2s infinite ease-in-out`,
    animationDelay: `${i * 0.18}s`,
    display: "inline-block",
  };
}
