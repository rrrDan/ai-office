// AI 辦公室：主程式（只讀 FEED；頻道代號從網址 # 取得，不寫在原始碼裡）
import { BOTS, STATUS, emptyState, applyNtfy, resolveBot, normStatus, serialize, deserialize, botMeta, lookColor, allBotKeys, taipei, taipeiIso, relative, viewStatus, STALE_SEC } from './feed.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const FLOORS = [[4, '4F', '總管室'], [3, '3F', '健身房與休息空間'], [2, '2F', '工作區'], [1, '1F', '專案大廳'], [0, '其他', '未登記的 bot']];
const POLL_MS = 15000;
const SSE_OPEN_TIMEOUT = 6000;

function readTopic() {
  let t = location.hash.replace(/^#/, '');
  try { t = decodeURIComponent(t); } catch { /* 保持原樣 */ }
  t = t.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(t) ? t : null;
}
function hashKey(s) { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(36); }

const topic = readTopic();
window.addEventListener('hashchange', () => location.reload());

if (!topic) {
  $('nohash').hidden = false;
  $('example').textContent = location.origin + location.pathname + '#你的頻道代號';
  $('conn').hidden = true;
  tickClock();
} else {
  boot();
}

function tickClock() {
  const f = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'narrow', hour: '2-digit', minute: '2-digit', hour12: false });
  $('clock').textContent = '台北 ' + f.format(new Date());
}

