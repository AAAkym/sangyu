// 服务预约：社区医护 / 志愿者陪伴 / 医疗机构复诊
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

const SERVICE_TYPES = ['社区医护', '志愿者陪伴', '复诊'];

// POST /api/appointment/create 创建预约
// 请求：{ openid, type, detail }
// TODO(后期)：补状态流转（待确认/已完成/已取消），复诊类走合规机构导流，见设计文档 9.3 节
router.post('/appointment/create', (req, res) => {
  const { openid, type, detail } = req.body || {};
  if (!openid || !type) return res.fail('缺少 openid 或 type');
  if (!SERVICE_TYPES.includes(type)) return res.fail(`type 仅支持: ${SERVICE_TYPES.join(' / ')}`);

  const record = {
    id: db.genId('ap'),
    openid,
    type,
    detail: detail || '',
    createdAt: new Date().toISOString()
  };
  db.insert('appointments', record);
  res.ok(record);
});

// GET /api/appointment/list?openid=xxx 查询预约记录（按时间倒序）
router.get('/appointment/list', (req, res) => {
  const { openid } = req.query;
  if (!openid) return res.fail('缺少 openid');

  const records = db
    .findWhere('appointments', (a) => a.openid === openid)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.ok(records);
});

module.exports = router;
