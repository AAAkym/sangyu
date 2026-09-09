// 讯飞 Spark Lite 客户端（Batch 13 · P1，OpenAI 兼容端点）
// 鉴权：Authorization: Bearer <SPARK_API_PASSWORD>（仅此一个值，不拼接、不签名）
// 并发控制：信号量（SPARK_MAX_IN_FLIGHT）+ 最小请求间隔 550ms + 排队等待超时（SPARK_BULKHEAD_WAIT_SECONDS）
// 密钥安全：全部读自 server/.env，不写日志、不进错误信息、不下发前端
const env = require('./env');

const MIN_GAP_MS = 550; // 秒级流控（QPS=2）的最小请求间隔

const cfg = () => ({
  password: env.get('SPARK_API_PASSWORD') || '',
  url: env.get('SPARK_API_URL') || 'https://spark-api-open.xf-yun.com/v1/chat/completions',
  model: env.get('SPARK_MODEL') || 'lite',
  timeoutMs: (Number(env.get('SPARK_TIMEOUT')) || 120) * 1000,
  maxInFlight: Number(env.get('SPARK_MAX_IN_FLIGHT')) || 2,
  waitMs: (Number(env.get('SPARK_BULKHEAD_WAIT_SECONDS')) || 30) * 1000
});

function configured() {
  const c = cfg();
  // 占位符（含「获取」提示文案）视为未配置
  return !!c.password && c.password.length >= 8 && c.password.indexOf('你的') !== 0 && c.password.indexOf('获取') === -1;
}

let inFlight = 0;
let lastCallAt = 0;

// 信号量：在途请求数超限时排队，超过 waitMs 仍未获得名额则返回 false（上层降级）
function acquire(waitMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const attempt = () => {
      if (inFlight < cfg().maxInFlight) {
        inFlight++;
        resolve(true);
        return;
      }
      if (Date.now() - start >= waitMs) {
        resolve(false);
        return;
      }
      setTimeout(attempt, 100);
    };
    attempt();
  });
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
}

// 秒级节流：距上次请求不足间隔时等待
async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// 调用 Spark Lite（非流式）。失败抛错（rateLimited 标记流控类错误，上层据此降级）
async function callSpark(messages) {
  const c = cfg();
  const got = await acquire(c.waitMs);
  if (!got) throw Object.assign(new Error('并发已满，等待超时'), { rateLimited: true });

  try {
    await throttle();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), c.timeoutMs);
    let res;
    try {
      res = await fetch(c.url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + c.password,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: c.model, messages, stream: false }),
        signal: ctl.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const err = new Error('Spark HTTP ' + res.status);
      err.rateLimited = res.status === 429;
      throw err;
    }

    const body = await res.json();
    const errCode = Number(body.code);
    if (errCode && errCode !== 0) {
      const err = new Error(body.message || 'spark error ' + errCode);
      // 讯飞流控错误码 11200~11203：可降级、非致命
      err.rateLimited = errCode >= 11200 && errCode <= 11203;
      throw err;
    }

    const text = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (!text) throw new Error('spark 响应解析失败');
    return String(text).trim();
  } finally {
    release();
  }
}

module.exports = { configured, callSpark };
