// 告警/SOS：创建、家属查询、详情、状态流转（含转社区/外部派单）与时间线留痕
// 状态机：open → acknowledged → (resolved | escalated → external_dispatched → resolved)
// 时间线存在 alerts.json 的 timeline 数组（不新建集合），每次变更追加 { status, operator, note, at }
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

// 状态机：当前状态 → 允许流转的目标状态（校验集中在此处，后续扩展只改这张表）
const ALERT_TRANSITIONS = {
  open: ['acknowledged'],
  acknowledged: ['resolved', 'escalated'],
  escalated: ['external_dispatched'],
  external_dispatched: ['resolved'],
  resolved: []
};

const canTransition = (from, to) => (ALERT_TRANSITIONS[from] || []).includes(to);

// 各状态的责任方：open/acknowledged 在家属，escalated 起在社区，resolved 关闭
const STATUS_HANDLER = {
  open: 'family',
  acknowledged: 'family',
  escalated: 'community',
  external_dispatched: 'community',
  resolved: null
};

// 调用方未传 note 时的缺省处置备注
const DEFAULT_NOTES = {
  acknowledged: '家属已确认，马上处理',
  escalated: '已转社区养老服务中心处理',
  external_dispatched: '社区已接单派单',
  resolved: '已处理完成'
};

// 兼容旧数据：补齐 timeline / currentHandler / resolvedNote 字段（读时归一化，不回写历史文件）
const normalizeAlert = (alert) => {
  if (!Array.isArray(alert.timeline)) {
    alert.timeline = [
      { status: alert.status, operator: 'system', note: '（历史数据补记）', at: alert.createdAt || new Date().toISOString() }
    ];
  }
  if (alert.currentHandler === undefined) {
    alert.currentHandler = STATUS_HANDLER[alert.status] ?? null;
  }
  if (alert.resolvedNote === undefined) {
    alert.resolvedNote = '';
  }
  return alert;
};

// 创建告警公共入口：SOS 与规则引擎（utils/ruleEngine 自动预警）共用
// params: { elderOpenid, reporterOpenid?, note?, source?, type?, severity?, ruleId?, message?, evidence? }
const createAlert = ({
  elderOpenid,
  reporterOpenid = 'system',
  note = '老人一键求助',
  source = 'sos',
  type = 'sos',
  severity = 'high',
  ruleId = null,
  message = '',
  evidence = null
}) => {
  const now = new Date().toISOString();
  const record = {
    id: db.genId('a'),
    elderOpenid,
    reporterOpenid,
    source, // 'sos' | 'rule_engine'
    type, // 'sos' | 'threshold'
    severity,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    timeline: [{ status: 'open', operator: reporterOpenid, note, at: now }],
    currentHandler: STATUS_HANDLER.open,
    resolvedNote: ''
  };
  if (ruleId) record.ruleId = ruleId;
  if (message) record.message = message;
  if (evidence) record.evidence = evidence;
  db.insert('alerts', record);
  return record;
};

// POST /api/alert/create 老人一键求助（也可由家属代报）
// 请求：{ openid, elderOpenid? }；elderOpenid 缺省视为老人本人触发
router.post('/alert/create', (req, res) => {
  const { openid, elderOpenid } = req.body || {};
  if (!openid) return res.fail('缺少 openid');

  const record = createAlert({
    elderOpenid: elderOpenid || openid,
    reporterOpenid: openid,
    note: '老人一键求助',
    source: 'sos',
    type: 'sos',
    severity: 'high'
  });
  res.ok(record);
});

// GET /api/alert/list?familyOpenid=xxx 家属查询其关联老人的全部告警（按时间倒序）
// timeline 只带最近 3 条摘要，完整时间线走 /api/alert/detail
router.get('/alert/list', (req, res) => {
  const { familyOpenid } = req.query;
  if (!familyOpenid) return res.fail('缺少 familyOpenid');

  const elderOpenids = db
    .findWhere('relationships', (r) => r.familyOpenid === familyOpenid && !r.unboundAt)
    .map((r) => r.elderOpenid);
  const alerts = db
    .findWhere('alerts', (a) => elderOpenids.includes(a.elderOpenid))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(normalizeAlert)
    .map((a) => ({ ...a, timeline: a.timeline.slice(-3) }));
  res.ok(alerts);
});

// GET /api/alert/detail?id=xxx 单条告警完整信息（含完整时间线）
router.get('/alert/detail', (req, res) => {
  const { id } = req.query;
  if (!id) return res.fail('缺少 id');

  const alert = db.findWhere('alerts', (a) => a.id === id)[0];
  if (!alert) return res.fail('告警不存在');
  res.ok(normalizeAlert(alert));
});

// POST /api/alert/update 处理告警：家属接单/处理完成/转社区，社区派单/解决
// 请求：{ alertId, status, note?, operator? }
// 每次变更追加 timeline 一条并更新 currentHandler；resolved 时把 note 写入 resolvedNote
router.post('/alert/update', (req, res) => {
  const { alertId, status, note, operator } = req.body || {};
  if (!alertId || !status) return res.fail('缺少 alertId 或 status');

  const alerts = db.read('alerts');
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) return res.fail('告警不存在');
  normalizeAlert(alert);

  if (!canTransition(alert.status, status)) {
    return res.fail(`非法状态变更: ${alert.status} → ${status}`);
  }

  const at = new Date().toISOString();
  alert.timeline.push({
    status,
    operator: operator || 'system',
    note: note || DEFAULT_NOTES[status] || '',
    at
  });
  alert.status = status;
  alert.updatedAt = at;
  alert.currentHandler = STATUS_HANDLER[status] ?? null;
  if (status === 'resolved') {
    alert.resolvedNote = note || DEFAULT_NOTES.resolved || '';
  }
  db.write('alerts', alerts);
  res.ok(alert);
});

// GET /api/alert/check-new?familyOpenid=xxx&lastCheckTime=0 家属端轮询：检测新产生的未处理告警
// 只返回 createdAt > lastCheckTime 且 status === 'open' 的告警（已处理的不算新）；lastCheckTime 首次传 0
router.get('/alert/check-new', (req, res) => {
  const { familyOpenid } = req.query;
  const lastCheckTime = Number(req.query.lastCheckTime) || 0;
  if (!familyOpenid) return res.fail('缺少 familyOpenid');

  const elderOpenids = db
    .findWhere('relationships', (r) => r.familyOpenid === familyOpenid && !r.unboundAt)
    .map((r) => r.elderOpenid);

  const fresh = db
    .findWhere('alerts', (a) => {
      const createdAt = new Date(a.createdAt).getTime();
      return elderOpenids.includes(a.elderOpenid) && a.status === 'open' && createdAt > lastCheckTime;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const latest = fresh[0]
    ? {
        id: fresh[0].id,
        type: fresh[0].type || 'sos',
        severity: fresh[0].severity || 'high',
        message: fresh[0].message || null,
        createdAt: fresh[0].createdAt
      }
    : null;

  res.ok({ hasNew: fresh.length > 0, count: fresh.length, latest });
});

module.exports = router;
// 供其他路由（如 health 设备上报）复用；挂在 router 对象上避免破坏 module.exports 指向
module.exports.createAlert = createAlert;
