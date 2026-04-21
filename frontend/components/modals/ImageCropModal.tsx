"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const SIZE = 320; // crop preview size in px (square)
const OUTPUT_SIZE = 512; // output image size in px

interface Props {
  file: File;
  onConfirm: (blob: Blob, filename: string) => void;
  onClose: () => void;
  title?: string;
}

export function ImageCropModal({ file, onConfirm, onClose, title = "Обрезать изображение" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [maxScale, setMaxScale] = useState(5);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const cover = Math.max(SIZE / image.width, SIZE / image.height);
      setImg(image);
      setMinScale(cover);
      setMaxScale(cover * 8);
      setScale(cover);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clamp = (v: { x: number; y: number }, s: number): { x: number; y: number } => {
    if (!img) return v;
    const w = img.width * s;
    const h = img.height * s;
    const maxX = Math.max(0, (w - SIZE) / 2);
    const maxY = Math.max(0, (h - SIZE) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const w = img.width * scale;
    const h = img.height * scale;
    const cx = SIZE / 2 - w / 2 + offset.x;
    const cy = SIZE / 2 - h / 2 + offset.y;
    ctx.drawImage(img, cx, cy, w, h);
  };

  useEffect(() => { draw(); }, [img, scale, offset]);

  const confirm = () => {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const octx = out.getContext("2d");
    if (!octx) return;
    const factor = OUTPUT_SIZE / SIZE;
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    octx.imageSmoothingQuality = "high";
    const w = img.width * scale * factor;
    const h = img.height * scale * factor;
    const cx = OUTPUT_SIZE / 2 - w / 2 + offset.x * factor;
    const cy = OUTPUT_SIZE / 2 - h / 2 + offset.y * factor;
    octx.drawImage(img, cx, cy, w, h);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    out.toBlob((blob) => {
      if (blob) onConfirm(blob, `${baseName || "avatar"}.jpg`);
      onClose();
    }, "image/jpeg", 0.92);
  };

  const onDown: React.PointerEventHandler = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove: React.PointerEventHandler = (e) => {
    if (!dragRef.current) return;
    const next = {
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    };
    setOffset(clamp(next, scale));
  };
  const onUp: React.PointerEventHandler = () => { dragRef.current = null; };
  const onWheel: React.WheelEventHandler = (e) => {
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const next = Math.max(minScale, Math.min(maxScale, scale * factor));
    setScale(next);
    setOffset((o) => clamp(o, next));
  };

  const onZoomSlider = (v: number) => {
    setScale(v);
    setOffset((o) => clamp(o, v));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 130,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 160ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel"
        style={{
          width: 380, background: "var(--bg-1)", border: "1px solid var(--line-strong)",
          borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>{title}</div>

        <div
          style={{
            position: "relative", width: SIZE, maxWidth: "100%", aspectRatio: "1/1",
            margin: "0 auto", borderRadius: 8, overflow: "hidden", background: "#000",
            touchAction: "none", userSelect: "none",
          }}
          onWheel={onWheel}
        >
          <canvas
            ref={canvasRef} width={SIZE} height={SIZE}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ display: "block", width: "100%", height: "100%", cursor: dragRef.current ? "grabbing" : "grab" }}
          />
          {/* Circular crop overlay hint */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.35)",
            mask: "radial-gradient(circle at center, transparent calc(50% - 1px), black calc(50% - 1px))",
            WebkitMask: "radial-gradient(circle at center, transparent calc(50% - 1px), black calc(50% - 1px))",
          }} />
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            borderRadius: "50%", boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.45)",
          }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <i className="fa-solid fa-magnifying-glass-minus" style={{ fontSize: 12, color: "var(--text-2)" }} />
          <input
            type="range" min={minScale} max={maxScale} step={(maxScale - minScale) / 200 || 0.01}
            value={scale} onChange={(e) => onZoomSlider(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <i className="fa-solid fa-magnifying-glass-plus" style={{ fontSize: 12, color: "var(--text-2)" }} />
        </div>

        <div style={{ fontSize: 11.5, color: "var(--text-3)", textAlign: "center", fontFamily: "Geist Mono" }}>
          перетащите чтобы сдвинуть · колесо / ползунок — масштаб
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={confirm} disabled={!img}>Готово</Button>
        </div>
      </div>
    </div>
  );
}
