// 健康数据：查询 / Mock 写入 / 设备上报（触发规则引擎）/ 设备数据流
// 集合命名与设计文档对齐：health_observations（后期迁移为云数据库同名 collection）
const express = require('express');
const db = require('../utils/db');
const { dateKey } = require('../utils/dates');
const ruleEngine = require('../utils/ruleEngine');
const alertRoutes = require('./alert');

const router = express.Router();

const RULE_DEBOUNCE_MS = 5 * 60 * 1000; // 同一规则同一老人 5 分钟内不重复触发告警

// 记录归属过滤：历史数据用 openid 字段，设备上报统一用 elderOpenid，两者兼容
const belongsTo = (elderOpenid) => (h) => h.elderOpenid === elderOpenid || h.openid === elderOpenid;

// GET /api/health?openid=xxx 查询该用户全部健康记录（按时间倒序，附 date 供列表/聚合用）
router.get('/health', (req, res) => {
  const { openid } = req.query;
  if (!openid) return res.fail('缺少 openid');

  const records = db
    .findWhere('health_observations', belongsTo(openid))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((r) => ({ ...r, date: r.date || dateKey(new Date(r.createdAt)), elderOpenid: r.elderOpenid || r.openid }));
  res.ok(records);
});

// POST /api/health/mock 写入一条 Mock 健康数据
// 请求：{ openid, heartRate, bloodPressure }；真实环境由设备上报通道（/health/report）写入
router.post('/health/mock', (req, res) => {
  const { openid, heartRate, bloodPressure } = req.body || {};
  if (!openid || heartRate === undefined) return res.fail('缺少 openid 或 heartRate');

  const createdAt = new Date().toISOString();
  const record = {
    id: db.genId('h'),
    elderOpenid: openid,
    date: dateKey(new Date(createdAt)),
    source: 'mock',
    heartRate: Number(heartRate),
    bloodPressure: bloodPressure || '',
    createdAt
  };
  db.insert('health_observations', record);
  res.ok(record);
});

// POST /api/health/mock/batch 一次性生成最近 7 天的演示数据（每天 1 条，早晨 8:30）
// 用途：报告页/趋势图演示需要连续多天数据；真实环境删除本接口，由设备上报替代
router.post('/health/mock/batch', (req, res) => {
  const { openid } = req.body || {};
  if (!openid) return res.fail('缺少 openid');

  const now = new Date();
  const records = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(8, 30, 0, 0);
    const createdAt = day.toISOString();
    records.push(
      db.insert('health_observations', {
        id: db.genId('h'),
        elderOpenid: openid,
        date: dateKey(day),
        source: 'mock',
        heartRate: 68 + Math.floor(Math.random() * 22), // 68~89 次/分
        bloodPressure: `${118 + Math.floor(Math.random() * 18)}/${76 + Math.floor(Math.random() * 10)}`, // 118~135 / 76~85
        createdAt
      })
    );
  }
  res.ok({ count: records.length, records });
});

