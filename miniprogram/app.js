// 桑榆智伴 · 小程序入口
// 家属端告警实时感知：前台轮询（15s）→ 新告警时 震动 + 语音 + 弹窗 + TabBar 红点
const polling = require('./utils/polling');
const { speak } = require('./utils/voice');
const { MOCK_OPENIDS } = require('./utils/config');

App({
  globalData: {
    // 当前角色：'family' | 'elder'，由登录页写入；custom-tab-bar 与各页面据此渲染
    role: '',
    // 云开发环境 ID：开通云开发后填入，并在 onLaunch 中启用 wx.cloud.init
    cloudEnvId: ''
  },

  onLaunch() {
    // 计划(阶段1)：接入云开发
    // if (!wx.cloud) { console.error('微信基础库版本过低，请升级'); return; }
    // wx.cloud.init({ env: this.globalData.cloudEnvId, traceUser: true });
  },

  onShow() {
    // 家属端切前台：恢复告警轮询（冷启动与后台返回都会触发；后台时 onHide 已停止）
    if (this.globalData.role === 'family') {
      this.startFamilyPolling();
    }
  },

  onHide() {
    // 切后台停止轮询，省电省流量
    polling.stopPolling();
  },

  // 家属端告警轮询：新告警 → 震动 + 语音 + TabBar 红点 + 弹窗（四路同时触发）
  startFamilyPolling() {
    polling.startPolling(MOCK_OPENIDS.family, (res) => {
      const latest = res.latest || {};

      // 1) 长震动
      wx.vibrateLong({ fail: () => {} });

      // 2) 语音播报（预录音频缺失自动降级为文字 toast）
      speak('您有新的求助，请及时查看');

      // 3) TabBar 红点：家属端第 2 个 tab 位显示待处理数量（进入告警页后清除）
      wx.setTabBarBadge({ index: 1, text: String(res.count), fail: () => {} });

      // 4) 弹窗引导跳转
      const typeText = latest.type === 'threshold' ? '设备自动预警' : '老人一键求助';
      wx.showModal({
        title: '🚨 新的求助/预警',
        content: `${typeText}${latest.message ? '：' + latest.message : ''}\n时间：${latest.createdAt ? new Date(latest.createdAt).toLocaleString() : '刚刚'}`,
        confirmText: '立即查看',
        cancelText: '稍后处理',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/alert/alert' });
        }
      });
    });
  },

  stopFamilyPolling() {
    polling.stopPolling();
  }
});
