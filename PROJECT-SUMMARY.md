# 桑榆智伴 · 项目工作总结报告

> 报告基于 2026-08-31 对项目文件的**实际扫描**（批次 17 刷新）（miniprogram/、server/、sangyu-zhiban-draft/、根目录），非凭记忆编写。

## 项目当前阶段（摘要）

项目已完成 MVP 全部核心闭环并通过交付前全量审查：双端 **18 页**小程序 + Express/JSON 后端 **39 个接口**（31 业务 + 8 增强）全部联通，smoke 自检 **122 项 122/122 通过**（两遍稳定），`MOCK_MODE=true` 答辩演示模式与真实微信登录代码并存。当前能完整演示：家属/老人双角色切换、设备上报触发规则引擎自动告警、老人长按 SOS、家属端 15 秒内实时推送（震动+语音+弹窗+红点）、告警状态机全程处置留痕、7 天趋势图、AI 健康报告、邀请码绑定与服务预约，夜间自主开发新增的**用药提醒、家人留言墙、紧急联系人快捷拨号**，以及后续批次新增的**打字聊天陪伴（三级降级）、个人信息页（高对比/语音开关/编辑资料）、老人端双 tab 与键盘适配、mock 字样清理、品牌符号落地（登录页品牌区 + 头像兜底 + appicon 双版）**；批次 17 已完成 15 项演示链路逐条实测（15/15）、七项可计算视觉审计（WCAG 对比度实算达标、溢出防御补齐）与 docs/11 晨检清单。剩余为增强项（语音通话、数据级鉴权、云迁移），不影响演示。

---

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | 桑榆智伴 |
| 定位 | 一句话：面向居家养老的「家属协同照护 + 老人自助照护」双端小程序，打通健康监测 → 自动预警 → 家属响应 → 服务预约的可审计闭环 |
| 目标用户 | 老人（大字体/一键求助/语音陪伴）与家属（远程监护/预警处置/代办服务），社区医护/志愿者为后续接入方 |
| 技术栈-前端 | 微信小程序原生（WXML/WXSS/JS）、自定义 tabBar、ec-canvas + ECharts 4.9（家属端图表）、原生 Canvas 2D（老人端 sparkline）、CSS 变量设计令牌（暖琥珀主题） |
| 技术栈-后端 | Node.js + Express 4、JSON 文件存储（9 个集合）、极简 .env 读取（无 dotenv 依赖）、内置规则引擎与 token 管理 |
| 设计来源 | sangyu-zhiban-draft/（暖琥珀适老化设计令牌 + 7 页 HTML 设计稿）；根目录另有研发路线 md 与商业计划书 pdf |
| 关键配置 | appid=`wxf6a4508628dc3e41`（project.config.json 与 server/.env 一致）；`MOCK_MODE=true`（前端 config.js 与后端 .env 双开一致）；云开发：project.config.json 已声明 `cloudfunctionRoot: cloudfunctions/`，app.js 预留 `cloudEnvId` 与注释态 `wx.cloud.init`（未接入） |

## 2. 已完成的后端能力（server/，约 2000 行）

### 2.1 数据集合（server/data/，9 个）

| 集合 | 记录数（当前演示态） | 核心字段 | 用途 |
|---|---|---|---|
| users | 2 | openid, role, createdAt | 用户档案（Mock + 真实登录共用） |
| relationships | 1 | id, familyOpenid, elderOpenid, createdAt | 家属↔老人监护关系 |
| devices | 1 | id, elderOpenid, deviceCode, boundAt, status, battery, lastReportAt, unboundAt | 设备生命周期（软删除） |
| health_observations | 8 | id, elderOpenid, date, source(device/mock), heartRate, bloodPressure, spo2, createdAt | 健康时序数据 |
| alerts | 4 | id, elderOpenid, reporterOpenid, source(sos/rule_engine), type, severity, status, timeline[], currentHandler, resolvedNote, ruleId, message, evidence | 告警事件 + 处置时间线 |
| appointments | 2 | id, openid, type, detail, status, createdAt | 服务预约 |
| reports | 1 | id, elderOpenid, periodStart/End, generatedAt, modelVersion, summary, advice[], dataQuality, disclaimer, evidence[] | AI 健康报告 |
| invitations | 0 | code, elderOpenid, createdAt, expiresAt, used, usedBy | 邀请码 |
| reminders | 2 | id, elderOpenid, title, time(HH:MM), note, createdAt | 用药提醒（纯日程提醒，带遵医嘱免责） |
| messages | 2 | id, fromOpenid, toOpenid, text, createdAt | 家人留言墙 |
| contacts | 2 | id, elderOpenid, name, phone, relation, group, createdAt | 紧急联系人（快捷拨号） |
| chats | 若干 | id, openid, role, message, reply, source(spark/local/fallback), timestamp | 打字聊天留痕 |
| sessions | 0 | openid, sessionKey, createdAt | session_key 服务端存储（不下发） |

