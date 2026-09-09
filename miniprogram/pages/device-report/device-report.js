// 模拟设备上报面板：演示设备 HTTP 通道 + 规则引擎自动告警（联调/演示用）
// elderOpenid 固定用老人 Mock 身份；命中阈值规则时 toast 提示，去抖由服务端控制
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');

const METRICS = ['心率', '血压', '血氧'];

// 快捷演示预设：一键直接上报
const PRESETS = {
  normal75: { heartRate: 75 },
  hr125: { heartRate: 125 },
  bp165: { bloodPressure: '165/100' }
};

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    metrics: METRICS,
    metricIndex: 0,
    value: '',
    deviceCode: 'SB-DEMO',
    loading: false
  },

  onMetricChange(e) {
    this.setData({ metricIndex: Number(e.detail.value) });
  },

  onValueInput(e) {
    this.setData({ value: e.detail.value });
  },

  onDeviceInput(e) {
    this.setData({ deviceCode: e.detail.value });
  },

  onPresetTap(e) {
    const payload = PRESETS[e.currentTarget.dataset.preset];
    if (!payload || this.data.loading) return;
    this.submit(payload);
  },

  async onSubmitTap() {
    const { metrics, metricIndex, value, loading } = this.data;
    if (loading) return;
    if (!value) {
      wx.showToast({ title: '请输入数值', icon: 'none' });
      return;
    }
    const metric = metrics[metricIndex];
    const payload = {};
    if (metric === '心率') payload.heartRate = Number(value);
    else if (metric === '血压') payload.bloodPressure = value;
    else payload.spo2 = Number(value);
    this.submit(payload);
  },

  async submit(payload) {
    this.setData({ loading: true });
    wx.showLoading({ title: '上报中' });
    try {
      const res = await request('/api/health/report', 'POST', {
        deviceCode: this.data.deviceCode,
        elderOpenid: MOCK_OPENIDS.elder,
        ...payload
      });
      wx.hideLoading();
      this.setData({ loading: false, value: '' });
      if (res.triggered && res.triggered.length) {
        wx.showToast({ title: '已触发阈值预警', icon: 'none', duration: 2500 });
      } else {
        wx.showToast({ title: '上报成功', icon: 'success' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  }
});
