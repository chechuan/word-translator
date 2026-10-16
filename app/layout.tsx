import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "近代史架构图 · 论述题默写",
  description: "把历史串起来，把答案记下来。用可编辑结构图整理近代史论述题，练习默写题目与答案要点。",
  metadataBase: new URL("https://translate.cc1204.cn"),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
