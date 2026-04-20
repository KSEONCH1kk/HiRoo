"use client";
interface ToggleProps { on: boolean; onChange: (v: boolean) => void; label?: string; desc?: string; }

export function Toggle({ on, onChange, label, desc }: ToggleProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
      {label && (
        <div style={{ flex: 1, paddingRight: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-0)" }}>{label}</div>
          {desc && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>{desc}</div>}
        </div>
      )}
      <div onClick={() => onChange(!on)} style={{
        width: 42, height: 24, borderRadius: 12, padding: 2,
        background: on ? "var(--accent)" : "var(--bg-3)", cursor: "pointer",
        transition: "background 140ms", flexShrink: 0,
      }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", transform: `translateX(${on ? 18 : 0}px)`, transition: "transform 160ms" }} />
      </div>
    </div>
  );
}
