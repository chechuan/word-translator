import test from "node:test";
import assert from "node:assert/strict";
import { chooseInitialSource, parseCloudSnapshot, studyFingerprint } from "../lib/cloud-study.ts";
import { makeInitialData } from "../lib/study.ts";

function changed(name) {
  const data = makeInitialData();
  data.groups[0].title = name;
  return data;
}
test("新设备读取云端，旧浏览器的题库可以迁移到空云端", () => {
  const local = changed("已有题库");
  assert.equal(chooseInitialSource(null, { revision: 5, data: local }, null), "remote");
  assert.equal(chooseInitialSource(local, { revision: 0, data: null }, null), "local");
  assert.equal(chooseInitialSource(local, { revision: 1, data: makeInitialData() }, null), "local");
  assert.equal(chooseInitialSource(makeInitialData(), { revision: 5, data: local }, null), "remote");
});
test("两份不同的既有题库需要确认，不自动覆盖", () => {
  assert.equal(chooseInitialSource(changed("本机"), { revision: 3, data: changed("云端") }, null), "conflict");
});
test("离线修改在云端未变化时可上传，双方都修改时保留冲突", () => {
  const old = changed("原内容"), local = changed("本机修改"), remote = changed("远端修改");
  const meta = { revision: 2, fingerprint: studyFingerprint(old) };
  assert.equal(chooseInitialSource(local, { revision: 2, data: old }, meta), "local");
  assert.equal(chooseInitialSource(old, { revision: 3, data: remote }, meta), "remote");
  assert.equal(chooseInitialSource(local, { revision: 3, data: remote }, meta), "conflict");
});
test("保存回执丢失时内容相同可以继续同步，时间戳不造成冲突", () => {
  const first = changed("相同内容"), second = structuredClone(first);
  second.updatedAt = "2026-10-17T08:00:00Z";
  assert.equal(studyFingerprint(first), studyFingerprint(second));
  assert.equal(chooseInitialSource(first, { revision: 2, data: second }, null), "remote");
  second.drafts["topic:topic-1-1"] = "新增草稿";
  assert.notEqual(studyFingerprint(first), studyFingerprint(second));
});
test("无效云端响应不能取代本机数据", () => {
  for (const value of [{ revision: -1, data: null }, { revision: 1 }, { revision: 1, data: { version: 2 } }, null]) assert.throws(() => parseCloudSnapshot(value));
  assert.deepEqual(parseCloudSnapshot({ revision: 0, data: null }), { revision: 0, data: null });
});

test("数据库返回的对象键顺序不造成虚假修改", () => {
  const a = makeInitialData(), b = makeInitialData();
  a.drafts = { 'topic:z': '后', 'topic:a': '前' };
  b.drafts = { 'topic:a': '前', 'topic:z': '后' };
  assert.equal(studyFingerprint(a), studyFingerprint(b));
});
test("已同步设备主动清空题库后，刷新不会把旧云端内容恢复回来", () => {
  const old = changed('旧题库'), cleared = makeInitialData();
  const meta = { revision: 2, fingerprint: studyFingerprint(old) };
  assert.equal(chooseInitialSource(cleared, { revision: 2, data: old }, meta), 'local');
  assert.equal(chooseInitialSource(changed('本机离线修改'), { revision: 3, data: cleared }, meta), 'conflict');
});
