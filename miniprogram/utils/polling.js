// 家属端告警轮询：定时调用 /api/alert/check-new，发现新告警即回调 onNewAlert(res)
// 只轮询告警，不轮询健康数据（避免浪费）；lastCheckTime 持久化到 Storage，重启不重复弹旧告警
// 轮询失败（后端未启动/网络异常）静默重试，由 request 的 silent 模式抑制 toast
const { request } = require('./request');

const ALERT_POLL_INTERVAL_MS = 15 * 1000; // 轮询间隔常量，方便调整

let timer = null;
let lastCheckTime = 0;

function startPolling(familyOpenid, onNewAlert, interval = ALERT_POLL_INTERVAL_MS) {
  stopPolling();
  lastCheckTime = Number(wx.getStorageSync('alertLastCheckTime') || 0);

  const tick = async () => {
    const checkAt = Date.now();
    try {
      const res = await request(
        '/api/alert/check-new',
        'GET',
        { familyOpenid, lastCheckTime },
        { silent: true }
      );
      lastCheckTime = checkAt;
      wx.setStorageSync('alertLastCheckTime', checkAt);
      if (res && res.hasNew && typeof onNewAlert === 'function') {
        onNewAlert(res);
      }
    } catch (err) {
      // 静默失败，下一轮重试
    }
  };

  tick(); // 启动立即查一次
  timer = setInterval(tick, interval);
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startPolling, stopPolling, ALERT_POLL_INTERVAL_MS };