### 2.2 API 接口（8 个路由文件，30 个业务接口 + 2 个运维端点 /、/healthz）

| 路由文件 | 接口（方法 + 路径） | 级别 |
|---|---|---|
| auth.js | POST /api/login（Mock 建档）、POST /api/updateRole | 核心（演示登录） |
| auth.js | POST /api/auth/login（真实登录）、POST /api/auth/check | 核心（MOCK=false 生效） |
| relationship.js | POST create、GET list、POST unbind | list/unbind 核心，create 辅助 |
| device.js | POST bindDevice、GET list、POST unbind | 核心 |
| device.js | GET status | 辅助（预留） |
| health.js | GET /api/health、GET /api/health/trend | 核心 |
| health.js | POST /api/health/report（设备上报+规则引擎） | 核心 |
| health.js | POST /api/health/mock、/mock/batch | 辅助（演示数据） |
| health.js | GET /api/health/stream | 辅助（调试） |
| alert.js | POST create、GET list、GET detail、POST update、GET check-new | 核心 |
| appointment.js | POST create、GET list | 核心（基础版） |
| report.js | POST generate、GET list、GET detail | 核心 |
| invitation.js | POST generate、POST bind、GET status | 核心 |
| reminders.js | POST create（HH:MM 校验）、GET list、POST delete | 增强（夜间新增，纯日程提醒） |
| messages.js | POST create（1~200 字+fromName 补全）、GET list | 增强（夜间新增） |
| contacts.js | POST create（电话校验）、GET list、POST delete | 增强（夜间新增，仅拨号入口） |
| chat.js | POST /api/chat（三级降级：Spark Lite → 本地引擎 → 兜底） | 核心（演示聊天） |

### 2.3 关键业务逻辑

| 能力 | 实现要点 | 状态 |
|---|---|---|
| 真实登录链路 | wx.login code → jscode2session（appid/secret 读自 .env）→ session_key 仅存 sessions.json → crypto 随机 token（7 天过期、内存 Map、单设备）→ 中间件校验 `Authorization: Bearer`（白名单 /、/healthz、auth 两接口）；secret 未配置返回明确错误不崩溃 | 已完成（代码就绪，真机未验证） |
| 规则引擎 | utils/ruleEngine.js 纯函数；规则表 4 条（心率>120 / <45、血压≥160/100、连续 3 次>100）；去抖：同规则同老人 5 分钟内不重复告警 | 已完成 |
| 告警状态机 | open → acknowledged → (resolved \| escalated → external_dispatched → resolved)；canTransition 集中校验、越序拒绝；每次变更追加 timeline{status,operator,note,at}，更新 currentHandler，resolved 写 resolvedNote；list 返回最近 3 条摘要、detail 返回全量 | 已完成 |
| AI 健康报告 | 规则引擎生成（非大模型）：7 天数据按日聚合 → 摘要 + advice[](level/text/evidenceRefs) + dataQuality(覆盖/缺失/指标统计) + 固定免责声明 + evidence 原始记录引用；无数据生成 insufficient 报告而非报错 | 已完成 |
| 设备生命周期 | 绑定解析归属老人（家属代绑）、status 按 lastReportAt 距今 10 分钟阈值实时计算、上报联动电量、解绑软删除（unboundAt）+ 越权校验 | 已完成 |
| 监护关系 | 邀请码 6 位（10 分钟、同老人单码覆盖、去抖绑定）；撤销授权软删除并**级联解绑该老人全部设备**；list 按 role 过滤并补全 familyName/elderName | 已完成 |
| 测试 | smoke-test.js：静态断言点 116 个，运行时按数据状态执行 **108 项**；运行方式 `cd server && node smoke-test.js`（或 npm run smoke）；当前 **108/108 通过**（两遍验证） | 已完成 |

