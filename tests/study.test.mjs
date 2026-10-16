import test from "node:test";
import assert from "node:assert/strict";
import { makeInitialData, parseStudyData, getQuestions, searchQuestions } from "../lib/study.ts";

test("初始框架严格保持用户指定的五组与专题", () => {
  const data = makeInitialData();
  assert.deepEqual(data.groups.map(group => group.topics.map(topic => topic.title)), [
    ["列强入侵", "各阶层探索", "辛亥革命"], ["新文化运动", "建党"], ["抗日战争", "解放战争"], ["社会主义改造", "改革开放", "新时代"], ["补充题"],
  ]);
  assert.equal(getQuestions(data).length, 1);
  assert.equal(getQuestions(data)[0].question.answer, "");
});

test("题库备份往返保留答案、关键词、自评与多行默写草稿", () => {
  const data = makeInitialData();
  const q = getQuestions(data)[0].question;
  q.answer = "1. 第一条\n2. 第二条"; q.keywords = ["要点一", "要点二"]; q.status = "mastered";
  data.drafts[`answer:${q.id}`] = "我的回忆\n补充一条";
  assert.deepEqual(parseStudyData(JSON.stringify(data)), data);
});

test("跨组搜索涵盖题干、专题、答案和提示词", () => {
  const data = makeInitialData();
  const q = getQuestions(data)[0].question;
  q.answer = "第一段中的独特文字"; q.keywords = ["提示关键词"];
  for (const query of ["辛亥", "革命", "第一组", "独特文字", "提示关键词"]) assert.equal(searchQuestions(data, query).length, 1);
  assert.equal(searchQuestions(data, "不存在的题目").length, 0);
});

test("拒绝截断 JSON、不兼容版本及非法掌握状态", () => {
  assert.throws(() => parseStudyData("{"));
  const data = makeInitialData();
  assert.throws(() => parseStudyData(JSON.stringify({ ...data, version: 2 })));
  getQuestions(data)[0].question.status = "invalid";
  assert.throws(() => parseStudyData(JSON.stringify(data)));
});

test("重复的专题或题目 ID 不得覆盖已有内容", () => {
  const data = makeInitialData();
  data.groups[1].topics[0].id = data.groups[0].topics[0].id;
  assert.throws(() => parseStudyData(JSON.stringify(data)), /重复编号/);
});

test("拒绝空分组题库、缺少字段及超过大小限制的输入", () => {
  assert.throws(() => parseStudyData(JSON.stringify({ ...makeInitialData(), groups: [] })));
  assert.throws(() => parseStudyData(JSON.stringify({ version: 1 })));
  assert.throws(() => parseStudyData(" ".repeat(10_000_001)), /文件过大/);
});

test("初始化数据互不共享可变内容，空专题和空题库可合法备份", () => {
  const first = makeInitialData(); const second = makeInitialData();
  first.groups[0].topics[2].questions.length = 0;
  assert.equal(getQuestions(second).length, 1);
  first.groups[4].topics.length = 0;
  assert.deepEqual(parseStudyData(JSON.stringify(first)), first);
});
