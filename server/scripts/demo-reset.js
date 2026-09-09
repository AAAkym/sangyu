// 演示数据一键初始化：把 server/data/ 重置为答辩演示态（幂等，可反复运行）
// 用法：先启动后端（npm start），再运行 npm run demo:reset
//
// 内容：
//   用户/关系：mock_family_001 ↔ mock_elder_001（未解绑）
//   设备：SB-001 已绑定、电量 66、lastReportAt=1 分钟前（演示"在线"）
//   健康数据：最近 7 天每天 1 条正常波动 + 今天最后一条 125（对应规则告警演示）
//   告警：4 条覆盖状态机 open / acknowledged / escalated / resolved，2 条 source=rule_engine
//   预约：社区医护（待处理）+ 志愿者陪伴（已完成）
//   报告：调 POST /api/report/generate 生成（后端未启动则跳过并提示）
//   邀请码：清空（现场生成更真实）
// 时间戳全部相对当前时间往前推，保证界面显示"X分钟前"而非绝对时间
const fs = require('fs');
const path = require('path');
const db = require('../utils/db');
const { dateKey } = require('../utils/dates');

const DATA_DIR = path.join(__dirname, '..', 'data');
const now = Date.now();

// 相对时间工具：minsAgo(8) = 8 分钟前；hoursAgo(2) 同理
const at = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();

// 1) 备份 data/ 到 data/.backup-<timestamp>/（备份属文件级操作，业务读写仍走 db.js）
const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(DATA_DIR, '.backup-' + stamp);
fs.mkdirSync(backupDir, { recursive: true });
fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith('.json'))
  .forEach((f) => fs.copyFileSync(path.join(DATA_DIR, f), path.join(backupDir, f)));
console.log('已备份原数据 → ' + path.relative(process.cwd(), backupDir));

// 2) 清空待重置集合
['users', 'relationships', 'devices', 'health_observations', 'alerts', 'appointments', 'invitations', 'reports', 'reminders', 'messages', 'contacts'].forEach(
  (c) => db.write(c, [])
);

// 3) 用户 + 监护关系（昵称用于首页问候与关系列表展示）
db.insert('users', { openid: 'mock_family_001', role: 'family', nickname: '小王', createdAt: at(60 * 24 * 30) });
db.insert('users', { openid: 'mock_elder_001', role: 'elder', nickname: '张爷爷', createdAt: at(60 * 24 * 30) });
db.insert('relationships', {
  id: 'r_demo_001',
  familyOpenid: 'mock_family_001',
  elderOpenid: 'mock_elder_001',
  createdAt: at(60 * 24 * 7)
});

// 4) 设备：SB-001 在线（lastReportAt 1 分钟前），电量 66
db.insert('devices', {
  id: 'd_demo_001',
  elderOpenid: 'mock_elder_001',
  deviceCode: 'SB-001',
  boundAt: at(60 * 24 * 6),
  status: 'online',
  battery: 66,
  lastReportAt: at(1),
  unboundAt: null
});

// 5) 健康数据：最近 7 天每天 1 条正常波动（68–95）+ 今天最后一条 125（规则告警演示点）
const historyHR = [76, 82, 71, 88, 79, 84]; // 6 天前 → 昨天
for (let i = 6; i >= 1; i--) {
  const day = new Date(now - i * 86400000);
  day.setHours(8, 30, 0, 0);
  db.insert('health_observations', {
    id: db.genId('h'),
    elderOpenid: 'mock_elder_001',
    date: dateKey(day),
    source: i % 2 === 0 ? 'device' : 'mock',
    heartRate: historyHR[6 - i],
    bloodPressure: `${118 + (i % 8)}/${76 + (i % 6)}`,
    spo2: 97,
    createdAt: day.toISOString()
  });
}
// 今天 2 小时前 1 条正常（用相对时间，避免凌晨运行时"早晨 8:30"落到未来）
db.insert('health_observations', {
  id: db.genId('h'),
  elderOpenid: 'mock_elder_001',
  date: dateKey(new Date(now - 130 * 60000)),
  source: 'mock',
  heartRate: 78,
  bloodPressure: '122/78',
  spo2: 98,
  createdAt: at(130)
});
// 今天 10 分钟前 1 条 125（偏高，对应规则告警 A2 的证据）
db.insert('health_observations', {
  id: 'h_demo_125',
  elderOpenid: 'mock_elder_001',
  date: dateKey(new Date(now)),
  source: 'device',
  heartRate: 125,
  bloodPressure: '126/84',
  spo2: 97,
  createdAt: at(10)
});

