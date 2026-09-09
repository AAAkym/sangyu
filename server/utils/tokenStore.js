// 自有 token 管理：随机串 → openid，带过期时间（内存态）
// 服务重启后 token 失效，前端 checkSession 会失败并自动重登——符合预期
const crypto = require('crypto');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const store = new Map(); // token → { openid, expiresAt }

// 签发新 token（同 openid 旧 token 由调用方先 drop，实现单设备登录）
function issue(openid) {
  const token = crypto.randomBytes(24).toString('hex');
  store.set(token, { openid, expiresAt: Date.now() + TTL_MS });
  return { token };
}

// 校验 token：有效返回 { openid }，无效/过期返回 null
function verify(token) {
  if (!token) return null;
  const info = store.get(String(token));
  if (!info) return null;
  if (Date.now() > info.expiresAt) {
    store.delete(String(token));
    return null;
  }
  return { openid: info.openid };
}

// 使某 openid 的全部 token 失效（重新登录时调用）
function drop(openid) {
  for (const [t, info] of store) {
    if (info.openid === openid) store.delete(t);
  }
}

module.exports = { issue, verify, drop };
