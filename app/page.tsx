"use client";

import { useRef, useState } from "react";
import { Check, Clipboard, RotateCcw, Volume2 } from "lucide-react";
import type { TranslationResponse, TranslationItem } from "@/types/translation";
import "./loading.css";
import "./learning.css";

let playbackId = 0;
let activeAudio: HTMLAudioElement | null = null;

function splitForSpeech(text: string) {
  const chunks: string[] = [];
  let current = "";
  for (const part of text.match(/[^.!?]+[.!?]*|\S+/g) ?? []) {
    if (current && current.length + part.length + 1 > 180) { chunks.push(current); current = part.trim(); }
    else current = `${current} ${part}`.trim();
  }
  if (current) chunks.push(current);
  return chunks;
}

function playSpeech(text: string) {
  const id = ++playbackId;
  activeAudio?.pause();
  const chunks = splitForSpeech(text);
  const playNext = (index: number) => {
    if (id !== playbackId || index >= chunks.length) return;
    const audio = new Audio(`https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=en-US&q=${encodeURIComponent(chunks[index])}`);
    activeAudio = audio;
    audio.onended = () => playNext(index + 1);
    audio.play().catch(() => { /* leave silent rather than falling back to low-quality system speech */ });
  };
  playNext(0);
}

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
    playSpeech(value);
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
        {result.fullTranslation && <section className="full-translation"><div className="full-translation-heading"><span className="section-kicker">Full passage</span><h2>Full Translation</h2></div><div className="passage-pair"><article><div className="passage-label"><span>Original English</span><SpeakButton value={result.sourceText} label="Play passage" /></div><p className="passage-source">{result.sourceText}</p></article><article><div className="passage-label"><span>Chinese Translation</span></div><p>{result.fullTranslation}</p></article></div><CopyButton value={`${result.sourceText}\n\n${result.fullTranslation}`} label="Copy original and translation" /></section>}
        {result.warnings.length > 0 && <p className="warning">{result.warnings.join(" · ")}</p>}
      </section>}
    </div>
  </main>;
}
