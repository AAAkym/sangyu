// 接口自检脚本：先启动服务（npm start），再运行 node smoke-test.js
// 按真实业务顺序跑通全部接口；负向用例（应失败的请求）通过 expectFail 标记
// 注意：结尾用 process.exitCode 而非 process.exit()，避免 Windows 下 libuv 退出断言崩溃
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const DATA_DIR = path.join(__dirname, 'data');

const post = (p, body) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then((r) => r.json());

const get = (p) => fetch(BASE + p).then((r) => r.json());

(async () => {
  const results = [];
  const log = (label, res, expectFail = false) => {
    const pass = expectFail ? !!(res && res.code !== 0) : !!(res && res.code === 0);
    results.push({ label, pass });
    const preview = JSON.stringify(res) || '';
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${preview.length > 400 ? preview.slice(0, 400) + '…' : preview}`);
  };
  // 自定义断言：不走 code===0 判定，由调用方给出通过条件
  const assert = (label, cond, extra) => {
    results.push({ label, pass: !!cond });
    const preview = JSON.stringify(extra) || '';
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ': ' + preview.slice(0, 400) : ''}`);
  };

  // ---- 登录建档 ----
  log('login elder（登录建档）', await post('/api/login', { openid: 'mock_elder_001' }));
  log('updateRole elder（role=elder）', await post('/api/updateRole', { openid: 'mock_elder_001', role: 'elder' }));
  log('login family（登录建档）', await post('/api/login', { openid: 'mock_family_001' }));
  log('updateRole family（role=family）', await post('/api/updateRole', { openid: 'mock_family_001', role: 'family' }));

  // ---- 邀请码绑定监护关系 ----
  const invRes = await post('/api/invitation/generate', { elderOpenid: 'mock_elder_001' });
  log('invitation/generate（老人生成邀请码）', invRes);
  assert(
    'invitation/generate（6 位数字、有效期 10 分钟）',
    !!(invRes.data && /^\d{6}$/.test(invRes.data.code) &&
      new Date(invRes.data.expiresAt).getTime() - new Date(invRes.data.createdAt).getTime() === 10 * 60 * 1000),
    { code: invRes.data && invRes.data.code }
  );

  const statusRes = await get('/api/invitation/status?elderOpenid=mock_elder_001');
  log('invitation/status（老人端查询有效码）', statusRes);
  assert(
    'invitation/status（hasActive 且与生成码一致）',
    !!(statusRes.data && statusRes.data.hasActive && statusRes.data.code === invRes.data.code),
    { code: statusRes.data && statusRes.data.code }
  );

  const bindRes = await post('/api/invitation/bind', { familyOpenid: 'mock_family_001', code: invRes.data.code });
  log('invitation/bind（家属输码绑定）', bindRes);
  assert(
    'invitation/bind（relationships 写入正确关系）',
    !!(bindRes.data && bindRes.data.relationship &&
      bindRes.data.relationship.familyOpenid === 'mock_family_001' &&
      bindRes.data.relationship.elderOpenid === 'mock_elder_001'),
    bindRes.data
  );

  const relListRes = await get('/api/relationship/list?openid=mock_family_001&role=family');
  log('relationship/list（按家属身份查关系）', relListRes);
  assert(
    'relationship/list（能查到刚绑定的老人）',
    !!(relListRes.data && relListRes.data.some((r) => r.elderOpenid === 'mock_elder_001')),
    { count: relListRes.data && relListRes.data.length }
  );

  log('invitation/bind（同一邀请码重复绑定应被拒绝）', await post('/api/invitation/bind', { familyOpenid: 'mock_family_001', code: invRes.data.code }), true);

  // 直接写入一条已过期邀请码，验证服务端过期校验（不等待真实 10 分钟）
  const invFile = path.join(DATA_DIR, 'invitations.json');
  const seeded = JSON.parse(fs.readFileSync(invFile, 'utf8'));
  seeded.push({
    code: '990001',
    elderOpenid: 'mock_elder_001',
    createdAt: new Date(Date.now() - 11 * 60000).toISOString(),
    expiresAt: new Date(Date.now() - 60000).toISOString(),
    used: false,
    usedBy: null
  });
  fs.writeFileSync(invFile, JSON.stringify(seeded, null, 2));
  log('invitation/bind（过期邀请码应被拒绝）', await post('/api/invitation/bind', { familyOpenid: 'mock_family_001', code: '990001' }), true);

  log('invitation/generate（重新生成覆盖旧码）', await post('/api/invitation/generate', { elderOpenid: 'mock_elder_001' }));

  // ---- 设备 / 健康数据 ----
  log('bindDevice（绑定设备 SB-001）', await post('/api/bindDevice', { openid: 'mock_family_001', deviceCode: 'SB-001' }));
  log('health/mock（写入心率血压）', await post('/api/health/mock', { openid: 'mock_elder_001', heartRate: 88, bloodPressure: '128/82' }));
  log('health（查询健康数据）', await get('/api/health?openid=mock_elder_001'));

  // ---- 设备上报 + 规则引擎自动告警 ----
  const repNormal = await post('/api/health/report', { deviceCode: 'SB-001', elderOpenid: 'mock_elder_001', heartRate: 75, bloodPressure: '120/80', battery: 66 });
  log('health/report（正常心率上报）', repNormal);
  assert(
    'health/report（正常值不触发告警）',
    !!(repNormal.data && repNormal.data.triggered && repNormal.data.triggered.length === 0),
    { triggered: repNormal.data && repNormal.data.triggered && repNormal.data.triggered.length }
  );

  const repHigh = await post('/api/health/report', { deviceCode: 'SB-001', elderOpenid: 'mock_elder_001', heartRate: 125 });
  log('health/report（心率 125 上报）', repHigh);
  assert(
    'health/report（触发 rule_engine 告警：HR_HIGH_SINGLE，source 正确）',
    !!(repHigh.data && repHigh.data.triggered && repHigh.data.triggered.length > 0 &&
      repHigh.data.triggered[0].source === 'rule_engine' && repHigh.data.triggered[0].ruleId === 'HR_HIGH_SINGLE'),
    { ruleId: repHigh.data && repHigh.data.triggered[0] && repHigh.data.triggered[0].ruleId }
  );

  const repDup = await post('/api/health/report', { deviceCode: 'SB-001', elderOpenid: 'mock_elder_001', heartRate: 125 });
  log('health/report（5 分钟内同规则重复上报）', repDup);
  assert(
    'health/report（同规则 5 分钟去抖，不重复告警）',
    !!(repDup.data && repDup.data.triggered && repDup.data.triggered.length === 0),
    { triggered: repDup.data && repDup.data.triggered && repDup.data.triggered.length }
  );

  const repBp = await post('/api/health/report', { deviceCode: 'SB-001', elderOpenid: 'mock_elder_001', bloodPressure: '165/100' });
  log('health/report（血压 165/100 上报）', repBp);
  assert(
    'health/report（血压规则触发，与心率规则互不去抖）',
    !!(repBp.data && repBp.data.triggered && repBp.data.triggered.length > 0 && repBp.data.triggered[0].ruleId === 'BP_HIGH'),
    { ruleId: repBp.data && repBp.data.triggered[0] && repBp.data.triggered[0].ruleId }
  );

  log('health/stream（设备最近 20 条数据流）', await get('/api/health/stream?deviceCode=SB-001'));

  const trendRes = await get('/api/health/trend?elderOpenid=mock_elder_001&days=7');
  log('health/trend（7 天按日聚合）', trendRes);
  assert(
    'health/trend（dates=7 天，各聚合数组长度一致）',
    !!(trendRes.data && trendRes.data.dates.length === 7 &&
      trendRes.data.heartRate.avg.length === 7 && trendRes.data.bloodPressure.sys.length === 7 && trendRes.data.spo2.length === 7),
    { dates: trendRes.data && trendRes.data.dates.length }
  );

  // ---- 设备生命周期 ----
  const devListRes = await get('/api/device/list?elderOpenid=mock_elder_001');
  log('device/list（设备列表，上报后应在线）', devListRes);
  assert(
    'device/list（完整 schema + 上报后 online + 电量 66 + 未解绑）',
    !!(devListRes.data && devListRes.data.length === 1 && devListRes.data[0].status === 'online' &&
      devListRes.data[0].battery === 66 && devListRes.data[0].elderOpenid === 'mock_elder_001' && devListRes.data[0].unboundAt === null),
    { status: devListRes.data[0] && devListRes.data[0].status, battery: devListRes.data[0] && devListRes.data[0].battery }
  );

  const devStatusRes = await get('/api/device/status?deviceCode=SB-001');
  log('device/status（单设备快速查询）', devStatusRes);
  assert(
    'device/status（online + battery 66）',
    !!(devStatusRes.data && devStatusRes.data.status === 'online' && devStatusRes.data.battery === 66),
    { status: devStatusRes.data && devStatusRes.data.status }
  );

  log('device/unbind（越权操作应拒绝）', await post('/api/device/unbind', { deviceId: devListRes.data[0].id, operatorOpenid: 'mock_elder_none_001' }), true);
  const devUnbindRes = await post('/api/device/unbind', { deviceId: devListRes.data[0].id, operatorOpenid: 'mock_elder_001' });
  log('device/unbind（老人本人解绑，软删除）', devUnbindRes);
  assert(
    'device/unbind（unboundAt 已写入）',
    !!(devUnbindRes.data && devUnbindRes.data.unboundAt),
    { unboundAt: devUnbindRes.data && devUnbindRes.data.unboundAt }
  );

  const devListAfter = await get('/api/device/list?elderOpenid=mock_elder_001');
  log('device/list（解绑后查询）', devListAfter);
  assert(
    'device/list（软删除后不再显示）',
    !!(devListAfter.data && devListAfter.data.length === 0),
    { count: devListAfter.data && devListAfter.data.length }
  );

  log('relationship/create（重复建立幂等返回已有记录）', await post('/api/relationship/create', { familyOpenid: 'mock_family_001', elderOpenid: 'mock_elder_001' }));

  // ---- 告警闭环（依赖邀请码建立的监护关系）：状态机全路径 + 时间线 ----
  const alertRes = await post('/api/alert/create', { openid: 'mock_elder_001' });
  log('alert/create（老人一键求助，含初始时间线）', alertRes);
  assert(
    'alert/create（timeline 首条 open/elder 记录）',
    !!(alertRes.data && Array.isArray(alertRes.data.timeline) && alertRes.data.timeline.length === 1 && alertRes.data.timeline[0].status === 'open'),
    { timelineLen: alertRes.data && alertRes.data.timeline && alertRes.data.timeline.length }
  );
  const alertId = alertRes.data && alertRes.data.id;

  if (alertId) {
    // 完整路径：open → acknowledged → escalated → external_dispatched → resolved
    const ackRes = await post('/api/alert/update', { alertId, status: 'acknowledged', note: '家属确认，马上处理', operator: 'mock_family_001' });
    log('alert/update（确认接单 open→acknowledged，带备注/操作人）', ackRes);
    assert(
      'alert/update（acknowledged：timeline 追加、currentHandler=family）',
      !!(ackRes.data && ackRes.data.timeline.length === 2 && ackRes.data.currentHandler === 'family'),
      { timelineLen: ackRes.data && ackRes.data.timeline.length, handler: ackRes.data && ackRes.data.currentHandler }
    );

    log('alert/update（转社区 acknowledged→escalated，带备注）', await post('/api/alert/update', { alertId, status: 'escalated', note: '联系了社区养老服务中心', operator: 'mock_family_001' }));
    log('alert/update（社区派单 escalated→external_dispatched）', await post('/api/alert/update', { alertId, status: 'external_dispatched', operator: 'community_001' }));
    const resolvedRes = await post('/api/alert/update', { alertId, status: 'resolved', note: '老人已平安，事件关闭', operator: 'community_001' });
    log('alert/update（最终解决 external_dispatched→resolved）', resolvedRes);
    assert(
      'alert/update（resolved：resolvedNote 已写入、timeline 共 5 条）',
      !!(resolvedRes.data && resolvedRes.data.resolvedNote === '老人已平安，事件关闭' && resolvedRes.data.timeline.length === 5),
      { resolvedNote: resolvedRes.data && resolvedRes.data.resolvedNote, timelineLen: resolvedRes.data && resolvedRes.data.timeline.length }
    );

    const detailRes = await get(`/api/alert/detail?id=${alertId}`);
    log('alert/detail（完整时间线）', detailRes);
    assert(
      'alert/detail（返回完整 timeline 5 条，含备注）',
      !!(detailRes.data && detailRes.data.timeline && detailRes.data.timeline.length === 5 && detailRes.data.timeline.every((t) => t.at && t.operator)),
      { timelineLen: detailRes.data && detailRes.data.timeline && detailRes.data.timeline.length }
    );

    log('alert/update（越序 resolved→acknowledged 应拒绝）', await post('/api/alert/update', { alertId, status: 'acknowledged' }), true);

    // 家属自行处理路径 acknowledged→resolved，以及 open 阶段越序转社区应拒绝
    const alert2Res = await post('/api/alert/create', { openid: 'mock_elder_001' });
    log('alert/create（第二条告警：家属自行处理路径）', alert2Res);
    const alertId2 = alert2Res.data && alert2Res.data.id;
    log('alert/update（越序 open→escalated 应拒绝）', await post('/api/alert/update', { alertId: alertId2, status: 'escalated' }), true);
    log('alert/update（确认接单 open→acknowledged）', await post('/api/alert/update', { alertId: alertId2, status: 'acknowledged', operator: 'mock_family_001' }));
    log('alert/update（家属自行处理 acknowledged→resolved）', await post('/api/alert/update', { alertId: alertId2, status: 'resolved', note: '虚惊一场', operator: 'mock_family_001' }));
  }

  const alertListRes = await get('/api/alert/list?familyOpenid=mock_family_001');
  log('alert/list（家属查告警，含 timeline 摘要）', alertListRes);
  assert(
    'alert/list（关系生效，家属可见 ≥2 条告警）',
    !!(alertListRes.data && alertListRes.data.length >= 2),
    { count: alertListRes.data && alertListRes.data.length }
  );
  assert(
    'alert/list（timeline 为最近 3 条摘要）',
    !!(alertListRes.data && alertListRes.data[0] && Array.isArray(alertListRes.data[0].timeline) && alertListRes.data[0].timeline.length <= 3),
    { timelineLen: alertListRes.data && alertListRes.data[0] && alertListRes.data[0].timeline && alertListRes.data[0].timeline.length }
  );

  // ---- 服务预约 ----
  log('appointment/create（预约社区医护）', await post('/api/appointment/create', { openid: 'mock_family_001', type: '社区医护', detail: '上门测血压' }));
  log('appointment/list（查预约）', await get('/api/appointment/list?openid=mock_family_001'));

  // ---- AI 健康报告 ----
  log('health/mock/batch（连续 7 天演示数据）', await post('/api/health/mock/batch', { openid: 'mock_elder_001' }));

  const genRes = await post('/api/report/generate', { openid: 'mock_elder_001' });
  log('report/generate（规则生成报告）', genRes);
  assert(
    'report/generate（含摘要/建议/数据质量/免责声明）',
    !!genRes.data && !!genRes.data.summary && Array.isArray(genRes.data.advice) && !!genRes.data.dataQuality && !!genRes.data.disclaimer,
    { adviceCount: genRes.data && genRes.data.advice && genRes.data.advice.length, quality: genRes.data && genRes.data.dataQuality && genRes.data.dataQuality.status }
  );

  const repListRes = await get('/api/report/list?openid=mock_elder_001');
  log('report/list（最近 5 份摘要）', repListRes);
  const repId = genRes.data && genRes.data.id;
  if (repId) log('report/detail（按 id 查详情）', await get(`/api/report/detail?id=${repId}`));

  const familyGen = await post('/api/report/generate', { openid: 'mock_family_001' });
  assert(
    'report/generate（家属 openid 自动解析到关联老人）',
    !!(familyGen.code === 0 && familyGen.data && familyGen.data.elderOpenid === 'mock_elder_001'),
    { elderOpenid: familyGen.data && familyGen.data.elderOpenid }
  );

  const emptyGen = await post('/api/report/generate', { openid: 'mock_elder_none_001' });
  assert(
    'report/generate（近 7 天无数据 → insufficient 报告而非报错）',
    !!(emptyGen.code === 0 && emptyGen.data && emptyGen.data.dataQuality && emptyGen.data.dataQuality.status === 'insufficient'),
    { quality: emptyGen.data && emptyGen.data.dataQuality && emptyGen.data.dataQuality.status }
  );

  // ---- 关系解绑（撤销授权）+ 级联设备软删除 ----
  const rel2Res = await post('/api/relationship/create', { familyOpenid: 'mock_family_002', elderOpenid: 'mock_elder_001' });
  log('relationship/create（第二条关系，供解绑测试）', rel2Res);
  const rel2Id = rel2Res.data && rel2Res.data.id;

  log('bindDevice（family_002 绑定设备 SB-006，验证级联用）', await post('/api/bindDevice', { openid: 'mock_family_002', deviceCode: 'SB-006' }));

  log('relationship/unbind（越权操作应拒绝）', await post('/api/relationship/unbind', { relationshipId: rel2Id, operatorOpenid: 'mock_elder_none_001' }), true);

  const relUnbindRes = await post('/api/relationship/unbind', { relationshipId: rel2Id, operatorOpenid: 'mock_family_002' });
  log('relationship/unbind（family_002 撤销授权，软删除）', relUnbindRes);
  assert(
    'relationship/unbind（unboundAt 已写入）',
    !!(relUnbindRes.data && relUnbindRes.data.unboundAt),
    { unboundAt: relUnbindRes.data && relUnbindRes.data.unboundAt }
  );

  const relListAfter = await get('/api/relationship/list?openid=mock_family_002&role=family');
  log('relationship/list（解绑后查询）', relListAfter);
  assert(
    'relationship/list（解绑后不再返回该关系）',
    !!(relListAfter.data && relListAfter.data.length === 0),
    { count: relListAfter.data && relListAfter.data.length }
  );

  const devCascadeRes = await get('/api/device/list?elderOpenid=mock_elder_001');
  log('device/list（级联解绑后查询）', devCascadeRes);
  assert(
    'relationship/unbind（级联软删除该老人全部设备）',
    !!(devCascadeRes.data && devCascadeRes.data.length === 0),
    { count: devCascadeRes.data && devCascadeRes.data.length }
  );

  // ---- 家属端轮询：check-new 新告警检测 ----
  const checkAllRes = await get('/api/alert/check-new?familyOpenid=mock_family_001&lastCheckTime=0');
  log('alert/check-new（首次传 0，统计全部未处理）', checkAllRes);
  assert(
    'alert/check-new（首次 0：hasNew、count ≥1、latest 结构完整）',
    !!(checkAllRes.data && checkAllRes.data.hasNew && checkAllRes.data.count >= 1 &&
      checkAllRes.data.latest && checkAllRes.data.latest.id && checkAllRes.data.latest.createdAt),
    { count: checkAllRes.data && checkAllRes.data.count }
  );

  const freshCheckAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 20)); // 确保新告警 createdAt 严格大于 lastCheckTime
  const freshAlertRes = await post('/api/alert/create', { openid: 'mock_elder_001' });
  log('alert/create（轮询测试用新告警）', freshAlertRes);
  const freshAlertId = freshAlertRes.data && freshAlertRes.data.id;

  const checkNewRes = await get(`/api/alert/check-new?familyOpenid=mock_family_001&lastCheckTime=${freshCheckAt}`);
  log('alert/check-new（lastCheckTime=新告警产生前）', checkNewRes);
  assert(
    'alert/check-new（只返回新产生的告警：count=1 且 id 匹配）',
    !!(checkNewRes.data && checkNewRes.data.hasNew && checkNewRes.data.count === 1 && checkNewRes.data.latest.id === freshAlertId),
    { count: checkNewRes.data && checkNewRes.data.count }
  );

  log('alert/update（接单后验证不再推送）', await post('/api/alert/update', { alertId: freshAlertId, status: 'acknowledged', note: '已响应', operator: 'mock_family_001' }));
  const checkHandledRes = await get(`/api/alert/check-new?familyOpenid=mock_family_001&lastCheckTime=${freshCheckAt}`);
  log('alert/check-new（告警被接单后再查）', checkHandledRes);
  assert(
    'alert/check-new（已处理告警不返回：hasNew=false）',
    !!(checkHandledRes.data && checkHandledRes.data.hasNew === false && checkHandledRes.data.count === 0),
    { count: checkHandledRes.data && checkHandledRes.data.count }
  );

  const checkNowRes = await get(`/api/alert/check-new?familyOpenid=mock_family_001&lastCheckTime=${Date.now()}`);
  log('alert/check-new（lastCheckTime=当前时刻）', checkNowRes);
  assert(
    'alert/check-new（无新告警时 hasNew=false）',
    !!(checkNowRes.data && checkNowRes.data.hasNew === false),
    { count: checkNowRes.data && checkNowRes.data.count }
  );

  // ---- Batch 9：真实登录 / 鉴权 ----
  // 后端模式探测：受保护接口在真实模式下未带 token 会返回 401
  const modeProbe = await get('/api/health?openid=mock_elder_001');
  const backendMock = !(modeProbe.code === -1 && String(modeProbe.msg).indexOf('登录') >= 0);
  log('auth/mode（后端鉴权探测）', modeProbe);
  results.push({
    label: 'auth/mode（后端为 ' + (backendMock ? 'MOCK_MODE=true，鉴权放行——演示模式' : 'MOCK_MODE=false，鉴权开启') + '）',
    pass: true
  });

  // 真实登录：code 为模拟值——仅在 .env 完整配置且拿到真实 code 时才会 code=0；
  // 未配置 appsecret 时后端返回明确错误 → 按约定标注 SKIP（不计失败）
  const authLoginRes = await post('/api/auth/login', { code: 'smoke-test-code' });
  if (authLoginRes.code === 0) {
    log('auth/login（真实登录成功）', authLoginRes);
    assert(
      'auth/login（返回 token/openid/role，且不下发 session_key）',
      !!(authLoginRes.data && authLoginRes.data.token && authLoginRes.data.openid && authLoginRes.data.session_key === undefined),
      { openid: authLoginRes.data && authLoginRes.data.openid }
    );

    const checkOk = await post('/api/auth/check', { token: authLoginRes.data.token });
    log('auth/check（有效 token）', checkOk);
    assert(
      'auth/check（valid=true 且 openid 匹配）',
      !!(checkOk.data && checkOk.data.valid && checkOk.data.openid === authLoginRes.data.openid),
      checkOk.data
    );

    const checkBad = await post('/api/auth/check', { token: 'forged-token' });
    log('auth/check（伪造 token）', checkBad);
    assert(
      'auth/check（伪造 token → valid=false）',
      !!(checkBad.data && checkBad.data.valid === false),
      checkBad.data
    );
  } else {
    console.log('SKIP  auth/login：' + authLoginRes.msg + '（.env 未配置完整 appsecret 或非真实 code，按约定跳过）');
    results.push({ label: 'auth/login（SKIP：.env 未配置完整 appsecret 或非真实 code）', pass: true });
  }


  // ---- Batch 11 · F1 用药提醒 ----
  const rmCreate = await post('/api/reminder/create', { elderOpenid: 'mock_elder_001', title: '晨间服药提醒', time: '08:00', note: '遵医嘱' });
  log('reminder/create（创建提醒）', rmCreate);
  assert(
    'reminder/create（标题与 HH:MM 时间写入）',
    !!(rmCreate.data && rmCreate.data.time === '08:00' && rmCreate.data.title === '晨间服药提醒'),
    rmCreate.data
  );
  const rmList = await get('/api/reminder/list?elderOpenid=mock_elder_001');
  log('reminder/list（提醒列表）', rmList);
  assert(
    'reminder/list（包含新创建提醒）',
    !!(rmList.data && rmList.data.some((r) => r.title === '晨间服药提醒')),
    { count: rmList.data && rmList.data.length }
  );
  log('reminder/create（非法时间 25:99 应拒绝）', await post('/api/reminder/create', { elderOpenid: 'mock_elder_001', title: '坏时间', time: '25:99' }), true);
  const rmDelId = rmCreate.data && rmCreate.data.id;
  if (rmDelId) {
    const rmDel = await post('/api/reminder/delete', { id: rmDelId });
    log('reminder/delete（删除提醒）', rmDel);
    const rmAfter = await get('/api/reminder/list?elderOpenid=mock_elder_001');
    assert('reminder/delete（删除后列表不含该提醒）', !!(rmAfter.data && !rmAfter.data.some((r) => r.id === rmDelId)), { count: rmAfter.data && rmAfter.data.length });
  }


  // ---- Batch 11 · F2 家人留言墙 ----
  const msgPost = await post('/api/message/create', { fromOpenid: 'mock_family_001', toOpenid: 'mock_elder_001', text: '爷爷降温了记得添衣（smoke）' });
  log('message/create（家属发布留言）', msgPost);
  assert(
    'message/create（写入并补全 fromName）',
    !!(msgPost.data && msgPost.data.text === '爷爷降温了记得添衣（smoke）' && msgPost.data.fromName === '小王'),
    msgPost.data
  );
  const msgList = await get('/api/message/list?elderOpenid=mock_elder_001');
  log('message/list（留言墙倒序）', msgList);
  assert(
    'message/list（最新留言在最前且带昵称）',
    !!(msgList.data && msgList.data.length >= 1 && msgList.data[0].fromName && msgList.data[0].createdAt >= msgList.data[msgList.data.length - 1].createdAt),
    { count: msgList.data && msgList.data.length }
  );
  log('message/create（空内容应拒绝）', await post('/api/message/create', { fromOpenid: 'mock_family_001', toOpenid: 'mock_elder_001', text: '   ' }), true);


  // ---- Batch 11 · F3 紧急联系人 ----
  const ctCreate = await post('/api/contact/create', { elderOpenid: 'mock_elder_001', name: '小王（子女）', phone: '13800000001', relation: '子女' });
  log('contact/create（添加联系人）', ctCreate);
  assert(
    'contact/create（姓名/电话/关系写入）',
    !!(ctCreate.data && ctCreate.data.name === '小王（子女）' && ctCreate.data.phone === '13800000001' && ctCreate.data.relation === '子女'),
    ctCreate.data
  );
  const ctList = await get('/api/contact/list?elderOpenid=mock_elder_001');
  log('contact/list（联系人列表）', ctList);
  assert(
    'contact/list（包含新添加联系人）',
    !!(ctList.data && ctList.data.some((c) => c.name === '小王（子女）')),
    { count: ctList.data && ctList.data.length }
  );
  log('contact/create（非法电话应拒绝）', await post('/api/contact/create', { elderOpenid: 'mock_elder_001', name: '坏号码', phone: 'abc' }), true);
  const ctDelId = ctCreate.data && ctCreate.data.id;
  if (ctDelId) {
    const ctDel = await post('/api/contact/delete', { id: ctDelId });
    log('contact/delete（删除联系人）', ctDel);
    const ctAfter = await get('/api/contact/list?elderOpenid=mock_elder_001');
    assert('contact/delete（删除后列表不含该联系人）', !!(ctAfter.data && !ctAfter.data.some((c) => c.id === ctDelId)), { count: ctAfter.data && ctAfter.data.length });
  }

  log('unknown api（未知接口应返回错误）', await get('/api/not-exist'), true);

  // ---- Batch 12 · G5 深度闭环（已服用打卡 / 留言已读 / 联系人分组）----
  const takenCreate = await post('/api/reminder/create', { elderOpenid: 'mock_elder_001', title: 'G5打卡用提醒', time: '21:30' });
  log('G5 前置：创建临时提醒', takenCreate);
  const takenId = takenCreate.data && takenCreate.data.id;
  let takenList = await get('/api/reminder/list?elderOpenid=mock_elder_001');
  assert('G5-1 初始 takenToday=false', !!(takenId && takenList.data.some((r) => r.id === takenId && !r.takenToday)), { takenId });
  const takenRes = await post('/api/reminder/taken', { id: takenId });
  log('reminder/taken（已服用打卡）', takenRes);
  takenList = await get('/api/reminder/list?elderOpenid=mock_elder_001');
  assert('G5-1 打卡后 takenToday=true', !!(takenList.data.some((r) => r.id === takenId && r.takenToday)), { takenId });
  if (takenId) await post('/api/reminder/delete', { id: takenId });

  const unreadBefore = await get('/api/message/list?elderOpenid=mock_elder_001');
  const unreadCount = unreadBefore.data.filter((m) => !m.readAt).length;
  log('message/list（mark-read 前未读数）', { code: 0, data: { unread: unreadCount } });
  const markRes = await post('/api/message/mark-read', { elderOpenid: 'mock_elder_001' });
  log('message/mark-read（全部标记已读）', markRes);
  const unreadAfter = await get('/api/message/list?elderOpenid=mock_elder_001');
  assert('G5-2 mark-read 后未读清零且留言带已读标记', !!(markRes.data && unreadAfter.data.length > 0 && unreadAfter.data.every((m) => m.readAt)), { marked: markRes.data && markRes.data.marked });

  const ctFam = await post('/api/contact/create', { elderOpenid: 'mock_elder_001', name: 'G5家人', phone: '13800000009', group: '家人' });
  log('contact/create（G5 分组联系人）', ctFam);
  const ctListG = await get('/api/contact/list?elderOpenid=mock_elder_001');
  const firstGroup = ctListG.data[0] && ctListG.data[0].group;
  assert('G5-3 联系人按分组排序（家人优先）且均带 group', !!(ctListG.data.length >= 2 && firstGroup === '家人' && ctListG.data.every((c) => c.group)), { first: firstGroup, count: ctListG.data.length });
  const ctG5Id = ctFam.data && ctFam.data.id;
  if (ctG5Id) await post('/api/contact/delete', { id: ctG5Id });

  // ---- Batch 13 · P1 打字聊天（三级降级）----
  const chatRes = await post('/api/chat', { openid: 'mock_elder_001', role: 'elder', message: '你好' });
  log('chat（问候对话）', chatRes);
  assert(
    'chat（回复非空且 source 合法）',
    !!(chatRes.data && chatRes.data.reply && ['spark','local','fallback'].indexOf(chatRes.data.source) >= 0),
    { source: chatRes.data && chatRes.data.source }
  );
  const unwellRes = await post('/api/chat', { openid: 'mock_elder_001', role: 'elder', message: '我有点头疼' });
  log('chat（身体不适 → 引导就医，禁止诊断/用药）', unwellRes);
  assert(
    'chat（不适话题引导联系家人或就医）',
    !!(unwellRes.data && /就医|医院|联系家人|家人/.test(unwellRes.data.reply)),
    { reply: unwellRes.data && unwellRes.data.reply }
  );
  ['诊断', '用药', '处方'].forEach((w) => { if (unwellRes.data.reply.indexOf(w) >= 0) { assert('chat 医疗红线', false, { text: unwellRes.data.reply }); } });
  log('chat（空消息应拒绝）', await post('/api/chat', { openid: 'mock_elder_001', message: '   ' }), true);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed} 项，失败 ${failed} 项`);
  process.exitCode = failed > 0 ? 1 : 0;



})();

