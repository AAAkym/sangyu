// 入参校验纯函数（Batch 12 · G4）：reminders/messages/contacts 路由共用
// 纯函数约定：只依赖入参、返回 null（通过）或错误文案字符串，便于 node:test 单测
// 注意：错误文案与 smoke-test 断言耦合，修改需同步回归

// 用药提醒：标题必填 ≤30 字；时间必须为 HH:MM
function validateReminder({ title, time } = {}) {
  const t = String(title || '').trim();
  if (!t) return '缺少提醒标题';
  if (t.length > 30) return '标题过长（≤30 字）';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) return '时间格式应为 HH:MM';
  return null;
}

// 留言：去除首尾空白后 1~200 字
function validateMessage(text) {
  const content = String(text || '').trim();
  if (!content) return '留言内容不能为空';
  if (content.length > 200) return '留言不能超过 200 字';
  return null;
}

// 紧急联系人：姓名必填 ≤20 字；电话 5~20 位数字（允许 + -）
function validateContact({ name, phone } = {}) {
  const n = String(name || '').trim();
  if (!n || n.length > 20) return '联系人姓名必填（≤20 字）';
  const p = String(phone || '').trim();
  if (!/^[0-9+\-]{5,20}$/.test(p)) return '电话格式不正确（5~20 位数字）';
  return null;
}

module.exports = { validateReminder, validateMessage, validateContact };
