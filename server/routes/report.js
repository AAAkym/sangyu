// AI 健康报告：规则引擎生成（不调用大模型），输出摘要 + 建议 + 数据质量 + 免责声明
// 措辞边界：只使用「建议关注 / 可记录 / 建议就医咨询」，禁止诊断、用药、疾病名确定性判断与急救指令
// 迁移云开发：本文件三个 handler 的逻辑可直接平移进 report 云函数，db.* 换成云数据库 API
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

const DISCLAIMER =
  '本内容根据已授权数据自动生成，仅供健康管理和康养参考，不构成诊断、治疗或急救建议。如有不适或紧急情况，请及时联系医疗机构或急救服务。';
const MODEL_VERSION = 'rule-engine-v1';
const WINDOW_DAYS = 7;

// ---------- 通用工具 ----------
// dateKey / parseBloodPressure 复用 utils（Batch 12 · G4 去重：与 health/ruleEngine 单一来源）
const { dateKey } = require('../utils/dates');
const { parseBloodPressure } = require('../utils/ruleEngine');
const round1 = (n) => Math.round(n * 10) / 10;

// 统计 avg/min/max；list: [{ value, record }]
function statsOf(list) {
  if (!list.length) return null;
  const values = list.map((x) => x.value);
  return {
    count: values.length,
    avg: round1(values.reduce((s, v) => s + v, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

// 趋势：按时间排序后，前半段均值 vs 后半段均值；样本 < 4 条视为无法判断
function trendOf(list, threshold) {
  if (list.length < 4) return '数据不足，无法判断趋势';
  const half = Math.floor(list.length / 2);
  const avg = (xs) => xs.reduce((s, x) => s + x.value, 0) / xs.length;
  const delta = avg(list.slice(half)) - avg(list.slice(0, half));
  if (delta > threshold) return '上升';
  if (delta < -threshold) return '下降';
  return '平稳';
}

// ---------- 报告构建 ----------
function buildReport(elderOpenid, allRecords, now) {
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - (WINDOW_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);

  const periodStart = dateKey(windowStart);
  const periodEnd = dateKey(now);

  const inWindow = allRecords
    .filter((r) => {
      const t = new Date(r.createdAt);
      return t >= windowStart && t <= now;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  // 按日期分组，统计覆盖与缺失
  const byDate = {};
  inWindow.forEach((r) => {
    const k = dateKey(new Date(r.createdAt));
    (byDate[k] = byDate[k] || []).push(r);
  });
  const missingDates = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate() + i);
    const k = dateKey(d);
    if (!byDate[k]) missingDates.push(k);
  }
  const daysWithData = WINDOW_DAYS - missingDates.length;

  // 指标统计
  const hrList = inWindow
    .filter((r) => Number.isFinite(Number(r.heartRate)))
    .map((r) => ({ value: Number(r.heartRate), record: r }));
  const bpParsed = inWindow
    .map((r) => ({ parsed: parseBloodPressure(r.bloodPressure), record: r }))
    .filter((x) => x.parsed);
  const bpSysList = bpParsed.map((x) => ({ value: x.parsed.systolic, record: x.record }));
  const bpDiaList = bpParsed.map((x) => ({ value: x.parsed.diastolic, record: x.record }));

  const hr = statsOf(hrList);
  const hrTrend = trendOf(hrList, 3);
  const sys = statsOf(bpSysList);
  const dia = statsOf(bpDiaList);
  const bpTrend = trendOf(bpSysList, 5);

  // 数据质量：insufficient（7 天 0 数据）/ partial（有缺失）/ good
  let status = 'good';
  if (daysWithData === 0) status = 'insufficient';
  else if (missingDates.length > 0) status = 'partial';

  const dataQuality = {
    status,
    totalDays: WINDOW_DAYS,
    daysWithData,
    missingDates,
    recordsCount: inWindow.length,
    metrics: {
      heartRate: hr
        ? { count: hr.count, avg: hr.avg, min: hr.min, max: hr.max, trend: hrTrend }
        : { count: 0, note: '未采集' },
      bloodPressure: sys
        ? { count: sys.count, avgSystolic: sys.avg, avgDiastolic: dia.avg, maxSystolic: sys.max, trend: bpTrend }
        : { count: 0, note: '未采集' },
      spo2: { count: 0, note: '未采集（当前 Mock 数据不含血氧）' }
    }
  };

  // evidence：被建议引用的原始记录（advice.evidenceRefs 指向这里的 id）
  const evidence = [];
  const refOf = (record, metric, value) => {
    const hit = evidence.find((e) => e.id === record.id && e.metric === metric);
    if (hit) return hit.id;
    evidence.push({ id: record.id, metric, value, observedAt: record.createdAt });
    return record.id;
  };

  const advice = [];
  const addAdvice = (level, text, refs = []) =>
    advice.push({ id: `adv_${advice.length + 1}`, level, text, evidenceRefs: refs });

  // 摘要
  let summary;
  if (status === 'insufficient') {
    summary = `最近 7 天（${periodStart} 至 ${periodEnd}）没有健康数据记录，无法进行统计分析。请在健康页写入数据或等待设备上报后，重新生成报告。`;
  } else {
    const parts = [
      `最近 7 天（${periodStart} 至 ${periodEnd}）共记录 ${inWindow.length} 条数据，覆盖 ${daysWithData}/7 天。`
    ];
    if (hr) parts.push(`心率平均 ${hr.avg} 次/分（最低 ${hr.min}、最高 ${hr.max}），趋势${hrTrend}。`);
    if (sys) parts.push(`血压平均高压 ${sys.avg} / 低压 ${dia.avg}（最高高压 ${sys.max}），趋势${bpTrend}。`);
    if (missingDates.length) parts.push(`有 ${missingDates.length} 天无数据：${missingDates.join('、')}。`);
    summary = parts.join('');
  }

  // 建议规则（全部为规则生成，低风险措辞）
  if (status === 'insufficient') {
    addAdvice('info', '可记录：最近 7 天没有健康数据。请在健康页写入或等待设备上报后，重新生成报告。');
  } else {
    if (hr) {
      const maxRec = hrList.find((x) => x.value === hr.max).record;
      const minRec = hrList.find((x) => x.value === hr.min).record;
      if (hr.avg > 100 || hr.max > 130) {
        addAdvice(
          'warning',
          `建议关注：最近一周心率偏高（平均 ${hr.avg} 次/分，最高 ${hr.max}）。可记录每日静息心率与测量时段，若持续偏高或伴有不适，建议就医咨询。`,
          [refOf(maxRec, 'heartRate', hr.max)]
        );
      } else if (hr.avg < 55) {
        addAdvice(
          'warning',
          `建议关注：最近一周心率偏低（平均 ${hr.avg} 次/分，最低 ${hr.min}）。可记录测量时的身体状态，若持续偏低或伴有不适，建议就医咨询。`,
          [refOf(minRec, 'heartRate', hr.min)]
        );
      } else {
        addAdvice(
          'info',
          `最近一周心率平均 ${hr.avg} 次/分（区间 ${hr.min}~${hr.max}），趋势${hrTrend}。可继续保持规律测量与记录。`,
          [refOf(maxRec, 'heartRate', hr.max)]
        );
      }
    }

    if (sys) {
      const maxSysRecord = bpSysList.reduce((best, x) => (x.value > best.value ? x : best)).record;
      const maxSysValue = `${maxSysRecord && parseBloodPressure(maxSysRecord.bloodPressure).systolic}/${parseBloodPressure(maxSysRecord.bloodPressure).diastolic}`;
      if (sys.avg >= 140 || dia.avg >= 90) {
        addAdvice(
          'warning',
          `建议关注：最近一周血压平均值偏高（高压 ${sys.avg} / 低压 ${dia.avg}）。可坚持每日早晚定时测量并记录，若多次偏高或伴有不适，建议就医咨询。`,
          [refOf(maxSysRecord, 'bloodPressure', maxSysValue)]
        );
      } else if (sys.avg >= 130 || dia.avg >= 85) {
        addAdvice(
          'info',
          `可记录：血压处于需要留意的区间（高压 ${sys.avg} / 低压 ${dia.avg}）。建议每日定时测量，观察一周内变化，复查时可提供本记录。`,
          [refOf(maxSysRecord, 'bloodPressure', maxSysValue)]
        );
      } else {
        addAdvice(
          'info',
          `血压记录处于常见参考区间（高压 ${sys.avg} / 低压 ${dia.avg}），可继续保持规律测量。`,
          []
        );
      }
    }

    if (missingDates.length > 0) {
      if (missingDates.length >= 4) {
        addAdvice(
          'warning',
          `数据覆盖不足：仅 ${daysWithData}/7 天有记录（缺失 ${missingDates.join('、')}）。当前报告结论可能不完整，建议连续记录一周后重新生成。`,
          []
        );
      } else {
        addAdvice(
          'info',
          `可记录：最近 7 天中有 ${missingDates.length} 天没有数据。保持每日测量，报告会更有参考价值。`,
          []
        );
      }
    }
  }

  return {
    id: db.genId('rp'),
    elderOpenid,
    periodStart,
    periodEnd,
    generatedAt: now.toISOString(),
    modelVersion: MODEL_VERSION,
    summary,
    advice,
    dataQuality,
    disclaimer: DISCLAIMER,
    evidence
  };
}

// ---------- 路由 ----------

// POST /api/report/generate 生成报告
// 请求：{ openid }；传老人 openid 直接使用；传家属 openid 则先通过监护关系解析老人（MVP 取第一个）
router.post('/report/generate', (req, res) => {
  const { openid } = req.body || {};
  if (!openid) return res.fail('缺少 openid');

  let elderOpenid = openid;
  const rel = db.findWhere('relationships', (r) => r.familyOpenid === openid && !r.unboundAt);
  if (rel.length > 0) elderOpenid = rel[0].elderOpenid;

  const records = db.read('health_observations').filter((r) => r.openid === elderOpenid || r.elderOpenid === elderOpenid);
  const report = buildReport(elderOpenid, records, new Date());
  db.insert('reports', report);
  res.ok(report);
});

// GET /api/report/list?openid=xxx 该老人最近 5 份报告摘要
// 与 generate 一致：传家属 openid 自动解析到关联老人
router.get('/report/list', (req, res) => {
  const { openid } = req.query;
  if (!openid) return res.fail('缺少 openid');

  let elderOpenid = openid;
  const rel = db.findWhere('relationships', (r) => r.familyOpenid === openid && !r.unboundAt);
  if (rel.length > 0) elderOpenid = rel[0].elderOpenid;

  const list = db
    .findWhere('reports', (r) => r.elderOpenid === elderOpenid)
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1))
    .slice(0, 5)
    // 摘要不含建议明细/依据/免责声明，减少传输；详情走 /api/report/detail
    .map(({ advice, evidence, disclaimer, ...summary }) => summary);
  res.ok(list);
});

// GET /api/report/detail?id=xxx 返回完整报告
router.get('/report/detail', (req, res) => {
  const { id } = req.query;
  if (!id) return res.fail('缺少 id');

  const report = db.findWhere('reports', (r) => r.id === id)[0];
  if (!report) return res.fail('报告不存在');
  res.ok(report);
});

module.exports = router;
