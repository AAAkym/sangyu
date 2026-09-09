// ruleEngine 单元测试（Batch 12 · G4）：规则表与阈值口径回归锚定
const test = require('node:test');
const assert = require('node:assert');
const ruleEngine = require('../utils/ruleEngine');

const mk = (over = {}) => ({ id: 'h_x', elderOpenid: 'e1', source: 'device', heartRate: null, bloodPressure: '', spo2: null, createdAt: new Date().toISOString(), ...over });

test('规则表共 4 条，id 固定', () => {
  assert.deepEqual(ruleEngine.RULES.map((r) => r.id), ['HR_HIGH_SINGLE', 'HR_LOW_SINGLE', 'BP_HIGH', 'HR_SUSTAINED_HIGH']);
});

test('正常心率不触发任何规则', () => {
  const hits = ruleEngine.evaluateHealthRules(mk({ heartRate: 80 }), []);
  assert.equal(hits.length, 0);
});

test('心率 125 触发 HR_HIGH_SINGLE，不触发持续偏高（历史不足）', () => {
  const hits = ruleEngine.evaluateHealthRules(mk({ heartRate: 125 }), [mk({ heartRate: 125 })]);
  assert.deepEqual(hits.map((h) => h.rule.id), ['HR_HIGH_SINGLE']);
});

test('心率 30 触发 HR_LOW_SINGLE', () => {
  const hits = ruleEngine.evaluateHealthRules(mk({ heartRate: 30 }), []);
  assert.deepEqual(hits.map((h) => h.rule.id), ['HR_LOW_SINGLE']);
});

test('血压 165/100 触发 BP_HIGH；140/90 仅平价不触发', () => {
  const high = ruleEngine.evaluateHealthRules(mk({ bloodPressure: '165/100' }), []);
  assert.deepEqual(high.map((h) => h.rule.id), ['BP_HIGH']);
  const edge = ruleEngine.evaluateHealthRules(mk({ bloodPressure: '139/89' }), []);
  assert.equal(edge.length, 0);
});

test('连续 3 次心率 >100 触发 HR_SUSTAINED_HIGH；中间断档不触发', () => {
  const history = [mk({ heartRate: 105 }), mk({ heartRate: 102 }), mk({ heartRate: 75 })];
  const hits = ruleEngine.evaluateHealthRules(mk({ heartRate: 110 }), history);
  assert.deepEqual(hits.map((h) => h.rule.id), ['HR_SUSTAINED_HIGH']);
  const broken = [mk({ heartRate: 105 }), mk({ heartRate: 80 })];
  const hits2 = ruleEngine.evaluateHealthRules(mk({ heartRate: 110 }), broken);
  assert.ok(!hits2.some((h) => h.rule.id === 'HR_SUSTAINED_HIGH'));
});

test('血压-only 记录不触发心率规则（空心率安全）', () => {
  const hits = ruleEngine.evaluateHealthRules(mk({ bloodPressure: '165/100' }), []);
  assert.ok(!hits.some((h) => h.rule.id.startsWith('HR')));
});

test('evidence 携带规则与最近历史', () => {
  const [hit] = ruleEngine.evaluateHealthRules(mk({ heartRate: 130 }), []);
  assert.equal(hit.rule.id, 'HR_HIGH_SINGLE');
  assert.equal(hit.evidence.heartRate, 130);
});
