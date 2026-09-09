# 桑榆智伴 · 微信小程序 MVP 骨架

双端（家属端 / 适老化老人端）微信小程序原生框架（WXML + WXSS + JS），后端规划使用微信云开发（CloudBase）：云函数 + 云数据库 + 云存储。

## 目录结构

```
桑榆/
├── project.config.json        # 开发者工具项目配置（appid 暂为占位 touristappid）
├── miniprogram/               # 小程序主体
│   ├── app.js                 # globalData.role 保存当前角色；云开发环境 ID 预留
│   ├── app.json               # 页面路由 + tabBar（custom: true）
│   ├── app.wxss               # 全局最简样式（入口卡片/占位文案）
│   ├── sitemap.json
│   ├── custom-tab-bar/        # 双角色自定义 tabBar（按 role 渲染不同 tab）
│   └── pages/
│       ├── login/             # 登录：选择“我是家属 / 我是老人”
│       ├── family/            # 家属首页（6 个功能入口）
│       ├── elder/             # 老人首页（一键求助 + 2 个入口）
│       ├── mine/              # 我的（家属端 tab；退出登录/切换身份）
│       ├── bind-device/       # 绑定设备（占位）
│       ├── health/            # 健康数据（占位，双端复用）
│       ├── alert/             # 告警与求助（占位）
│       ├── voice/             # 语音通话（占位）
│       ├── appointment/       # 服务预约（占位）
│       └── report/            # AI 健康报告（占位）
└── cloudfunctions/            # 云函数目录（空占位，见其 README）
```

## 如何运行

1. 打开微信开发者工具 → 导入项目 → 选择本目录（含 `project.config.json` 的目录）。
2. `appid` 当前为占位值 `touristappid`，可先用测试号体验；正式开发请替换为真实小程序 appid（**云开发必须使用真实 appid**）。
3. 编译后进入登录页：点「我是家属」进家属首页（底部 tab：首页/我的），点「我是老人」进老人首页（底部 tab：仅首页）。

## 双角色 tabBar 说明

微信原生 tabBar 无法按角色动态切换，因此 `app.json` 中 `tabBar.custom = true`，由 `miniprogram/custom-tab-bar/` 组件根据 `role`（`globalData` + 本地 Storage）渲染：

- `family`：首页、我的
- `elder`：首页

登录页选择角色时写入 Storage 并跳转对应首页；「我的」页可退出登录（清除角色）回到登录页。各 tab 页在 `onShow` 中调用 `getTabBar().setSelected(index)` 高亮当前 tab。

## 本地后端（开发期）

`server/` 为 Express + JSON 文件存储的本地后端，接口路径与后期云函数一一对应：

```bash
cd server
npm install
npm start           # 监听 http://localhost:3000
npm run smoke       # 一键自检全部接口（需先启动服务）
```

- 统一返回格式：`{ code: 0, msg: 'ok', data }` / `{ code: -1, msg: '错误描述' }`
- 浏览器打开 `http://localhost:3000` 为本地启动页：展示小程序双端功能、页面与接口清单，并附实时数据面板（与小程序同接口、同 Mock 身份，可一键求助 / 写入 Mock 健康数据）；服务状态 JSON 在 `GET /healthz`
- 小程序侧统一走 `miniprogram/utils/request.js`（BASE_URL 在文件顶部），迁移云开发时只改这一个文件
- 本地联调用固定 Mock 身份：家属 `mock_family_001`、老人 `mock_elder_001`（见 `miniprogram/utils/config.js`）
- `server/data/relationships.json` 预置了这两个身份的演示监护关系，家属端开箱即可看到老人告警
- 数据落在 `server/data/*.json`，可随时查看/手动清理；`alert/update` 有状态机校验（open → acknowledged → resolved）
- 开发者工具需勾选「不校验合法域名」（设置 → 项目设置 → 本地设置）

## 云开发预留

开通云开发后：在 `app.js` 的 `globalData.cloudEnvId` 填入环境 ID，并打开 `onLaunch` 中注释的 `wx.cloud.init(...)`。迁移时前端只需把 `utils/request.js` 的 `request` 实现换成 `wx.cloud.callFunction`，`server/routes/` 下各路由逻辑平移进对应云函数。
