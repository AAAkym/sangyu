// 老人端：生成 6 位邀请码给家属绑定（有效期 10 分钟，倒计时展示，过期可重新生成）
// 页面以服务端 /api/invitation/status 为准：再次进入时恢复当前有效邀请码
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');

const pad = (n) => (n < 10 ? '0' + n : '' + n);

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    code: '',
    remainingText: '',
    expired: false,
    generating: false
  },

  onShow() {
    this.refreshStatus();
  },

  onHide() {
    this.clearTimer();
  },

  onUnload() {
    this.clearTimer();
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  async refreshStatus() {
    try {
      const status = await request('/api/invitation/status', 'GET', { openid: MOCK_OPENIDS.elder });
      if (status.hasActive) {
        this.startCountdown(status.code, status.expiresAt);
      } else {
        this.setData({ code: '', expired: false, remainingText: '' });
      }
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  async onGenerateTap() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    wx.showLoading({ title: '生成中' });
    try {
      const record = await request('/api/invitation/generate', 'POST', { openid: MOCK_OPENIDS.elder });
      wx.hideLoading();
      this.setData({ generating: false });
      this.startCountdown(record.code, record.expiresAt);
    } catch (err) {
      wx.hideLoading();
      this.setData({ generating: false });
    }
  },

  startCountdown(code, expiresAt) {
    this.clearTimer();
    this.setData({ code, expired: false });
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      this.setData({ remainingText: `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}` });
      if (remaining <= 0) {
        this.clearTimer();
        this.setData({ code: '', expired: true, remainingText: '' });
      }
    };
    tick();
    this.timer = setInterval(tick, 1000);
  }
});
