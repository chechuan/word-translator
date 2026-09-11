const endpoint = "https://api.siliconflow.cn/v1/chat/completions";

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型未返回有效 JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}

async function complete(model: string, prompt: string, options: { json?: boolean; timeoutMs?: number; maxTokens?: number } = {}) {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) throw new Error("翻译服务尚未配置 API Key。");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages: [{ role: "user", content: prompt }], temperature: options.json ? 0.1 : 0.3,
      stream: false, max_tokens: options.maxTokens ?? 128,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 18_000),
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
${text}`, { json: true, timeoutMs: 8_000, maxTokens: 500 });
  const parsed = extractJson(content) as { phrases?: Array<{ source?: unknown; start?: unknown; end?: unknown }> };
  return (parsed.phrases ?? []).flatMap((item) => typeof item.source === "string" && typeof item.start === "number" && typeof item.end === "number" ? [{ source: item.source, start: item.start, end: item.end }] : []);
}

export async function translateBatch(sources: string[]) {
  if (!sources.length) return [];
  const model = process.env.TRANSLATION_MODEL;
  if (!model) throw new Error("翻译服务尚未配置 TRANSLATION_MODEL。");
  try {
    const content = await complete(model, `将下面每一行英文分别翻译成简体中文。严格保持相同行数和顺序；每行只输出对应译文，不要编号、不要解释、不要空行。

${sources.join("\n")}`, { timeoutMs: 6_000, maxTokens: Math.min(1200, Math.max(128, sources.length * 40)) });
    const translations = content.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim()).filter(Boolean);
    if (translations.length === sources.length) return translations;
  } catch { /* fall back to reliable one-item translations */ }

  const results = Array<string>(sources.length).fill("");
  let cursor = 0;
  const workers = Array.from({ length: Math.min(2, sources.length) }, async () => {
    while (cursor < sources.length) {
      const index = cursor++;
      try {
        results[index] = await complete(model, `把下面的英文翻译成简体中文，不要额外解释。

${sources[index]}`, { timeoutMs: 10_000, maxTokens: 128 });
      } catch { /* return other successful items */ }
    }
  });
  await Promise.all(workers);
  return results;
}
