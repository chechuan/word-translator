export type InputType = "word" | "phrase" | "sentence" | "paragraph";
export type TranslationItem = { source: string; translation: string; start: number; end: number; sentenceIndex: number; };
export type TranslationResponse = { requestId: string; status: "success" | "partial"; inputType: InputType; words: TranslationItem[]; phrases: TranslationItem[]; sentences: TranslationItem[]; fullTranslation: string | null; warnings: string[]; };
