"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Clipboard, Languages, RotateCcw } from "lucide-react";
import type { TranslationResponse, TranslationItem } from "@/types/translation";
import "./loading.css";

function CopyButton({ value, label = "复制" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="copy-button" onClick={async () => {
      await navigator.clipboard.writeText(value); setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }} aria-label={`${label}：${value}`}>
      {copied ? <Check size={15} /> : <Clipboard size={15} />}
      {copied ? "已复制" : label}
    </button>
  );
}

function ResultSection({ title, kicker, items, showSentence }: {
  title: string; kicker: string; items: TranslationItem[]; showSentence?: boolean;
}) {
  if (!items.length) return null;
  return <section className="result-section">
    <div className="section-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><span className="count-pill">{items.length}</span></div>
    <div className="result-list">{items.map((item, index) => <article className="translation-row" key={`${item.start}-${item.end}-${index}`}>
      <div className="source-cell"><code>{item.source}</code>{showSentence && <span>第 {item.sentenceIndex + 1} 句</span>}</div>
      <div className="row-arrow">→</div><p>{item.translation || "暂未取得译文"}</p><CopyButton value={item.translation || item.source} />
    </article>)}</div>
  </section>;
}

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lastRequested = useRef("");
  const typeLabel = useMemo(() => {
    const labels = { word: "单词", phrase: "短语", sentence: "句子", paragraph: "段落" };
    return result ? labels[result.inputType] : null;
  }, [result]);

  async function translate(content = text) {
    if (!content.trim() || content === lastRequested.current) return;
    lastRequested.current = content;
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setError(""); setResult(null); setIsLoading(true);
    try {
      const response = await fetch("/api/analyze-translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }), signal: current.signal });
      const data = (await response.json()) as TranslationResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "翻译服务暂时不可用，请稍后再试。");
      setResult(data);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError((caught as Error).message);
    } finally {
      if (controller.current === current) setIsLoading(false);
    }
  }

  return <main>
    <header className="site-header"><a className="brand" href="#top" aria-label="分层翻译首页"><span className="brand-mark"><Languages size={20} /></span><span>分层翻译</span></a><span className="header-note">English → 简体中文</span></header>
    <div className="page-shell" id="top">
      <section className="translator-card" aria-label="英文翻译输入区">
        {isLoading && <><span className="translation-progress-track" aria-hidden="true" /><span className="translation-progress" aria-hidden="true" /></>}
        <div className="input-toolbar"><span>输入英文</span><span>{text.length} / 1,000</span></div>
        <div className="input-area">
          <textarea value={text} onChange={(event) => { lastRequested.current = ""; setText(event.target.value.slice(0, 1000)); }} onPaste={(event) => { const field = event.currentTarget; window.setTimeout(() => { const pasted = field.value.slice(0, 1000); setText(pasted); void translate(pasted); }, 0); }} onBlur={() => void translate()} placeholder="在这里粘贴一个英文单词、短语、句子或段落…" aria-label="英文文本" />
        </div>
        <div className="input-footer"><button className="text-button" type="button" onClick={() => { controller.current?.abort(); lastRequested.current = ""; setIsLoading(false); setText(""); setResult(null); setError(""); }}><RotateCcw size={15} /> 清空</button></div>
      </section>
      {error && <div className="error-message" role="alert">{error}</div>}
      {result && <section className="results" aria-live="polite">
        <div className="result-overview"><div><span className="section-kicker">识别结果</span><h2>这是一个<span>{typeLabel}</span></h2></div>{result.status === "partial" && <p>部分项目未完成，已展示可用结果。</p>}</div>
        <ResultSection title="逐词翻译" kicker="Word by word" items={result.words} showSentence />
        <ResultSection title="有效短语" kicker="Phrases in context" items={result.phrases} showSentence />
        <ResultSection title="逐句翻译" kicker="Sentence by sentence" items={result.sentences} />
        {result.fullTranslation && <section className="full-translation"><div><span className="section-kicker">Full translation</span><h2>整段翻译</h2></div><p>{result.fullTranslation}</p><CopyButton value={result.fullTranslation} label="复制整段" /></section>}
        {result.warnings.length > 0 && <p className="warning">{result.warnings.join(" · ")}</p>}
      </section>}
    </div>
  </main>;
}
