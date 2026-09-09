// 语音陪伴（Batch 13 · P1）：打字聊天（非语音识别/TTS）
// - 消息列表 + 打字机效果（40ms 分片渲染）+ 自动滚动到底部
// - 三级降级可视化：source = spark（讯飞星火）/ local（本地陪伴引擎）/ fallback（兜底反问）
// - 发送中禁用输入，防止连点触发流控
const { request } = require('../../utils/request');
const { MOCK_OPENIDS } = require('../../utils/config');
const voice = require('../../utils/voice');
const font = require('../../utils/font');

const SOURCE_TEXT = {
  spark: '由讯飞星火生成',
  local: '本地陪伴模式',
  fallback: '离线陪伴模式'
};

Page({
  data: {
    fontClass: font.fontClass(),
    messages: [
      { id: 'guide', role: 'ai', text: '我是小伴，陪您聊聊天～今天感觉怎么样？' }
    ],
    input: '',
    sending: false,
    typing: false,
    sourceText: '',
    scrollInto: '',
    kbHeight: 0,
    showPack: false,
    packs: voice.VOICE_PACKS,
    playingId: ''
  },

  seq: 0,
  history: [], // [{ message, reply }] 最近对话，供上下文记忆

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  // 键盘高度联动：输入栏上移 + 聊天区底部让位 + 滚到最新（微信式体验）
  onKeyboardHeight(e) {
    const h = (e.detail && e.detail.height) || 0;
    this.setData({ kbHeight: h });
    if (h > 0) this.scrollToBottom();
  },

  onInputFocus() {
    this.scrollToBottom();
  },

  onHide() {
    voice.stopPackAudio();
  },

  onUnload() {
    voice.stopPackAudio();
  },

  // 语音包面板开合（右上角三条竖线）
  onPackToggle() {
    this.setData({ showPack: !this.data.showPack });
  },

  // 点击语音包条目：播放；再次点击停止
  onPackItemTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.playingId === id) {
      voice.stopPackAudio();
      this.setData({ playingId: '' });
      return;
    }
    const item = this.data.packs.find((p) => p.id === id);
    if (!item) return;
    voice.playPack(item);
    this.setData({ playingId: id });
  },

  scrollToBottom() {
    const msgs = this.data.messages;
    if (msgs.length) this.setData({ scrollInto: msgs[msgs.length - 1].id });
  },

  async onSend() {
    const text = String(this.data.input || '').trim();
    if (!text || this.data.sending) return;

    this.seq++;
    const userMsg = { id: 'm' + this.seq, role: 'user', text };
    this.setData({
      messages: this.data.messages.concat([userMsg]),
      input: '',
      sending: true,
      typing: true,
      scrollInto: userMsg.id
    });

    try {
      const res = await request(
        '/api/chat',
        'POST',
        {
          openid: MOCK_OPENIDS.elder,
          role: 'elder',
          message: text,
          history: this.history.slice(-5)
        },
        { silent: true }
      );

      // 打字机：AI 气泡先占位，再逐字填充（每次 2 字，40ms）
      this.seq++;
      const aiId = 'm' + this.seq;
      const aiIndex = this.data.messages.length;
      this.setData({
        messages: this.data.messages.concat([{ id: aiId, role: 'ai', text: '' }]),
        typing: false,
        sourceText: SOURCE_TEXT[res.source] || '',
        scrollInto: aiId
      });
      this.typewrite(aiIndex, aiId, res.reply, text);
    } catch (err) {
      // 网络异常也要有回应：本地兜底文案，绝不让老人对着空屏幕
      this.seq++;
      const aiId = 'm' + this.seq;
      this.setData({
        messages: this.data.messages.concat([{ id: aiId, role: 'ai', text: '我这边信号不太好，稍后再跟我说说～' }]),
        typing: false,
        sending: false,
        scrollInto: aiId
      });
    }
  },

  // 打字机：40ms 一片，每次 2 字，只动 text 字段；期间与完成后都保持滚到底部
  typewrite(index, id, full, userText) {
    let shown = 0;
    const timer = setInterval(() => {
      shown = Math.min(full.length, shown + 2);
      this.setData({
        ['messages[' + index + '].text']: full.slice(0, shown),
        scrollInto: id
      });
      if (shown >= full.length) {
        clearInterval(timer);
        this.history.push({ message: userText, reply: full });
        this.setData({ sending: false, scrollInto: id });
      }
    }, 40);
  }
});
