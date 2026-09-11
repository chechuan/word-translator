const endpoint = "https://api.datamuse.com/words";
const memory = new Map<string, string>();

type DictionaryEntry = { word?: string; tags?: string[] };

const IPA: Record<string, string> = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ", ER: "ɝ", EY: "eɪ", F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "i", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p", R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ", UW: "u", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

function arpaToIpa(pronunciation: string) {
  return pronunciation.trim().split(/\s+/).map((token) => {
    const match = token.match(/^([A-Z]+)([012])?$/); if (!match) return "";
    const [, phoneme, stress] = match;
    const vowel = phoneme === "AH" && stress === "0" ? "ə" : phoneme === "ER" && stress === "0" ? "ɚ" : IPA[phoneme] ?? "";
    return `${stress === "1" ? "ˈ" : stress === "2" ? "ˌ" : ""}${vowel}`;
  }).join("");
}

async function lookup(word: string) {
  const key = word.toLowerCase();
  if (memory.has(key)) return memory.get(key) ?? "";
  try {
    const response = await fetch(`${endpoint}?sp=${encodeURIComponent(key)}&md=pr&max=1`, { signal: AbortSignal.timeout(2_500) });
    if (!response.ok) throw new Error("not found");
    const entries = await response.json() as DictionaryEntry[];
    const pronunciation = entries.find((entry) => entry.word?.toLowerCase() === key)?.tags?.find((tag) => tag.startsWith("pron:"))?.slice(5) ?? "";
    const phonetic = arpaToIpa(pronunciation);
    memory.set(key, phonetic);
    return phonetic;
  } catch {
    memory.set(key, "");
    return "";
  }
}

export async function getPhonetics(words: string[]) {
  const distinct = [...new Set(words.map((word) => word.toLowerCase()))];
  const results = new Map<string, string>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, distinct.length) }, async () => {
    while (cursor < distinct.length) {
      const word = distinct[cursor++];
      results.set(word, await lookup(word));
    }
  });
  await Promise.all(workers);
  return results;
}
