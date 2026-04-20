"use client";
import { DMSidebar } from "@/components/dm/DMSidebar";

export default function DmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
      <DMSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
