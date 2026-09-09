// 用药提醒（日程提醒，非用药指导）：老人端查看提醒列表，家属端添加/删除
// 免责（页面常驻）：本功能仅为日程时间提醒，不涉及任何用药指导；具体用药请遵医嘱
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    role: '',
    list: [],
    loading: false,
    form: { title: '', time: '08:00', note: '' },
    creating: false
  },

  onShow() {
    this.setData({ role: getApp().globalData.role || wx.getStorageSync('role') });
    this.fetchList();
  },

  onTimeChange(e) {
    this.setData({ 'form.time': e.detail.value });
  },

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value });
  },

  async onCreateTap() {
    const { form, creating } = this.data;
    if (creating) return;
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写提醒标题', icon: 'none' });
      return;
    }
    this.setData({ creating: true });
    try {
      await request('/api/reminder/create', 'POST', {
        elderOpenid: MOCK_OPENIDS.elder,
        title: form.title.trim(),
        time: form.time,
        note: form.note
      });
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ form: { title: '', time: '08:00', note: '' }, creating: false });
      this.fetchList();
    } catch (err) {
      this.setData({ creating: false });
    }
  },

  onDeleteTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除提醒',
      content: '确定删除该条提醒吗？',
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm) this.submitDelete(id);
      }
    });
  },

  // 老人端"已服用"打卡：写入 lastTakenAt（按天判定，家属端可见）
  onTakenTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '已服用确认',
      content: '确认已按计划服用并打卡？（仅为日程打卡，具体用药请遵医嘱）',
      success: (res) => {
        if (!res.confirm) return;
        request('/api/reminder/taken', 'POST', { id })
          .then(() => {
            wx.showToast({ title: '已打卡', icon: 'success' });
            this.fetchList();
          })
          .catch(() => {});
      }
    });
  },

  async submitDelete(id) {
    try {
      await request('/api/reminder/delete', 'POST', { id });
      wx.showToast({ title: '已删除', icon: 'success' });
      this.fetchList();
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  async fetchList() {
    this.setData({ loading: true });
    try {
      const list = await request('/api/reminder/list', 'GET', { elderOpenid: MOCK_OPENIDS.elder });
      this.setData({ list, loading: false });
    } catch (err) {
      this.setData({ loading: false });
    }
  }
});
