// 登录页：选角色 → 落地对应首页（Batch 9 双模式）
//   MOCK_MODE=true  —— 选角色 → /api/login(Mock openid 建档) → /api/updateRole → 跳首页（演示流程，与旧版一致）
//   MOCK_MODE=false —— onLoad 先 checkSession（有效且已有角色直达首页）；
//                      选角色 → wx.login 真实登录拿 openid → /api/updateRole → 跳首页
const { request } = require('../../utils/request');
const auth = require('../../utils/auth');
const { MOCK_MODE, MOCK_OPENIDS } = require('../../utils/config');

const ROLES = {
  family: { home: '/pages/family/family' },
  elder: { home: '/pages/elder/elder' }
};

Page({
  data: {
    brandImgFailed: false,
    fontClass: require('../../utils/font').fontClass(),
    loading: false
  },

  onLoad() {
    if (MOCK_MODE) return; // 演示模式：维持 onShow 自动进入的现状
    // 真实登录：启动校验会话，有效且已有角色 → 直达对应首页；否则留在本页等选角色
    auth
      .checkSession()
      .then((d) => {
        if (d.role) {
          getApp().globalData.role = d.role;
          wx.setStorageSync('role', d.role);
          this.enterRole(d.role, d.openid);
        }
      })
      .catch(() => {
        // 无有效会话：留在登录页，用户选角色后走 wx.login 真实登录
      });
  },

  onShow() {
    if (!MOCK_MODE) return; // 真实模式跳转由 onLoad 的 checkSession 决定
    // 已选过角色则直接进入对应首页；「我的」页退出登录会清空角色回到这里
    const savedRole = wx.getStorageSync('role');
    if (savedRole && ROLES[savedRole]) {
      this.enterRole(savedRole);
    }
  },

  // 品牌符号图加载失败（极端环境）：回退 CSS 环图标，不留空洞
  onBrandImgError() {
    this.setData({ brandImgFailed: true });
  },

  onChooseRole(e) {
    this.enterRole(e.currentTarget.dataset.key);
  },

  // key：角色；realOpenid：真实模式下已验证会话的 openid（免重复 wx.login）
  async enterRole(key, realOpenid) {
    const home = ROLES[key] && ROLES[key].home;
    if (!home || this.data.loading) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '登录中' });

    try {
      let openid;
      if (MOCK_MODE) {
        openid = MOCK_OPENIDS[key];
        const user = await request('/api/login', 'POST', { openid });
        if (user && user.nickname) wx.setStorageSync('nickname', user.nickname);
      } else {
        openid = realOpenid || (await auth.login()).openid;
      }
      const updated = await request('/api/updateRole', 'POST', { openid, role: key });
      if (updated && updated.nickname) wx.setStorageSync('nickname', updated.nickname);

      getApp().globalData.role = key;
      wx.setStorageSync('role', key);
      wx.hideLoading();
      this.setData({ loading: false });

      // 家属登录后启动告警轮询（新告警自动弹窗提醒）；老人端确保轮询停止
      if (key === 'family') {
        getApp().startFamilyPolling();
      } else {
        getApp().stopFamilyPolling();
      }

      // 家属身份：尚无监护关系时先引导去绑定老人（正式绑定流程，见 pages/bind-relationship）
      if (key === 'family') {
        const relations = await request('/api/relationship/list', 'GET', { openid, role: 'family' });
        if (!relations.length) {
          wx.redirectTo({ url: '/pages/bind-relationship/bind-relationship' });
          return;
        }
      }
      wx.switchTab({ url: home });
    } catch (err) {
      // 错误提示已由 request 统一弹出（多为本地后端未启动 / 微信登录未配置）
      wx.hideLoading();
      this.setData({ loading: false });
    }
  }
});
