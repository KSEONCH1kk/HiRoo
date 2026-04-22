"use client";
import { CSSProperties } from "react";

interface Props {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  size?: "sm" | "md";
  style?: CSSProperties;
}

/**
 * Themed checkbox — uses --accent, rounded, no Chrome default styling.
 * Can be used standalone or with an inline label.
 */
export function Checkbox({ checked, onChange, disabled, label, hint, size = "md", style }: Props) {
  const s = size === "sm" ? 15 : 18;
  const iconSize = size === "sm" ? 9 : 11;
  const radius = size === "sm" ? 4 : 5;

  const box = (
    <span
      aria-hidden
      style={{
        width: s, height: s, borderRadius: radius,
        background: checked ? "var(--accent)" : "var(--bg-0)",
        border: `1.5px solid ${checked ? "var(--accent)" : "var(--line-strong)"}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        transition: "background 120ms, border-color 120ms, transform 120ms",
        boxShadow: checked ? "0 0 0 3px rgba(124,92,255,0.15)" : "none",
      }}
    >
      {checked && (
        <i
          className="fa-solid fa-check"
          style={{
            color: "#fff", fontSize: iconSize, fontWeight: 900,
            animation: "hirooCheckPop 160ms ease-out",
          }}
        />
      )}
    </span>
  );

  const content = label ? (
    <label
      style={{
        display: "inline-flex", alignItems: "flex-start", gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
      />
      {box}
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: size === "sm" ? 12.5 : 13.5, color: "var(--text-0)", lineHeight: 1.35 }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{hint}</span>}
      </span>
    </label>
  ) : (
    <span
      onClick={() => !disabled && onChange?.(!checked)}
      style={{ display: "inline-flex", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, ...style }}
    >
      {box}
    </span>
  );

  return content;
}
