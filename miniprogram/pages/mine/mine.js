// 「我的」：身份头部 + 已绑定关系列表（撤销授权/解绑）+ 隐私政策 + 字体大小设置 + 退出登录
// 关系解绑（撤销授权）与设备解绑是两个操作：这里只处理“人”的关系，设备在设备管理页
const { request, BASE_URL } = require('../../utils/request');
const auth = require('../../utils/auth');
const { getOpenid, MOCK_MODE } = require('../../utils/config');
const font = require('../../utils/font');

const FONT_LABELS = ['标准', '大', '特大'];
// 预设头像色板（零依赖快速选择）：avatar 存预设 id，前端映射颜色
const PRESET_COLORS = {
  c1: '#B5832E', c2: '#2D7A3D', c3: '#1A6B8C',
  c4: '#C62828', c5: '#7A561D', c6: '#6B5D44'
};

Page({
  data: {
    role: '',
    roleLabel: '未选择',
    identityTitle: '',
    relations: [],
    fontClass: font.fontClass(),
    fontLabels: FONT_LABELS,
    fontIndex: 0,
    contrastOn: false,
    voiceOn: true,
    mockMode: MOCK_MODE,
    version: 'v0.9.0-demo',
    myAvatar: '',
    myAvatarSrc: '',
    myAvatarColor: PRESET_COLORS.c1,
    showPresets: false,
    editBusy: false
  },

  onShow() {
    const role = getApp().globalData.role || wx.getStorageSync('role');
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      // 家属端 mine 是第 2 个 tab；老人端经设置入口进入，高亮其第 1 个 tab（首页）
      tabBar.setSelected(role === 'elder' ? 0 : 1);
    }
    const fontIndex = font.MODES.indexOf(wx.getStorageSync('fontMode') || 'standard');
    this.setData({
      role,
      fontClass: font.fontClass(),
      fontIndex: fontIndex < 0 ? 0 : fontIndex,
      contrastOn: wx.getStorageSync('contrastMode') === 'on',
      voiceOn: wx.getStorageSync('voiceSwitch') !== 'off',
      roleLabel: role === 'family' ? '家属' : role === 'elder' ? '老人' : '未选择'
    });
    this.fetchRelations();
    this.fetchMyProfile();
  },

  // 我的资料：昵称 + 头像（GET /api/user/profile）
  async fetchMyProfile() {
    try {
      const p = await request('/api/user/profile', 'GET', { openid: getOpenid() }, { silent: true });
      this.applyProfile(p);
    } catch (err) {
      // 静默失败：保持默认展示
    }
  },

  applyProfile(p) {
    const avatar = (p && p.avatar) || '';
    const isImage = avatar.indexOf('/avatars/') === 0;
    const preset = PRESET_COLORS[avatar] ? avatar : '';
    this.setData({
      myAvatar: avatar,
      myAvatarSrc: isImage ? BASE_URL + avatar : '',
      myAvatarColor: preset ? PRESET_COLORS[preset] : PRESET_COLORS.c1,
      identityTitle: (p && p.nickname) || this.data.identityTitle
    });
    if (p && p.nickname) wx.setStorageSync('nickname', p.nickname);
  },

  // 编辑昵称：showModal editable（适老化：系统输入法）
  onEditNickname() {
    const that = this;
    wx.showModal({
      title: '修改称呼',
      editable: true,
      placeholderText: this.data.identityTitle || '请输入称呼（20 字内）',
      success(res) {
        if (!res.confirm) return;
        const nick = String(res.content || '').trim();
        if (!nick) {
          wx.showToast({ title: '称呼不能为空', icon: 'none' });
          return;
        }
        request('/api/user/profile', 'POST', { openid: getOpenid(), nickname: nick })
          .then((p) => {
            wx.setStorageSync('nickname', p.nickname);
            that.applyProfile({ nickname: p.nickname, avatar: p.avatar });
            wx.showToast({ title: '已保存', icon: 'success' });
          })
          .catch(() => {});
      }
    });
  },

  // 头像入口：预设色板 / 相册上传
  onAvatarTap() {
    const that = this;
    wx.showActionSheet({
      itemList: ['从相册选择头像', '使用预设头像'],
      success(res) {
        if (res.tapIndex === 0) {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sizeType: ['compressed'],
            success(m) {
              const tmp = m.tempFiles && m.tempFiles[0];
              if (!tmp) return;
              const fsm = wx.getFileSystemManager();
              const b64 = fsm.readFileSync(tmp.tempFilePath, 'base64');
              that.uploadAvatar('data:image/png;base64,' + b64);
            },
            fail() {
              wx.showToast({ title: '未选择图片', icon: 'none' });
            }
          });
        } else if (res.tapIndex === 1) {
          that.setData({ showPresets: !that.data.showPresets });
        }
      }
    });
  },

  onPresetTap(e) {
    const c = e.currentTarget.dataset.c;
    this.applyPreset(c);
  },

  // 上传头像：base64 → 后端写文件，返回 /avatars/ 路径
  uploadAvatar(dataBase64) {
    if (this.data.editBusy) return;
    this.setData({ editBusy: true });
    request('/api/user/avatar', 'POST', { openid: getOpenid(), dataBase64 }, { silent: true })
      .then((p) => {
        this.setData({ editBusy: false });
        this.applyProfile({ avatar: p.avatar });
        wx.showToast({ title: '头像已更新', icon: 'success' });
      })
      .catch(() => this.setData({ editBusy: false }));
  },

  // 应用预设头像：avatar 存预设 id，前端映射颜色（零上传依赖）
  applyPreset(presetId) {
    request('/api/user/profile', 'POST', { openid: getOpenid(), avatar: presetId })
      .then(() => {
        this.setData({ myAvatar: presetId, myAvatarSrc: '', myAvatarColor: PRESET_COLORS[presetId] || PRESET_COLORS.c1 });
        wx.showToast({ title: '头像已更新', icon: 'success' });
      })
      .catch(() => {});
  },


  // 已绑定关系：家属看「已绑定的老人」，老人看「已绑定的家属」
  async fetchRelations() {
    const role = this.data.role;
    if (!role) return;
    try {
      const relations = await request('/api/relationship/list', 'GET', { openid: getOpenid(), role });
      const enriched = await Promise.all(
        relations.map(async (r) => {
          const otherOpenid = role === 'family' ? r.elderOpenid : r.familyOpenid;
          const otherName = role === 'family' ? r.elderName : r.familyName;
          const item = {
            id: r.id,
            name: otherName || otherOpenid,
            boundText: new Date(r.createdAt).toLocaleDateString(),
            unbindLabel: role === 'elder' ? '撤销授权' : '解除绑定',
            confirmText:
              role === 'elder'
                ? '撤销授权后，对方将立即无法查看您的健康数据，其绑定设备同步停止接收。确定撤销？'
                : '解除绑定后，您将无法查看该老人的健康数据与告警。确定解除？'
          };
          if (role === 'family') {
            // 家属端：显示该老人设备的在线状态小绿点
            try {
              const devices = await request('/api/device/list', 'GET', { elderOpenid: r.elderOpenid });
              item.deviceCount = devices.length;
              item.deviceOnline = devices.some((d) => d.status === 'online');
            } catch (err) {
              item.deviceCount = 0;
              item.deviceOnline = false;
            }
          }
          return item;
        })
      );
      // 个人信息区标题：老人显示自己的昵称，家属显示「XX的家属」
      const selfNickname = wx.getStorageSync('nickname') || '';
      const identityTitle =
        role === 'elder'
          ? selfNickname || '长辈'
          : enriched.length
            ? (enriched[0].name || '老人') + '的家属'
            : selfNickname || '家属';
      this.setData({ relations: enriched, identityTitle });
    } catch (err) {
      // 错误提示已由 request 统一弹出
    }
  },

  // 切换为另一身份（演示便捷入口）：改角色 → 跳对应首页
  onSwitchRoleTap() {
    const other = this.data.role === 'family' ? 'elder' : 'family';
    const otherLabel = other === 'family' ? '家属' : '老人';
    wx.showModal({
      title: '切换身份',
      content: `确定切换为${otherLabel}身份吗？将进入${otherLabel}端首页。`,
      success: (res) => {
        if (!res.confirm) return;
        const openid = getOpenid();
        request('/api/updateRole', 'POST', { openid, role: other })
          .then(() => {
            getApp().globalData.role = other;
            wx.setStorageSync('role', other);
            if (other === 'family') getApp().startFamilyPolling();
            else getApp().stopFamilyPolling();
            wx.switchTab({ url: other === 'family' ? '/pages/family/family' : '/pages/elder/elder' });
          })
          .catch(() => {});
      }
    });
  },

  // 撤销授权 / 解除绑定（二次确认，破坏性操作）
  onUnbindTap(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.relations[idx];
    if (!item) return;
    wx.showModal({
      title: item.unbindLabel,
      content: item.confirmText,
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm) this.submitUnbind(item.id);
      }
    });
  },

  async submitUnbind(relationshipId) {
    wx.showLoading({ title: '处理中' });
    try {
      await request('/api/relationship/unbind', 'POST', { relationshipId, operatorOpenid: getOpenid() });
      wx.hideLoading();
      wx.showToast({ title: '已解绑', icon: 'success' });
      this.fetchRelations();
    } catch (err) {
      wx.hideLoading();
    }
  },

  // 高对比模式：写入 Storage → fontClass 附带 .hc-mode，app.wxss 变量组整体提对比
  onContrastTap() {
    const on = wx.getStorageSync('contrastMode') === 'on';
    wx.setStorageSync('contrastMode', on ? 'off' : 'on');
    this.setData({ contrastOn: !on, fontClass: font.fontClass() });
    wx.showToast({ title: on ? '已切回标准对比' : '已开启高对比', icon: 'success' });
  },

  // 语音播报开关：关闭后告警不再播报（弹窗/震动不受影响）
  onVoiceSwitchTap() {
    const on = wx.getStorageSync('voiceSwitch') !== 'off';
    wx.setStorageSync('voiceSwitch', on ? 'off' : 'on');
    this.setData({ voiceOn: !on });
    wx.showToast({ title: on ? '语音播报已关闭' : '语音播报已开启', icon: 'success' });
  },


  onPrivacyTap() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  // 字体大小：标准 / 大 / 特大 → Storage；本页立即生效，重启后全局生效
  onFontTap() {
    wx.showActionSheet({
      itemList: FONT_LABELS,
      success: (res) => {
        const mode = font.MODES[res.tapIndex] || 'standard';
        wx.setStorageSync('fontMode', mode);
        getApp().globalData.fontMode = mode;
        this.setData({ fontIndex: res.tapIndex, fontClass: font.fontClass() });
        wx.showToast({ title: `已设为${FONT_LABELS[res.tapIndex]}字号`, icon: 'success' });
      }
    });
  },

  onLogout() {
    getApp().stopFamilyPolling();
    // 真实模式清登录态（token/openid）；角色、邀请码、字体等 Storage 一律保留
    if (!MOCK_MODE) auth.logout();
    wx.removeStorageSync('role');
    getApp().globalData.role = '';
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
