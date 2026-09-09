// 日期工具（Batch 12 · G4 去重）：服务端统一的本地日期键与补零
const pad = (n) => String(n).padStart(2, '0');

// 本地时区 YYYY-MM-DD（健康数据的 date 字段、按日聚合的分组键）
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

module.exports = { pad, dateKey };
