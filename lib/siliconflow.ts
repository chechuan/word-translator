import { z } from "zod";

const endpoint = "https://api.siliconflow.cn/v1/chat/completions";
const BatchSchema = z.object({ items: z.array(z.object({ id: z.number(), translation: z.string().min(1) })) });

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型未返回有效 JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}

async function complete(model: string, prompt: string) {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) throw new Error("翻译服务尚未配置 API Key。");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, stream: false, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "翻译服务请求过于频繁，请稍后重试。" : "翻译服务暂时不可用。");
  const body = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  const choice = body.choices?.[0];
  if (choice?.finish_reason !== "stop" || !choice.message?.content?.trim()) throw new Error("翻译结果不完整，请重试。");
  return choice.message.content.trim();
}

export async function findPhrases(text: string) {
  const model = process.env.ANALYSIS_MODEL;
  if (!model) throw new Error("解析服务尚未配置 ANALYSIS_MODEL。");
  const content = await complete(model, `你是英语语言分析器。只从原文抽取有独立含义的固定搭配、短语动词、习语、技术术语和语法短语。不要翻译，不要编造，不要输出单词或任意连续词组。每项 source 必须与原文逐字符一致，并给出从 0 开始、end 排他的字符位置。只返回 JSON：{"phrases":[{"source":"...","start":0,"end":0}]}。

原文：
${text}`);
  const parsed = extractJson(content) as { phrases?: Array<{ source?: unknown; start?: unknown; end?: unknown }> };
  return (parsed.phrases ?? []).flatMap((item) => typeof item.source === "string" && typeof item.start === "number" && typeof item.end === "number" ? [{ source: item.source, start: item.start, end: item.end }] : []);
}

export async function translateBatch(sources: string[]) {
  if (!sources.length) return [];
  const model = process.env.TRANSLATION_MODEL;
  if (!model) throw new Error("翻译服务尚未配置 TRANSLATION_MODEL。");
  const numbered = sources.map((source, id) => ({ id, source }));
  const content = await complete(model, `把下列英文逐项翻译成简体中文。根据上下文给出自然、准确的译义。只返回 JSON，不要解释：{"items":[{"id":0,"translation":"..."}]}。必须保留每一个 id。

${JSON.stringify(numbered)}`);
  const parsed = BatchSchema.parse(extractJson(content));
  return sources.map((source, id) => parsed.items.find((item) => item.id === id)?.translation ?? "");
}
