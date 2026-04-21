"use client";
import { DMSidebar } from "@/components/dm/DMSidebar";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function DmsLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
      {!isMobile && <DMSidebar />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
