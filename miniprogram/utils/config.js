// 演示模式开关（Batch 9）：
//   true  —— 答辩演示模式：选角色 → 写 Mock openid（现状全流程）
//   false —— 真实微信登录：wx.login → /api/auth/login 换真实 openid，请求自动带 token
// ⚠️ 切 false 前确认 server/.env 已配置 WX_APPID / WX_APPSECRET
const MOCK_MODE = true;

// 后端地址（Batch 14 · 真机联调）：
//   开发者工具 → http://localhost:3000（本机即后端所在电脑）
//   真机预览/真机调试 → http://192.168.1.17:3000（电脑局域网 IP；手机与电脑连同一 Wi-Fi）
//   ⚠️ 电脑换网络后 IP 会变：用 ipconfig 查「IPv4 地址」后同步更新 LAN_BASE_URL
//   前提：后端监听 0.0.0.0（server/app.js 默认如此）+ Windows 防火墙放行 3000 端口
const DEV_BASE_URL = 'http://localhost:3000';
const LAN_BASE_URL = 'http://192.168.1.17:3000';

function resolveBaseUrl() {
  let platform = '';
  try {
    platform = (wx.getDeviceInfo && wx.getDeviceInfo().platform) || wx.getSystemInfoSync().platform || '';
  } catch (e) {
    // 取不到平台时按真机处理
  }
  return platform === 'devtools' ? DEV_BASE_URL : LAN_BASE_URL;
}

const BASE_URL = resolveBaseUrl();

// 本地联调的 Mock 身份：家属与老人各固定一个 openid，保证双端流程互通。
// 正式流程中家属-老人的监护关系由邀请码建立：老人端 pages/invite 生成 → 家属端 pages/bind-relationship 输入；
// alert/report/health 等接口在本模式下继续使用以下 Mock 身份跑通。
// 计划(迁移云开发)：替换为 wx.login → 云函数 code2session 换取真实 openid。
const MOCK_OPENIDS = {
  family: 'mock_family_001',
  elder: 'mock_elder_001'
};

// 按当前角色取 openid；无角色时兜底家属身份
function getOpenid() {
  const role = getApp().globalData.role || wx.getStorageSync('role');
  return MOCK_OPENIDS[role] || MOCK_OPENIDS.family;
}

module.exports = { MOCK_MODE, BASE_URL, MOCK_OPENIDS, getOpenid };
