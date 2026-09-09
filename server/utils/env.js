// 极简 .env 读取（避免引入 dotenv 依赖）：启动时读取 server/.env，process.env 优先
// 安全约束：本文件只负责读取，调用方不得把 WX_APPSECRET 写入日志/返回值
const fs = require('fs');
const path = require('path');

const env = {};
try {
  fs
    .readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      if (line.trim().startsWith('#')) return;
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
} catch (err) {
  // .env 不存在：仅使用 process.env（演示模式默认可用）
}

function get(key) {
  if (process.env[key] !== undefined) return process.env[key];
  return env[key];
}

module.exports = { get };
