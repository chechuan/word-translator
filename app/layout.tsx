import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "研途笔记 · 考研资料整理",
  description: "整理考研资料，构建知识框架，记录复习笔记与学习进度。",
  metadataBase: new URL("https://translate.cc1204.cn"),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
