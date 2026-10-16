import test from "node:test";
import assert from "node:assert/strict";
import { deleteStudyNode, makeInitialData, moveStudyNode, parseMemoryKeywords, parseStudyData, removeUnusedExample, getQuestions, searchQuestions } from "../lib/study.ts";

function makeDataWithQuestion() {
  const data = makeInitialData();
  data.groups[0].topics[2].questions.push({ id: "user-question", title: "辛亥革命的历史意义", answer: "", keywords: [], status: "new" });
  return data;
}

test("初始框架严格保持用户指定的五组与专题", () => {
  const data = makeInitialData();
  assert.deepEqual(data.groups.map(group => group.topics.map(topic => topic.title)), [
    ["列强入侵", "各阶层探索", "辛亥革命"], ["新文化运动", "建党"], ["抗日战争", "解放战争"], ["社会主义改造", "改革开放", "新时代"], ["补充题"],
  ]);
  assert.equal(getQuestions(data).length, 0);
});

test("题库备份往返保留答案、关键词、自评与多行默写草稿", () => {
  const data = makeDataWithQuestion();
  const q = getQuestions(data)[0].question;
  q.answer = "1. 第一条\n2. 第二条"; q.keywords = ["要点一", "要点二"]; q.status = "mastered";
  data.drafts[`answer:${q.id}`] = "我的回忆\n补充一条";
  assert.deepEqual(parseStudyData(JSON.stringify(data)), data);
});

test("跨组搜索涵盖题干、专题、答案和记忆关键词", () => {
  const data = makeDataWithQuestion();
  const q = getQuestions(data)[0].question;
  q.answer = "第一段中的独特文字"; q.keywords = ["提示关键词"];
  for (const query of ["辛亥", "革命", "第一组", "独特文字", "提示关键词"]) assert.equal(searchQuestions(data, query).length, 1);
  assert.equal(searchQuestions(data, "不存在的题目").length, 0);
});

test("拒绝截断 JSON、不兼容版本及非法掌握状态", () => {
  assert.throws(() => parseStudyData("{"));
  const data = makeDataWithQuestion();
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
  const first = makeDataWithQuestion(); const second = makeDataWithQuestion();
  first.groups[0].topics[2].questions.length = 0;
  assert.equal(getQuestions(second).length, 1);
  first.groups[4].topics.length = 0;
  assert.deepEqual(parseStudyData(JSON.stringify(first)), first);
});

test("记忆关键词按编号或换行分条，保留条内标点和年份", () => {
  const expected = ["政治、经济，社会", "成立于（1949）年", "第三项", "第四项"];
  assert.deepEqual(parseMemoryKeywords("（1）政治、经济，社会\r\n（2）成立于（1949）年\n(3) 第三项（4）第四项"), expected);
  assert.deepEqual(parseMemoryKeywords(" 第一项、第二项 \n\n 第三项，第四项 "), ["第一项、第二项", "第三项，第四项"]);
  assert.deepEqual(parseMemoryKeywords("\n（1）\n（2） "), []);
});

test("只清理未使用的默认示例题，保留用户录入的内容和草稿", () => {
  const data = makeDataWithQuestion();
  getQuestions(data)[0].question.id = "question-example";
  const original = structuredClone(data);
  assert.equal(getQuestions(removeUnusedExample(data)).length, 0);
  assert.deepEqual(data, original);
  for (const change of [
    q => { q.title = "用户修改后的题目"; },
    q => { q.answer = "我的标准答案"; },
    q => { q.keywords = ["我的关键词"]; },
    q => { q.status = "review"; },
    (_, copy) => { copy.drafts["answer:question-example"] = "我的默写草稿"; },
    (_, copy) => { copy.drafts["topic:topic-1-3"] = "我的题目默写草稿"; },
    q => { q.id = "user-created-question"; },
  ]) {
    const copy = structuredClone(data);
    change(getQuestions(copy)[0].question, copy);
    assert.deepEqual(removeUnusedExample(copy), copy);
  }
});

function makeNodeFixture() {
  const data = makeDataWithQuestion();
  const question = getQuestions(data)[0].question;
  question.answer = "完整答案";
  question.keywords = ["要点一", "要点二"];
  question.status = "mastered";
  data.groups[0].topics[2].questions.push({ ...question, id: "second-question", title: "第二道题" });
  data.groups[1].topics[0].questions.push({ ...question, id: "other-question", title: "另一组的题目" });
  data.drafts = { "answer:user-question": "第一题草稿", "answer:second-question": "第二题草稿", "topic:topic-1-3": "专题默写", "answer:other-question": "另一组草稿", "topic:topic-1-1": "空专题草稿" };
  return data;
}

