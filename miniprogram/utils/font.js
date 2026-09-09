// 全局字号与显示模式（适老化）：mine 页「字体大小 / 高对比模式」写入 Storage，
// 各页面根节点绑定 fontClass → 命中 app.wxss 对应档位变量组（含 .hc-mode 高对比覆盖）。
// 在页面文件加载时读取一次：改完设置重启小程序全局生效（当前页立即生效由 mine 页 setData 处理）。
const MODES = ['standard', 'large', 'xlarge'];

function fontClass() {
  const mode = wx.getStorageSync('fontMode');
  const base = mode === 'large' ? 'font-large' : mode === 'xlarge' ? 'font-xlarge' : 'font-standard';
  const hc = wx.getStorageSync('contrastMode') === 'on' ? ' hc-mode' : '';
  return base + hc;
}

module.exports = { MODES, fontClass };
