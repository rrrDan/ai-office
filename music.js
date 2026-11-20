// 背景音樂：全部在瀏覽器裡用 Web Audio API 即時合成（沒有任何音訊檔），本專案自有程式碼，MIT 授權。
// 柔和的 lo-fi／ambient 辦公室氛圍：和弦鋪底（pad）＋低音＋零星鍵盤琶音＋輕刷聲。
// 白天：明亮和弦、稍快（78 BPM）、濾波較亮；夜晚：較暗的和弦、較慢（64 BPM）、濾波較低。
// 只「讀取」頁面既有的白天／夜晚狀態（body[data-theme]），不改那個功能。

const MASTER = 0.08;           // 總音量（低）
const LOOKAHEAD = 0.35;        // 預排時間（秒）
const TICK_MS = 25;            // 排程器間隔
const KEY = 'ai-office:music'; // localStorage：'on'／'off'

const PROG = {
  // [低音 MIDI, [和弦音 MIDI...]]
  day: [[48, [64, 67, 71, 74]], [45, [60, 64, 67, 72]], [41, [60, 64, 65, 69]], [43, [62, 65, 67, 71]]],
  night: [[45, [60, 64, 67, 71]], [41, [57, 60, 64, 69]], [38, [57, 60, 62, 65]], [40, [55, 59, 62, 64]]],
};
const MOOD = {
  day: { bpm: 78, cutoff: 3200, keysP: 0.5, hatP: 0.7, bass2: true },
  night: { bpm: 64, cutoff: 1100, keysP: 0.28, hatP: 0.25, bass2: false },
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// 合成引擎：即時播放與離線錄音（OfflineAudioContext）共用同一份程式。
export function createEngine(ctx, out = ctx.destination, { seed = 7, mood = 'day' } = {}) {
  const rand = rng(seed);
  const master = ctx.createGain(); master.gain.value = 0;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.5; tone.frequency.value = MOOD[mood].cutoff;
  const bus = ctx.createGain(); bus.gain.value = 1.8; // 內部混音增益；總音量仍由 MASTER 控制
  bus.connect(tone); tone.connect(master); master.connect(out);
  // 鍵盤用的柔和回音
  const dly = ctx.createDelay(2); dly.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  const dlyTone = ctx.createBiquadFilter(); dlyTone.type = 'lowpass'; dlyTone.frequency.value = 1800;
  dly.connect(dlyTone); dlyTone.connect(fb); fb.connect(dly); dlyTone.connect(wet); wet.connect(bus);
  const keysIn = ctx.createGain(); keysIn.connect(bus); keysIn.connect(dly);
  // 刷聲用的雜訊（短緩衝，每次只取一小段，不做循環所以不會有接縫）
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1; }
  const hatF = ctx.createBiquadFilter(); hatF.type = 'highpass'; hatF.frequency.value = 6500; hatF.connect(bus);

  let target = mood, cur = { ...MOOD[mood] }, bar = 0, nextBar = 0, running = false;

  const env = (g, t, a, peak, hold, rel) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.linearRampToValueAtTime(0, t + a + hold + rel);
    return t + a + hold + rel;
  };
  const osc = (type, f, t, end, dest, detune = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end + 0.05);
    o.onended = () => o.disconnect();
  };
  function pad(notes, t, len) {
    for (const n of notes) {
      const g = ctx.createGain(); g.connect(bus);
      const end = env(g, t, 1.4, 0.045, Math.max(0, len - 1.4), 1.6); // 下一小節開始時還在淡出：互相交疊，沒有空隙
      osc('triangle', hz(n), t, end, g, -6); osc('sine', hz(n), t, end, g, 7);
    }
  }
  function bass(n, t, beat) {
    const g = ctx.createGain(); g.connect(bus);
    const end = env(g, t, 0.03, 0.22, beat * 0.6, beat * 1.4);
    osc('sine', hz(n), t, end, g);
  }
  function key(n, t) {
    const g = ctx.createGain(); g.connect(keysIn);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6); g.gain.linearRampToValueAtTime(0, t + 1.7);
    osc('sine', hz(n), t, t + 1.7, g);
    const h = ctx.createGain(); h.gain.value = 0.18; h.connect(g); osc('sine', hz(n) * 2, t, t + 1.7, h);
  }
  function hat(t, v) {
    const s = ctx.createBufferSource(); s.buffer = nb;
    const g = ctx.createGain(); s.connect(g); g.connect(hatF);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09); g.gain.linearRampToValueAtTime(0, t + 0.1);
    s.start(t, rand() * 0.35, 0.12); s.onended = () => { s.disconnect(); g.disconnect(); };
  }
  function scheduleBar(t) {
    // 速度、機率每小節往目標情緒靠近一半：切換時兩三小節內平順過去
    const m = MOOD[target];
    cur.bpm += (m.bpm - cur.bpm) * 0.5; cur.keysP += (m.keysP - cur.keysP) * 0.5; cur.hatP += (m.hatP - cur.hatP) * 0.5;
    const beat = 60 / cur.bpm, len = beat * 4;
    const [root, ch] = PROG[target][bar % 4];
    pad(ch, t, len);
    bass(root, t, beat); if (m.bass2) bass(root + (bar % 2 ? 7 : 0), t + beat * 2, beat);
    const pool = [...ch, ch[0] + 12, ch[2] + 12];
    for (let i = 0; i < 8; i++) {
      const tt = t + i * beat / 2 + (i % 2 ? beat * 0.09 : 0); // 輕微 swing
      if (rand() < cur.keysP * (i === 0 ? 0.4 : 1)) key(pool[Math.floor(rand() * pool.length)], tt);
      if (i % 2 && rand() < cur.hatP) hat(tt, 0.03 + rand() * 0.02);
    }
    bar++;
    return t + len;
  }
  return {
    master,
    get running() { return running; },
    start(t, fadeIn = 1.5) {
      running = true; nextBar = Math.max(t, nextBar);
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(MASTER, t + fadeIn);
    },
    fadeOut(t, len = 0.5) {
      running = false;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + len);
    },
    schedule(until) { if (!running) return; while (nextBar < until) nextBar = scheduleBar(nextBar); },
    resync(now) { if (nextBar < now) nextBar = now + 0.05; },
    setMood(md, now) {
      if (!MOOD[md] || md === target) return; target = md;
      tone.frequency.cancelScheduledValues(now); tone.frequency.setValueAtTime(tone.frequency.value, now);
      tone.frequency.setTargetAtTime(MOOD[md].cutoff, now, 2.0); // 約 6 秒平順過渡
    },
    get mood() { return target; },
  };
}

