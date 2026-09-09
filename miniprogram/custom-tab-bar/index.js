// 自定义 tabBar（Batch 15 · P0-A）：
//   双端统一渲染两个 tab（首页 + 我的），按角色控制显隐（hidden，避免 wx:if 反复重建闪烁）
//   家属端：[家属首页, 我的]；老人端：[老人首页, 我的]——老人也有"我的"入口（退出/切换身份）
// 选中态多通道：主色 + 加粗 600 + 顶部指示条（不只靠颜色，适老化要求）
const app = getApp();

// 全量 tab 定义：roles 表示该 tab 在哪些角色下可见
const ALL_TABS = [
  { pagePath: '/pages/elder/elder', text: '首页', roles: ['elder'] },
  { pagePath: '/pages/family/family', text: '首页', roles: ['family'] },
  { pagePath: '/pages/mine/mine', text: '我的', roles: ['elder', 'family'] }
];

function tabsForRole(role) {
  return ALL_TABS.map((t) => ({
    pagePath: t.pagePath,
    text: t.text,
    show: t.roles.indexOf(role) >= 0
  }));
}

Component({
  data: {
    role: 'family',
    tabs: tabsForRole('family'),
    selectedPage: '/pages/family/family'
  },

  lifetimes: {
    attached() {
      this.refresh();
    }
  },

  pageLifetimes: {
    show() {
      // 每次页面显示都按当前路由与角色重算，避免"先闪默认态再跳"与高亮错位
      this.refresh();
    }
  },

  methods: {
    currentRoute() {
      try {
        const pages = getCurrentPages();
        return pages.length ? pages[pages.length - 1].route : '';
      } catch (e) {
        return '';
      }
    },

    refresh() {
      const role = getApp().globalData.role || wx.getStorageSync('role') || 'family';
      const tabs = tabsForRole(role);
      const route = this.currentRoute();
      const current = tabs.find((t) => t.pagePath.indexOf(route) >= 0);
      this.setData({
        role,
        tabs,
        selectedPage: current ? current.pagePath : this.data.selectedPage
      });
    },

    // 页面 onShow 传入其角色列表中的序号；组件按可见 tab 解析出页面路径
    setSelected(index) {
      const visible = this.data.tabs.filter((t) => t.show);
      const target = visible[index];
      if (target) this.setData({ selectedPage: target.pagePath });
    },

    onTabTap(e) {
      const path = e.currentTarget.dataset.path;
      wx.switchTab({ url: path });
      this.setData({ selectedPage: path });
    }
  }
});
