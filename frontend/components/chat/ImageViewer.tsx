"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useImageViewerStore } from "@/store/imageViewerStore";

const MIN = 0.25;
const MAX = 8;

export function ImageViewer() {
  const { url, filename, close } = useImageViewerStore();
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);

  useEffect(() => {
    if (!url) return;
    reset();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(MAX, s * 1.2));
      else if (e.key === "-") setScale((s) => Math.max(MIN, s / 1.2));
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, close, reset]);

  if (!url) return null;

  const onWheel: React.WheelEventHandler = (e) => {
    const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
    setScale((s) => Math.min(MAX, Math.max(MIN, s * factor)));
  };

  const startDrag: React.PointerEventHandler = (e) => {
    if (scale <= 1) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const moveDrag: React.PointerEventHandler = (e) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };
  const endDrag: React.PointerEventHandler = () => { dragRef.current = null; };

  const name = filename || url.split("/").pop() || "image";

  return (
    <div
      onClick={close}
      onWheel={onWheel}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.86)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 160ms ease-out", overflow: "hidden",
        userSelect: "none",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => { e.stopPropagation(); reset(); }}
        style={{
          maxWidth: "92vw", maxHeight: "92vh",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: dragRef.current ? "none" : "transform 120ms ease-out",
          cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "zoom-in",
          touchAction: "none",
        }}
      >
        <img
          ref={imgRef}
          src={url}
          alt={name}
          draggable={false}
          style={{ maxWidth: "92vw", maxHeight: "92vh", display: "block", borderRadius: 6 }}
        />
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", top: 16, left: 16, right: 16,
          display: "flex", alignItems: "center", gap: 8, color: "#fff",
          pointerEvents: "none",
        }}
      >
        <div style={{
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "Geist Mono",
        }}>{name}</div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 6, padding: 6,
          background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999, backdropFilter: "blur(6px)",
        }}
      >
        <CircleBtn icon="fa-minus" title="Уменьшить" onClick={() => setScale((s) => Math.max(MIN, s / 1.2))} />
        <div style={{ minWidth: 52, textAlign: "center", fontSize: 11.5, color: "#fff", fontFamily: "Geist Mono", alignSelf: "center" }}>
          {Math.round(scale * 100)}%
        </div>
        <CircleBtn icon="fa-plus" title="Увеличить" onClick={() => setScale((s) => Math.min(MAX, s * 1.2))} />
        <CircleBtn icon="fa-rotate" title="Сбросить (0)" onClick={reset} />
        <CircleBtn icon="fa-arrow-up-right-from-square" title="Открыть в новой вкладке" onClick={() => window.open(url, "_blank", "noreferrer,noopener")} />
        <CircleBtn icon="fa-download" title="Скачать" onClick={() => {
          const a = document.createElement("a");
          a.href = url; a.download = name; a.rel = "noreferrer noopener";
          document.body.appendChild(a); a.click(); a.remove();
        }} />
        <CircleBtn icon="fa-xmark" title="Закрыть (esc)" onClick={close} danger />
      </div>
    </div>
  );
}

function CircleBtn({ icon, title, onClick, danger }: { icon: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer",
        background: danger ? "var(--danger)" : "rgba(255,255,255,0.08)",
        color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 120ms",
      }}
    >
      <i className={`fa-solid ${icon}`} style={{ fontSize: 12 }} />
    </button>
  );
}
