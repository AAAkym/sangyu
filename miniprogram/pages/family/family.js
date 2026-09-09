const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');
const healthStatus = require('../../utils/healthStatus');

// 相对时间展示："3分钟前"（面板"更新于"与状态卡"最后同步"用）
function relativeTime(iso) {
  if (!iso) return '刚刚';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

// 面板空态（无数据显示 "—" + 灰色，绝不回退写死数值）
const emptyState = () => ({ key: 'none', text: '暂无数据', color: '#8A7A5C', soft: '#F5EFE2' });

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    deviceTag: null,
    // 老人状态卡（昵称来自监护关系 elderName；同步时间来自最新健康记录）
    elderName: '老人',
    elderAge: '',
    syncText: '刚刚',
    // 今日健康监测面板（真实数据；无数据显示 "—"）
    panelHint: '今日暂无数据',
    hrText: '—',
    hrState: emptyState(),
    hrChip: 'flat',
    hrFlag: '',
    bpText: '—',
    bpState: emptyState(),
    bpChip: 'flat',
    spo2Text: '—',
    spo2State: emptyState(),
    spo2Chip: 'flat',
    // 待处理预警数（>0 时显示预警横幅）
    pendingCount: 0
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setSelected(0);
    this.fetchElderProfile();
    this.fetchDeviceTag();
    this.fetchHealthPanel();
    this.fetchPendingAlerts();
  },

  // 老人状态卡：昵称走监护关系 elderName（users.nickname）
  async fetchElderProfile() {
    try {
      const relations = await request(
        '/api/relationship/list',
        'GET',
        { openid: MOCK_OPENIDS.family, role: 'family' },
        { silent: true }
      );
      if (relations && relations.length) {
        this.setData({ elderName: relations[0].elderName || '老人' });
      }
    } catch (err) {
      // 静默失败：保留默认称呼
    }
  },

  // 顶部设备状态小标签（点击进设备管理页）
  async fetchDeviceTag() {
    try {
      const devices = await request('/api/device/list', 'GET', { elderOpenid: MOCK_OPENIDS.elder });
      const online = devices.filter((d) => d.status === 'online').length;
      let deviceTag = null;
      if (!devices.length) deviceTag = { text: '未绑定设备', color: '#8A7A5C' };
      else if (online > 0) deviceTag = { text: `设备在线 ${online}/${devices.length}`, color: '#2D7A3D' };
      else deviceTag = { text: '设备离线', color: '#8A7A5C' };
      this.setData({ deviceTag });
    } catch (err) {
      this.setData({ deviceTag: null });
    }
  },

  onDeviceTagTap() {
    wx.navigateTo({ url: '/pages/bind-device/bind-device' });
  },

  // 今日健康监测面板：取老人最新一条健康记录；状态判定走 utils/healthStatus（与规则引擎同口径）
  async fetchHealthPanel() {
    const setEmpty = () => {
      this.setData({
        panelHint: '今日暂无数据',
        syncText: '—',
        hrText: '—', hrState: emptyState(), hrChip: 'flat', hrFlag: '',
        bpText: '—', bpState: emptyState(), bpChip: 'flat',
        spo2Text: '—', spo2State: emptyState(), spo2Chip: 'flat'
      });
    };
    try {
      const records = await request('/api/health', 'GET', { openid: MOCK_OPENIDS.elder }, { silent: true });
      const latest = records && records[0];
      if (!latest) {
        setEmpty();
        return;
      }
      const hr = healthStatus.hrStatus(latest.heartRate);
      const bp = healthStatus.bpStatus(latest.bloodPressure);
      const sp = healthStatus.spo2Status(latest.spo2);
      this.setData({
        panelHint: '更新于 ' + relativeTime(latest.createdAt),
        syncText: relativeTime(latest.createdAt),
        hrText: latest.heartRate === null || latest.heartRate === undefined ? '—' : String(latest.heartRate),
        hrState: hr,
        hrChip: hr.chip,
        hrFlag: '',
        bpText: latest.bloodPressure || '—',
        bpState: bp,
        bpChip: bp.chip,
        spo2Text: latest.spo2 === null || latest.spo2 === undefined ? '—' : String(latest.spo2),
        spo2State: sp,
        spo2Chip: sp.chip
      });
    } catch (err) {
      // 静默失败：显示 "—"，不打断演示
      setEmpty();
    }
  },

  // 预警中心横幅：有待处理（status=open）告警才显示，无则不渲染
  async fetchPendingAlerts() {
    try {
      const res = await request(
        '/api/alert/check-new',
        'GET',
        { familyOpenid: MOCK_OPENIDS.family, lastCheckTime: 0 },
        { silent: true }
      );
      this.setData({ pendingCount: res && res.hasNew ? res.count : 0 });
    } catch (err) {
      this.setData({ pendingCount: 0 });
    }
  }
});