## 3. 已完成的前端页面（miniprogram/pages/，18 页，前端约 5000 行）

| 页面 | 路径 | 角色 | 核心功能 | 数据来源 | 状态 |
|---|---|---|---|---|---|
| 角色选择 | pages/login | 共用入口 | 双模式登录、角色卡选择、家属无关系引导绑定、隐私 navigator | 接口：login/updateRole/relationship/list | 完整 |
| 家属首页 | pages/family [tab] | 家属端 | 品牌栏、老人状态卡（肖像）、今日健康监测面板、预警横幅、快捷操作、11 个 navigator 入口 | 接口：device/list、health、alert/check-new；静态：状态卡姓名年龄（设计稿演示值） | 完整 |
| 老人首页 | pages/elder [tab] | 老人端 | 琥珀 Hero、设备状态、提醒卡、SOS 红条（按住确认）、三宫格入口、语音播报 | 接口：device/list、alert/create；静态：问候语/提醒卡 | 完整 |
| 我的 | pages/mine [tab] | 共用（家属 tab） | 身份头部、关系列表（撤销授权/解绑）、隐私政策、字体三档、退出登录 | 接口：relationship/list、relationship/unbind、device/list | 完整 |
| 告警与求助 | pages/alert | 共用（双分支） | 老人：220px SOS 圆钮按住确认；家属：告警卡片（类型色边/状态胶囊）+ 弹窗填备注 + 时间线展开 + 状态机流转 | 接口：alert/create/list/detail/update | 完整 |
| 设备管理 | pages/bind-device | 家属端 | 绑定新设备（展开输入）、设备卡片（状态点/电量/最后上报）、解绑二次确认 | 接口：bindDevice/device/list/device/unbind | 完整 |
| 绑定老人 | pages/bind-relationship | 家属端 | 6 位邀请码输入绑定 | 接口：invitation/bind | 完整 |
| 模拟设备上报 | pages/device-report | 家属端 | 快捷预设（75/125/165/100）+ 手动表单上报，触发告警 toast | 接口：health/report | 完整 |
| 健康数据（家属） | pages/health | 共用（按角色分流） | ec-canvas 心率/血压趋势图（参考线）、血氧条件渲染、7/30 天切换、可折叠原始列表、Mock 写入按钮 | 接口：health、health/trend、health/mock、/mock/batch | 完整 |
| 健康数据（老人） | pages/health-elder | 老人端 | 今日心率大数字 + 三色状态点 + canvas2d 迷你折线 + 来源行 | 接口：health、health/trend | 完整 |
| 告警发起（告警页老人分支） | —（含于 alert） | 老人端 | 见 alert 行 | — | — |
| 语音陪伴 | pages/voice | 老人端 | 琥珀 Hero、对话气泡、话题 chips、话筒按钮（**静态视觉，无交互**） | 静态 | 静态视觉 |
| 服务预约 | pages/appointment | 共用 | 类型选择 + 提交 + 我的预约列表 | 接口：appointment/create/list | 完整（基础版） |
| AI 健康报告 | pages/report | 共用 | 生成按钮、周期/完整度/摘要/建议（warn 色+展开依据）/数据来源折叠/历史列表/免责声明 | 接口：report/generate/list/detail | 完整 |
| 邀请家属 | pages/invite | 老人端 | 6 位码大字展示 + 10 分钟倒计时 + 重新生成 + 过期态 | 接口：invitation/generate/status | 完整 |
| 隐私政策 | pages/privacy | 共用 | 五节静态内容 + 勾选同意（Storage） | 静态 | 完整 |
| 用药提醒 | pages/reminders | 共用（双分支） | 日程服药提醒：家属添加/删除（时间 picker + 标题/备注），老人端列表；常驻遵医嘱免责 | 接口：reminder/create/list/delete | 完整（夜间新增） |
| 家人留言 | pages/messages | 共用（双分支） | 家属发布 200 字留言，留言墙倒序展示（昵称+时间） | 接口：message/create/list | 完整（夜间新增） |
| 紧急联系人 | pages/contacts | 共用（双分支） | 家属维护联系人（姓名/电话/关系），老人端一键拨号（二次确认） | 接口：contact/create/list/delete | 完整（夜间新增） |

