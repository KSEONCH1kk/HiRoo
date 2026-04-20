import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HiRoo — community chat & voice",
  description: "Общайся, звони, создавай сообщества",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
