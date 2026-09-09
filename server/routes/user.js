// 用户资料接口（Batch 16 · P1-A）：昵称与头像编辑，双端同步展示
// 头像方案：前端 wx.chooseMedia 选图 → base64 → 本接口写 server/public/avatars/<openid>.<ext>，
//           users.avatar 存 /avatars/<openid>.<ext>（前端拼接 BASE_URL 访问）；另支持预设色板（avatar=c1..c6，纯前端渲染）
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../utils/db');

const router = express.Router();
const AVATAR_DIR = path.join(__dirname, '..', 'public', 'avatars');
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

// GET /api/user/profile?openid=xxx
router.get('/user/profile', (req, res) => {
  const { openid } = req.query;
  if (!openid) return res.fail('缺少 openid');

  const user = db.read('users').find((u) => u.openid === openid);
  if (!user) return res.fail('用户不存在，请先登录');
  res.ok({
    openid: user.openid,
    role: user.role || '',
    nickname: user.nickname || '',
    avatar: user.avatar || ''
  });
});

// POST /api/user/profile 更新昵称/头像标识
// 请求：{ openid, nickname?, avatar? }（至少传一项；avatar 亦可传预设 id c1..c6 或上传路径）
router.post('/user/profile', (req, res) => {
  const { openid, nickname, avatar } = req.body || {};
  if (!openid) return res.fail('缺少 openid');
  const nick = String(nickname === undefined ? '' : nickname).trim();
  if (nickname !== undefined && (!nick || nick.length > 20)) {
    return res.fail('昵称必填（≤20 字）');
  }

  const users = db.read('users');
  const user = users.find((u) => u.openid === openid);
  if (!user) return res.fail('用户不存在，请先登录');

  if (nick) user.nickname = nick;
  if (avatar !== undefined && avatar !== null && String(avatar).trim()) user.avatar = String(avatar).trim();
  user.updatedAt = new Date().toISOString();
  db.write('users', users);
  res.ok({ openid: user.openid, role: user.role || '', nickname: user.nickname || '', avatar: user.avatar || '' });
});

// POST /api/user/avatar 上传头像（base64）
// 请求：{ openid, dataBase64 }，dataBase64 形如 data:image/png;base64,xxxx
router.post('/user/avatar', (req, res) => {
  const { openid, dataBase64 } = req.body || {};
  if (!openid || !dataBase64) return res.fail('缺少 openid 或 dataBase64');

  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataBase64));
  if (!m) return res.fail('图片格式不支持（仅 png/jpg）');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_AVATAR_BYTES) return res.fail('图片过大（≤2MB）');

  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const fileName = String(openid).replace(/[^a-zA-Z0-9_]/g, '_') + '.' + ext;
  fs.writeFileSync(path.join(AVATAR_DIR, fileName), buf);
  const avatarPath = '/avatars/' + fileName;

  const users = db.read('users');
  const user = users.find((u) => u.openid === openid);
  if (!user) return res.fail('用户不存在，请先登录');
  user.avatar = avatarPath;
  user.updatedAt = new Date().toISOString();
  db.write('users', users);
  res.ok({ avatar: avatarPath });
});

module.exports = router;
