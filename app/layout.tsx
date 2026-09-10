import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "分层翻译｜英语文本解析工具",
  description: "按原文顺序提供英语逐词、逐短语、逐句和整段翻译。",
  metadataBase: new URL("https://translate.cc1204.cn"),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
