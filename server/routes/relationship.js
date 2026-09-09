// 监护关系：家属 ↔ 老人
// 说明：这是为 /api/alert/list 补充的最小接口（原接口清单未包含）——
// 家属查告警需要先知道「我关联了哪些老人」。
// data/relationships.json 已预置一条演示关系 mock_family_001 ↔ mock_elder_001，
// 保证本地联调开箱即用；后期做邀请码绑定页后可清理种子数据。
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

// POST /api/relationship/create 建立监护关系（重复绑定幂等返回已有记录）
// 请求：{ familyOpenid, elderOpenid }
router.post('/relationship/create', (req, res) => {
  const { familyOpenid, elderOpenid } = req.body || {};
  if (!familyOpenid || !elderOpenid) return res.fail('缺少 familyOpenid 或 elderOpenid');

  const existing = db.findWhere(
    'relationships',
    (r) => !r.unboundAt && r.familyOpenid === familyOpenid && r.elderOpenid === elderOpenid
  );
  if (existing.length > 0) return res.ok(existing[0]);

  const record = {
    id: db.genId('r'),
    familyOpenid,
    elderOpenid,
    createdAt: new Date().toISOString()
  };
  db.insert('relationships', record);
  res.ok(record);
});

// GET /api/relationship/list?openid=xxx&role=family|elder 按身份查有效监护关系（已解绑的不返回）
// role=family 按 familyOpenid 过滤；role=elder 按 elderOpenid 过滤；缺省时两者任一匹配
// 返回补充 familyName / elderName（users.nickname，缺省用角色名）
router.get('/relationship/list', (req, res) => {
  const { openid, role } = req.query;
  if (!openid) return res.fail('缺少 openid');

  const users = db.read('users');
  const nameOf = (openid_, fallback) => {
    const u = users.find((x) => x.openid === openid_);
    return (u && u.nickname) || fallback;
  };
  const avatarOf = (openid_) => {
    const u = users.find((x) => x.openid === openid_);
    return (u && u.avatar) || '';
  };

  const list = db
    .findWhere('relationships', (r) =>
      !r.unboundAt &&
      (role === 'family'
        ? r.familyOpenid === openid
        : role === 'elder'
          ? r.elderOpenid === openid
          : r.familyOpenid === openid || r.elderOpenid === openid)
    )
    .map((r) => ({
      ...r,
      familyName: nameOf(r.familyOpenid, '家属'),
      elderName: nameOf(r.elderOpenid, '老人'),
      familyAvatar: avatarOf(r.familyOpenid),
      elderAvatar: avatarOf(r.elderOpenid)
    }));
  res.ok(list);
});

// POST /api/relationship/unbind 解除监护关系（撤销授权，软删除 unboundAt）
// 请求：{ relationshipId, operatorOpenid }；操作人须为该关系的任一方（防越权）
// 级联：撤销授权后，该老人的全部未解绑设备一并软删除（停止数据接收与告警可见性）
router.post('/relationship/unbind', (req, res) => {
  const { relationshipId, operatorOpenid } = req.body || {};
  if (!relationshipId || !operatorOpenid) return res.fail('缺少 relationshipId 或 operatorOpenid');

  const relationships = db.read('relationships');
  const rel = relationships.find((r) => r.id === relationshipId);
  if (!rel) return res.fail('关系不存在');
  if (rel.unboundAt) return res.fail('该关系已解绑');
  if (rel.familyOpenid !== operatorOpenid && rel.elderOpenid !== operatorOpenid) {
    return res.fail('无权操作该关系');
  }

  rel.unboundAt = new Date().toISOString();
  db.write('relationships', relationships);

  const now = new Date().toISOString();
  const devices = db.read('devices');
  devices.forEach((d) => {
    if (d.elderOpenid === rel.elderOpenid && !d.unboundAt) d.unboundAt = now;
  });
  db.write('devices', devices);

  res.ok(rel);
});

module.exports = router;
