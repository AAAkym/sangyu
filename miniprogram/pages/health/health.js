// 健康数据（家属端详细版）：心率/血压趋势图（echarts）+ 血氧（若有）+ 可折叠原始数据列表
// 老人端进入本页自动跳转简要版 pages/health-elder——老人端只回答"我今天怎么样"
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');
const echarts = require('../../ec-canvas/echarts');

// 设计令牌（sangyu-zhiban）：主绿 / 关注黄 / 异常红；血压线用蓝系区分
const COLORS = {
  primary: '#B5832E',
  primaryLight: 'rgba(181, 131, 46, 0.10)',
  primaryFaint: 'rgba(181, 131, 46, 0.35)',
  blue: '#1A6B8C',
  blueLight: '#5A9AB5',
  watch: '#C49A3D',
  alert: '#C62828'
};

const GRID = { left: 44, right: 20, top: 32, bottom: 28 };
const shortDate = (d) => d.slice(5); // MM-DD

// 心率趋势：平均实线 + 最高/最低虚线 + 关注参考线 100
function hrOption(trend) {
  return {
    grid: GRID,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trend.dates.map(shortDate), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', min: 40, max: 140, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: '平均心率',
        type: 'line',
        smooth: true,
        symbolSize: 4,
        data: trend.heartRate.avg,
        itemStyle: { color: COLORS.primary },
        lineStyle: { color: COLORS.primary, width: 2 },
        areaStyle: { color: COLORS.primaryLight },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: COLORS.watch },
          data: [{ yAxis: 100, label: { formatter: '关注 100', fontSize: 9, position: 'insideEndTop' } }]
        }
      },
      { name: '最高', type: 'line', smooth: true, symbol: 'none', data: trend.heartRate.max, lineStyle: { type: 'dashed', color: COLORS.primaryFaint, width: 1 } },
      { name: '最低', type: 'line', smooth: true, symbol: 'none', data: trend.heartRate.min, lineStyle: { type: 'dashed', color: COLORS.primaryFaint, width: 1 } }
    ]
  };
}

// 血压趋势：收缩压/舒张压双线 + 140/90 参考虚线
function bpOption(trend) {
  const refLine = (y, label) => ({
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed', color: COLORS.alert },
    data: [{ yAxis: y, label: { formatter: label, fontSize: 9, position: 'insideEndTop' } }]
  });
  return {
    grid: GRID,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trend.dates.map(shortDate), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', min: 50, max: 200, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: '收缩压', type: 'line', smooth: true, symbolSize: 4, data: trend.bloodPressure.sys,
        itemStyle: { color: COLORS.blue }, lineStyle: { color: COLORS.blue, width: 2 },
        markLine: refLine(140, '140')
      },
      {
        name: '舒张压', type: 'line', smooth: true, symbolSize: 4, data: trend.bloodPressure.dia,
        itemStyle: { color: COLORS.blueLight }, lineStyle: { color: COLORS.blueLight, width: 2 },
        markLine: refLine(90, '90')
      }
    ]
  };
}

function spo2Option(trend) {
  return {
    grid: GRID,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trend.dates.map(shortDate), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', min: 80, max: 100, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: '血氧', type: 'line', smooth: true, symbolSize: 4, data: trend.spo2,
        itemStyle: { color: COLORS.primary }, lineStyle: { color: COLORS.primary, width: 2 }
      }
    ]
  };
}

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    role: '',
    records: [],
    showRecords: false,
    showTools: false,
    rangeDays: 7,
    hasTrend: false,
    hasSpo2: false,
    loading: false,
    batchLoading: false,
    ecHr: { lazyLoad: true },
    ecBp: { lazyLoad: true },
    ecSpo2: { lazyLoad: true }
  },

  onLoad() {
    const role = getApp().globalData.role || wx.getStorageSync('role');
    // 老人端 → 跳转简要版（首页健康入口不改，按角色在这里分流）
    if (role === 'elder') {
      wx.redirectTo({ url: '/pages/health-elder/health-elder' });
      return;
    }
    this.setData({ role });
  },

  onShow() {
    if (this.data.role === 'family') {
      this.fetchRecords();
      this.fetchTrend();
    }
  },

  onRangeChange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.rangeDays) return;
    this.setData({ rangeDays: days });
    this.fetchTrend();
  },

  toggleRecords() {
    this.setData({ showRecords: !this.data.showRecords });
  },

  // 演示工具折叠区：默认收起，显式点击展开后按钮才可触发（P0-2 防误触）
  toggleTools() {
    this.setData({ showTools: !this.data.showTools });
  },

  async fetchRecords() {
    this.setData({ loading: true });
    try {
      const records = await request('/api/health', 'GET', { openid: MOCK_OPENIDS.elder });
      this.setData({
        records: records.map((r) => ({
          ...r,
          timeText: new Date(r.createdAt).toLocaleString(),
          sourceText: r.source === 'device' ? '设备上报' : r.source === 'mock' ? '本地记录' : '手动'
        })),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  async fetchTrend() {
    try {
      const trend = await request('/api/health/trend', 'GET', { elderOpenid: MOCK_OPENIDS.elder, days: this.data.rangeDays });
      const daysWithData = trend.dates.filter(
        (d, i) => trend.heartRate.avg[i] !== null || trend.bloodPressure.sys[i] !== null
      ).length;
      this.setData({ hasTrend: daysWithData >= 2, hasSpo2: trend.spo2.some((v) => v !== null) });
      if (daysWithData >= 2) {
        // 等图表节点渲染完成再初始化
        wx.nextTick(() => this.renderCharts(trend));
      }
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  renderCharts(trend) {
    this.charts = this.charts || {};
    const render = (selector, name, option) => {
      const comp = this.selectComponent(selector);
      if (!comp) return;
      if (this.charts[name]) {
        this.charts[name].setOption(option);
        return;
      }
      comp.init((canvas, width, height, dpr) => {
        const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr });
        chart.setOption(option);
        this.charts[name] = chart;
        return chart;
      });
    };
    render('#hrChart', 'hr', hrOption(trend));
    render('#bpChart', 'bp', bpOption(trend));
    if (this.data.hasSpo2) render('#spo2Chart', 'spo2', spo2Option(trend));
  },

  // 页内写入一条随机 Mock 数据：没有 curl/Postman 时也能自测
  async onMockTap() {
    try {
      await request('/api/health/mock', 'POST', {
        openid: MOCK_OPENIDS.elder,
        heartRate: 70 + Math.floor(Math.random() * 20),
        bloodPressure: '120/80'
      });
      this.fetchRecords();
      this.fetchTrend();
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  // 一次性生成最近 7 天演示数据（每天 1 条）：保证报告页/趋势图有足够数据
  async onBatchTap() {
    if (this.data.batchLoading) return;
    this.setData({ batchLoading: true });
    try {
      const res = await request('/api/health/mock/batch', 'POST', { openid: MOCK_OPENIDS.elder });
      wx.showToast({ title: `已生成 ${res.count} 条`, icon: 'success' });
      this.setData({ batchLoading: false });
      this.fetchRecords();
      this.fetchTrend();
    } catch (err) {
      this.setData({ batchLoading: false });
    }
  }
});
