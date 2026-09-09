// 家人留言墙（家属发布 → 老人端展示；家属可查看自己发过的留言）
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    role: '',
    nickName: '',
    list: [],
    text: '',
    posting: false,
    loading: false
  },

  onShow() {
    this.setData({
      role: getApp().globalData.role || wx.getStorageSync('role'),
      nickName: wx.getStorageSync('nickname') || ''
    });
    if (this.data.role === 'elder') {
      // 老人打开留言墙即全部已读（先标记再拉取，家属端可见"已读"）
      request('/api/message/mark-read', 'POST', { elderOpenid: MOCK_OPENIDS.elder }, { silent: true })
        .catch(() => {})
        .then(() => this.fetchList());
    } else {
      this.fetchList();
    }
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value });
  },

  async onPostTap() {
    const { text, posting, role } = this.data;
    if (posting) return;
    if (!text.trim()) {
      wx.showToast({ title: '写点什么再发布吧', icon: 'none' });
      return;
    }
    this.setData({ posting: true });
    try {
      await request('/api/message/create', 'POST', {
        fromOpenid: MOCK_OPENIDS.family,
        toOpenid: MOCK_OPENIDS.elder,
        text: text.trim()
      });
      wx.showToast({ title: '留言已送达', icon: 'success' });
      this.setData({ text: '', posting: false });
      this.fetchList();
    } catch (err) {
      this.setData({ posting: false });
    }
  },

  async fetchList() {
    this.setData({ loading: true });
    try {
      const list = await request('/api/message/list', 'GET', { elderOpenid: MOCK_OPENIDS.elder });
      this.setData({
        list: list.map((m) => ({
          ...m,
          read: !!m.readAt,
          timeText: new Date(m.createdAt).toLocaleString()
        })),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  }
});
