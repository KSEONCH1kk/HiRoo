"use client";
import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "soft" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  active?: boolean;
}

export function Button({ children, variant = "ghost", size = "md", icon, active, style, ...props }: ButtonProps) {
  const H = { sm: 28, md: 32, lg: 38 }[size];
  const pad = icon && !children ? 0 : { sm: "0 10px", md: "0 14px", lg: "0 18px" }[size];
  const bg =
    variant === "primary" ? "var(--accent)" :
    variant === "danger" ? "var(--danger)" :
    active ? "var(--bg-active)" :
    variant === "soft" ? "var(--bg-3)" : "transparent";
  const color =
    variant === "primary" || variant === "danger" ? "#fff" :
    active ? "var(--accent)" : "var(--text-1)";

  return (
    <button {...props} style={{
      height: H, padding: pad, width: icon && !children ? H : undefined,
      borderRadius: size === "sm" ? 6 : 8,
      background: bg, color,
      border: variant === "outline" ? "1px solid var(--line-strong)" : "none",
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      fontSize: 13, fontWeight: 500, cursor: "pointer",
      transition: "background 120ms, color 120ms, transform 80ms",
      fontFamily: "inherit",
      ...style,
    }}
    onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; props.onMouseDown?.(e); }}
    onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; props.onMouseUp?.(e); }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; props.onMouseLeave?.(e); }}
    >
      {icon}{children}
    </button>
  );
}
