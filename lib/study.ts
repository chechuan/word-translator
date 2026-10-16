import { z } from "zod";

export const statusLabels = { new: "未开始", review: "待巩固", mastered: "已掌握" } as const;
export type StudyStatus = keyof typeof statusLabels;
const questionSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(500),
  answer: z.string().max(100000), keywords: z.array(z.string().max(100)).max(100),
  status: z.enum(["new", "review", "mastered"]),
});
const topicSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(200),
  questions: z.array(questionSchema).max(1000),
});
const groupSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(100),
  subtitle: z.string().max(200), period: z.string().max(100),
  topics: z.array(topicSchema).max(200),
});
const studySchema = z.object({
  version: z.literal(1), groups: z.array(groupSchema).min(1).max(50),
  drafts: z.record(z.string().max(100000)), updatedAt: z.string().max(100),
});
export type Question = z.infer<typeof questionSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type StudyGroup = z.infer<typeof groupSchema>;
export type StudyData = z.infer<typeof studySchema>;
export const STORAGE_KEY = "shishi-history-v1";

export function parseMemoryKeywords(text: string): string[] {
  return text.split(/\r?\n|(?=[（(]\d{1,3}[）)])/u)
    .map(word => word.replace(/^[（(]\d{1,3}[）)]\s*/u, "").trim())
    .filter(Boolean);
}

export function removeUnusedExample(data: StudyData): StudyData {
  return { ...data, groups: data.groups.map(group => ({ ...group, topics: group.topics.map(topic => ({
    ...topic, questions: topic.questions.filter(question => !(
      question.id === "question-example" && question.title === "辛亥革命的历史意义" &&
      !question.answer && !question.keywords.length && question.status === "new" &&
      !data.drafts[`answer:${question.id}`]?.trim() && !data.drafts[`topic:${topic.id}`]?.trim()
    )),
  })) })) };
}

export function parseStudyData(raw: string): StudyData {
  if (raw.length > 10_000_000) throw new Error("题库文件过大，请控制在 10 MB 以内。");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("文件不是有效的 JSON 题库，请选择从本页面导出的文件。"); }
  const parsed = studySchema.safeParse(value);
  if (!parsed.success) throw new Error("题库格式不兼容，请选择从本页面导出的 JSON 文件。");
  const ids = new Set<string>();
  function unique(id: string) {
    if (ids.has(id)) throw new Error("题库包含重复编号，无法导入。请检查文件。");
    ids.add(id);
  }
  parsed.data.groups.forEach(group => {
    unique(group.id);
    group.topics.forEach(topic => {
      unique(topic.id);
      topic.questions.forEach(question => unique(question.id));
    });
  });
  return parsed.data;
}

export function getQuestions(data: StudyData) {
  return data.groups.flatMap(group => group.topics.flatMap(topic => topic.questions.map(question => ({ group, topic, question }))));
}

export function searchQuestions(data: StudyData, query: string) {
  const text = query.trim().toLocaleLowerCase();
  return getQuestions(data).filter(({ group, topic, question }) =>
    [group.title, group.subtitle, topic.title, question.title, question.answer, ...question.keywords].some(value => value.toLocaleLowerCase().includes(text)));
}

export function makeInitialData(): StudyData {
  const definitions = [
    { title: "第一组", subtitle: "救亡与探索", period: "1840—1912", topics: ["列强入侵", "各阶层探索", "辛亥革命"] },
    { title: "第二组", subtitle: "思想觉醒与建党", period: "1915—1921", topics: ["新文化运动", "建党"] },
    { title: "第三组", subtitle: "民族独立与人民解放", period: "1931—1949", topics: ["抗日战争", "解放战争"] },
    { title: "第四组", subtitle: "建设与发展", period: "新中国成立以来", topics: ["社会主义改造", "改革开放", "新时代"] },
    { title: "第五组", subtitle: "补充与融会贯通", period: "跨专题整理", topics: ["补充题"] },
  ];
  return {
    version: 1, drafts: {}, updatedAt: "",
    groups: definitions.map((group, gi) => ({ ...group, id: `group-${gi + 1}`, topics: group.topics.map((title, ti) => ({
      id: `topic-${gi + 1}-${ti + 1}`, title,
      questions: [],
    })) })),
  };
}