- tabBar 页 3 个：family、mine、elder（custom-tab-bar 按角色渲染：家属 首页/我的，老人 首页）
- 全部页面根节点接入 `{{fontClass}}`（字体三档全局生效）

### 关键交互实现

| 交互 | 实现要点 | 状态 |
|---|---|---|
| 角色切换与登录 | onChooseRole(data-key) → MOCK：Mock openid 建档+updateRole；真实：wx.login→auth.login；家属无关系 redirectTo 绑定页 | 已完成（真实模式待真机） |
| SOS 防误触 | 按住 1000ms + 松开确认，touchcancel 兜底；两种形态：elder 横向红条 / alert 440rpx 圆钮（脉冲动画）；成功后语音反馈 | 已完成 |
| 家属端实时推送 | utils/polling 15s 轮询 check-new（silent）→ vibrateLong + speak + TabBar 红点(index 1) + showModal；onHide 停 / onShow 恢复 | 已完成 |
| 双端差异化 | 家属：ec-canvas 折线图（min/max/参考线/7-30 天）；老人：大数字 + 状态点 + canvas2d sparkline；health 页按 role redirectTo 分流 | 已完成 |
| 字体系统 | utils/font.js 读 Storage → 根节点 class → app.wxss 三档 CSS 变量（特大 44rpx）；mine 页 actionSheet 设置 | 已完成 |
| 设计令牌 | app.wxss 暖琥珀全量变量（颜色/圆角/阴影/间距/字号），页面 WXSS 零硬编码色值；.theme-dark 深色变量组备用 | 已完成 |

## 4. 设计稿还原情况（sangyu-zhiban-draft/pages/ 7 页）

| 设计稿 | 对应小程序页面 | 还原程度 | 说明 |
|---|---|---|---|
| role-select.html | pages/login | 完整 | 琥珀满屏 + 品牌区 + 双描边角色卡；skip 链接与数据确认态未还原 |
| elder-home.html | pages/elder | 完整 | Hero/提醒卡/SOS 红条/三宫格；**底部 4 tab 未还原**（计划内） |
| family-home.html | pages/family | 完整（面板接真实接口） | 紧急横幅改为「预警中心」入口；状态卡姓名年龄为静态演示值 |
| elder-sos.html | pages/alert（老人分支） | 大部分 | 220px 圆钮/脉冲/按住态已还原；appbar 与成功卡未还原（成功用 toast+语音） |
| health-data.html | pages/health + pages/health-elder | 大部分 | 品牌顶条/分段切换/面板结构还原；图表用 echarts 替代 HTML 静态图；老人简要版另建 |
| voice-companion.html | pages/voice | 视觉结构完整 | 纯静态（Hero/气泡/chips/话筒），无交互逻辑 |
| health-report.html | pages/report | 大部分 | 文档式头部/免责/建议列表还原；分享与导出未做 |

- 图片资产：3 张 jpg 已复制到 `miniprogram/assets/`（companion-warm-illustration / elder-man-portrait / elder-woman-portrait），portrait 已用于 family 状态卡
- 未还原项汇总：老人端 4 tab（涉及 tabBar 重构）；elder-sos 的成功卡页面态（以 toast+语音代替）

## 5. 演示准备

