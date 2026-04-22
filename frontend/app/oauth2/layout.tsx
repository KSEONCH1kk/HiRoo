"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function OAuth2Layout({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
