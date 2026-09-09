// 本地陪伴对话引擎（Batch 13 · P1）：纯函数，关键词匹配 + 引导式兜底
// 人设：温暖耐心的陪伴者「小伴」，面向老人，短句、口语、不啰嗦
// 安全红线：涉及身体不适只引导联系家人或就医，绝不出现诊断/用药/剂量建议
// 同一关键词多次命中不得总是同一句：组内随机抽取；兜底按历史轮数轮换
// memory：{ name? } 由路由层按 openid 保存，实现跨轮简单记忆（记住称呼）

const INTENTS = [
  {
    id: 'greet',
    words: ['你好', '您好', '早上好', '下午好', '晚上好', '嗨', '哈喽', '在吗'],
    replies: [
      '哎，我在呢！今天精神头怎么样？',
      '你好呀～想吃点什么，还是咱俩聊聊天？',
      '嗨，我一直在呢，想说啥都行。'
    ]
  },
  {
    id: 'unwell',
    words: ['疼', '不舒服', '头晕', '难受', '肚子', '头疼', '发烧', '没力气', '心慌', '喘不上气'],
    replies: [
      '别硬扛着，先坐下歇一会儿。这种情况我建议您联系家人，让他们陪您去医院看看，要紧的。',
      '听我的，别拖——给家人打个电话说明一下，必要时直接去医院。号码在「紧急联系人」里存着呢。'
    ]
  },
  {
    id: 'family',
    words: ['儿子', '女儿', '孙子', '孙女', '想家人', '想孩子', '家人', '小王', '孩子'],
    replies: [
      '家人都惦记着您呢。要不给他们在「家人留言」里留句话？他们一登录就能看见。',
      '想他们了就打个电话，紧急联系人里存着号码呢。也可以我陪您聊，别一个人闷着。'
    ]
  },
  {
    id: 'med',
    words: ['吃药', '服药', '提醒'],
    replies: [
      '到点我会在「用药提醒」里提醒您。吃什么药、吃多少，一定按医生交代的来，别自己增减。'
    ]
  },
  {
    id: 'weather',
    words: ['天气', '下雨', '降温', '出门', '冷', '热'],
    replies: [
      '最近天气变化大，出门多带件衣裳，别着凉。遛弯的话挑个暖和的钟点再去。'
    ]
  },
  {
    id: 'lonely',
    words: ['无聊', '寂寞', '孤单', '闷', '没人说话'],
    replies: [
      '我在呢，随时都能聊。也可以去「家人留言」看看，家里人给您留话了。',
      '要不聊聊您年轻时候的事？我最爱听这些。'
    ]
  },
  {
    id: 'memory',
    words: ['以前', '年轻', '想当年', '往事'],
    replies: [
      '那时候可真不容易。后来呢？我还想接着听。'
    ]
  },
  {
    id: 'thanks',
    words: ['谢谢', '辛苦', '麻烦你'],
    replies: [
      '跟我还客气啥！陪您聊天就是我的事。'
    ]
  },
  {
    id: 'bye',
    words: ['再见', '拜拜', '不聊了', '睡了', '休息'],
    replies: [
      '好，您歇着，有事随时叫我。'
    ]
  }
];

// 兜底引导式反问（按历史轮数轮换，不重复、不生硬）
const FALLBACKS = [
  '今天吃饭了吗？胃口怎么样？',
  '最近晚上睡得踏实吗？',
  '跟我说说今天遇到的新鲜事儿？',
  '要不要聊聊家里最近的情况？',
  '今天出门走走了吗？外面风景怎么样？'
];

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== '';

// 解析「我叫XX / 我是XX」→ 称呼
function findName(text) {
  const m = /(?:我叫|我是)([\u4e00-\u9fa5A-Za-z0-9]{1,8})/.exec(String(text || ''));
  return m ? m[1] : null;
}

// 回复入口（纯函数）：message 用户消息；history 最近轮次 [{message, reply}]；memory {name?}
// 返回 { text, matched, intent }：matched=false 表示走了兜底反问
function reply(message, history, memory) {
  const mem = memory || {};
  const text = String(message || '').trim();
  if (!text) {
    return { text: '您说什么？我没太听清，再说一遍好吗？', matched: true, intent: 'empty' };
  }

  // 简单记忆：老人告知称呼 → 记住并即时回应
  const nameInMsg = findName(text);
  if (nameInMsg && mem.name !== nameInMsg) {
    mem.name = nameInMsg;
    return { text: `好嘞${nameInMsg}！我记住您了。今天感觉怎么样？`, matched: true, intent: 'remember' };
  }
  const name = mem.name || null;

  for (const intent of INTENTS) {
    if (intent.words.some((w) => text.indexOf(w) >= 0)) {
      const pick = intent.replies[Math.floor(Math.random() * intent.replies.length)];
      const prefix = name && (intent.id === 'greet' || intent.id === 'lonely') ? name + '，' : '';
      return { text: prefix + pick, matched: true, intent: intent.id };
    }
  }

  const fallback = FALLBACKS[(history ? history.length : 0) % FALLBACKS.length];
  return { text: fallback, matched: false, intent: 'fallback' };
}

module.exports = { reply, INTENTS, FALLBACKS, findName };
