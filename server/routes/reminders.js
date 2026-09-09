// 用药提醒（Batch 11 · F1）：纯"日程时间提醒"，不涉及任何用药指导/剂量/医嘱
// 前端页面须展示免责："本功能仅为日程提醒，不涉及任何用药指导；具体用药请遵医嘱"
const express = require('express');
const db = require('../utils/db');
const validators = require('../utils/validators');
const { dateKey } = require('../utils/dates');

const router = express.Router();

// POST /api/reminder/create 请求：{ elderOpenid, title, time(HH:MM), note? }
router.post('/reminder/create', (req, res) => {
  const { elderOpenid, title, time, note } = req.body || {};
  if (!elderOpenid) return res.fail('缺少 elderOpenid');
  const invalid = validators.validateReminder({ title, time });
  if (invalid) return res.fail(invalid);

  const record = {
    id: db.genId('rm'),
    elderOpenid,
    title: String(title).trim(),
    time,
    note: String(note || '').trim().slice(0, 50),
    createdAt: new Date().toISOString()
  };
  db.insert('reminders', record);
  res.ok(record);
});

// GET /api/reminder/list?elderOpenid=xxx 按提醒时间升序（附带"今日已服用"状态）
router.get('/reminder/list', (req, res) => {
  const { elderOpenid } = req.query;
  if (!elderOpenid) return res.fail('缺少 elderOpenid');

  const today = dateKey(new Date());
  const list = db
    .findWhere('reminders', (r) => r.elderOpenid === elderOpenid)
    .sort((a, b) => (a.time < b.time ? -1 : 1))
    .map((r) => ({ ...r, takenToday: !!(r.lastTakenAt && dateKey(new Date(r.lastTakenAt)) === today) }));
  res.ok(list);
});

// POST /api/reminder/taken 请求：{ id } 老人打卡"今日已服用"（写入 lastTakenAt，按天判定）
router.post('/reminder/taken', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.fail('缺少 id');

  const reminders = db.read('reminders');
  const reminder = reminders.find((r) => r.id === id);
  if (!reminder) return res.fail('提醒不存在');

  reminder.lastTakenAt = new Date().toISOString();
  db.write('reminders', reminders);
  res.ok(reminder);
});

// POST /api/reminder/delete 请求：{ id } 删除提醒
router.post('/reminder/delete', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.fail('缺少 id');

  const reminders = db.read('reminders');
  const next = reminders.filter((r) => r.id !== id);
  if (next.length === reminders.length) return res.fail('提醒不存在');
  db.write('reminders', next);
  res.ok({ deleted: id });
});

module.exports = router;
