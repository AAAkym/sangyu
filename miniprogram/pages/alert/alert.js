// 告警与求助：老人端按住确认发起 SOS（与老人首页一致）；家属端处理告警（状态机 + 时间线留痕）
// 状态标签 / 操作按钮 / 时间线文案统一在本文件 enum 对象管理，WXML 不写死文案
const { request } = require('../../utils/request');
const { speak } = require('../../utils/voice');
const { MOCK_OPENIDS } = require('../../utils/config');

// 状态 → 卡片状态标签
const STATUS_TEXT = {
  open: '待处理',
  acknowledged: '已接单',
  escalated: '等待社区响应',
  external_dispatched: '已派单',
  resolved: '已处理'
};

// 状态 → 可执行操作（label 按钮文案 / status 目标状态 / defaultNote 留空时的缺省备注）
const ACTIONS = {
  open: [{ label: '确认接单', status: 'acknowledged', defaultNote: '家属已确认，马上处理' }],
  acknowledged: [
    { label: '处理完成', status: 'resolved', defaultNote: '家属已处理完成' },
    { label: '转社区', status: 'escalated', defaultNote: '已转社区养老服务中心' }
  ],
  escalated: [{ label: '标记已派单', status: 'external_dispatched', defaultNote: '社区已接单派单' }],
  external_dispatched: [{ label: '确认解决', status: 'resolved', defaultNote: '问题已解决' }],
  resolved: []
};

// 时间线里各状态的动作描述
const TIMELINE_TEXT = {
  open: '发起求助',
  acknowledged: '确认接单',
  escalated: '转社区',
  external_dispatched: '社区已派单',
  resolved: '处理完成'
};

// 操作人 → 角色标识（支持角色名或 openid 两种写法）
const OPERATOR_TEXT = (operator) => {
  if (!operator) return '系统';
  if (operator === 'elder' || operator.indexOf('elder') >= 0) return '老人';
  if (operator === 'family' || operator.indexOf('family') >= 0) return '家属';
  if (operator.indexOf('rule_engine') >= 0) return '规则引擎';
  if (operator.indexOf('community') >= 0) return '社区';
  return operator;
};

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const formatHM = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 时间线条目 → 页面渲染结构
const decorateTimelineEntry = (entry) => ({
  ...entry,
  timeText: entry.at ? formatHM(entry.at) : '',
  operatorText: OPERATOR_TEXT(entry.operator),
  actionText: TIMELINE_TEXT[entry.status] || entry.status
});

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    role: '',
    alerts: [],
    loading: false,
    sosPressing: false,
    sosHint: ''
  },

  onShow() {
    const role = getApp().globalData.role || wx.getStorageSync('role');
    this.setData({ role });
    if (role === 'family') {
      // 进入告警页即视为已查看：清除 TabBar 红点
      wx.removeTabBarBadge({ index: 1, fail: () => {} });
      this.fetchAlerts();
    }
  },

  onHide() {
    this.resetPress();
  },

  onUnload() {
    this.resetPress();
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

  // ---- 老人端：按住 1 秒确认 SOS（与老人首页一致，防误触） ----

  onSOSStart() {
    if (this.data.sosPressing) return;
    this.sosStartTime = Date.now();
    this.setData({ sosPressing: true, sosReady: false, sosHint: '按住确认求助...' });
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

  // ---- 家属端：告警列表 / 详情展开 / 状态流转 ----

  async fetchAlerts() {
    this.setData({ loading: true });
    try {
      const alerts = await request('/api/alert/list', 'GET', { familyOpenid: MOCK_OPENIDS.family });
      this.setData({
        alerts: alerts.map((a) => ({
          ...a,
          statusText: STATUS_TEXT[a.status] || a.status,
          isRuleEngine: a.source === 'rule_engine',
          timeText: new Date(a.createdAt).toLocaleString(),
          actions: ACTIONS[a.status] || [],
          expanded: false,
          fullTimeline: null,
          // 列表接口只带最近 3 条摘要；展开时从 detail 拉完整时间线
          displayTimeline: (a.timeline || []).map(decorateTimelineEntry)
        })),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  // 点击卡片：展开/收起时间线（首次展开拉取完整时间线）
  async onCardTap(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.alerts[idx];
    if (!item) return;

    if (item.expanded) {
      this.setData({
        [`alerts[${idx}].expanded`]: false,
        [`alerts[${idx}].displayTimeline`]: item.summaryTimeline || item.displayTimeline
      });
      return;
    }
    if (item.fullTimeline) {
      this.setData({ [`alerts[${idx}].expanded`]: true });
      return;
    }
    try {
      const detail = await request('/api/alert/detail', 'GET', { id: item.id });
      const fullTimeline = (detail.timeline || []).map(decorateTimelineEntry);
      this.setData({
        [`alerts[${idx}].expanded`]: true,
        [`alerts[${idx}].fullTimeline`]: fullTimeline,
        [`alerts[${idx}].displayTimeline`]: fullTimeline,
        [`alerts[${idx}].summaryTimeline`]: item.displayTimeline
      });
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  // 操作按钮：弹窗填写处置备注（留空用缺省备注），提交后刷新列表
  onActionTap(e) {
    const idx = e.currentTarget.dataset.index;
    const target = e.currentTarget.dataset.act;
    const item = this.data.alerts[idx];
    if (!item) return;
    const action = (ACTIONS[item.status] || []).find((a) => a.status === target);
    if (!action) return;

    wx.showModal({
      title: action.label,
      editable: true,
      placeholderText: `填写处置备注（留空默认：${action.defaultNote}）`,
      success: (res) => {
        if (!res.confirm) return;
        const note = (res.content || '').trim() || action.defaultNote;
        this.submitUpdate(idx, item, action, note);
      }
    });
  },

  async submitUpdate(idx, item, action, note) {
    wx.showLoading({ title: '提交中' });
    try {
      await request('/api/alert/update', 'POST', {
        alertId: item.id,
        status: action.status,
        note,
        operator: MOCK_OPENIDS.family
      });
      wx.hideLoading();
      wx.showToast({ title: '已更新', icon: 'success' });
      this.fetchAlerts();
    } catch (err) {
      wx.hideLoading();
    }
  }
});
