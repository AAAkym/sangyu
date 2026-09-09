// 邀请码绑定监护关系：老人生成 6 位邀请码 → 家属输入绑定 → 写入 relationships
// 约束：纯数字 6 位（Math.random 即可）；有效期 10 分钟；同一老人仅一个未过期未使用码，重复生成覆盖旧码；
//       过期校验在服务端完成（比较 expiresAt 与当前时间）；一个邀请码只能被一个家属使用（used 标记）
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

const EXPIRES_MS = 10 * 60 * 1000; // 10 分钟

const isActive = (inv, now = Date.now()) => !inv.used && new Date(inv.expiresAt).getTime() > now;

// POST /api/invitation/generate 老人生成邀请码
// 请求：{ elderOpenid }；重复生成时覆盖该老人当前有效的未使用邀请码
router.post('/invitation/generate', (req, res) => {
  const { elderOpenid } = req.body || {};
  if (!elderOpenid) return res.fail('缺少 elderOpenid');

  const now = Date.now();
  const invitations = db.read('invitations');
  const kept = invitations.filter((i) => !(i.elderOpenid === elderOpenid && isActive(i, now)));

  const record = {
    code: String(Math.floor(100000 + Math.random() * 900000)), // 6 位数字
    elderOpenid,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    used: false,
    usedBy: null
  };
  kept.push(record);
  db.write('invitations', kept);
  res.ok(record);
});

// POST /api/invitation/bind 家属输入邀请码绑定老人
// 请求：{ familyOpenid, code }；校验存在 → 未使用 → 未过期，通过后写关系并标记邀请码已使用
router.post('/invitation/bind', (req, res) => {
  const { familyOpenid, code } = req.body || {};
  if (!familyOpenid || !code) return res.fail('缺少 familyOpenid 或 code');

  const invitations = db.read('invitations');
  const invitation = invitations.find((i) => i.code === String(code));
  if (!invitation) return res.fail('邀请码不存在，请核对后重试');
  if (invitation.used) return res.fail('邀请码已被使用，请让老人重新生成');
  if (!isActive(invitation)) return res.fail('邀请码已过期，请让老人重新生成');

  const relationships = db.read('relationships');
  let relationship = relationships.find(
    (r) => r.familyOpenid === familyOpenid && r.elderOpenid === invitation.elderOpenid && !r.unboundAt
  );
  let alreadyBound = false;
  if (relationship) {
    // 重复绑定同一老人（未解绑）：幂等处理，不写重复关系
    alreadyBound = true;
  } else if (
    relationships.find((r) => r.familyOpenid === familyOpenid && r.elderOpenid === invitation.elderOpenid && r.unboundAt)
  ) {
    // 曾绑定后撤销授权：复活原记录（清 unboundAt），否则"重新绑定"会幂等命中软删除记录导致关系不恢复
    relationship = relationships.find(
      (r) => r.familyOpenid === familyOpenid && r.elderOpenid === invitation.elderOpenid && r.unboundAt
    );
    delete relationship.unboundAt;
    relationship.createdAt = new Date().toISOString();
    db.write('relationships', relationships);
  } else {
    relationship = {
      id: db.genId('r'),
      familyOpenid,
      elderOpenid: invitation.elderOpenid,
      createdAt: new Date().toISOString()
    };
    relationships.push(relationship);
    db.write('relationships', relationships);
  }

  invitation.used = true;
  invitation.usedBy = familyOpenid;
  invitation.usedAt = new Date().toISOString();
  db.write('invitations', invitations);

  res.ok({ relationship, alreadyBound });
});

// GET /api/invitation/status?elderOpenid=xxx 老人端查询当前有效邀请码（用于页面显示/刷新）
router.get('/invitation/status', (req, res) => {
  const { elderOpenid } = req.query;
  if (!elderOpenid) return res.fail('缺少 elderOpenid');

  const active = db
    .findWhere('invitations', (i) => i.elderOpenid === elderOpenid && isActive(i))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  if (!active) return res.ok({ hasActive: false });
  res.ok({
    hasActive: true,
    code: active.code,
    expiresAt: active.expiresAt,
    remainingSeconds: Math.max(0, Math.ceil((new Date(active.expiresAt).getTime() - Date.now()) / 1000))
  });
});

module.exports = router;
