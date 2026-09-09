// 设备管理：绑定新设备（展开输入）+ 设备列表（在线状态/电量/最后上报）+ 解绑（二次确认，软删除）
// 数据来自 GET /api/device/list；每次进入重新拉取（实时性后续可用 WebSocket 增强）
const { request } = require('../../utils/request');
const { getOpenid, MOCK_OPENIDS } = require('../../utils/config');

// 相对时间展示："3分钟前"
function relativeTime(iso) {
  if (!iso) return '从未上报';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    devices: [],
    showBindForm: false,
    deviceCode: '',
    binding: false,
    loading: false
  },

  onShow() {
    this.fetchDevices();
  },

  toggleBindForm() {
    this.setData({ showBindForm: !this.data.showBindForm });
  },

  onInput(e) {
    this.setData({ deviceCode: e.detail.value });
  },

  async onBindTap() {
    const { deviceCode, binding } = this.data;
    if (binding) return;
    if (!deviceCode) {
      wx.showToast({ title: '请先输入设备码', icon: 'none' });
      return;
    }
    this.setData({ binding: true });
    try {
      await request('/api/bindDevice', 'POST', { openid: getOpenid(), deviceCode });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ deviceCode: '', binding: false, showBindForm: false });
      this.fetchDevices();
    } catch (err) {
      this.setData({ binding: false });
    }
  },

  async fetchDevices() {
    this.setData({ loading: true });
    try {
      const devices = await request('/api/device/list', 'GET', { elderOpenid: MOCK_OPENIDS.elder });
      this.setData({
        devices: devices.map((d) => ({
          ...d,
          batteryText: d.battery === null || d.battery === undefined ? '—' : `${d.battery}%`,
          batteryLow: d.battery !== null && d.battery !== undefined && d.battery < 20,
          lastReportText: relativeTime(d.lastReportAt)
        })),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  // 解绑：二次确认 → 软删除 → 列表刷新
  onUnbindTap(e) {
    const idx = e.currentTarget.dataset.index;
    const device = this.data.devices[idx];
    if (!device) return;
    wx.showModal({
      title: '解绑设备',
      content: `确定解绑 ${device.deviceCode}？解绑后将停止接收该设备的健康数据。`,
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm) this.submitUnbind(device.id);
      }
    });
  },

  async submitUnbind(deviceId) {
    wx.showLoading({ title: '处理中' });
    try {
      await request('/api/device/unbind', 'POST', { deviceId, operatorOpenid: getOpenid() });
      wx.hideLoading();
      wx.showToast({ title: '已解绑', icon: 'success' });
      this.fetchDevices();
    } catch (err) {
      wx.hideLoading();
    }
  }
});
