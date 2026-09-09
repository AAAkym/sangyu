// 隐私政策（MVP 静态页）：数据收集范围 / 用途 / 存储 / 用户权利 / 联系方式
// 底部勾选「我已阅读并同意」后写入 Storage 并返回
Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    agreed: false,
    alreadyAgreed: false
  },

  onLoad() {
    this.setData({ alreadyAgreed: !!wx.getStorageSync('privacyAgreed') });
  },

  onCheckboxTap() {
    this.setData({ agreed: !this.data.agreed });
  },

  onConfirmTap() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选「我已阅读并同意」', icon: 'none' });
      return;
    }
    wx.setStorageSync('privacyAgreed', true);
    wx.showToast({ title: '已记录您的同意', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  }
});
