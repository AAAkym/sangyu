// 紧急联系人（Batch 11 · F3）：家属为老人维护联系人，老人端一键唤起拨号
// 安全边界：仅提供拨号入口（wx.makePhoneCall 由前端调用），不提供任何急救指导内容
const express = require('express');
const db = require('../utils/db');
const validators = require('../utils/validators');

const router = express.Router();

// POST /api/contact/create 请求：{ elderOpenid, name, phone, relation?, group? }
router.post('/contact/create', (req, res) => {
  const { elderOpenid, name, phone, relation, group } = req.body || {};
  if (!elderOpenid) return res.fail('缺少 elderOpenid');
  const invalid = validators.validateContact({ name, phone });
  if (invalid) return res.fail(invalid);
  const nameText = String(name).trim();
  const phoneText = String(phone).trim();

  // 分组：家人 / 社区 / 其他（未传时按关系推断，默认其他）
  const GROUPS = ['家人', '社区', '其他'];
  let groupText = GROUPS.includes(String(group || '').trim()) ? String(group).trim() : '';
  if (!groupText) groupText = String(relation || '').indexOf('社区') >= 0 ? '社区' : '其他';

  const record = {
    id: db.genId('ct'),
    elderOpenid,
    name: nameText,
    phone: phoneText,
    relation: String(relation || '').trim().slice(0, 10),
    group: groupText,
    createdAt: new Date().toISOString()
  };
  db.insert('contacts', record);
  res.ok(record);
});

// GET /api/contact/list?elderOpenid=xxx 按分组优先级（家人→社区→其他）+ 创建时间排序
router.get('/contact/list', (req, res) => {
  const { elderOpenid } = req.query;
  if (!elderOpenid) return res.fail('缺少 elderOpenid');
  const groupOrder = (g) => {
    const i = ['家人', '社区'].indexOf(g);
    return i === -1 ? 2 : i;
  };
  const list = db
    .findWhere('contacts', (c) => c.elderOpenid === elderOpenid)
    .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || (a.createdAt < b.createdAt ? -1 : 1));
  res.ok(list);
});

// POST /api/contact/delete 请求：{ id }
router.post('/contact/delete', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.fail('缺少 id');

  const contacts = db.read('contacts');
  const next = contacts.filter((c) => c.id !== id);
  if (next.length === contacts.length) return res.fail('联系人不存在');
  db.write('contacts', next);
  res.ok({ deleted: id });
});

module.exports = router;