// 6) 告警 4 条：open（SOS 刚发起）/ acknowledged（rule_engine）/ escalated（已转社区）/ resolved（rule_engine，完整时间线）
db.insert('alerts', {
  id: 'a_demo_sos_open',
  elderOpenid: 'mock_elder_001',
  reporterOpenid: 'mock_elder_001',
  source: 'sos',
  type: 'sos',
  severity: 'high',
  status: 'open',
  createdAt: at(8),
  updatedAt: at(8),
  timeline: [{ status: 'open', operator: 'mock_elder_001', note: '老人一键求助', at: at(8) }],
  currentHandler: 'family',
  resolvedNote: ''
});

db.insert('alerts', {
  id: 'a_demo_rule_ack',
  elderOpenid: 'mock_elder_001',
  reporterOpenid: 'rule_engine',
  source: 'rule_engine',
  type: 'threshold',
  severity: 'warning',
  ruleId: 'HR_HIGH_SINGLE',
  message: '心率过高，建议密切关注',
  status: 'acknowledged',
  createdAt: at(120),
  updatedAt: at(110),
  timeline: [
    { status: 'open', operator: 'rule_engine', note: '阈值预警：心率过高，建议密切关注', at: at(120) },
    { status: 'acknowledged', operator: 'mock_family_001', note: '家属已确认，马上处理', at: at(110) }
  ],
  currentHandler: 'family',
  resolvedNote: ''
});

db.insert('alerts', {
  id: 'a_demo_escalated',
  elderOpenid: 'mock_elder_001',
  reporterOpenid: 'mock_elder_001',
  source: 'sos',
  type: 'sos',
  severity: 'high',
  status: 'escalated',
  createdAt: at(300),
  updatedAt: at(275),
  timeline: [
    { status: 'open', operator: 'mock_elder_001', note: '老人一键求助', at: at(300) },
    { status: 'acknowledged', operator: 'mock_family_001', note: '我在路上', at: at(290) },
    { status: 'escalated', operator: 'mock_family_001', note: '已转社区养老服务中心', at: at(275) }
  ],
  currentHandler: 'community',
  resolvedNote: ''
});

db.insert('alerts', {
  id: 'a_demo_rule_resolved',
  elderOpenid: 'mock_elder_001',
  reporterOpenid: 'rule_engine',
  source: 'rule_engine',
  type: 'threshold',
  severity: 'warning',
  ruleId: 'BP_HIGH',
  message: '血压偏高，建议关注',
  status: 'resolved',
  createdAt: at(60 * 26),
  updatedAt: at(60 * 25),
  timeline: [
    { status: 'open', operator: 'rule_engine', note: '阈值预警：血压偏高，建议关注', at: at(60 * 26) },
    { status: 'acknowledged', operator: 'mock_family_001', note: '已上门查看', at: at(60 * 25.5) },
    { status: 'resolved', operator: 'mock_family_001', note: '老人已平安，血压回落', at: at(60 * 25) }
  ],
  currentHandler: null,
  resolvedNote: '老人已平安，血压回落'
});