// POST /api/health/report 设备上报（HTTP 模拟真实设备通道，不接设备 SDK）
// 请求：{ deviceCode, elderOpenid, heartRate?, bloodPressure?, spo2?, timestamp? }
// 写入后立即跑规则引擎：命中 → 自动创建 rule_engine 告警（同规则同一老人 5 分钟去抖）
router.post('/health/report', (req, res) => {
  const { deviceCode, elderOpenid, heartRate, bloodPressure, spo2, battery, timestamp } = req.body || {};
  if (!deviceCode || !elderOpenid) return res.fail('缺少 deviceCode 或 elderOpenid');
  const hasMetric =
    (heartRate !== undefined && heartRate !== '') ||
    (bloodPressure && String(bloodPressure).trim()) ||
    (spo2 !== undefined && spo2 !== '');
  if (!hasMetric) return res.fail('至少上报一项指标（heartRate / bloodPressure / spo2）');

  const ts = timestamp ? new Date(timestamp) : new Date();
  const createdAt = isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString();
  const record = {
    id: db.genId('h'),
    deviceCode,
    elderOpenid,
    date: dateKey(new Date(createdAt)),
    source: 'device',
    heartRate: heartRate !== undefined && heartRate !== '' ? Number(heartRate) : null,
    bloodPressure: bloodPressure || '',
    spo2: spo2 !== undefined && spo2 !== '' ? Number(spo2) : null,
    createdAt
  };
  db.insert('health_observations', record);

  // 设备联动：更新该设备 lastReportAt 与电量（在线状态由 device 路由按 lastReportAt 实时计算）
  const devices = db.read('devices');
  const device = devices.find((d) => d.deviceCode === deviceCode && d.elderOpenid === elderOpenid && !d.unboundAt);
  if (device) {
    device.lastReportAt = createdAt;
    if (battery !== undefined && battery !== null && battery !== '') device.battery = Number(battery);
    db.write('devices', devices);
  }

  // 规则引擎：当前记录 + 最近 10 条历史（不含本条，按时间倒序）
  const history = db
    .findWhere('health_observations', (h) => belongsTo(elderOpenid)(h) && h.id !== record.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10);

  const triggered = [];
  for (const hit of ruleEngine.evaluateHealthRules(record, history)) {
    if (isRuleDebounced(elderOpenid, hit.rule.id)) continue;
    triggered.push(
      alertRoutes.createAlert({
        elderOpenid,
        reporterOpenid: 'rule_engine',
        note: `阈值预警：${hit.message}`,
        source: 'rule_engine',
        type: 'threshold',
        severity: hit.severity,
        ruleId: hit.rule.id,
        message: hit.message,
        evidence: hit.evidence
      })
    );
  }
  res.ok({ record, triggered });
});

// 同一规则同一老人 5 分钟内只触发一次（查 alerts.json 最近记录判断）
function isRuleDebounced(elderOpenid, ruleId) {
  const now = Date.now();
  return db
    .findWhere('alerts', (a) => a.source === 'rule_engine' && a.elderOpenid === elderOpenid && a.ruleId === ruleId)
    .some((a) => now - new Date(a.createdAt).getTime() < RULE_DEBOUNCE_MS);
}

// GET /api/health/stream?deviceCode=xxx 该设备最近 20 条上报（调试/演示设备在线状态用）
router.get('/health/stream', (req, res) => {
  const { deviceCode } = req.query;
  if (!deviceCode) return res.fail('缺少 deviceCode');

  const records = db
    .findWhere('health_observations', (h) => h.deviceCode === deviceCode)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20);
  res.ok(records);
});

// GET /api/health/trend?elderOpenid=xxx&days=7 按日聚合趋势（家属端图表直接喂，前端无需再聚合）
// 返回：{ dates, days, heartRate: {avg,min,max}, bloodPressure: {sys,dia}, spo2 }，无数据日为 null
router.get('/health/trend', (req, res) => {
  const { elderOpenid } = req.query;
  if (!elderOpenid) return res.fail('缺少 elderOpenid');
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);

  const now = new Date();
  const dates = [];
  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const k = dateKey(d);
    dates.push(k);
    buckets[k] = [];
  }
  db.findWhere('health_observations', belongsTo(elderOpenid)).forEach((h) => {
    const k = h.date || dateKey(new Date(h.createdAt));
    if (buckets[k]) buckets[k].push(h);
  });

  const avgOf = (xs) => (xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : null);
  const numOf = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  const heartRate = { avg: [], min: [], max: [] };
  const bloodPressure = { sys: [], dia: [] };
  const spo2 = [];
  dates.forEach((k) => {
    const recs = buckets[k];
    const hrs = recs.map((r) => numOf(r.heartRate)).filter((v) => v !== null);
    const bps = recs.map((r) => ruleEngine.parseBloodPressure(r.bloodPressure)).filter(Boolean);
    const spo2s = recs.map((r) => numOf(r.spo2)).filter((v) => v !== null);
    heartRate.avg.push(avgOf(hrs));
    heartRate.min.push(hrs.length ? Math.min(...hrs) : null);
    heartRate.max.push(hrs.length ? Math.max(...hrs) : null);
    bloodPressure.sys.push(avgOf(bps.map((b) => b.systolic)));
    bloodPressure.dia.push(avgOf(bps.map((b) => b.diastolic)));
    spo2.push(avgOf(spo2s));
  });

  res.ok({ dates, days, heartRate, bloodPressure, spo2 });
});

module.exports = router;
