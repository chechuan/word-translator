import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Layered Translation | English Text Analyzer",
  description: "Explore English text word by word, phrase by phrase, sentence by sentence, and as a full passage.",
  metadataBase: new URL("https://translate.cc1204.cn"),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
