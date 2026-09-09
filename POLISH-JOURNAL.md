# POLISH-JOURNAL · 打磨批次日志（Batch 18：login 角色选择页三件套）

- 时间：2026-08-31（验收复盘驱动的补齐轮）
- 范围：**只改 `pages/login` 三件套**（login.json / login.wxml / login.wxss），login.js 零改动，其余页面一律未动
- 改前副本：`nightly-backup-20260831-0338/login.wxml.pre-polish`、`login.wxss.pre-polish`（可逐字节还原比对）
- 说明：本轮无截图能力，改前/改后以**结构与样式参数对比**记录；真机截图待用户晨检时补充到本文件末尾

## 改前 → 改后对比

### 1. 导航栏标题去重
- 改前：`login.json` → `navigationBarTitleText: "桑榆智伴"`，与页面内 68rpx 大标题「桑榆智伴」上下重复
- 改后：`navigationBarTitleText: "选择身份"`，告诉用户这一步在干什么；品牌名只保留页面大标题一处

### 2. slogan 具体化
- 改前：`温暖陪伴，安心守护`（空话，无场景）
- 改后：`一键呼叫，家人马上知道`（具体场景 + 结果承诺，指向 SOS 核心功能；不用"守护/赋能"类词）

### 3. 双角色卡图标区分（44rpx CSS 几何体系扩展，currentColor，零新增色值）
- 改前：两卡都是 `.ico-person`（同一个人形），区分度只靠文字
- 改后：
  - 老人卡 `.ico-elder`：圆头 + 半圆身 + **倒 U 手杖**（`.ico-elder-cane`，4rpx 描边 12×24 圆角顶）——长者拄拐意象
  - 家属卡 `.ico-family`：大人圆头 + 半圆肩，`box-shadow` 缩小复制出**交叠的小人**——双人/守护意象

### 4. 功能点降噪（列表墙 → 一句核心描述）
- 改前：`一键求助 · 语音陪伴 · 健康查看` / `远程监护 · 预警处理 · 健康报告`（三连点，信息密度高）
- 改后：老人卡 `大字大按钮，一键呼叫家人`；家属卡 `远程查看健康，异常即时提醒`（各一句，动词开头说清得到什么）

### 5. 老人卡视觉加权（主要使用者给更大焦点）
- 改前：两卡完全对称（同高 192rpx、同描边、同 80rpx 图标）
- 改后（`.role-card--elder`）：
  - 高度 192 → **232rpx**，标题 48 → **52rpx**
  - 边框 4rpx 中性 → **6rpx 主色 var(--color-primary)**
  - 图标 80rpx 透明底 → **96rpx 主色圆形实底**（白前景图标，`--color-primary-foreground`）
  - 家属卡保持原描边样式，形成"主卡 + 次卡"层级
- 附：两卡 `button` 加 `aria-label`（"我是老人，点这里进入老人端"）

### 6. 品牌符号尺寸修正（G5 复核项）
- 改前：`.brand-mark` 128rpx，低于 G5 要求的 160~200rpx
- 改后：**176rpx**（区间中值），logo 视觉存在感与品牌区平衡

## 约束自查
- 只动 login.json / login.wxml / login.wxss ✅（login.js 未改，onChooseRole 与 data-key 原样）
- 无新增硬编码色值（新样式全部走 `--color-primary` / `--color-primary-foreground` / `currentColor`，grep 十六进制色值 0 命中）✅
- 适老化：卡片 min-height ≥232rpx（>112rpx）、描述文字 36rpx（--font-base）、标题 52rpx ✅
- app.json tabBar 未动 ✅

## 验证
- wxml 栈式闭合校验通过；wxss 花括号平衡
- `demo:reset` → smoke **122/122** ×2；`npm test` **28/28**
- hash 基线 10 文件零漂移

## 真机待确认（晨检时补截图到这里）
1. 拐杖图标与双人图标在小屏（iPhone SE 级）是否清晰不糊
2. 老人卡 232rpx + logo 176rpx 后一屏是否仍能同时看到两张卡（iPhone SE 高度约 1334rpx 物理视口，估算可同屏；若溢出则滚动可达即可接受，或把 brand-area margin-bottom 96rpx 减到 64rpx）
3. 「一键呼叫，家人马上知道」文案是否合意（可换「不舒服？点一下，家人马上知道」备选）
## Spark 诊断（2026-08-31）

```text
SPARK_API_PASSWORD=SLcFAs***
HTTP_STATUS=500
RESPONSE_BODY={"error":{"message":"AppIdNoAuthError (sid: cha000ae93b@dx1a057a81ad19a4b812)","type":"api_error","param":null,"code":"11200"}}
```

- 判断：响应明确为 `AppIdNoAuthError`，但错误码 `11200` 不在本次给定对照表的精确分类中；不能据此未经核实地断言是流控、model 无效或免费包未领取。需在讯飞控制台核对该应用对 Spark Lite OpenAI 兼容接口的授权/服务领取状态，或依据 sid 向讯飞查询。
- model 试探：未执行。首轮错误不是 model 无效（`10163` / `10201`），不满足试探条件。
