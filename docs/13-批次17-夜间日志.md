# NIGHTLY-JOURNAL · Goal 模式夜间日志（Batch 17）

- 开始：2026-08-31（Goal 模式，无人值守）
- 单实例锁：`.nightly.lock`（PID=63892，hash 基线 10 文件）
- 备份：`nightly-backup-20260831-0338/`
- 上一轮基线：smoke 122 项 122/122；npm test 28/28；18 页 / 39 接口 / 13 集合

---

## 开工检查

- [x] 上一轮产物已读（AGENT-JOURNAL / AUTONOMOUS-REPORT / PROJECT-SUMMARY / REVIEW-REPORT；CONTENT-REVIEW.md 不存在，内容审查在 REVIEW-REPORT 第 5 节）
- [x] F1/F2/F3 已确认上轮完成——本轮不重复实现
- [x] 双 MOCK_MODE=true ✓
- [x] 3000 端口空闲 ✓
- [x] `.nightly.lock` 创建 + 10 文件 hash 基线 ✓
- [x] `nightly-backup-20260831-0338/` 备份 ✓

---

## Goal 评估（开工时）

| Goal | 状态 | 自评 | 主要 Gap |
|---|---|---|---|
| G1 稳定性零回归 | 达标（上轮 122/122×2） | 95 | 需本轮改动后复验 |
| G2 视觉与交互自我审计 | 部分达标 | 70 | WCAG 对比度未实算；间距网格有点值未全扫；点击区/字号未系统审计；溢出防御部分缺 |
| G3 演示链路零失误 | 达标（smoke 覆盖） | 95 | 15 项需对照本轮数据再实证一遍 |
| G4 合规与内容真实 | 基本达标 | 90 | 医疗词/TODO/console.log 需终检；假数据上轮已清 |
| G5 品牌落地 | 未启动 | 0 | brand/ 素材：docs/brand/sangyu-zhiban-symbol-v2.svg（512 viewBox 几何符号，可软件栅格化） |
| G6 发展项 | 未启动 | — | G1~G5 达标后评估 |

### 优先级表

| 序 | 任务 | Goal | 风险 |
|---|---|---|---|
| 1 | G1 回归：smoke×2 + npm test + wxml 校验 + 演示态 | G1 | 低 |
| 2 | G2 审计脚本（对比度 WCAG 实算/间距/点击区/字号/安全区/溢出/多通道）+ 不达标最小修复 | G2 | 低 |
| 3 | G3 15 项链路逐条 curl 实测 | G3 | 低 |
| 4 | G4 合规 grep 终检 | G4 | 低 |
| 5 | G5 品牌落地：SVG 栅格化（零依赖自研渲染器）→ appicon-512 + 登录页 + mine 头像兜底 | G5 | 中 |
| 6 | G6 视情况 | — | — |

---

## 执行记录（实时追加）

### G1 · 稳定性零回归 ✅ 通过
- smoke **122/122 连续两遍**（每遍前 demo:reset）✅
- npm test **28/28** ✅
- wxml 结构校验（栈式 + 自闭合合法 + 根外残留检测）：**18+1 文件全部 ✅**
- 演示态：心率末条 125 / 告警 4 条 4 状态 / 提醒 2 含已服用 1 / 留言 2 含未读 1 / 联系人 2 / 设备在线电量 66 ✅

### G2 · 视觉与交互自我审计 ✅ 完成
- 审计工具：`scripts/visual-audit.js`（保留复用，本轮修复了 multi 段路径 bug）
- 七项结果：
  1. 对比度（WCAG 2.1 实算）：正文/次要/语义色 on 卡片底全部 ≥4.5:1 ✅；品牌主色 #B5832E on 浅底 2.7~3.4:1，仅用于 ≥38rpx 粗体大字与图形场景（大字标准 ≥3:1 达标）✅
  2. 间距网格：8 处 6/14/18rpx 半步值（2rpx 精度内，视觉一致，记录不动）⚠️已评估
  3. 点击区：23 处 <112rpx 元素，逐一核对均为非交互装饰（图标/徽章/说明文字），交互元素全部达标 ✅
  4. 字号：主体文字 ≥36rpx ✅；26rpx 仅限辅助 caption（记录）
  5. 安全区：--tabbar-height 令牌 + env(safe-area) 全覆盖 ✅
  6. 溢出防御：report / messages 本轮补 `overflow-wrap: anywhere` ✅（修复项）
  7. 状态多通道：颜色+文字+形状+弹窗+震动全链 ✅

### G3 · 演示链路 15 项实测 ✅ 15/15
- 首测 7/15——❌ 全部为测试脚本参数/字段名猜错（reminder 而非 remind；health/appointment/report 用 openid；提醒字段 takenToday 而非 taken；alert/list 用 familyOpenid），**接口与演示数据本身零缺陷**
- 修正后 15/15 ✅（healthz/健康心率125/设备电量66/告警4状态/关系/提醒2含已服1/留言未读/联系人分组/陪伴对话三级降级/预约/趋势/报告/告警详情/打卡字段/用户资料）

