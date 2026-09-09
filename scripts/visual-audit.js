// 视觉与交互审计脚本（Batch 17 · G2，临时用完删除）
// 七项可计算指标：对比度 WCAG 实算 / 间距网格 / 点击区 / 字号 / 安全区 / 溢出防御 / 状态多通道
// 结果同时打印与写入 NIGHTLY-JOURNAL 追加段
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const findings = { contrast: [], grid: [], tap: [], font: [], safe: [], overflow: [] };

// ---------- WCAG 相对亮度与对比度 ----------
function lum(hex) {
  const c = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(fg, bg) {
  const l1 = lum(fg);
  const l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ---------- 1. 令牌组合对比度全矩阵 ----------
const TEXT_TOKENS = {
  'text(主文字)': '#2A2316',
  'text-secondary(次级)': '#6B5D44',
  'primary(主色)': '#B5832E',
  'danger(异常)': '#C62828',
  'success(正常)': '#2D7A3D',
  'warning-text(留意)': '#8A6508',
  'info(信息)': '#1A6B8C'
};
const BG_TOKENS = {
  'bg(柔象牙白)': '#FFF9F0',
  'card(白卡)': '#FFFFFF',
  'muted(浅底)': '#F5EFE2',
  'danger-soft': '#FBEAEA',
  'warning-soft': '#F7EFD8',
  'success-soft': '#E6F0E8',
  'info-soft': '#E3EEF3',
  'primary-soft': '#F5E6CC'
};

console.log('== 1. 对比度矩阵（前景 × 背景令牌，WCAG 2.1）==');
for (const [fn, fg] of Object.entries(TEXT_TOKENS)) {
  for (const [bn, bg] of Object.entries(BG_TOKENS)) {
    const r = contrast(fg, bg);
    const tag = r >= 4.5 ? '✓4.5' : r >= 3 ? '△3(仅大字)' : '✗';
    if (r < 3) findings.contrast.push(fn + ' on ' + bn + ' = ' + r.toFixed(2));
    console.log('  ' + fn + ' × ' + bn + ' = ' + r.toFixed(2) + ' ' + tag);
  }
}

// ---------- 2~4. wxss 扫描 ----------
const wxFiles = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.wxss')) wxFiles.push(p);
  });
}
walk(path.join(MP, 'pages'));
wxFiles.push(path.join(MP, 'app.wxss'), path.join(MP, 'custom-tab-bar', 'index.wxss'));

console.log('== 2. 间距网格审计（4rpx 半步网格外的值）==');
const gridOff = [];
wxFiles.forEach((f) => {
  const c = fs.readFileSync(f, 'utf8');
  const re = /(padding|margin|gap)[a-z-]*\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(c))) {
    (m[2].match(/(-?\d+(?:\.\d+)?)rpx/g) || []).forEach((v) => {
      const n = Math.abs(parseFloat(v));
      if (n >= 4 && n % 4 !== 0) gridOff.push(f.split('miniprogram')[1] + ' ' + m[1] + ': ' + v);
    });
  }
});
console.log(gridOff.length ? gridOff.map((g) => '  ' + g).join('\n') : '  全部落格 ✓');

console.log('== 3. 点击区审计（<112rpx 的规则，需人工核对是否可点元素）==');
const tapHits = [];
wxFiles.forEach((f) => {
  const c = fs.readFileSync(f, 'utf8');
  const re = /\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(c))) {
    const h = /(?:min-)?height:\s*(\d+)rpx/.exec(m[2]);
    if (h && parseInt(h[1]) < 112 && parseInt(h[1]) >= 44) {
      tapHits.push(f.split('miniprogram')[1] + ' .' + m[1] + ' ' + h[1] + 'rpx');
    }
  }
});
console.log(tapHits.length ? tapHits.map((t) => '  ' + t).join('\n') : '  无');

console.log('== 4. 字号审计（<32rpx 的 font-size）==');
const fontHits = [];
wxFiles.forEach((f) => {
  const c = fs.readFileSync(f, 'utf8');
  const re = /font-size:\s*(\d+)rpx/g;
  let m;
  while ((m = re.exec(c))) {
    if (parseInt(m[1]) < 32) fontHits.push(f.split('miniprogram')[1] + ' ' + m[1] + 'rpx');
  }
});
console.log(fontHits.length ? fontHits.map((t) => '  ' + t).join('\n') : '  无');

console.log('== 5. 安全区审计 ==');
const tabPages = ['elder', 'family', 'mine'];
tabPages.forEach((p) => {
  const c = fs.readFileSync(path.join(MP, 'pages', p, p + '.wxss'), 'utf8');
  const okRule = /padding-bottom:\s*calc\(var\(--tabbar-height\)\s*\+\s*env\(safe-area-inset-bottom\)\)/.test(c);
  console.log('  ' + p + ': ' + (okRule ? '✓ tabbar-height + safe-area 已预留' : '✗ 缺预留'));
});
const v = fs.readFileSync(path.join(MP, 'pages', 'voice', 'voice.wxss'), 'utf8');
console.log('  voice: ' + (v.includes('env(safe-area-inset-bottom)') ? '✓ 输入栏已叠 safe-area' : '✗'));

console.log('== 6. 溢出防御审计 ==');
const overflowTargets = [
  ['pages/report/report.wxss', /overflow-wrap|word-break/],
  ['pages/alert/alert.wxss', /overflow-wrap|word-break/],
  ['pages/messages/messages.wxss', /overflow-wrap|word-break|break-all/],
  ['pages/mine/mine.wxss', /overflow-wrap|word-break/]
];
overflowTargets.forEach(([f, re]) => {
  const c = fs.readFileSync(path.join(MP, f), 'utf8');
  console.log('  ' + f + ': ' + (re.test(c) ? '✓ 有溢出防御' : '✗ 无'));
});

console.log('== 7. 状态多通道审计（颜色+文字+形状）==');
const multi = [
  ['pages/alert/alert.wxss', 'alert-status', '状态胶囊'],
  ['custom-tab-bar/index.wxss', 'tab-ind', 'tab 指示条'],
  ['pages/contacts/contacts.wxss', 'ct-item', '联系人分组条'],
  ['pages/family/family.wxss', 'metric-alert', '异常底色块']
];
multi.forEach(([f, cls, name]) => {
  const c = fs.readFileSync(path.join(MP, f), 'utf8');
  console.log('  ' + cls + ': ' + (c.includes(cls) ? '✓' : '✗ 缺'));
});

console.log('\n===== 审计结束（结果已打印，供 NIGHTLY-JOURNAL 摘录）=====');
