// 品牌符号光栅化：docs/brand/sangyu-zhiban-symbol-v2.svg → PNG
// 纯 Node 实现（内置 zlib，零依赖），按 SVG 几何重绘：
//   弧面 = 圆环(圆心 256,256 外径 180 内径 112) 裁角度 [37.6°,254.8°]，另一片旋转 180°（两弧相向、端部交叠）
//   菱形 = (256,181)(331,256)(256,331)(181,256)
// 4× 超采样抗锯齿；输出深色版（浅底用）与白弧版（深底用）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const S = 512;
const SS = 4; // 每像素 4×4 子样本
const CX = 256, CY = 256, R_OUT = 180, R_IN = 112;
const A1_START = 37.6, A1_END = 254.8; // 屏幕角（y 向下，顺时针），C1 覆盖区间
const DIA = [[256, 181], [331, 256], [256, 331], [181, 256]]; // 菱形顶点

function inRing(x, y) {
  const dx = x - CX, dy = y - CY;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > R_OUT || r < R_IN) return false;
  // atan2 屏幕角 0..360
  let a = Math.atan2(dy, dx) * 180 / Math.PI;
  if (a < 0) a += 360;
  const inC1 = a >= A1_START && a <= A1_END;
  const inC2 = a >= (A1_START + 180) % 360 || a <= (A1_END + 180) % 360;
  return inC1 || inC2;
}

function inDiamond(x, y) {
  // 凸四边形半平面判定（顶点顺时针）
  let inside = true;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = DIA[i], [x2, y2] = DIA[(i + 1) % 4];
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (cross < 0) { inside = false; break; }
  }
  return inside;
}

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

// 生成一张 RGBA PNG：arcColor 弧面色，diamondColor 菱形色，bg 透明
function render(arcHex, diaHex) {
  const [ar, ag, ab] = hex(arcHex);
  const [dr_, dg, db] = hex(diaHex);
  const raw = Buffer.alloc(S * (S * 4 + 1));
  let p = 0;
  for (let y = 0; y < S; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < S; x++) {
      let nArc = 0, nDia = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          if (inDiamond(px, py)) nDia++;
          else if (inRing(px, py)) nArc++;
        }
      }
      const n = SS * SS;
      // 菱形在上、弧面在下，各自按覆盖率混合到透明底
      const aDia = nDia / n, aArc = nArc / n;
      const a = Math.min(1, aDia + aArc);
      let r = 0, g = 0, b = 0;
      if (a > 0) {
        r = (dr_ * aDia + ar * aArc) / (aDia + aArc || 1);
        g = (dg * aDia + ag * aArc) / (aDia + aArc || 1);
        b = (db * aDia + ab * aArc) / (aDia + aArc || 1);
      }
      raw[p++] = Math.round(r); raw[p++] = Math.round(g); raw[p++] = Math.round(b);
      raw[p++] = Math.round(a * 255);
    }
  }
  return encodePNG(raw);
}

// PNG 编码：IHDR + IDAT(zlib) + IEND，CRC32 手写
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// 深色版：浅底使用（弧面深棕 #28231F + 琥珀菱形 #E99A35）
const dark = render('#28231F', '#E99A35');
// 白弧版：深底使用（弧面柔象牙白 + 琥珀菱形）
const white = render('#FFF9F0', '#E99A35');

const outRoot = path.join(ROOT, 'brand');
fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, 'appicon-512.png'), dark);
fs.writeFileSync(path.join(outRoot, 'appicon-512-white.png'), white);
const outMp = path.join(ROOT, 'miniprogram', 'assets', 'brand');
fs.mkdirSync(outMp, { recursive: true });
fs.writeFileSync(path.join(outMp, 'symbol.png'), dark);
fs.writeFileSync(path.join(outMp, 'symbol-white.png'), white);
console.log('OK appicon-512.png', dark.length, 'bytes; appicon-512-white.png', white.length, 'bytes');
