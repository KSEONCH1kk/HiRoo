"use client";
import { useEffect, useState } from "react";
import { useDesktop, type ShareSource } from "@/hooks/useDesktop";

/**
 * Mounts a global listener that shows a pretty picker whenever the desktop
 * app needs the user to choose a screen/window source. Only active in the
 * Electron build — no-op in normal browsers.
 */
export function ScreenSharePickerHost() {
  const { api } = useDesktop();
  const [sources, setSources] = useState<ShareSource[] | null>(null);

  useEffect(() => {
    if (!api) return;
    return api.onShareRequest((s) => setSources(s));
  }, [api]);

  if (!sources) return null;

  const pick = (id: string | null) => {
    api?.pickShareSource(id);
    setSources(null);
  };

  const screens  = sources.filter((s) => s.id.startsWith("screen:"));
  const windows_ = sources.filter((s) => !s.id.startsWith("screen:"));

  return (
    <>
      <div
        onClick={() => pick(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300 }}
      />
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: 820, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto",
        background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 14,
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)", zIndex: 301, padding: 20,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 2 }}>
          Поделиться экраном
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>
          Выберите, что показать.
        </div>

        {screens.length > 0 && (
          <>
            <SectionLabel>Мониторы</SectionLabel>
            <Grid>{screens.map((s) => <Card key={s.id} src={s} onPick={() => pick(s.id)} />)}</Grid>
          </>
        )}
        {windows_.length > 0 && (
          <>
            <SectionLabel>Окна приложений</SectionLabel>
            <Grid>{windows_.map((s) => <Card key={s.id} src={s} onPick={() => pick(s.id)} />)}</Grid>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={() => pick(null)}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13, fontWeight: 600,
            }}
          >
            Отмена
          </button>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "var(--text-3)",
      textTransform: "uppercase", letterSpacing: 0.5,
      margin: "12px 0 8px",
    }}>{children}</div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
      {children}
    </div>
  );
}

function Card({ src, onPick }: { src: ShareSource; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      title={src.name}
      style={{
        display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 10,
        background: "var(--bg-0)", border: "1px solid var(--line)",
        cursor: "pointer", transition: "border-color 120ms, transform 120ms",
        minWidth: 0, overflow: "hidden",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
    >
      <div style={{
        width: "100%", aspectRatio: "16/9", borderRadius: 6, overflow: "hidden",
        background: `#000 url(${src.thumbnail}) center/contain no-repeat`,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, width: "100%" }}>
        {src.appIcon && <img src={src.appIcon} alt="" style={{ width: 14, height: 14, flexShrink: 0 }} />}
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 12, color: "var(--text-0)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: "left",
        }}>
          {src.name}
        </span>
      </div>
    </button>
  );
}
