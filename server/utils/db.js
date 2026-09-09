// JSON 文件"数据库"工具：一个 collection 对应 data/ 目录下的一个 JSON 文件（数组）。
// MVP 阶段够用且零依赖；迁移云开发时，这些函数的调用点直接换成云数据库 API 即可。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const fileOf = (collection) => path.join(DATA_DIR, `${collection}.json`);

// 读 collection，返回数组；文件不存在或内容损坏时按空库处理
function read(collection) {
  try {
    const arr = JSON.parse(fs.readFileSync(fileOf(collection), 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    return [];
  }
}

// 整体写回 collection
function write(collection, data) {
  fs.writeFileSync(fileOf(collection), JSON.stringify(data, null, 2), 'utf8');
}

// 按条件查找，返回数组（filter 语义）
function findWhere(collection, predicate) {
  return read(collection).filter(predicate);
}

// 追加一条，返回该条
function insert(collection, item) {
  const data = read(collection);
  data.push(item);
  write(collection, data);
  return item;
}

// 简易 ID 生成：前缀_时间戳_随机串（MVP 够用，迁移后换数据库自增/uuid）
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { read, write, findWhere, insert, genId };
