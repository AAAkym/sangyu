// AI 健康报告：家属/老人双端复用，MVP 阶段统一查看老人 mock_elder_001 的数据
// 计划(迁移云开发)：接口不变，request 换 wx.cloud.callFunction；openid 换真实登录态与监护关系解析
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');

const QUALITY_LABEL = { good: '完整', partial: '部分缺失', insufficient: '不足' };
const METRIC_TEXT = { heartRate: '心率', bloodPressure: '血压', spo2: '血氧' };

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
};

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    elderOpenid: MOCK_OPENIDS.elder,
    report: null,
    history: [],
    generating: false,
    sourceExpanded: false
  },

  onLoad() {
    this.fetchHistory();
  },

  // 生成最新报告：成功后展示详情并刷新历史
  async onGenerateTap() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    wx.showLoading({ title: '生成中' });
    try {
      const report = await request('/api/report/generate', 'POST', { openid: this.data.elderOpenid });
      wx.hideLoading();
      this.setData({ generating: false });
      this.applyReport(report);
      this.fetchHistory();
      wx.showToast({ title: '报告已生成', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ generating: false });
    }
  },

  // 历史报告列表；首次进入若已有报告，自动展示最近一份
  async fetchHistory() {
    try {
      const history = await request('/api/report/list', 'GET', { openid: this.data.elderOpenid });
      this.setData({
        history: history.map((h) => ({
          ...h,
          generatedAtText: formatTime(h.generatedAt),
          qualityText: QUALITY_LABEL[h.dataQuality.status] || h.dataQuality.status
        }))
      });
      if (!this.data.report && history.length) {
        const detail = await request('/api/report/detail', 'GET', { id: history[0].id });
        this.applyReport(detail);
      }
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  // 点击历史报告 → 拉取完整详情
  async onHistoryTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.showLoading({ title: '加载中' });
    try {
      const detail = await request('/api/report/detail', 'GET', { id });
      wx.hideLoading();
      this.applyReport(detail);
    } catch (err) {
      wx.hideLoading();
    }
  },

  // 展开/收起单条建议的数据依据
  onAdviceTap(e) {
    const idx = e.currentTarget.dataset.index;
    const key = `report.advice[${idx}].expanded`;
    this.setData({ [key]: !this.data.report.advice[idx].expanded });
  },

  toggleSource() {
    this.setData({ sourceExpanded: !this.data.sourceExpanded });
  },

  // 把接口返回的报告装饰成页面可直接渲染的结构（时间文本/依据明细等）
  applyReport(report) {
    const quality = report.dataQuality || {};
    const advice = (report.advice || []).map((item) => ({
      ...item,
      evidenceList: (item.evidenceRefs || [])
        .map((ref) => (report.evidence || []).find((ev) => ev.id === ref))
        .filter(Boolean)
        .map((ev) => ({
          id: ev.id,
          text: `${METRIC_TEXT[ev.metric] || ev.metric} ${ev.value}（${formatTime(ev.observedAt)}）`
        }))
    }));
    this.setData({
      report: {
        ...report,
        generatedAtText: formatTime(report.generatedAt),
        qualityText: `${QUALITY_LABEL[quality.status] || quality.status}（${quality.daysWithData || 0}/${quality.totalDays || 7} 天）`,
        missingText: (quality.missingDates || []).join('、'),
        advice
      }
    });
  }
});
