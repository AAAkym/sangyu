// 桑榆智伴 · 本地开发后端入口
// 定位：MVP 阶段用 Express + JSON 文件模拟数据库；接口路径与后期云函数一一对应，
// 迁移时前端只改 miniprogram/utils/request.js（wx.request → wx.cloud.callFunction），
// 各路由的业务逻辑可直接平移进云函数。
const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./utils/db');
const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const remindersRoutes = require('./routes/reminders');
const messagesRoutes = require('./routes/messages');
const contactsRoutes = require('./routes/contacts');
const chatRoutes = require('./routes/chat');
const relationshipRoutes = require('./routes/relationship');
const deviceRoutes = require('./routes/device');
const healthRoutes = require('./routes/health');
const alertRoutes = require('./routes/alert');
const appointmentRoutes = require('./routes/appointment');
const reportRoutes = require('./routes/report');
const invitationRoutes = require('./routes/invitation');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 统一响应格式：{ code: 0, msg: 'ok', data } / { code: -1, msg: '错误描述' }
app.use((req, res, next) => {
  res.ok = (data = null) => res.json({ code: 0, msg: 'ok', data });
  res.fail = (msg = '请求失败') => res.json({ code: -1, msg });
  next();
});

// 请求鉴权（Batch 9）：MOCK_MODE=true 放行；否则校验 Bearer token（白名单见 middleware/auth.js）
app.use(authMiddleware);

// 启动页：与小程序真实页面/接口一一对应的说明 + 实时数据面板（server/public/index.html）
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 头像静态目录（Batch 16 · 编辑资料）：/avatars/<openid>.png，前端拼 BASE_URL 访问
app.use('/avatars', express.static(path.join(__dirname, 'public', 'avatars')));

// 服务状态 JSON（原 / 的健康检查迁到这里，附各 JSON 文件记录数，供脚本/启动页读取）
app.get('/healthz', (req, res) => {
  const uptime = process.uptime();
  const uptimeText = uptime < 60
    ? `${Math.round(uptime)} 秒`
    : `${Math.floor(uptime / 3600)} 小时 ${Math.floor((uptime % 3600) / 60)} 分`;
  res.ok({
    name: 'sangyu-server',
    status: 'running',
    port: PORT,
    uptimeText,
    counts: {
      health: db.read('health_observations').length,
      alerts: db.read('alerts').length,
      appointments: db.read('appointments').length,
      devices: db.read('devices').length,
      relationships: db.read('relationships').length,
      users: db.read('users').length,
      reports: db.read('reports').length
    }
  });
});

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', relationshipRoutes);
app.use('/api', deviceRoutes);
app.use('/api', healthRoutes);
app.use('/api', alertRoutes);
app.use('/api', appointmentRoutes);
app.use('/api', reportRoutes);
app.use('/api', invitationRoutes);
app.use('/api', remindersRoutes);
app.use('/api', messagesRoutes);
app.use('/api', contactsRoutes);
app.use('/api', chatRoutes);

// 未匹配到的接口
app.use((req, res) => res.fail(`接口不存在: ${req.method} ${req.path}`));

// 兜底错误（含请求体 JSON 解析失败）
app.use((err, req, res, next) => {
  console.error('[server error]', err.message);
  res.fail(err.type === 'entity.parse.failed' ? '请求体不是合法 JSON' : '服务器内部错误');
});

app.listen(PORT, () => {
  console.log(`桑榆智伴本地后端已启动: http://localhost:${PORT}`);
});
