// 老人端首页：一键求助（按住 1 秒 + 松开确认，防误触）+ 语音播报 + 最少入口
const { request } = require('../../utils/request');
const { speak } = require('../../utils/voice');
const { MOCK_OPENIDS } = require('../../utils/config');

// 就绪提示音频：云存储/本地文件就绪后填入路径（如 '/assets/audio/ready.mp3'）即可生效
// 计划: 后续替换为语音文件；为空时用弹窗文字代替语音播报
const INTRO_AUDIO_SRC = '';

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    greeting: '上午好',
    nickName: '长辈',
    greetDate: '',
    nextAppt: null,
    unreadMsg: 0,
    sosPressing: false,
    sosReady: false,
    sosHint: '',
    deviceTag: null
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setSelected(0);
    this.refreshGreeting();
    this.fetchDeviceTag();
    this.fetchNextAppointment();
    this.fetchUnreadMessages();
  },

  // 家人留言未读数（留言墙卡片提示；打开留言页后自动已读）
  async fetchUnreadMessages() {
    try {
      const list = await request('/api/message/list', 'GET', { elderOpenid: MOCK_OPENIDS.elder }, { silent: true });
      this.setData({ unreadMsg: (list || []).filter((m) => !m.readAt).length });
    } catch (err) {
      this.setData({ unreadMsg: 0 });
    }
  },

  // 下次陪伴卡：取老人名下最近的待处理预约（demo:reset 播种；无则显示暂无安排）
  async fetchNextAppointment() {
    try {
      const list = await request('/api/appointment/list', 'GET', { openid: MOCK_OPENIDS.elder }, { silent: true });
      const next = (list || []).find((a) => a.status !== '已完成') || null;
      this.setData({
        nextAppt: next
          ? { type: next.type, detail: next.detail || '详情见预约页' }
          : null
      });
    } catch (err) {
      this.setData({ nextAppt: null });
    }
  },

  // 问候语与日期：按时段问候 + 真实日期 + 昵称（登录时写入 Storage）
  refreshGreeting() {
    const now = new Date();
    const h = now.getHours();
    const greeting = h < 12 ? '上午好' : h < 18 ? '下午好' : '晚上好';
    const nickName = wx.getStorageSync('nickname') || '长辈';
    const greetDate = `${now.getMonth() + 1}月${now.getDate()}日 · 星期${'日一二三四五六'[now.getDay()]}`;
    this.setData({ greeting, nickName, greetDate });
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

  // 设置入口：mine 是 tabBar 页，须用 switchTab 跳转（老人端唯一退出/切身份入口）
  onSettingsTap() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  onHide() {
    this.resetPress();
  },

  onUnload() {
    // 清理：按住计时器 + 音频实例
    this.resetPress();
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
  },

  resetPress() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.data.sosPressing) {
      this.setData({ sosPressing: false, sosReady: false, sosHint: '' });
    }
  },

  // ---- 一键求助：按住 1 秒 + 松开确认（防误触） ----

  onSOSStart() {
    if (this.data.sosPressing) return;
    this.sosStartTime = Date.now();
    this.setData({ sosPressing: true, sosReady: false, sosHint: '按住确认求助...' });
    // 按满 1 秒后提示可以松手；onSOSEnd / onHide / onUnload 时清除
    this.holdTimer = setTimeout(() => {
      this.setData({ sosReady: true, sosHint: '松开以发起求助' });
    }, 1000);
  },

  onSOSEnd() {
    if (!this.data.sosPressing) return;
    const duration = Date.now() - (this.sosStartTime || 0);
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.setData({ sosPressing: false, sosReady: false, sosHint: '' });

    if (duration < 1000) {
      wx.showToast({ title: '已取消', icon: 'none' });
      return;
    }
    this.sendSOS();
  },

  // 发起求助：创建告警事件（status=open），家属端告警页立即拉取可见
  async sendSOS() {
    wx.showLoading({ title: '发送中' });
    try {
      await request('/api/alert/create', 'POST', { openid: MOCK_OPENIDS.elder, elderOpenid: MOCK_OPENIDS.elder });
      wx.hideLoading();
      wx.showToast({ title: '求助已发出', icon: 'success' });
      speak('求助已发送，家属将尽快响应');
    } catch (err) {
      wx.hideLoading();
    }
  },

  // ---- 语音播报（基础版） ----

  onSpeakTap() {
    // 音频文件已配置时走真实语音播报
    if (INTRO_AUDIO_SRC) {
      if (this.audio) this.audio.destroy();
      this.audio = wx.createInnerAudioContext();
      this.audio.src = INTRO_AUDIO_SRC;
      this.audio.play();
      return;
    }
    // 音频文件暂未提供：先用弹窗文字代替语音播报（后续替换为语音文件）
    wx.showModal({
      title: '桑榆智伴',
      content: '桑榆智伴已就绪，如需帮助请按住红色按钮',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onEntryTap(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  }
});
