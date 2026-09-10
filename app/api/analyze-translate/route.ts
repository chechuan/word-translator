import { z } from "zod";
import { findPhrases, translateBatch } from "@/lib/siliconflow";
import { allowRequest, readCache, writeCache } from "@/lib/runtime";
import { classify, normalize, splitSentences, splitWords, validatePhrases } from "@/lib/text";
import type { TranslationItem, TranslationResponse } from "@/types/translation";

const InputSchema = z.object({ text: z.string().max(1100) });
function requestId() { return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`; }
async function withTranslations(items: Omit<TranslationItem, "translation">[]) {
  const distinct = [...new Set(items.map((item) => item.source))];
  const translations = await translateBatch(distinct);
  const dictionary = new Map(distinct.map((source, index) => [source, translations[index]]));
  return items.map((item) => ({ ...item, translation: dictionary.get(item.source) ?? "" }));
}
export async function POST(request: Request) {
  const id = requestId();
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  if (!allowRequest(ip)) return Response.json({ error: "请求过于频繁，请一分钟后再试。" }, { status: 429 });
  try {
    const { text: raw } = InputSchema.parse(await request.json()); const text = normalize(raw);
    if (!text) return Response.json({ error: "请输入英文内容。" }, { status: 400 });
    if (!/[A-Za-z]/.test(text)) return Response.json({ error: "目前仅支持英文到简体中文翻译。" }, { status: 400 });
    const cached = readCache<TranslationResponse>(`v1:${text}`); if (cached) return Response.json({ ...cached, requestId: id });
    const sentences = splitSentences(text); const words = splitWords(text, sentences);
    if (words.length > 150) return Response.json({ error: "单次最多处理 150 个英文单词。" }, { status: 413 });
    if (sentences.length > 20) return Response.json({ error: "单次最多处理 20 个句子。" }, { status: 413 });
    const inputType = classify(text, words, sentences);
    const phrases = validatePhrases(text, await findPhrases(text), sentences).slice(0, 50);
    const [translatedWords, translatedPhrases, translatedSentences, fullTranslation] = await Promise.all([
      withTranslations(words), inputType === "word" ? Promise.resolve([]) : withTranslations(phrases),
      inputType === "sentence" || inputType === "paragraph" ? withTranslations(sentences) : Promise.resolve([]),
      inputType === "paragraph" ? translateBatch([text]).then(([item]) => item) : Promise.resolve(null),
    ]);
    const incomplete = [...translatedWords, ...translatedPhrases, ...translatedSentences].some((item) => !item.translation) || (inputType === "paragraph" && !fullTranslation);
    const result: TranslationResponse = { requestId: id, status: incomplete ? "partial" : "success", inputType, words: translatedWords, phrases: translatedPhrases, sentences: translatedSentences, fullTranslation, warnings: incomplete ? ["部分翻译未完成"] : [] };
    writeCache(`v1:${text}`, result); return Response.json(result);
  } catch (caught) {
    if (caught instanceof z.ZodError) return Response.json({ error: "输入格式不正确。" }, { status: 400 });
    const message = caught instanceof Error ? caught.message : "服务暂时不可用。";
    return Response.json({ error: message, requestId: id }, { status: /尚未配置/.test(message) ? 503 : 502 });
  }
}