// 7) 预约 2 条：不同服务类型，1 待处理 1 已完成（统一挂家属账号，家属端预约页可见 2 条）
db.insert('appointments', {
  id: 'ap_demo_001',
  openid: 'mock_family_001',
  type: '社区医护',
  detail: '上门测血压，周三上午',
  status: '待处理',
  createdAt: at(60 * 20)
});
db.insert('appointments', {
  id: 'ap_demo_002',
  openid: 'mock_family_001',
  type: '志愿者陪伴',
  detail: '志愿者上门陪伴聊天',
  status: '已完成',
  createdAt: at(60 * 24 * 3)
});

// 老人名下待处理预约（elder 首页「下次陪伴」卡数据源）
db.insert('appointments', {
  id: 'ap_demo_003',
  openid: 'mock_elder_001',
  type: '志愿者陪伴',
  detail: '今天 10:00 · 上门探访',
  status: '待处理',
  createdAt: at(30)
});

// 7.5) 用药提醒 2 条（纯日程提醒，非用药指导；页面带遵医嘱免责；晨间已打"已服用"卡）
db.insert('reminders', { id: 'rm_demo_001', elderOpenid: 'mock_elder_001', title: '晨间服药提醒', time: '08:00', note: '', lastTakenAt: at(60), createdAt: at(60 * 24 * 2) });
db.insert('reminders', { id: 'rm_demo_002', elderOpenid: 'mock_elder_001', title: '晚间服药提醒', time: '20:00', note: '', createdAt: at(60 * 24 * 2) });

// 7.6) 家人留言 2 条（老人端留言墙展示；第 1 条已读、第 2 条未读）
db.insert('messages', { id: 'msg_demo_001', fromOpenid: 'mock_family_001', toOpenid: 'mock_elder_001', text: '爷爷今天降温，记得添衣', readAt: at(20), createdAt: at(60 * 5) });
db.insert('messages', { id: 'msg_demo_002', fromOpenid: 'mock_family_001', toOpenid: 'mock_elder_001', text: '周末我回家看您，给您带了您爱吃的糕点', createdAt: at(60 * 26) });

// 7.7) 紧急联系人 2 条（老人端一键拨号；电话为演示号码；group 用于分组排序）
db.insert('contacts', { id: 'ct_demo_001', elderOpenid: 'mock_elder_001', name: '小王（子女）', phone: '13800000001', relation: '子女', group: '家人', createdAt: at(60 * 24 * 5) });
db.insert('contacts', { id: 'ct_demo_002', elderOpenid: 'mock_elder_001', name: '社区服务站', phone: '13800000002', relation: '社区', group: '社区', createdAt: at(60 * 24 * 5) });

// 8) 邀请码清空（现场生成更真实）
db.write('invitations', []);

// 9) AI 报告：调后端接口生成（不手写 JSON；后端未启动则提示跳过）
(async () => {
  let reportDone = false;
  try {
    const res = await fetch('http://localhost:3000/api/report/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ openid: 'mock_elder_001' })
    }).then((r) => r.json());
    reportDone = res.code === 0;
    if (!reportDone) console.log('报告生成失败：' + (res.msg || ''));
  } catch (err) {
    console.log('后端未启动（npm start），跳过报告生成——可在小程序报告页手动点「生成最新报告」');
  }

  // 10) 摘要
  const count = (c) => db.read(c).length;
  console.log('\n演示数据初始化完成：');
  console.log(`  users=${count('users')} relationships=${count('relationships')} devices=${count('devices')}（SB-001 在线，电量 66）`);
  console.log(`  health_observations=${count('health_observations')}（最近 7 天 + 末条心率 125）`);
  console.log(`  alerts=${count('alerts')}（open/acknowledged/escalated/resolved 各 1，2 条 rule_engine）`);
  console.log(`  contacts=${count('contacts')}（子女/社区快捷拨号）  reminders=${count('reminders')}（晨间/晚间服药提醒）  appointments=${count('appointments')}（社区医护待处理 + 志愿者已完成）`);
  console.log(`  invitations=0（现场生成）  reports=${count('reports')}${reportDone ? '（接口生成）' : '（后端未启动，未生成）'}`);
})();
