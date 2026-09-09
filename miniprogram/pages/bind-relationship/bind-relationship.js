// 家属端：输入老人 6 位邀请码完成监护关系绑定
// 失败（不存在 / 已使用 / 已过期）由 request 统一 toast 服务端返回的说明
const { request } = require('../../utils/request');
const { getOpenid } = require('../../utils/config');

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    code: '',
    loading: false
  },

  onInput(e) {
    this.setData({ code: e.detail.value });
  },

  async onBindTap() {
    const { code, loading } = this.data;
    if (loading) return;
    if (!code || code.length !== 6) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      await request('/api/invitation/bind', 'POST', { familyOpenid: getOpenid(), code });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ loading: false });
      setTimeout(() => wx.switchTab({ url: '/pages/family/family' }), 600);
    } catch (err) {
      this.setData({ loading: false });
    }
  }
});
