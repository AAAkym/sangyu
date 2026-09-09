// 健康阈值规则引擎：纯函数，不依赖 Express / 文件系统，方便单测
// 用法：evaluateHealthRules(record, history) → 命中数组 [{ rule, message, severity, evidence }]
//   record：刚上报的那条健康记录
//   history：该老人最近 10 条历史记录（不含 record，按时间倒序）
// 告警去抖（同一规则同一老人 5 分钟内不重复触发）在路由层做，本文件保持纯净。

// 解析 "128/82" 形式的血压字符串
function parseBloodPressure(text) {
  const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(String(text || '').trim());
  return m ? { systolic: Number(m[1]), diastolic: Number(m[2]) } : null;
}

// 是否携带有效心率值（BP/血氧-only 的上报不参与心率规则）
const hasHR = (r) => r.heartRate !== undefined && r.heartRate !== null && r.heartRate !== '';

// 规则表（可扩展数组）：check(record, history) → boolean
const RULES = [
  {
    id: 'HR_HIGH_SINGLE',
    name: '心率过高',
    severity: 'warning',
    message: '心率过高，建议密切关注',
    check: (record) => hasHR(record) && Number(record.heartRate) > 120
  },
  {
    id: 'HR_LOW_SINGLE',
    name: '心率过低',
    severity: 'warning',
    message: '心率过低',
    check: (record) => hasHR(record) && Number(record.heartRate) < 45
  },
  {
    id: 'BP_HIGH',
    name: '血压偏高',
    severity: 'warning',
    message: '血压偏高，建议关注',
    check: (record) => {
      const bp = parseBloodPressure(record.bloodPressure);
      return !!bp && (bp.systolic >= 160 || bp.diastolic >= 100);
    }
  },
  {
    id: 'HR_SUSTAINED_HIGH',
    name: '心率持续偏高',
    severity: 'warning',
    message: '心率持续偏高（连续 3 次超过 100）',
    check: (record, history) => {
      if (!hasHR(record) || Number(record.heartRate) <= 100) return false;
      const recentHR = (history || []).filter(hasHR).slice(0, 2);
      return recentHR.length === 2 && recentHR.every((h) => Number(h.heartRate) > 100);
    }
  }
];

function evaluateHealthRules(record, history) {
  const hits = [];
  for (const rule of RULES) {
    let hit = false;
    try {
      hit = !!rule.check(record, history || []);
    } catch (err) {
      hit = false; // 单条规则异常不阻断整体评估
    }
    if (hit) {
      hits.push({
        rule,
        message: rule.message,
        severity: rule.severity,
        evidence: {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          heartRate: record.heartRate ?? null,
          bloodPressure: record.bloodPressure || '',
          spo2: record.spo2 ?? null,
          recentHistory: (history || [])
            .slice(0, 3)
            .map((h) => ({ heartRate: h.heartRate ?? null, bloodPressure: h.bloodPressure || '', createdAt: h.createdAt }))
        }
      });
    }
  }
  return hits;
}

module.exports = { RULES, evaluateHealthRules, parseBloodPressure };