- **`npm run demo:reset`**（server/scripts/demo-reset.js）：先备份 data/ 到 `data/.backup-<时间戳>/`，再重置为演示态——幂等可反复运行；时间戳全部相对当前时间（保证界面显示“X分钟前”）
- **当前演示态（实测）**：健康数据 8 条（近 7 天每天 1 条 + 今天末条心率 125）；告警 4 条（SOS open / 规则 acknowledged / SOS escalated / 规则 resolved，2 条 rule_engine）；预约 2 条（社区医护待处理、志愿者已完成）；报告 1 份（接口生成）；设备 SB-001 在线电量 66；邀请码 0（现场生成）；用户 2
- **答辩前操作步骤**：
  1. 确认 `miniprogram/utils/config.js` 与 `server/.env` 的 `MOCK_MODE=true`（当前即如此）
  2. `cd server && npm start`（确认 healthz 正常）
  3. `npm run demo:reset` 铺演示数据（演示中数据玩乱可随时重跑复原）
  4. 开发者工具勾选「不校验合法域名」后编译，从家属端登录开始演示

## 6. 完整功能链路（已打通的核心闭环）

```
【数据链】设备上报(POST /api/health/report，含电量)
          └→ 规则引擎(ruleEngine 4 条规则, 5 分钟去抖) ──命中──→ 自动创建 rule_engine 告警
【求助链】老人长按 SOS 1 秒(elder 红条 / alert 圆钮) ──→ POST /api/alert/create(open + 时间线首条)
                          ↓
        alerts.json（状态机 open → acknowledged → escalated → external_dispatched → resolved）
                          ↓
【推送】家属端轮询(15s) GET /api/alert/check-new
          └→ 震动 + 语音(alert.mp3) + TabBar 红点 + 弹窗「立即查看」
                          ↓
【处置】家属告警页：确认接单 / 转社区 / 标记派单 / 确认解决（每次填处置备注）
          └→ timeline 逐条追加 + currentHandler 更新 + resolvedNote 留痕
                          ↓
【呈现】family 今日健康监测面板(最新一条+状态色) · health 趋势图(ec-canvas 7/30 天)
        · health-elder 老人简要版(大数字+状态点+sparkline) · AI 报告(规则生成+免责声明)
        · 服务预约(create/list) · 设备管理(在线/电量/解绑)
        · 用药提醒(日程提醒+遵医嘱免责) · 家人留言墙(琥珀气泡) · 紧急联系人(一键拨号)
【支撑链】邀请码绑定监护关系 → 撤销授权级联解绑设备 · Mock/真实双模式登录 · 字体三档 · 隐私政策
```

## 7. 待办与未完成项

| 事项 | 状态 | 预留情况 | 预估工作量 |
|---|---|---|---|
| 预约状态流转（取消/改期/完成） | 部分（状态胶囊已展示；取消/改期操作未实现） | 状态字段与 UI 已预留 | 0.5–1 天 |
| voice 真实语音通话（TRTC 选型） | 未实现（静态视觉页已备） | 页面结构就绪 | 选型 1 天 + 开发 3–5 天 |
| 数据级鉴权（越权校验） | 已预留接口待接入（middleware 挂 req.user，MOCK 放行） | 中间件就绪 | 1–2 天 |
| 老人端底部 4 tab（琥珀求助圆钮） | 未实现（涉及 app.json tabBar 重构 + 跳转方式改造） | 设计稿已还原至页面内 | 1 天 |
| 全局请求失败降级页 | 未实现（当前 toast + 页内空态） | request.js 有统一失败出口 | 0.5 天 |
| 真实登录真机验证 | 已预留接口待接入（代码就绪；.env appsecret 为占位） | 填密钥即可 | 0.5 天（填密钥 + 真机回归） |
| 云开发迁移 | 已预留（cloudfunctionRoot + request 封装口 + cloudEnvId） | 路由逻辑可平移 | 3–5 天 |
| family 状态卡静态字段（姓名/年龄） | 部分（面板已接真数据，姓名年龄仍为设计稿演示值） | — | 0.5 天 |
| sessions.json 保留期清理 | 未实现（只增不减） | — | 0.5 天 |

## 8. 统计汇总

