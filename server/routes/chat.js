// 打字聊天路由（Batch 13 · P1）：三级降级 Spark Lite → 本地 chatEngine → 兜底反问
// 密钥安全：SPARK_* 全部读自 .env，不写日志、不进错误信息、不下发前端
// 存储：每轮对话追加到 chats.json（openid/role/message/reply/source/timestamp）
const express = require('express');
const db = require('../utils/db');
const env = require('../utils/env');
const spark = require('../utils/sparkClient');
const chatEngine = require('../utils/chatEngine');

const router = express.Router();

// 人设提示词（三段式：语气 / 对话方式 / 安全禁忌），支持 .env CHAT_SYSTEM_PROMPT 整段覆盖
// 默认人设：「小伴」——温暖耐心的陪伴者，面向老人
const DEFAULT_SYSTEM_PROMPT = [
  '【身份与语气】你是「小伴」，一位温暖耐心的陪伴者，陪一位老人打字聊天。',
  '语气永远温和、亲切、尊敬，像晚辈陪长辈唠家常；可以带一点幽默，但绝不油腔滑调。',
  '',
  '【对话方式】',
  '1. 短句为主，每次回复不超过三句话，一段话控制在 60 字以内；',
  '2. 先共情再回应：老人说难受先安慰，说开心先顺着夸；',
  '3. 多用引导式反问（"后来呢？""想吃点什么？"），让老人有话可接；',
  '4. 老人重复说同一件事，也要像第一次听到一样耐心回应；',
  '5. 记住老人提过的称呼和事情，下次聊天主动提起。',
  '',
  '【安全禁忌（最高优先）】',
  '1. 你不是医疗助手：老人提到身体不适（疼/晕/闷/乏力等），只温柔地建议"联系家人"或"去医院看看"，',
  '   绝不给出诊断、疾病名称、用药、剂量等任何医疗建议；',
  '2. 不聊政治、财经、投资话题；老人提起就温和地岔开；',
  '3. 老人说"想不开""不想活"等话，立即温柔劝说并强烈建议联系家人，同时提示会通知家人。',
].join('\n');

const SYSTEM_PROMPT = env.get('CHAT_SYSTEM_PROMPT') || DEFAULT_SYSTEM_PROMPT;

// POST /api/chat 请求：{ openid, role, message, history? }
// history：最近轮次 [{ message, reply }]，仅保留最近 5 轮做简单上下文记忆
router.post('/chat', async (req, res) => {
  const { openid, role, message, history } = req.body || {};
  if (!openid) return res.fail('缺少 openid');
  const text = String(message || '').trim();
  if (!text) return res.fail('消息内容不能为空');

  // 简单记忆：跨轮记住称呼（chatEngine 在 memory 对象上维护）
  const memory = memoryFor(openid);

  // 上下文：最近 5 轮，转成 OpenAI 兼容 messages
  const turns = (Array.isArray(history) ? history : [])
    .filter((h) => h && hasValue(h.message) && hasValue(h.reply))
    .slice(-5)
    .flatMap((h) => [
      { role: 'user', content: String(h.message) },
      { role: 'assistant', content: String(h.reply) }
    ]);

  let replyText = '';
  let source = 'local';

  // 第一级：Spark Lite（配置了 APIPassword 才启用）
  if (spark.configured()) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT + (memory.name ? '老人称呼：' + memory.name + '。' : '') },
        ...turns,
        { role: 'user', content: text }
      ];
      replyText = await spark.callSpark(messages);
      source = 'spark';
    } catch (err) {
      // 未配置/超时/5xx/流控(11200~11203)/解析失败 → 一律降级本地引擎，不透出原始报文
      replyText = '';
    }
  }

  // 第二级：本地陪伴引擎（含第三级兜底反问）
  if (!replyText) {
    const local = chatEngine.reply(text, turns, memory);
    replyText = local.text;
    source = local.matched ? 'local' : 'fallback';
  }

  db.insert('chats', {
    id: db.genId('chat'),
    openid,
    role: role || '',
    message: text,
    reply: replyText,
    source,
    timestamp: new Date().toISOString()
  });

  res.ok({ reply: replyText, source });
});

// 按 openid 维护会话记忆（称呼等），进程内有效
const memoryMap = new Map();
function memoryFor(openid) {
  if (!memoryMap.has(openid)) memoryMap.set(openid, {});
  return memoryMap.get(openid);
}

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== '';

module.exports = router;
