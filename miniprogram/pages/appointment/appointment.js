// 服务预约：社区医护 / 志愿者陪伴 / 复诊，表单 + 我的预约列表
const { request } = require('../../utils/request');
const { getOpenid } = require('../../utils/config');

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    types: ['社区医护', '志愿者陪伴', '复诊'],
    typeIndex: 0,
    detail: '',
    list: [],
    creating: false,
    loading: false
  },

  onShow() {
    this.fetchList();
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
  },

  onDetailInput(e) {
    this.setData({ detail: e.detail.value });
  },

  async onCreateTap() {
    const { types, typeIndex, detail, creating } = this.data;
    if (creating) return;
    this.setData({ creating: true });
    try {
      await request('/api/appointment/create', 'POST', {
        openid: getOpenid(),
        type: types[typeIndex],
        detail
      });
      wx.showToast({ title: '预约成功', icon: 'success' });
      this.setData({ detail: '', creating: false });
      this.fetchList();
    } catch (err) {
      this.setData({ creating: false });
    }
  },

  async fetchList() {
    this.setData({ loading: true });
    try {
      const list = await request('/api/appointment/list', 'GET', { openid: getOpenid() });
      this.setData({
        list: list.map((a) => {
          const status = a.status || '待处理';
          return {
            ...a,
            statusText: status,
            statusKey: status === '已完成' ? 'done' : 'pending',
            timeText: new Date(a.createdAt).toLocaleString()
          };
        }),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  }
});
