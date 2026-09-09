// 统一请求封装：后端地址按运行环境自动切换（config.BASE_URL）
//   开发者工具 → http://localhost:3000；真机 → 电脑局域网 IP（见 utils/config.js 头部说明）
// 迁移云开发时只改本文件：把 request 的实现换成 wx.cloud.callFunction，
// 页面侧 request(url, method, data) 的调用方式保持不变。
//
// 鉴权（Batch 9）：
//   MOCK_MODE=true  —— 与旧版完全一致，不携带 token
//   MOCK_MODE=false —— 自动携带 Authorization: Bearer <token>；
//                      收到 401 自动重登并重试一次（本请求仅重试一次，防死循环）
// 注意：本地联调需在开发者工具勾选「不校验合法域名」（设置 → 项目设置 → 本地设置）。
const { MOCK_MODE, BASE_URL } = require('./config');

function request(url, method = 'GET', data = {}, options = {}) {
  const silent = !!(options && options.silent); // 静默模式：失败不弹 toast（轮询等后台调用用）

  const doRequest = (isRetry) =>
    new Promise((resolve, reject) => {
      const header = { 'content-type': 'application/json' };
      if (!MOCK_MODE) {
        const token = wx.getStorageSync('token');
        if (token) header.Authorization = 'Bearer ' + token;
      }

      wx.request({
        url: BASE_URL + url,
        method,
        data,
        header,
        success(res) {
          // 后端统一返回 { code, msg, data }：code=0 视为成功，直接解包 data 给页面
          if (res.statusCode === 200 && res.data && res.data.code === 0) {
            resolve(res.data.data);
            return;
          }
          // 401：token 失效/伪造 → 重登后重试一次（真实模式专属；登录接口自身不重试）
          if (
            res.statusCode === 401 &&
            !MOCK_MODE &&
            !isRetry &&
            url !== '/api/auth/login' &&
            url !== '/api/auth/check'
          ) {
            const auth = require('./auth'); // 运行时引入，避免循环依赖
            auth
              .login()
              .then(() => resolve(doRequest(true)))
              .catch(() => reject(new Error('登录已失效，请重新登录')));
            return;
          }
          const msg = (res.data && res.data.msg) || `请求失败(${res.statusCode})`;
          if (!silent) wx.showToast({ title: msg, icon: 'none' });
          reject(new Error(msg));
        },
        fail(err) {
          if (!silent)
            wx.showToast({
              title: '网络异常：请确认后端已启动（cd server && npm start），且手机与电脑连同一 Wi-Fi',
              icon: 'none'
            });
          reject(err);
        }
      });
    });

  return doRequest(false);
}

module.exports = { request, BASE_URL };
