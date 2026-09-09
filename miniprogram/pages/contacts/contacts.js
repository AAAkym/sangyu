// 紧急联系人（老人端一键拨号 / 家属端维护；仅拨号入口，不提供急救指导）
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    role: '',
    list: [],
    loading: false,
    form: { name: '', phone: '', relation: '', group: '其他' },
    groups: ['家人', '社区', '其他'],
    groupIndex: 2,
    creating: false
  },

  onShow() {
    this.setData({ role: getApp().globalData.role || wx.getStorageSync('role') });
    this.fetchList();
  },

  onGroupChange(e) {
    const groupIndex = Number(e.detail.value);
    this.setData({ groupIndex, 'form.group': this.data.groups[groupIndex] });
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onPhoneInput(e) {
    this.setData({ 'form.phone': e.detail.value });
  },

  onRelationInput(e) {
    this.setData({ 'form.relation': e.detail.value });
  },

  async onCreateTap() {
    const { form, creating } = this.data;
    if (creating) return;
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写联系人姓名', icon: 'none' });
      return;
    }
    if (!/^[0-9+\-]{5,20}$/.test(form.phone.trim())) {
      wx.showToast({ title: '电话格式不正确', icon: 'none' });
      return;
    }
    this.setData({ creating: true });
    try {
      await request('/api/contact/create', 'POST', {
        elderOpenid: MOCK_OPENIDS.elder,
        name: form.name.trim(),
        phone: form.phone.trim(),
        relation: form.relation.trim(),
        group: form.group
      });
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ form: { name: '', phone: '', relation: '' }, creating: false });
      this.fetchList();
    } catch (err) {
      this.setData({ creating: false });
    }
  },

  onDeleteTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除联系人',
      content: '确定删除该联系人吗？',
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm) this.submitDelete(id);
      }
    });
  },

  async submitDelete(id) {
    try {
      await request('/api/contact/delete', 'POST', { id });
      wx.showToast({ title: '已删除', icon: 'success' });
      this.fetchList();
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  // 老人端拨号：二次确认后唤起系统拨号（仅入口，无急救指导）
  onDialTap(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.list[idx];
    if (!item) return;
    wx.showModal({
      title: '呼叫 ' + item.name,
      content: '即将拨打电话 ' + item.phone,
      confirmText: '拨打',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: item.phone,
            fail: () => {}
          });
        }
      }
    });
  },

  async fetchList() {
    this.setData({ loading: true });
    try {
      const list = await request('/api/contact/list', 'GET', { elderOpenid: MOCK_OPENIDS.elder });
      this.setData({ list, loading: false });
    } catch (err) {
      this.setData({ loading: false });
    }
  }
});
