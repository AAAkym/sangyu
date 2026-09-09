// chatEngine 单元测试（Batch 12 · G5/G3）：陪伴语料与医疗红线回归锚
const test = require('node:test');
const assert = require('node:assert');
const chatEngine = require('../utils/chatEngine');

// 医疗越界词黑名单：任何回复命中即失败
const FORBIDDEN = ['诊断', '确诊', '处方', '用药建议', '剂量', '一天吃', '几分钟起效', '立即拨打120'];

function assertSafe(text) {
  FORBIDDEN.forEach((w) => assert.ok(!text.includes(w), '出现越界词: ' + w + ' → ' + text));
}

test('问候命中且有温度', () => {
  const r = chatEngine.reply('你好', []);
  assert.equal(r.matched, true);
  assert.ok(r.text.length > 0 && r.text.length < 60);
  assertSafe(r.text);
});

test('身体不适 → 引导联系家人或就医，绝不诊断/用药', () => {
  ['我头疼', '我有点头晕', '肚子不舒服'].forEach((msg) => {
    const r = chatEngine.reply(msg, []);
    assert.equal(r.intent, 'unwell');
    assert.ok(/就医|医院|联系家人|打/.test(r.text), r.text);
    assertSafe(r.text);
  });
});

test('吃药话题 → 只做提醒引导 + 遵医嘱口径', () => {
  const r = chatEngine.reply('该吃药了吗', []);
  assert.ok(/提醒/.test(r.text) && /医生/.test(r.text), r.text);
  assertSafe(r.text);
});

test('想家人 → 引导留言或拨号', () => {
  const r = chatEngine.reply('有点想我儿子了', []);
  assert.ok(/留言|电话/.test(r.text), r.text);
});

test('寂寞/无聊 → 陪伴引导', () => {
  const r = chatEngine.reply('好无聊啊', []);
  assert.ok(r.text.length > 0);
  assertSafe(r.text);
});

test('未命中 → 兜底引导式反问', () => {
  const r = chatEngine.reply('今天白菜多少钱一斤', []);
  assert.equal(r.matched, false);
  assert.ok(r.text.length > 0);
});

test('同一意图多次命中，回复不总是同一句', () => {
  const texts = new Set();
  for (let i = 0; i < 12; i++) {
    texts.add(chatEngine.reply('你好', []).text);
  }
  assert.ok(texts.size > 1, '应有多条变化回复');
});

test('记忆：说「我叫XX」后，问候带称呼', () => {
  const mem = {};
  const first = chatEngine.reply('我叫张建国', [], mem);
  assert.ok(first.text.indexOf('张建国') >= 0, first.text);
  const r = chatEngine.reply('你好', [], mem);
  assert.ok(r.text.indexOf('张建国') >= 0, r.text);
});

test('空消息 → 复述引导', () => {
  const r = chatEngine.reply('', []);
  assert.equal(r.matched, true);
  assert.ok(r.text.length > 0);
});
