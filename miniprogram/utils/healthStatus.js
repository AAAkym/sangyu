// 健康状态判定（共用工具）：family 首页健康面板 与 health-elder 老人简要版 共用
// 阈值与 server/utils/ruleEngine.js 保持同一套口径：
//   心率：>120 或 <45 异常；100~120 / 45~60 需要留意；其余正常
//   血压：收缩压≥160 或 舒张压≥100 异常；收缩压≥140 或 舒张压≥90 需要留意；其余正常
//   血氧（MVP 约定，规则引擎暂未采集血氧）：<90 异常；90~95 需要留意；其余正常
// 返回统一结构：{ key, text, color, soft, chip }
//   color/soft：数值与标签的文字色/软底色（设计令牌语义色）
//   chip：trend-chip 修饰键（up=红 / watch=琥珀 / ok=绿 / flat=灰），页面拼 trend-{{chip}}

const none = { key: 'none', text: '暂无数据', color: '#6B5D44', soft: '#F5EFE2', chip: 'flat' };
const normal = { key: 'normal', text: '正常', color: '#2D7A3D', soft: '#E6F0E8', chip: 'ok' };
const watch = { key: 'watch', text: '需要留意', color: '#8A6508', soft: '#F7EFD8', chip: 'watch' };
const alert = { key: 'alert', text: '异常', color: '#C62828', soft: '#FBEAEA', chip: 'up' };

const hasValue = (v) => v !== null && v !== undefined && v !== '';

// 解析 "128/82" 形式的血压字符串 → { systolic, diastolic } | null
function parseBloodPressure(text) {
  const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(String(text || '').trim());
  return m ? { systolic: Number(m[1]), diastolic: Number(m[2]) } : null;
}

function hrStatus(hr) {
  if (!hasValue(hr)) return none;
  const v = Number(hr);
  if (v > 120 || v < 45) return alert;
  if (v > 100 || v < 60) return watch;
  return normal;
}

function bpStatus(bloodPressure) {
  const bp = parseBloodPressure(bloodPressure);
  if (!bp) return none;
  if (bp.systolic >= 160 || bp.diastolic >= 100) return alert;
  if (bp.systolic >= 140 || bp.diastolic >= 90) return watch;
  return normal;
}

function spo2Status(v) {
  if (!hasValue(v)) return none;
  const n = Number(v);
  if (n < 90) return alert;
  if (n < 95) return watch;
  return normal;
}

module.exports = { hrStatus, bpStatus, spo2Status, parseBloodPressure };