test("同级排序只改变位置，答案、关键词、进度和草稿随节点保留", () => {
  const data = makeNodeFixture();
  const original = structuredClone(data);
  const questionMoved = moveStudyNode(data, { kind: "question", id: "second-question" }, -1);
  assert.deepEqual(questionMoved.groups[0].topics[2].questions.map(q => q.id), ["second-question", "user-question"]);
  assert.deepEqual(questionMoved.groups[0].topics[2].questions[0], data.groups[0].topics[2].questions[1]);
  assert.deepEqual(questionMoved.groups[1], data.groups[1]);
  assert.deepEqual(questionMoved.drafts, data.drafts);
  const topicMoved = moveStudyNode(questionMoved, { kind: "topic", id: "topic-1-3" }, -1);
  assert.deepEqual(topicMoved.groups[0].topics.map(t => t.id), ["topic-1-1", "topic-1-3", "topic-1-2"]);
  assert.deepEqual(topicMoved.groups[0].topics[1], questionMoved.groups[0].topics[2]);
  const groupMoved = moveStudyNode(topicMoved, { kind: "group", id: "group-1" }, 1);
  assert.deepEqual(groupMoved.groups.map(g => g.id), ["group-2", "group-1", "group-3", "group-4", "group-5"]);
  assert.deepEqual(groupMoved.groups[1], topicMoved.groups[0]);
  assert.deepEqual(parseStudyData(JSON.stringify(groupMoved)), groupMoved);
  assert.deepEqual(data, original);
});

test("排序到边界时保持原位，不把节点移入其他父节点", () => {
  const data = makeNodeFixture();
  for (const [target, direction] of [
    [{ kind: "group", id: "group-1" }, -1], [{ kind: "group", id: "group-5" }, 1],
    [{ kind: "topic", id: "topic-1-1" }, -1], [{ kind: "topic", id: "topic-1-3" }, 1],
    [{ kind: "question", id: "user-question" }, -1], [{ kind: "question", id: "second-question" }, 1],
    [{ kind: "question", id: "other-question" }, -1], [{ kind: "topic", id: "missing" }, 1],
  ]) assert.deepEqual(moveStudyNode(data, target, direction), data);
});

test("删除题目、专题或分组只清理对应子树和草稿，原数据可供撤销", () => {
  const data = makeNodeFixture();
  const original = structuredClone(data);
  const questionDeleted = deleteStudyNode(data, { kind: "question", id: "user-question" });
  assert.deepEqual(questionDeleted.groups[0].topics[2].questions.map(q => q.id), ["second-question"]);
  assert.equal(questionDeleted.drafts["answer:user-question"], undefined);
  assert.equal(questionDeleted.drafts["topic:topic-1-3"], "专题默写");
  const topicDeleted = deleteStudyNode(data, { kind: "topic", id: "topic-1-3" });
  assert.equal(topicDeleted.groups[0].topics.length, 2);
  assert.equal(topicDeleted.drafts["topic:topic-1-3"], undefined);
  assert.equal(topicDeleted.drafts["answer:second-question"], undefined);
  assert.equal(topicDeleted.drafts["topic:topic-1-1"], "空专题草稿");
  const groupDeleted = deleteStudyNode(data, { kind: "group", id: "group-1" });
  assert.equal(groupDeleted.groups.length, 4);
  assert.deepEqual(groupDeleted.drafts, { "answer:other-question": "另一组草稿" });
  assert.deepEqual(groupDeleted.groups[0], data.groups[1]);
  assert.deepEqual(parseStudyData(JSON.stringify(groupDeleted)), groupDeleted);
  assert.deepEqual(data, original);
});

test("最后一个分组保留，分组内仍可清空专题", () => {
  const data = makeNodeFixture();
  data.groups = [data.groups[0]];
  assert.equal(deleteStudyNode(data, { kind: "group", id: "group-1" }), data);
  let next = data;
  for (const topic of data.groups[0].topics) next = deleteStudyNode(next, { kind: "topic", id: topic.id });
  assert.equal(next.groups[0].topics.length, 0);
  assert.deepEqual(parseStudyData(JSON.stringify(next)), next);
});