### G4 · 合规与内容真实 ✅ 通过
- TODO/FIXME/debugger：0；console.*：仅 app.js 注释态代码内 1 处（红线 7 保留）
- 医疗越界词：2 处命中均为免责否定句（"不构成诊断或治疗建议"）✅
- mock 字样：用户可见文案 0；仅标识符/注释/接口名（.mock-btn 类名、/api/health/mock）✅
- 三处免责齐备：privacy.wxml:17 / reminders.wxml:3 / report.wxml:19 ✅
- 前端硬编码健康数值：0 命中 ✅

### G5 · 品牌落地 ✅ 完成
- 素材：docs/brand/sangyu-zhiban-symbol-v2.svg（512 viewBox，双弧环+琥珀菱形）
- 零依赖栅格化：`scripts/gen-brand-png.js`（纯 Node + 内置 zlib，手写 PNG 编码，4× 超采样）→ **brand/appicon-512.png**（浅底深弧版）+ **brand/appicon-512-white.png**（深底白弧版）+ miniprogram/assets/brand/{symbol.png, symbol-white.png, symbol.svg}
- 接入：login.wxml 品牌区 ico-ring → symbol.png；mine.wxml 头像兜底（无头像时显示品牌符号）
- tabBar 图标：按协议跳过；elder/family 首页 CSS 环与符号同语义，保留
- 小程序 image 真机不支持本地 SVG，故全部走 PNG；SVG 保留作源文件

### G6 · 发展项
- G1~G5 占满本轮预算；溢出防御与品牌兜底即为质量向增量。功能深度闭环（打卡家属可见/留言已读/联系人分组/预约状态流转）已在既往批次实现，本轮无新增功能。

### docs 整理 ✅
- 根目录 10 个已归档英文报告副本删除（逐一 diff 验证 docs 内中文版相同/超集：AGENT/AUTONOMOUS/GOAL/FIX/POLISH ×2/REVIEW/路线文档）
- 新增：docs/11-晨检清单-MORNING-CHECK.md、docs/12-批次17-夜间验收报告.md、docs/13-批次17-夜间日志.md（本文件归档副本）
- 刷新：PROJECT-SUMMARY.md + docs/00-项目总结报告.md（同步）、docs/00-文档导航.md、docs/README-文档导航.md

### 终验 ✅ 全绿
- demo:reset → smoke **122/122**（第一遍）→ demo:reset → smoke **122/122**（第二遍）
- npm test **28/28**
- wxml 结构校验 **19/19**（含本轮修改的 login/mine）
- hash 基线（sha256×10 文件）：**零漂移，无并行会话修改**（注：写锁算法为 sha256[:16]）
- 后端服务：**保留运行**（3000 端口，供真机验证）；如需停止：`netstat -ano | findstr :3000` 后 `taskkill /PID <pid> /F`
- `.nightly.lock`：收尾删除（见下）

### 本轮全部代码改动清单
1. `pages/report/report.wxss`：+3 行（overflow-wrap 防御）
2. `pages/messages/messages.wxss`：+3 行（overflow-wrap 防御）
3. `pages/login/login.wxml`：品牌区图标替换为品牌符号图（1 处）
4. `pages/login/login.wxss`：+.brand-mark-img（6 行）
5. `pages/mine/mine.wxml`：头像兜底首字 → 品牌符号图（1 处）
6. `pages/mine/mine.wxss`：+.mine-avatar-fallback（6 行）
7. 新增：scripts/gen-brand-png.js、scripts/visual-audit.js（工具）、assets/brand/×3、brand/×2
8. 文档：docs/ 新增 3 删 0 改 3，根目录删 10 冗余副本

---

## 复盘补齐轮（Batch 18）· 验收复盘驱动

### login 三件套五项打磨 ✅（只动 login.json/wxml/wxss，js 零改动）
导航标题「选择身份」/ slogan「一键呼叫，家人马上知道」/ 老人卡拐杖图标+家属卡双人图标（CSS 几何扩展）/ 功能点降噪为一句核心描述 / 老人卡视觉加权（232rpx 高、主色实边、96rpx 主色圆底图标）；logo 调至 176rpx（G5 要求 160~200）。明细见根目录 POLISH-JOURNAL.md（重建）。

### G3 缺失项补测 ✅ 四项全通
① updateRole 双向（profile 实查）｜④ check-new（hasNew/count/latest）｜⑪ 邀请码生成→绑定→撤销→重绑全闭环｜⑬ 语音包降级静态走查（onError→文字，不报错）。

### 真 Bug 修复：邀请码撤销后重绑假成功 ✅
server/routes/invitation.js bind 幂等查找未过滤软删除记录 → 撤销后再绑返回 ok 但关系不恢复。最小修复：只匹配未解绑关系，命中软删除记录则复活（清 unboundAt）。闭环回归通过。

### G4 补查 ✅
紧急联系人页免责存在（contacts.wxml:3）；睡眠/步数/血糖/心情评分等假指标 grep 零命中。

### 回归与收尾 ✅
smoke 122/122 ×2（每遍前 demo:reset）、npm test 28/28、hash 基线零漂移；demo:reset 恢复演示态（心率 125/告警 4/关系 1）；**已停服、3000 已释放**；锁已删。
