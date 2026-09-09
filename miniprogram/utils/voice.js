// 语音播报：优先播放预录音频（miniprogram/audio/*.mp3，MVP 用 TTS 预录文件，后续可换云端 TTS）；
// 文件缺失或播放失败自动降级为 3 秒文字 toast，不影响功能
// 「语音播报开关」（mine 页设置，Storage voiceSwitch）关闭时跳过播报，告警弹窗/震动不受影响
const AUDIO_FILES = {
  '您有新的求助，请及时查看': '/audio/alert.mp3',
  '求助已发送，家属将尽快响应': '/audio/sos_sent.mp3'
};

function voiceEnabled() {
  return wx.getStorageSync('voiceSwitch') !== 'off';
}

function fallbackToast(text) {
  if (!voiceEnabled()) return;
  wx.showToast({ title: text, icon: 'none', duration: 3000 });
}

function speak(text) {
  if (!voiceEnabled()) return;
  const src = AUDIO_FILES[text];
  if (!src) {
    fallbackToast(text);
    return;
  }
  try {
    const audio = wx.createInnerAudioContext();
    audio.src = src;
    audio.onError(() => {
      // 音频文件不存在或播放失败：降级为文字提示
      audio.destroy();
      fallbackToast(text);
    });
    audio.play();
  } catch (err) {
    fallbackToast(text);
  }
}


// ---- 语音包（Batch 16 · P1-B）：预录 mp3 播放，文件缺失/失败降级为文字 ----
const VOICE_PACKS = [
  { id: 'vp01', text: '你好，我是桑榆智伴，很高兴认识你', src: '/audio/voicepack/vp01.mp3' },
  { id: 'vp02', text: '早上好呀，昨晚睡得好吗？', src: '/audio/voicepack/vp02.mp3' },
  { id: 'vp03', text: '今天感觉怎么样？有没有哪里不舒服？', src: '/audio/voicepack/vp03.mp3' },
  { id: 'vp04', text: '记得按时吃药哦，有什么需要随时叫我', src: '/audio/voicepack/vp04.mp3' },
  { id: 'vp05', text: '天气变化大，出门记得添件衣服', src: '/audio/voicepack/vp05.mp3' },
  { id: 'vp06', text: '我给你讲个小笑话吧', src: '/audio/voicepack/vp06.mp3' },
  { id: 'vp07', text: '想家人的时候就跟我说说话，我一直都在', src: '/audio/voicepack/vp07.mp3' },
  { id: 'vp08', text: '慢慢来，不着急，我陪着你', src: '/audio/voicepack/vp08.mp3' },
  { id: 'vp09', text: '要不要听首老歌，我陪你哼两句', src: '/audio/voicepack/vp09.mp3' },
  { id: 'vp10', text: '今天也要开开心心的呀', src: '/audio/voicepack/vp10.mp3' }
];

let packAudio = null;

function stopPackAudio() {
  if (packAudio) {
    try { packAudio.stop(); packAudio.destroy(); } catch (e) { /* 忽略 */ }
    packAudio = null;
  }
}

// 播放语音包条目；受「语音播报」开关控制（关闭时只弹文字不播放）
function playPack(item) {
  if (!voiceEnabled()) {
    wx.showToast({ title: '语音播报已关闭，可在「我的」开启', icon: 'none' });
    return;
  }
  stopPackAudio();
  packAudio = wx.createInnerAudioContext();
  packAudio.src = item.src;
  packAudio.onError(() => {
    // mp3 未就位或播放失败：降级为文字提示，绝不报错
    stopPackAudio();
    fallbackToast(item.text);
  });
  packAudio.play();
}

module.exports = { speak, VOICE_PACKS, playPack, stopPackAudio };
