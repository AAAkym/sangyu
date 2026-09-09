// 临时：演示态验证（稳健版，null 安全）
const BASE = 'http://localhost:3000';
const get = (p) => fetch(BASE + p).then((r) => r.json());

(async () => {
  const [rm, msg, ct, hl, al, dv, hz] = await Promise.all([
    get('/api/reminder/list?elderOpenid=mock_elder_001'),
    get('/api/message/list?elderOpenid=mock_elder_001'),
    get('/api/contact/list?elderOpenid=mock_elder_001'),
    get('/api/health?openid=mock_elder_001'),
    get('/api/alert/list?familyOpenid=mock_family_001'),
    get('/api/device/list?elderOpenid=mock_elder_001'),
    get('/healthz')
  ]);
  const latest = hl.data[0] || {};
  const dev = dv.data[0] || {};
  console.log('提醒 ' + rm.data.length + '（已服用 ' + rm.data.filter(r => r.takenToday).length + '）');
  console.log('留言 ' + msg.data.length + '（未读 ' + msg.data.filter(m => !m.readAt).length + '）');
  console.log('联系人 ' + ct.data.length);
  console.log('心率末条 ' + (latest.heartRate === null || latest.heartRate === undefined ? '—' : latest.heartRate));
  console.log('告警 ' + al.data.length + ' 条（' + al.data.map(a => a.status).join('/') + '）');
  console.log('设备 ' + (dev.deviceCode || '无') + ' ' + (dev.status || '—') + ' 电量' + (dev.battery === null || dev.battery === undefined ? '—' : dev.battery));
  console.log('后端 ' + hz.data.status);
})();
