import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "裔甯專案紀錄工具",
  description: "課程、保健食品、領取與繳費狀態紀錄工具",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
