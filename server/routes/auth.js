// 真实微信登录（Batch 9）：前端 wx.login 拿 code → 本路由调微信 jscode2session 换 openid → 签发自有 token
// 安全约束：
//   1. WX_APPID / WX_APPSECRET 仅从 server/.env 读取，不进代码库
//   2. session_key 仅存服务端 sessions.json，绝不下发前端
//   3. 错误信息不透出 appsecret 与微信原始报文；未配置时返回明确错误而非崩溃
const express = require('express');
const db = require('../utils/db');
const env = require('../utils/env');
const tokenStore = require('../utils/tokenStore');

const router = express.Router();

// POST /api/auth/login 请求：{ code }（wx.login 获得）
// 返回：{ code: 0, data: { token, openid, role } }
router.post('/auth/login', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.fail('缺少 code');

  const appid = env.get('WX_APPID');
  const secret = env.get('WX_APPSECRET');
  // 占位符 / 缺失均视为未配置，明确报错而非崩溃
  const secretConfigured = !!secret && secret.length >= 8 && secret.indexOf('你的') !== 0;
  if (!appid || !secretConfigured) {
    return res.fail('微信登录未配置：请在 server/.env 填写 WX_APPID 与 WX_APPSECRET（开发设置→AppSecret）');
  }

  let wxRes;
  try {
    const url =
      'https://api.weixin.qq.com/sns/jscode2session?appid=' +
      encodeURIComponent(appid) +
      '&secret=' +
      encodeURIComponent(secret) +
      '&js_code=' +
      encodeURIComponent(code) +
      '&grant_type=authorization_code';
    wxRes = await fetch(url).then((r) => r.json());
  } catch (err) {
    return res.fail('微信登录失败：登录服务暂时不可用，请稍后重试');
  }

  if (!wxRes || wxRes.errcode) {
    return res.fail('微信登录失败: ' + ((wxRes && wxRes.errmsg) || 'code 无效或已过期'));
  }

  const { openid, session_key } = wxRes;
  if (!openid) return res.fail('微信登录失败: 未获取到用户标识');

  // session_key 仅存服务端（sessions.json，已加入 .gitignore），绝不下发
  const sessions = db.read('sessions').filter((s) => s.openid !== openid);
  sessions.push({ openid, sessionKey: session_key, createdAt: new Date().toISOString() });
  db.write('sessions', sessions);

  // 查/建用户（沿用 users 集合，role 由 updateRole 维护）
  const users = db.read('users');
  let user = users.find((u) => u.openid === openid);
  if (!user) {
    user = { openid, role: '', createdAt: new Date().toISOString() };
    db.insert('users', user);
  }

  // 单设备登录：旧 token 全部失效
  tokenStore.drop(openid);
  const { token } = tokenStore.issue(openid);
  res.ok({ token, openid, role: user.role || '', nickname: user.nickname || '' });
});

// POST /api/auth/check 请求：{ token } → { valid, openid, role }
router.post('/auth/check', (req, res) => {
  const { token } = req.body || {};
  const info = tokenStore.verify(token);
  if (!info) return res.ok({ valid: false, openid: null, role: null });

  const user = db.read('users').find((u) => u.openid === info.openid);
  res.ok({ valid: true, openid: info.openid, role: (user && user.role) || '' });
});

// ============================================================
// Mock 登录（演示模式：前端 MOCK_MODE=true 时走这里，与真实登录共存）
// MVP 阶段由前端直接传 openid 标识用户（真实环境 openid 由上面 /api/auth/login 换取）
// ============================================================

// POST /api/login 模拟登录
// 请求：{ openid }；openid 已存在则直接返回该用户，否则新建（role 默认空字符串）
router.post('/login', (req, res) => {
  const { openid } = req.body || {};
  if (!openid) return res.fail('缺少 openid');

  const users = db.read('users');
  let user = users.find((u) => u.openid === openid);
  if (!user) {
    user = { openid, role: '', createdAt: new Date().toISOString() };
    db.insert('users', user);
  }
  res.ok(user);
});

// POST /api/updateRole 更新角色
// 请求：{ openid, role }，role 仅支持 family / elder
router.post('/updateRole', (req, res) => {
  const { openid, role } = req.body || {};
  if (!openid || !role) return res.fail('缺少 openid 或 role');
  if (!['family', 'elder'].includes(role)) return res.fail('role 仅支持 family / elder');

  const users = db.read('users');
  const user = users.find((u) => u.openid === openid);
  if (!user) return res.fail('用户不存在，请先调用 /api/login');

  user.role = role;
  // 首次设置角色时补默认昵称（demo-reset/真实注册可覆盖为真实称呼）
  if (!user.nickname) user.nickname = role === 'elder' ? '长辈' : '家属';
  user.updatedAt = new Date().toISOString();
  db.write('users', users);
  res.ok(user);
});

module.exports = router;