| 指标 | 数量 |
|---|---|
| 小程序页面 | 18（tabBar 页 3，custom-tab-bar 按角色渲染；夜间新增 3 页） |
| 设计稿页面 | 7（全部有对应还原，2 处部分还原） |
| 后端 API 接口 | 39 业务（含 /api/chat 三级降级）+ 2 运维（/、/healthz） |
| 数据集合 | 13 个 JSON 文件（含 chats 对话留痕） |
| smoke 用例 | 脚本断言点 131 个，运行时 122 项，当前 122/122 通过（两遍） |
| 代码规模 | 前端约 5000 行；后端约 2200 行（含 demo-reset/smoke） |
| 图片资产 | 3 张 jpg（已迁入 miniprogram/assets/） |
| 图表依赖 | ec-canvas 组件 6 文件 + echarts 4.9（约 768KB） |
| TODO 注释 | 5 处（均为计划内：云迁移 ×3、语音文件、voice 方案） |

| 模块 | 状态 |
|---|---|
| 登录与角色（Mock / 真实双模式） | 已完成（真实模式待真机验证） |
| 监护关系（邀请码/撤销/级联） | 已完成 |
| 设备生命周期 | 已完成 |
| 健康数据（查询/上报/趋势/Mock） | 已完成 |
| 规则引擎自动告警 | 已完成 |
| 告警状态机 + 时间线 | 已完成 |
| 实时推送（轮询版） | 已完成 |
| AI 健康报告 | 已完成 |
| 服务预约 | 部分完成（缺状态流转） |
| 语音陪伴 | 部分完成（静态视觉） |
| 数据级鉴权 / 全局降级页 / 4 tab / 云迁移 | 未实现（计划内） |
| 用药提醒 / 家人留言墙 / 紧急联系人拨号 | 已完成（夜间自主开发 Batch 11 新增，smoke 108/108） |


## 打磨批次（Batch 15，2026-08-31）

- **老人端导航修复**：custom-tab-bar 双端统一 [首页, 我的] 双 tab（老人端也有「我的」入口），选中态=主色+加粗+顶部指示条，顶部 1rpx 分隔线，hidden 显隐防闪烁。
- **演示字样中性化**：15 处 Mock/演示/模拟 用户可见文案全部改为中性表述（健康数据录入/记录一条健康数据/本地演示环境），功能零删除。
- **内容充实**：mine 页双角色完整个人信息页（关系摘要/高对比/语音播报/关于/演示标识）、alert 与 appointment 空态指引、family 主入口真实摘要、appointment 状态胶囊。
- **真机联调**：BASE_URL 按平台自动切换（工具=localhost / 真机=局域网 IP），当前局域网地址 192.168.1.17。
- 回归：smoke 122/122 两遍；npm test 28/28。

## 夜间自主开发增量（Batch 11，2026-08-30）

由自主 Agent 夜间完成，详见 `AGENT-JOURNAL.md`（含 18 个候选的 Brainstorm 与打分）与 `AUTONOMOUS-REPORT.md`：

| 功能 | 内容 | 新增文件 |
|---|---|---|
| F1 用药提醒 | 家属为老人添加 HH:MM 日程提醒（标题/备注），老人端列表；纯日程提醒，页面常驻「具体用药请遵医嘱」免责 | data/reminders.json、routes/reminders.js、pages/reminders/（×4） |
| F2 家人留言墙 | 家属发布 200 字留言 → 老人端琥珀气泡墙倒序展示（昵称补全） | data/messages.json、routes/messages.js、pages/messages/（×4） |
| F3 紧急联系人拨号 | 家属维护联系人（电话格式校验）→ 老人端一键拨号卡片（二次确认后 wx.makePhoneCall） | data/contacts.json、routes/contacts.js、pages/contacts/（×4） |

实现方式全部为「新增独立文件」：app.js 仅追加 3 行挂载、app.json 仅追加 3 个页面注册、family/elder 首页仅追加入口（additive）、demo-reset 追加播种、smoke 末尾追加用例（89 → 108 项）。核心模块（告警状态机/规则引擎/轮询/报告/设备/邀请码）零改动。
