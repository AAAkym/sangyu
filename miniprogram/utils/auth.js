// 真实登录工具（Batch 9，仅 MOCK_MODE=false 时被调用）：
//   login()        wx.login 拿 code → POST /api/auth/login → 存 token/openid/role
//   checkSession() 用本地 token 调 /api/auth/check，有效则恢复登录态，失效 reject
//   logout()       仅清登录态（token/openid）；角色、邀请码、字体设置等 Storage 一律保留
const { request } = require('./request');

// wx.login 拿 code → 后端换 token
function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('wx.login 未返回 code'));
          return;
        }
        request('/api/auth/login', 'POST', { code: res.code })
          .then((data) => {
            wx.setStorageSync('token', data.token);
            wx.setStorageSync('openid', data.openid);
            const app = getApp();
            app.globalData.openid = data.openid;
            // 优先沿用服务端已存角色，其次保留本地角色
            const role = data.role || wx.getStorageSync('role') || '';
            if (role) {
              app.globalData.role = role;
              wx.setStorageSync('role', role);
            }
            if (data.nickname) wx.setStorageSync('nickname', data.nickname);
            resolve(data);
          })
          .catch(reject);
      },
      fail: reject
    });
  });
}

// 启动会话校验：有效 → resolve({ openid, role }) 并恢复登录态；无效/无 token → reject
function checkSession() {
  const token = wx.getStorageSync('token');
  if (!token) {
    return Promise.reject(new Error('无本地 token'));
  }
  return request('/api/auth/check', 'POST', { token }, { silent: true }).then((data) => {
    if (!data || !data.valid) {
      throw new Error('token 已失效');
    }
    const app = getApp();
    app.globalData.openid = data.openid;
    if (data.role) {
      app.globalData.role = data.role;
      wx.setStorageSync('role', data.role);
    }
    return data;
  });
}

// 清登录态（保留 role / 邀请码 / 字体 / 隐私同意等 Storage）
function logout() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('openid');
  const app = getApp();
  app.globalData.openid = '';
}

module.exports = { login, checkSession, logout };