function boot() {
  $('app').hidden = false;
  const KEY = 'ai-office:v1:' + hashKey(topic);
  const BASE = 'https://ntfy.sh/' + encodeURIComponent(topic);
  let state = deserialize(localStorage.getItem(KEY) || '');
  let office = null, selected = null, renderQueued = false;

  const save = () => { try { localStorage.setItem(KEY, serialize(state)); } catch { /* 空間不足時略過 */ } };
  const queueRender = () => { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); };
  let live = false;
  const OPENED_AT = Math.floor(Date.now() / 1000); // 開頁之前的訊息（歷史重播）不觸發送文件
  let batching = false;
  function ingest(ev) {
    if (applyNtfy(state, ev)) {
      if (batching) return;
      save(); queueRender();
      if (live && ev && ev.event === 'message' && Number(ev.time) >= OPENED_AT - 60) {
        try { const b = JSON.parse(ev.message); if (b && b.bot && b.step) { const k = resolveBot(b.bot); if (k) inferDelivery(k, normStatus(b.status), String(b.step)); } } catch { }
      }
    }
  }

  // ---- 連線指示 ----
  function setConn(s, text) { const c = $('conn'); c.dataset.state = s; c.querySelector('b').textContent = text; }

  // ---- 讀取歷史 ----
  async function fetchSince(since) {
    const res = await fetch(`${BASE}/json?poll=1&since=${encodeURIComponent(since)}`, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    batching = true;
    try { for (const line of text.split('\n')) { if (!line.trim()) continue; try { ingest(JSON.parse(line)); } catch { /* 略過壞行 */ } } }
    finally { batching = false; }
    save(); render();
  }

  // ---- 即時更新：SSE，失敗時改輪詢 ----
  let es = null, pollTimer = 0, errCount = 0, retrySse = 0, openTimer = 0;
  function connectSse() {
    if (!('EventSource' in window)) return startPoll();
    try { es && es.close(); } catch { }
    // 歷史已經讀過，只要從最後一筆之後開始接；沒有就只收新的
    const since = state.lastId ? state.lastId : (state.lastTime ? String(state.lastTime) : '');
    es = new EventSource(`${BASE}/sse` + (since ? `?since=${encodeURIComponent(since)}` : ''));
    clearTimeout(openTimer);
    // SSE 太慢就先輪詢，不讓畫面卡住；連上後自動停止輪詢
    openTimer = setTimeout(() => { if (!es || es.readyState !== 1) startPoll(true); }, SSE_OPEN_TIMEOUT);
    es.onopen = () => { errCount = 0; clearTimeout(openTimer); stopPoll(); setConn('live', '即時連線'); };
    es.onmessage = (m) => { try { ingest(JSON.parse(m.data)); } catch { } };
    es.onerror = () => {
      errCount++;
      if (es.readyState === EventSource.CLOSED || errCount >= 3) { es.close(); es = null; startPoll(); }
      else setConn('down', '重新連線中');
    };
  }
  function startPoll(keepSse) {
    if (pollTimer) return;
    setConn('poll', '輪詢中（15 秒）');
    if (keepSse) { pollTimer = setInterval(() => fetchSince(state.lastTime ? String(state.lastTime) : 'all').catch(() => {}), POLL_MS); return; }
    const tick = async () => {
      try { await fetchSince(state.lastTime ? String(state.lastTime) : 'all'); setConn('poll', '輪詢中（15 秒）'); }
      catch { setConn('down', '連線中斷，重試中'); }
    };
    pollTimer = setInterval(tick, POLL_MS);
    clearTimeout(retrySse); retrySse = setTimeout(() => { stopPoll(); connectSse(); }, 5 * 60 * 1000);
  }
  function stopPoll() { clearInterval(pollTimer); pollTimer = 0; }

  // ---- 角色外型（存在這台裝置） ----
  const SET_KEY = 'ai-office:avatar-set';
  const SETS = [
    ['mark', '標記吉祥物', '用各 bot 的標記形狀做成的圓潤小精靈'],
    ['office', '上班族', '深色頭髮、白襯衫打紅領帶，外套是 bot 的顏色'],
    ['robot', '圓圓機器人', '圓滾滾的機器人，面罩會發光'],
    ['cat', '貓咪同事', '尖耳朵、白鬍鬚、綠眼睛，還有翹尾巴'],
    ['astro', 'Q 版太空人', '戴頭盔、背背包的太空人'],
  ];
  let avatarSet = localStorage.getItem(SET_KEY);
  if (!SETS.some(x => x[0] === avatarSet)) avatarSet = 'mark';
  function renderSets() {
    const box = $('sets'); box.replaceChildren();
    for (const [id, name, desc] of SETS) {
      const b = h('button', 'setcard'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === avatarSet));
      const sw = h('div', 'swatches ' + id);
      for (const k of BOTS.map(x => x.key)) { const i = h('i'); i.style.background = lookColor(state, k); sw.append(i); }
      const t = h('b', null, name); if (id === 'mark') t.append(h('em', null, '預設'));
      b.append(sw, t, h('span', null, desc));
      b.addEventListener('click', () => {
        avatarSet = id; try { localStorage.setItem(SET_KEY, id); } catch { }
        office && office.setAvatarSet(id, state); renderSets();
      });
      box.append(b);
    }
  }

  // ---- 白天／夜晚（自動依台北時間 06:00–18:00；可手動切換，記在這台裝置；網址可加 ?theme=day|night）----
  const THEME_KEY = 'ai-office:theme';
  const THEME_LABEL = { auto: '自動', day: '白天', night: '夜晚' };
  let themePref = localStorage.getItem(THEME_KEY) || 'auto';
  const qTheme = new URLSearchParams(location.search).get('theme');
  if (['auto', 'day', 'night'].includes(qTheme)) themePref = qTheme;
  if (!THEME_LABEL[themePref]) themePref = 'auto';
  function taipeiHour() { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false }).format(new Date())) % 24; }
  function effectiveTheme() { if (themePref !== 'auto') return themePref; const hr = taipeiHour(); return hr >= 6 && hr < 18 ? 'day' : 'night'; }
  function applyTheme() {
    const t = effectiveTheme();
    document.body.dataset.theme = t;
    $('themeBtn').textContent = THEME_LABEL[themePref] + (themePref === 'auto' ? (t === 'day' ? '・白天' : '・夜晚') : '');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'day' ? '#6fb3f2' : '#151629');
    office && office.setTheme(t);
  }
  $('themeBtn').addEventListener('click', () => {
    themePref = themePref === 'auto' ? 'day' : themePref === 'day' ? 'night' : 'auto';
    try { localStorage.setItem(THEME_KEY, themePref); } catch { }
    applyTheme();
  });
  applyTheme(); setInterval(applyTheme, 60000);

  // ---- 送資料：示範按鈕＋從 FEED 的步驟文字推斷（不改任何格式）----
  // 名字：英文名後面不能再接英文字母（避免 Nori 撞到 Noriko 之類）；前面一定是動詞或空白。阿卡拉照中文比對
  const NAME_SRC = BOTS.map(b => [b.key, b.key === 'akara' ? '阿卡拉(?:專案經理)?' : `${b.short}(?![A-Za-z])`]);
  // 動詞必須「緊接著」名字（中間只允許空白），例如「交 Nori 驗收」「通知 Yuzu」「轉交給 Goya」
  const VERB = '(?:轉交給?|交付給?|交件給|交辦|交給|回報給?|通知|送給|傳給|派給?|交)';
  const HANDOFF = NAME_SRC.map(([k, n]) => [k, new RegExp(VERB + '\\s*' + n, 'i')]);
  // 描述問題本身（例如「查送文件為何都給阿卡拉」）不是真的送文件
  const META_RE = /(為何|為什麼|原因|是否|有沒有|查修)/;
  function inferTarget(key, status, step) {
    if (!step || key.startsWith('x:') || META_RE.test(step)) return null;
    let to = null, at = Infinity;
    for (const [k, re] of HANDOFF) {
      if (k === key) continue;
      const m = re.exec(step);
      if (m && m.index < at) { at = m.index; to = k; } // 取文字中最先出現的那一位
    }
    // 完成且提到交付、交件或回報，但沒寫給誰：送給 Nori（原本的規則）
    if (!to && status === 'done' && /(交付|交件|已交|回報)/.test(step) && key !== 'nori') to = 'nori';
    return to;
  }
  // ---- 送件排隊（每位寄件人各一條）----
  // 同一位正在送件時，新的送件先排隊，送完一趟再送下一趟。每位最多排 3 件（不含正在送的那件）；
  // 排滿後又來新的：丟掉「排最久的那一件」（最舊的），保留最新的，讓畫面反映最新的訊息。
  const QUEUE_MAX = 3;
  const deliveryLog = [];          // 每件：{ id, src, from, to, mode, step?, t, state, startedAt?, endedAt?, droppedAt? }
  const queues = new Map();        // 寄件人 → { active: 件 | null, waiting: [件…] }
  let deliveryId = 0;
  const qOf = (k) => { if (!queues.has(k)) queues.set(k, { active: null, waiting: [] }); return queues.get(k); };
  const copy = (it) => it && { ...it };
  window.__aiOfficeDeliveries = () => deliveryLog.map(copy);   // 唯讀：每次給一份複本
  window.__aiOfficeDeliveries.queues = () => { const o = {}; for (const [k, q] of queues) o[k] = { active: copy(q.active), waiting: q.waiting.map(copy) }; return o; };
  window.__aiOfficeDeliveries.max = QUEUE_MAX;
  window.__aiOfficeInfer = (bot, status, step) => { const k = resolveBot(bot); return k ? inferTarget(k, normStatus(status), String(step)) : null; };
  function enqueueDelivery(item) {
    item.id = ++deliveryId; item.t = Date.now(); deliveryLog.push(item);
    if (deliveryLog.length > 200) deliveryLog.splice(0, deliveryLog.length - 200);
    const q = qOf(item.from);
    item.done = new Promise((res) => { item._res = res; });
    Object.defineProperty(item, 'done', { enumerable: false }); Object.defineProperty(item, '_res', { enumerable: false });
    if (q.active) {
      item.state = 'queued'; q.waiting.push(item);
      while (q.waiting.length > QUEUE_MAX) { const old = q.waiting.shift(); old.state = 'dropped'; old.droppedAt = Date.now(); old._res(false); }
    } else runDelivery(q, item);
    return item.done;
  }
  async function runDelivery(q, item) {
    q.active = item; item.state = 'delivering'; item.startedAt = Date.now();
    let ok = false;
    try { ok = await office.deliver(item.from, item.to, item.mode); } catch (e) { ok = false; }
    item.state = ok === false ? 'skipped' : 'done'; item.endedAt = Date.now(); q.active = null; item._res(ok !== false);
    const next = q.waiting.shift(); if (next) runDelivery(q, next);
  }
  function inferDelivery(key, status, step) {
    if (!office) return;
    const to = inferTarget(key, status, step);
    if (to) enqueueDelivery({ src: 'feed', from: key, to, mode: 'auto', step: String(step).slice(0, 120) });
  }
  $('demoBtn').addEventListener('click', async () => {
    if (!office) return;
    const keys = BOTS.map(b => b.key);
    const from = keys[Math.floor(Math.random() * keys.length)];
    const others = keys.filter(k => k !== from); // 寄件人以外的 5 位，平均隨機
    const to = others[Math.floor(Math.random() * others.length)];
    const fl = (k) => (office.where(k) || {}).floor || office.floorOf(k);   // 依目前所在樓層（例如在 3F 休息）
    const same = fl(to) === fl(from);
    const mode = same ? 'auto' : 'elevator';
    const meta = (k) => BOTS.find(b => b.key === k).short;
    $('demoNote').textContent = `${meta(from)} → ${meta(to)}（${same ? '同樓層' : '搭電梯'}）`;
    setDrawer('peek');
    $('demoBtn').disabled = true;
    try { await enqueueDelivery({ src: 'demo', from, to, mode }); } finally { $('demoBtn').disabled = false; }
  });

  // ---- 3D ----
  async function init3d() {
    const { createOffice, webglAvailable } = await import('./office3d.js');
    if (!webglAvailable()) throw new Error('no webgl');
    office = createOffice($('viewport'), $('overlay'), { onSelect: (k) => selectBot(k, true), avatarSet });
    updateInsets(); office.resetView(false); office.setTheme(effectiveTheme()); window.__aiOfficeDeliver = (a, b, m) => office.deliver(a, b, m); window.__aiOfficeEnqueue = (a, b, m) => enqueueDelivery({ src: 'test', from: a, to: b, mode: m || 'auto' }); window.__aiOfficeWhere = (k) => office.where(k); window.__aiOfficeFeet = (k) => office.footProbe(k); window.__aiOfficeFootLog = (keys, o) => office.footLog(keys, o); window.__aiOfficeBody = (k) => office.bodyProbe(k); window.__aiOfficeTagBands = () => office.tagBands(); window.__aiOfficePathCheck = () => office.pathCheck(); window.__aiOfficeElev = () => office.elevState(); window.__aiOfficeRest = () => office.restState(); window.__aiOfficeRestAt = (k, id) => office.restAt(k, id);
    office.update(state);
  }
  function syncHeader() {
    const hh = document.querySelector('.top').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-h', Math.round(hh) + 'px');
  }
  syncHeader();
  function updateInsets() {
    syncHeader();
    if (!office) return;
    const wide = matchMedia('(min-width: 900px)').matches;
    const header = document.querySelector('.top').getBoundingClientRect().height;
    office.setInsets(header + 12, wide ? 16 : (document.getElementById('drawer').getBoundingClientRect().height ? peekHeight() + 40 : 150));
  }
  const peekHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek-h')) || 112;
  const start3d = () => init3d().catch((err) => { console.warn('3D 停用：', err && err.message); document.body.classList.add('no3d'); $('fallback').hidden = false; $('hint').hidden = true; setDrawer('open'); });
  $('resetView').addEventListener('click', () => { updateInsets(); office && office.resetView(true); });
  setTimeout(() => $('hint').classList.add('gone'), 6000);
  addEventListener('resize', () => { updateInsets(); });

  // ---- 抽屜與分頁 ----
  const drawer = $('drawer');
  function setDrawer(s) {
    drawer.dataset.state = s;
    $('handle').setAttribute('aria-expanded', String(s === 'open'));
    $('handleText').textContent = s === 'open' ? '收合，回到 3D 畫面' : '展開資料面板';
  }
  $('handle').addEventListener('click', () => { if (!dragMoved) setDrawer(drawer.dataset.state === 'open' ? 'peek' : 'open'); });
  let dragY = null, dragMoved = false, baseY = 0;
  $('handle').addEventListener('pointerdown', (e) => { dragY = e.clientY; dragMoved = false; baseY = drawer.getBoundingClientRect().top; drawer.classList.add('dragging'); $('handle').setPointerCapture(e.pointerId); });
  $('handle').addEventListener('pointermove', (e) => {
    if (dragY == null) return;
    const dy = e.clientY - dragY; if (Math.abs(dy) > 5) dragMoved = true;
    if (!dragMoved) return;
    const full = drawer.offsetHeight, peek = peekHeight();
    const top0 = innerHeight - full; const y = Math.min(innerHeight - peek, Math.max(top0, baseY + dy));
    drawer.style.transform = `translateY(${y - top0}px)`;
  });
  const endDrag = (e) => {
    if (dragY == null) return;
    drawer.classList.remove('dragging'); drawer.style.transform = '';
    if (dragMoved) { const dy = e.clientY - dragY; setDrawer(dy < -40 ? 'open' : dy > 40 ? 'peek' : drawer.dataset.state); }
    dragY = null; setTimeout(() => { dragMoved = false; }, 0);
  };
  $('handle').addEventListener('pointerup', endDrag); $('handle').addEventListener('pointercancel', endDrag);

  let tab = 'bots';
  function setTab(t) {
    tab = t;
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.dataset.pane !== t;
    $('drawerBody').scrollTop = 0;
  }
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => { setTab(b.dataset.tab); setDrawer('open'); });

  function selectBot(key, fromScene) {
    selected = key; office && office.select(key);
    renderDetail(); renderBots();
    if (fromScene) { setTab('bots'); setDrawer('open'); }
  }

  $('clearCache').addEventListener('click', () => { localStorage.removeItem(KEY); location.reload(); });

  // ---- 繪製 ----
  function render() {
    tickClock();
    renderStats(); renderBots(); renderDetail(); renderUsage(); renderRoutines(); renderEvents(); renderSets();
    office && office.update(state);
  }

  function renderStats() {
    const keys = allBotKeys(state);
    const count = (s) => keys.filter(k => state.bots[k]?.status === s).length;
    const items = [['工作中', count('working'), ''], ['等待用戶', count('waiting_user'), ''], ['錯誤', count('error'), ''],
      ['總用量', state.usage && state.usage.total != null ? state.usage.total : '—', state.usage && state.usage.total != null ? '%' : '']];
    const box = $('stats'); box.replaceChildren();
    for (const [label, val, unit] of items) {
      const d = h('div', 'stat'); d.append(h('small', null, label));
      const b = h('b', null, String(val)); if (unit) b.append(h('em', null, unit)); d.append(b); box.append(d);
    }
  }

  function timeLine(t) {
    if (!t) return '超過 12 小時未更新';
    const old = Date.now() / 1000 - t > STALE_SEC;
    return `${taipei(t)}（${relative(t)}）` + (old ? '・超過 12 小時未更新' : '');
  }

  function botCard(key) {
    const meta = botMeta(state, key), v = viewStatus(state, key), s = v.s;
    const status = v.status, sc = STATUS[status];
    const card = h('div', 'bot' + (selected === key ? ' sel' : '') + (v.stale ? ' stale' : ''));
    card.tabIndex = 0; card.setAttribute('role', 'button');
    card.addEventListener('click', () => selectBot(key, false));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBot(key, false); } });
    const av = h('div', 'avatar'); av.style.background = lookColor(state, key); av.style.setProperty('--st', sc.color);
    const main = h('div', 'bot-main');
    const top = h('div', 'bot-top');
    top.append(h('span', 'bot-name', meta.short));
    const badge = h('span', 'badge', sc.label); badge.style.background = sc.color; top.append(badge);
    if (state.groups[key]) top.append(h('span', 'grp', state.groups[key]));
    main.append(top, h('div', 'bot-step', s && s.step ? s.step : (s ? '（沒有步驟文字）' : '這台裝置沒有更早的紀錄')));
    const tl = h('div', 'bot-time'); tl.append(h('span', null, timeLine(s && s.time)));
    if (state.chat[key] && !/^(javascript|data|vbscript|file):/i.test(state.chat[key])) { const a = h('a', null, '開啟對話 ›'); a.href = state.chat[key]; a.rel = 'noopener noreferrer'; a.addEventListener('click', e => e.stopPropagation()); tl.append(a); }
    main.append(tl);
    card.append(av, main);
    return card;
  }

  function renderBots() {
    const box = $('botList'); box.replaceChildren();
    const keys = allBotKeys(state);
    for (const [f, tagTxt, name] of FLOORS) {
      const ks = keys.filter(k => botMeta(state, k).floor === f);
      if (!ks.length) continue;
      const hd = h('div', 'floorhead'); hd.append(h('b', null, tagTxt), h('span', null, name)); box.append(hd);
      for (const k of ks) box.append(botCard(k));
    }
  }

  function renderDetail() {
    const d = $('detail');
    if (!selected) { d.hidden = true; return; }
    const meta = botMeta(state, selected), v = viewStatus(state, selected), s = v.s;
    const sc = STATUS[v.status];
    d.replaceChildren();
    const hh = h('h3', null, meta.name);
    const x = h('button', 'closebtn', '✕'); x.type = 'button'; x.setAttribute('aria-label', '關閉詳情');
    x.addEventListener('click', (e) => { e.stopPropagation(); selected = null; office && office.select(null); renderDetail(); renderBots(); });
    d.append(x, hh);
    d.append(h('p', null, `狀態：${sc.label}${s && s.rawStatus && v.status === 'other' ? `（${s.rawStatus}）` : ''}`));
    d.append(h('p', null, `目前步驟：${s && s.step ? s.step : '—'}`));
    d.append(h('p', null, `最後更新：${timeLine(s && s.time)}`));
    const r = state.routines[selected];
    d.append(h('p', null, `排程：${r ? r.items.length + ' 項' : '尚無資料'}`));
    d.hidden = false;
  }

  function renderUsage() {
    const box = $('usage'); box.replaceChildren();
    const u = state.usage;
    if (!u) { box.append(h('p', 'empty', '還沒收到用量資料。')); return; }
    const tot = h('div', 'usage-total');
    const big = h('div', 'big', u.total != null ? String(u.total) : '—'); big.append(h('small', null, ' % 已使用'));
    const bar = h('div', 'bar' + (u.total >= 80 ? ' hot' : '')); const bi = h('i'); bi.style.width = Math.max(0, Math.min(100, u.total || 0)) + '%'; bar.append(bi);
    tot.append(big, bar, h('div', 'meta', `重置時間：${u.resetsAt ? taipeiIso(u.resetsAt) : '—'}・資料時間：${taipei(u.time)}（${relative(u.time)}）`));
    box.append(tot);
    const entries = Object.entries(u.bots).sort((a, b) => b[1] - a[1]);
    if (entries.length) {
      box.append(h('div', 'meta', '各 bot 用量占比'));
      const max = Math.max(100, ...entries.map(e => e[1]));
      for (const [k, v] of entries) {
        const row = h('div', 'urow');
        const nm = h('span', null, botMeta(state, k).short);
        const b = h('div', 'bar'); const i = h('i'); i.style.width = (v / max * 100) + '%'; i.style.background = lookColor(state, k); b.append(i);
        row.append(nm, b, h('span', 'num', v + '%')); box.append(row);
      }
    }
  }

  function renderRoutines() {
    const box = $('routines'); box.replaceChildren();
    for (const k of allBotKeys(state)) {
      const g = h('div', 'rgroup');
      const hh = h('h3'); const dot = h('i'); dot.style.background = lookColor(state, k); hh.append(dot, h('span', null, botMeta(state, k).short)); g.append(hh);
      const r = state.routines[k];
      if (!r) g.append(h('p', 'empty', '尚無排程資料'));
      else if (!r.items.length) g.append(h('p', 'empty', '目前沒有排程'));
      else for (const it of r.items) {
        const row = h('div', 'ritem');
        row.append(h('b', null, it.name || '（未命名）'));
        if (it.schedule) row.append(h('span', null, it.schedule));
        if (it.next) { const d = new Date(it.next); row.append(h('span', 'next', `下次執行：${taipeiIso(it.next)}${isNaN(d) ? '' : '（' + relative(d.getTime() / 1000) + '）'}`)); }
        g.append(row);
      }
      if (r) g.append(h('div', 'meta', `資料時間：${taipei(r.time)}`));
      box.append(g);
    }
  }

  function renderEvents() {
    const box = $('events'); box.replaceChildren();
    if (!state.events.length) { box.append(h('li', 'empty', '還沒有事件。')); return; }
    for (const e of state.events) {
      const li = h('li'); const dot = h('i');
      dot.style.background = e.kind === 'status' ? STATUS[e.status || 'unknown'].color : (e.bot ? lookColor(state, e.bot) : '#8e8ba8');
      const body = h('div'); body.append(h('div', 'etext', e.summary), h('div', 'etime', timeLine(e.time)));
      li.append(dot, body); box.append(li);
    }
  }

  // 開場順序：先畫快取 → 立刻抓 12 小時歷史並畫出清單 → 開 SSE → 最後才載入 3D（不擋住資料）
  render();
  setInterval(render, 30000);
  setConn('off', '讀取中');
  let started3d = false;
  const kick3d = () => { if (started3d) return; started3d = true; setTimeout(start3d, 0); };
  setTimeout(kick3d, 2500);
  fetchSince('all')
    .then(() => setConn('off', '已載入，連線中'))
    .catch(() => setConn('down', '讀取失敗，重試中'))
    .finally(() => { connectSse(); setTimeout(() => { live = true; }, 3000); requestAnimationFrame(kick3d); });
}
