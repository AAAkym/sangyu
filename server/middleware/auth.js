// 请求鉴权中间件（Batch 9 基础版，为 Batch 10 数据鉴权打底）
// - 后端 MOCK_MODE=true（.env，默认演示）→ 全部放行
// - 否则：白名单（/ 、/healthz 、/api/auth/login 、/api/auth/check）放行，
//          其余请求须携带 Authorization: Bearer <token>，无效返回 401
// 通过后挂 req.user = { openid }，供后续批次做数据级鉴权
const env = require('../utils/env');
const tokenStore = require('../utils/tokenStore');

const WHITELIST = ['/', '/healthz', '/api/auth/login', '/api/auth/check'];

function isMockMode() {
  const raw = env.get('MOCK_MODE');
  return raw === undefined ? true : String(raw).toLowerCase() !== 'false';
}

module.exports = function authMiddleware(req, res, next) {
  if (isMockMode()) return next();
  if (WHITELIST.indexOf(req.path) >= 0) return next();

  const header = req.headers.authorization || '';
  const token = header.indexOf('Bearer ') === 0 ? header.slice(7) : null;
  const info = tokenStore.verify(token);
  if (!info) {
    return res.status(401).json({ code: -1, msg: '登录已失效，请重新登录' });
  }

  req.user = info;
  next();
};
