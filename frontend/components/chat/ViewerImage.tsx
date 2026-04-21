"use client";
import { useImageViewerStore } from "@/store/imageViewerStore";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  src: string;
  filename?: string;
  maxWidth?: number;
  maxHeight?: number;
  style?: React.CSSProperties;
}

export function ViewerImage({ src, filename, maxWidth = 420, maxHeight = 360, style }: Props) {
  const open = useImageViewerStore((s) => s.open);
  const isMobile = useIsMobile();
  return (
    <img
      src={src}
      alt={filename ?? ""}
      loading="lazy"
      draggable={false}
      onClick={(e) => { e.stopPropagation(); open(src, filename ?? null); }}
      style={{
        width: "100%",
        maxWidth: isMobile ? "100%" : maxWidth,
        maxHeight: isMobile ? "70vh" : maxHeight,
        height: "auto",
        objectFit: "contain",
        borderRadius: 8, border: "1px solid var(--line)", display: "block",
        cursor: "zoom-in",
        ...style,
      }}
    />
  );
}
