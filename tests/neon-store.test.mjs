import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createStudyStore, validateNeonConnection } from "../lib/neon-store.ts";
import { makeInitialData } from "../lib/study.ts";

test("仅允许显式配置的 Neon 地址，缺少配置和其他服务器均拒绝", () => {
  for (const value of [undefined, '', 'postgresql://user:pass@192.0.2.1/study', 'postgresql://user:pass@company.internal/study', 'https://example.neon.tech/db', 'postgresql://user:pass@example.neon.tech.evil.test/db']) assert.throws(() => validateNeonConnection(value));
  assert.equal(validateNeonConnection('postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require'), 'postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require');
});

test("PostgreSQL 持久保存整份题库并拒绝旧版本覆盖，备份保留最近二十次", async () => {
  const db = new PGlite();
  try {
    const store = createStudyStore(async (query, parameters) => (await db.query(query, parameters)).rows);
    assert.deepEqual(await store.read(), { revision: 0, data: null });
    const data = makeInitialData();
    data.groups[0].topics[0].questions.push({ id: 'q1', title: '个人题目', answer: '标准答案', keywords: ['第一条', '第二条'], status: 'mastered' });
    data.drafts['answer:q1'] = '默写草稿';
    const concurrent = await Promise.all([store.write(0, data), store.write(0, data)]);
    assert.equal(concurrent.filter(Boolean).length, 1);
    const remote = await store.read();
    assert.equal(remote.revision, 1);
    assert.deepEqual(remote.data.groups, data.groups);
    assert.deepEqual(remote.data.drafts, data.drafts);
    data.groups[0].title = '另一设备修改';
    assert.equal((await store.write(1, data)).revision, 2);
    assert.equal(await store.write(1, makeInitialData()), null);
    assert.equal((await store.read()).data.groups[0].title, '另一设备修改');
    for (let revision = 2; revision < 24; revision++) await store.write(revision, data);
    const history = (await db.query('SELECT history FROM yantu_study_documents')).rows[0].history;
    assert.equal(history.length, 20);
    assert.equal(history[0].revision, 23);
    assert.equal(history[19].revision, 4);
    assert.equal(history[0].data.drafts['answer:q1'], '默写草稿');
    const restarted = createStudyStore(async (query, parameters) => (await db.query(query, parameters)).rows);
    assert.equal((await restarted.read()).revision, 24);
  } finally { await db.close(); }
});
