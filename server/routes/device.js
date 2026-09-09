// 设备生命周期：绑定 / 列表 / 单设备状态 / 解绑（软删除）
// 状态规则：lastReportAt 距今超过 OFFLINE_AFTER_MS → offline，否则 online（存储字段仅作快照，读取时实时计算）
const express = require('express');
const db = require('../utils/db');

const router = express.Router();

const OFFLINE_AFTER_MS = 10 * 60 * 1000; // 离线判定阈值：10 分钟无上报

const computeStatus = (device, now = Date.now()) =>
  device.lastReportAt && now - new Date(device.lastReportAt).getTime() <= OFFLINE_AFTER_MS ? 'online' : 'offline';

// 通过操作人 openid 解析设备归属老人：老人本人即其自身；家属则取其监护的老人（MVP 取第一个）
const resolveElderOpenid = (openid) => {
  const rel = db.findWhere('relationships', (r) => r.familyOpenid === openid && !r.unboundAt);
  return rel.length > 0 ? rel[0].elderOpenid : openid;
};

// POST /api/bindDevice 绑定设备（同老人同设备码的未解绑记录幂等返回；解绑后重绑生成新记录）
// 请求：{ openid, deviceCode }
router.post('/bindDevice', (req, res) => {
  const { openid, deviceCode } = req.body || {};
  if (!openid || !deviceCode) return res.fail('缺少 openid 或 deviceCode');

  const elderOpenid = resolveElderOpenid(openid);
  const devices = db.read('devices');
  const existing = devices.find(
    (d) => d.elderOpenid === elderOpenid && d.deviceCode === deviceCode && !d.unboundAt
  );
  if (existing) return res.ok(existing);

  const record = {
    id: db.genId('d'),
    elderOpenid,
    deviceCode,
    boundAt: new Date().toISOString(),
    status: 'offline',
    battery: null,
    lastReportAt: null,
    unboundAt: null
  };
  devices.push(record);
  db.write('devices', devices);
  res.ok(record);
});

// GET /api/device/list?elderOpenid=xxx 该老人未解绑设备（按绑定时间倒序，status 实时计算）
router.get('/device/list', (req, res) => {
  const { elderOpenid } = req.query;
  if (!elderOpenid) return res.fail('缺少 elderOpenid');

  const list = db
    .findWhere('devices', (d) => d.elderOpenid === elderOpenid && !d.unboundAt)
    .sort((a, b) => (a.boundAt < b.boundAt ? 1 : -1))
    .map((d) => ({ ...d, status: computeStatus(d) }));
  res.ok(list);
});

// GET /api/device/status?deviceCode=xxx 单设备在线状态 + 电量（首页/告警页快速展示；未绑定返回 null）
router.get('/device/status', (req, res) => {
  const { deviceCode } = req.query;
  if (!deviceCode) return res.fail('缺少 deviceCode');

  const device = db
    .findWhere('devices', (d) => d.deviceCode === deviceCode && !d.unboundAt)
    .sort((a, b) => (a.boundAt < b.boundAt ? 1 : -1))[0];
  if (!device) return res.ok(null);
  res.ok({ ...device, status: computeStatus(device) });
});

// POST /api/device/unbind 解绑（软删除：unboundAt = now，不物理删除）
// 请求：{ deviceId, operatorOpenid }；操作人须为设备归属老人本人，或与该老人有监护关系的家属（防越权）
router.post('/device/unbind', (req, res) => {
  const { deviceId, operatorOpenid } = req.body || {};
  if (!deviceId || !operatorOpenid) return res.fail('缺少 deviceId 或 operatorOpenid');

  const devices = db.read('devices');
  const device = devices.find((d) => d.id === deviceId);
  if (!device) return res.fail('设备不存在');
  if (device.unboundAt) return res.fail('该设备已解绑');

  const isOwner = device.elderOpenid === operatorOpenid;
  const isRelatedFamily =
    db.findWhere(
      'relationships',
      (r) => r.familyOpenid === operatorOpenid && r.elderOpenid === device.elderOpenid && !r.unboundAt
    ).length > 0;
  if (!isOwner && !isRelatedFamily) {
    return res.fail('无权解绑该设备');
  }

  device.unboundAt = new Date().toISOString();
  device.status = 'offline';
  db.write('devices', devices);
  res.ok(device);
});

module.exports = router;
