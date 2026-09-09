// 家人留言墙（Batch 11 · F2）：家属发文字留言 → 老人端留言墙展示
// 留言归属：fromOpenid（家属）、toOpenid（老人）；服务端补全 fromName（users.nickname）
const express = require('express');
const db = require('../utils/db');
const validators = require('../utils/validators');

const router = express.Router();

// POST /api/message/create 请求：{ fromOpenid, toOpenid, text(1~200 字) }
router.post('/message/create', (req, res) => {
  const { fromOpenid, toOpenid, text } = req.body || {};
  if (!fromOpenid || !toOpenid) return res.fail('缺少 fromOpenid 或 toOpenid');
  const invalid = validators.validateMessage(text);
  if (invalid) return res.fail(invalid);
  const content = String(text).trim();

  const record = {
    id: db.genId('msg'),
    fromOpenid,
    toOpenid,
    text: content,
    createdAt: new Date().toISOString()
  };
  db.insert('messages', record);

  // 补全发件人昵称（users.nickname，缺省用角色名），便于前端直接展示
  const user = db.read('users').find((u) => u.openid === fromOpenid);
  res.ok({ ...record, fromName: (user && user.nickname) || '家人' });
});

// GET /api/message/list?elderOpenid=xxx 老人留言墙（按时间倒序，带发件人昵称）
router.get('/message/list', (req, res) => {
  const { elderOpenid } = req.query;
  if (!elderOpenid) return res.fail('缺少 elderOpenid');

  const users = db.read('users');
  const list = db
    .findWhere('messages', (m) => m.toOpenid === elderOpenid)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => {
      const user = users.find((u) => u.openid === m.fromOpenid);
      return { ...m, fromName: (user && user.nickname) || '家人' };
    });
  res.ok(list);
});

// POST /api/message/mark-read 请求：{ elderOpenid } 将该老人全部未读留言标记已读
router.post('/message/mark-read', (req, res) => {
  const { elderOpenid } = req.body || {};
  if (!elderOpenid) return res.fail('缺少 elderOpenid');

  const messages = db.read('messages');
  const now = new Date().toISOString();
  let marked = 0;
  messages.forEach((m) => {
    if (m.toOpenid === elderOpenid && !m.readAt) {
      m.readAt = now;
      marked++;
    }
  });
  db.write('messages', messages);
  res.ok({ marked });
});

module.exports = router;
