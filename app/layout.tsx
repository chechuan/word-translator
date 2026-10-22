import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "近代史笔记 · 知识架构图",
  description: "整理中国近现代史题目、答案与记忆关键词，构建知识框架，记录复习进度。",
  metadataBase: new URL("https://translate.cc1204.cn"),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
