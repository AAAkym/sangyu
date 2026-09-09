// validators 单元测试（Batch 12 · G4）：node --test 运行
const test = require('node:test');
const assert = require('node:assert');
const validators = require('../utils/validators');

test('validateReminder：正常通过', () => {
  assert.equal(validators.validateReminder({ title: '晨间服药提醒', time: '08:00' }), null);
});

test('validateReminder：空标题拒绝', () => {
  assert.equal(validators.validateReminder({ title: '  ', time: '08:00' }), '缺少提醒标题');
});

test('validateReminder：过长标题拒绝', () => {
  assert.equal(validators.validateReminder({ title: '测'.repeat(31), time: '08:00' }), '标题过长（≤30 字）');
  assert.equal(validators.validateReminder({ title: '测'.repeat(30), time: '08:00' }), null);
});

test('validateReminder：非法时间拒绝（25:99 / 8:00 / 空）', () => {
  assert.equal(validators.validateReminder({ title: 't', time: '25:99' }), '时间格式应为 HH:MM');
  assert.equal(validators.validateReminder({ title: 't', time: '8:00' }), '时间格式应为 HH:MM');
  assert.equal(validators.validateReminder({ title: 't', time: '' }), '时间格式应为 HH:MM');
});

test('validateReminder：合法边界 00:00 与 23:59 通过', () => {
  assert.equal(validators.validateReminder({ title: 't', time: '00:00' }), null);
  assert.equal(validators.validateReminder({ title: 't', time: '23:59' }), null);
});

test('validateMessage：正常通过并去除首尾空白', () => {
  assert.equal(validators.validateMessage('  爷爷好  '), null);
});

test('validateMessage：空/纯空白拒绝', () => {
  assert.equal(validators.validateMessage(''), '留言内容不能为空');
  assert.equal(validators.validateMessage('   '), '留言内容不能为空');
});

test('validateMessage：超 200 字拒绝', () => {
  assert.equal(validators.validateMessage('一'.repeat(201)), '留言不能超过 200 字');
  assert.equal(validators.validateMessage('一'.repeat(200)), null);
});

test('validateContact：正常通过', () => {
  assert.equal(validators.validateContact({ name: '小王', phone: '13800000001' }), null);
  assert.equal(validators.validateContact({ name: '社区站', phone: '+86-010-1234567' }), null);
});

test('validateContact：空/过长姓名拒绝（配合法电话，隔离姓名分支）', () => {
  assert.equal(validators.validateContact({ name: '', phone: '13800000001' }), '联系人姓名必填（≤20 字）');
  assert.equal(validators.validateContact({ name: '王'.repeat(21), phone: '13800000001' }), '联系人姓名必填（≤20 字）');
  assert.equal(validators.validateContact({ name: '王'.repeat(20), phone: '13800000001' }), null);
});

test('validateContact：非法电话拒绝', () => {
  assert.equal(validators.validateContact({ name: 'x', phone: 'abc' }), '电话格式不正确（5~20 位数字）');
  assert.equal(validators.validateContact({ name: 'x', phone: '1234' }), '电话格式不正确（5~20 位数字）');
});
