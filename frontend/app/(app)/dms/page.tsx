"use client";

export default function DmsPage() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <i className="fa-solid fa-message" style={{ fontSize: 40, color: "var(--text-3)" }} />
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-0)" }}>Выберите диалог</div>
      <div style={{ fontSize: 13, color: "var(--text-2)" }}>Выберите друга слева, чтобы начать переписку</div>
    </div>
  );
}
