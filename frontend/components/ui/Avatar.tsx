"use client";
import { avatarInitial, getStatusColor } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function resolveAvatarUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

interface AvatarProps {
  name: string;
  hue?: number;
  size?: number;
  status?: "online" | "idle" | "dnd" | "offline";
  shape?: "squircle" | "circle";
  ring?: boolean;
  avatarUrl?: string | null;
}

export function Avatar({ name, hue = 268, size = 36, status, shape = "squircle", ring, avatarUrl }: AvatarProps) {
  const resolvedUrl = resolveAvatarUrl(avatarUrl);
  const radius = shape === "circle" ? "50%" : `${Math.round(size * 0.32)}px`;
  const bg = `oklch(58% 0.14 ${hue})`;
  const bg2 = `oklch(72% 0.11 ${(hue + 30) % 360})`;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: radius,
        background: resolvedUrl ? undefined : `linear-gradient(135deg, ${bg}, ${bg2})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 600, fontSize: size * 0.42, letterSpacing: -0.5,
        boxShadow: ring ? `0 0 0 2px var(--bg-2), 0 0 0 4px ${bg}` : "none",
        overflow: "hidden",
      }}>
        {resolvedUrl
          ? <img src={resolvedUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : avatarInitial(name)}
      </div>
      {status && (
        <div style={{
          position: "absolute", right: -2, bottom: -2,
          width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3),
          borderRadius: "50%", background: getStatusColor(status),
          boxShadow: "0 0 0 3px var(--bg-2)",
        }}>
          {status === "idle" && (
            <div style={{ width: "50%", height: "50%", borderRadius: "50%", background: "var(--bg-2)", margin: "25% 0 0 25%" }} />
          )}
        </div>
      )}
    </div>
  );
}
