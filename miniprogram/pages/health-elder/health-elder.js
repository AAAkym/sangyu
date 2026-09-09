// 老人端健康简要版：只回答"我今天怎么样"——今日心率大数字 + 状态点 + 7 天迷你趋势
// sparkline 用原生 canvas 2d 手绘（不加载 echarts，避免老人端页面变重）
// 状态阈值抽在 utils/healthStatus.js（与 family 首页面板、规则引擎同一套口径）
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');
const healthStatus = require('../../utils/healthStatus');

const pad = (n) => (n < 10 ? '0' + n : '' + n);

Page({
  data: {
    fontClass: require('../../utils/font').fontClass(),
    todayHr: '--',
    statusColor: '#9e9e9e',
    statusText: '查询中',
    sourceLine: '数据来源：—'
  },

  onShow() {
    this.fetchData();
  },

  async fetchData() {
    try {
      // 最新一条：大数字 + 来源/更新时间；趋势：7 天心率均值迷你折线
      const records = await request('/api/health', 'GET', { openid: MOCK_OPENIDS.elder });
      const latest = records[0] || null;
      const trend = await request('/api/health/trend', 'GET', { elderOpenid: MOCK_OPENIDS.elder, days: 7 });

      const todayAvg = trend.heartRate.avg.length ? trend.heartRate.avg[trend.heartRate.avg.length - 1] : null;
      const hr = todayAvg !== null ? todayAvg : latest ? latest.heartRate : null;
      const st = healthStatus.hrStatus(hr);

      const sourceText = latest ? (latest.source === 'device' ? '智能手环' : '本地记录') : '—';
      let updatedText = '';
      if (latest) {
        const d = new Date(latest.createdAt);
        const now = new Date();
        const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        updatedText = sameDay ? `今日 ${pad(d.getHours())}:${pad(d.getMinutes())} 更新` : `${d.getMonth() + 1}/${d.getDate()} 更新`;
      }

      this.setData({
        todayHr: hr === null ? '--' : hr,
        statusColor: st.color,
        statusText: st.text,
        sourceLine: `数据来源：${sourceText}${updatedText ? ' · ' + updatedText : ''}`
      });

      this.drawSparkline(trend.heartRate.avg, st.color);
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  // 原生 canvas 2d 手绘迷你折线：null 值跳过，dpr 适配保证清晰
  drawSparkline(values, color) {
    wx.nextTick(() => {
      wx.createSelectorQuery()
        .in(this)
        .select('#sparkline')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const dpr = info.pixelRatio || 2;
          canvas.width = res[0].width * dpr;
          canvas.height = res[0].height * dpr;
          ctx.scale(dpr, dpr);

          const w = res[0].width;
          const h = res[0].height;
          const pts = (values || [])
            .map((v, i) => ({ v, i }))
            .filter((p) => p.v !== null && p.v !== undefined);
          if (pts.length < 2) return;

          const min = Math.min(...pts.map((p) => p.v)) - 4;
          const max = Math.max(...pts.map((p) => p.v)) + 4;
          const stepX = w / (values.length - 1);

          ctx.clearRect(0, 0, w, h);
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          pts.forEach((p, j) => {
            const x = p.i * stepX;
            const y = h - 6 - ((p.v - min) / (max - min || 1)) * (h - 12);
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        });
    });
  }
});
