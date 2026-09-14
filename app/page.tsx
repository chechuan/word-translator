"use client";

import { useRef, useState } from "react";
import { Check, Clipboard, RotateCcw, Volume2 } from "lucide-react";
import type { TranslationResponse, TranslationItem } from "@/types/translation";
import "./loading.css";
import "./learning.css";

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="copy-button" onClick={async () => {
      await navigator.clipboard.writeText(value); setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }} aria-label={`${label}：${value}`}>
      {copied ? <Check size={15} /> : <Clipboard size={15} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function SpeakButton({ value, label = "Play word" }: { value: string; label?: string }) {
  return <button className="speak-button" type="button" onClick={() => {
    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(value)}&type=2`);
    audio.play().catch(() => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "en-US";
      utterance.rate = 0.82;
      window.speechSynthesis.speak(utterance);
    });
  }} aria-label={`${label}：${value}`} title={label}><Volume2 size={16} /></button>;
}

function ResultSection({ title, kicker, items, showSentence, kind }: {
  title: string; kicker: string; items: TranslationItem[]; showSentence?: boolean; kind?: "word" | "sentence" | "phrase";
}) {
  if (!items.length) return null;
  return <section className={`result-section ${kind ? `result-section-${kind}` : ""}`}>
    <div className="section-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><span className="count-pill">{items.length}</span></div>
    <div className="result-list">{items.map((item, index) => <article className="translation-row" key={`${item.start}-${item.end}-${index}`}>
      <div className="source-cell"><code>{item.source}</code>{kind === "sentence" && <SpeakButton value={item.source} label="Play sentence" />}{item.phonetic && <span className="pronunciation"><span className="phonetic">/{item.phonetic.replaceAll("/", "")}/</span>{kind === "word" && <SpeakButton value={item.source} />}</span>}{showSentence && <span>Sentence {item.sentenceIndex + 1}</span>}</div>
      <div className="row-arrow">→</div><p>{item.translation || "Translation unavailable"}</p><CopyButton value={item.translation || item.source} />
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
  async function translate(content = text) {
    if (!content.trim() || content === lastRequested.current) return;
    lastRequested.current = content;
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setError(""); setResult(null); setIsLoading(true);
    try {
      const response = await fetch("/api/analyze-translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }), signal: current.signal });
      const data = (await response.json()) as TranslationResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Translation is temporarily unavailable. Please try again.");
      setResult(data);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError((caught as Error).message);
    } finally {
      if (controller.current === current) setIsLoading(false);
    }
  }

  return <main>
    <div className="page-shell" id="top">
      <section className="translator-card" aria-label="English translation input">
        {isLoading && <svg className="translation-progress" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0.12" y="0.18" width="99.76" height="99.64" rx="1.6" ry="5.5" pathLength="100" /></svg>}
        <div className="input-toolbar"><span>Paste English</span><span>{text.length} / 1,000</span></div>
        <div className="input-area">
          <textarea value={text} onChange={(event) => { lastRequested.current = ""; setText(event.target.value.slice(0, 1000)); }} onPaste={(event) => { const field = event.currentTarget; window.setTimeout(() => { const pasted = field.value.slice(0, 1000); setText(pasted); void translate(pasted); }, 0); }} onBlur={() => void translate()} placeholder="Paste an English word, phrase, sentence, or passage…" aria-label="English text" />
        </div>
        <div className="input-footer"><button className="text-button" type="button" onClick={() => { controller.current?.abort(); lastRequested.current = ""; setIsLoading(false); setText(""); setResult(null); setError(""); }}><RotateCcw size={15} /> Clear</button></div>
      </section>
      {error && <div className="error-message" role="alert">{error}</div>}
      {result && <section className="results" aria-live="polite">
        <ResultSection title="Word by Word" kicker="Vocabulary" items={result.words} showSentence kind="word" />
        <ResultSection title="Phrases in Context" kicker="Phrases" items={result.phrases} showSentence kind="phrase" />
        <ResultSection title="Sentence by Sentence" kicker="Sentences" items={result.sentences} kind="sentence" />
        {result.fullTranslation && <section className="full-translation"><div className="full-translation-heading"><span className="section-kicker">Full passage</span><h2>Full Translation</h2></div><div className="passage-pair"><article><span>Original English</span><p className="passage-source">{result.sourceText}</p></article><article><span>Chinese Translation</span><p>{result.fullTranslation}</p></article></div><CopyButton value={`${result.sourceText}\n\n${result.fullTranslation}`} label="Copy original and translation" /></section>}
        {result.warnings.length > 0 && <p className="warning">{result.warnings.join(" · ")}</p>}
      </section>}
    </div>
  </main>;
}
