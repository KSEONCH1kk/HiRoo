"use client";
import { useImageViewerStore } from "@/store/imageViewerStore";

interface Props {
  src: string;
  filename?: string;
  maxWidth?: number;
  maxHeight?: number;
  style?: React.CSSProperties;
}

export function ViewerImage({ src, filename, maxWidth = 420, maxHeight = 360, style }: Props) {
  const open = useImageViewerStore((s) => s.open);
  return (
    <img
      src={src}
      alt={filename ?? ""}
      loading="lazy"
      draggable={false}
      onClick={(e) => { e.stopPropagation(); open(src, filename ?? null); }}
      style={{
        maxWidth: "100%", maxHeight, width: maxWidth, height: "auto",
        objectFit: "contain",
        borderRadius: 8, border: "1px solid var(--line)", display: "block",
        cursor: "zoom-in",
        ...style,
      }}
    />
  );
}
