import { parseMemoryKeywords } from "@/lib/study";

export default function MemoryKeywords({ keywords }: { keywords: string[] }) {
  return <ol className="memory-keywords" aria-label="记忆关键词">{parseMemoryKeywords(keywords.join("\n")).map((word, index) => <li key={index}><span>（{index + 1}）</span><span>{word}</span></li>)}</ol>;
}