// ---- 頁面上的播放器與按鈕 ----
function initPlayer(btn) {
  let pref = 'on';
  try { pref = localStorage.getItem(KEY) === 'off' ? 'off' : 'on'; } catch { }
  let ctx = null, eng = null, timer = null, suspendT = null;
  const theme = () => (document.body.dataset.theme === 'night' ? 'night' : 'day');
  const playing = () => !!(ctx && eng && eng.running && ctx.state === 'running');

  function render() {
    const on = pref === 'on', live = playing();
    btn.dataset.state = on ? (live ? 'on' : 'pending') : 'off';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const tip = on ? (live ? '背景音樂：開（點一下關閉）' : '背景音樂：開（點一下頁面任何地方開始播放；再點這裡關閉）') : '背景音樂：關（點一下開啟）';
    btn.title = tip; btn.setAttribute('aria-label', tip);
  }
  function tick() { if (eng && ctx) eng.schedule(ctx.currentTime + LOOKAHEAD); }
  function play() {
    if (pref !== 'on' || document.hidden) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC({ latencyHint: 'playback' });
        eng = createEngine(ctx, ctx.destination, { seed: (Date.now() & 0xffff) + 1, mood: theme() });
        ctx.onstatechange = render;
      }
      clearTimeout(suspendT);
      const go = () => {
        if (pref !== 'on' || document.hidden) return;
        eng.setMood(theme(), ctx.currentTime);
        eng.resync(ctx.currentTime); eng.start(ctx.currentTime + 0.02);
        tick(); clearInterval(timer); timer = setInterval(tick, TICK_MS); render();
      };
      if (ctx.state !== 'running') ctx.resume().then(go, () => { }); else go();
      // iOS 有時要在手勢當下的同一個呼叫裡 resume；上面已在手勢事件中同步呼叫
    } catch { }
    render();
  }
  function pause(len = 0.5) {
    if (!ctx || !eng) return render();
    eng.fadeOut(ctx.currentTime, len);
    clearInterval(timer); timer = null;
    clearTimeout(suspendT); suspendT = setTimeout(() => { if (!eng.running) ctx.suspend().catch(() => { }); render(); }, len * 1000 + 150);
    render();
  }
  btn.addEventListener('click', (e) => {
    pref = pref === 'on' ? 'off' : 'on';
    try { localStorage.setItem(KEY, pref); } catch { }
    pref === 'on' ? play() : pause();
  });
  // 瀏覽器（特別是 iOS）不允許無聲自動播放：選擇為「開」時，在第一次點擊／觸控任何地方時開始；關掉就永遠不自動開始。
  const gesture = (e) => { if (btn.contains(e.target)) return; if (pref === 'on' && !playing()) play(); };
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, gesture, { capture: true, passive: true });
  // 分頁隱藏時淡出並暫停（省電；iOS 背景本來就會中斷），回來時若仍是「開」就恢復
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (eng && eng.running) pause(0.25); }
    else if (pref === 'on' && ctx) play();
  });
  // 只讀取既有的白天／夜晚狀態
  new MutationObserver(() => { if (eng && ctx) eng.setMood(theme(), ctx.currentTime); }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  render();
  window.__aiOfficeMusic = () => ({ pref, state: ctx ? ctx.state : 'none', running: !!(eng && eng.running), mood: eng ? eng.mood : theme(), btn: btn.dataset.state, stored: (() => { try { return localStorage.getItem(KEY); } catch { return null; } })() });
}

const btn = typeof document !== 'undefined' && document.getElementById('musicBtn');
if (btn) initPlayer(btn);
