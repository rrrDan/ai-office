// AI 辦公室：FEED 解析與狀態管理（純邏輯，無 DOM，可在 Node 測試）
// 只讀取，不寫入任何訊息。

export const BOTS = [
  { key: 'nori',   name: 'Nori · CEO · 總管',            short: 'Nori',   floor: 4, color: '#3a3f4b' },
  { key: 'meron',  name: 'Meron · 繪圖技術',              short: 'Meron',  floor: 2, color: '#13b7a2' },
  { key: 'yuzu',   name: 'Yuzu · 桌面助理 · 排程助理',     short: 'Yuzu',   floor: 2, color: '#959595' },
  { key: 'goya',   name: 'Goya · 高階編碼專業工程',        short: 'Goya',   floor: 2, color: '#f59312' },
  { key: 'ichigo', name: 'Ichigo · 分析師',               short: 'Ichigo', floor: 2, color: '#fd690f' },
  { key: 'akara',  name: '阿卡拉專案經理',                 short: '阿卡拉', floor: 1, color: '#1e86fc' },
];

export const STATUS = {
  working:      { label: '工作中',   color: '#4da3ff', glyph: '⋯' },
  done:         { label: '完成',     color: '#3ccf91', glyph: '✓' },
  idle:         { label: '待命',     color: '#a3acc2', glyph: 'z' },
  waiting_user: { label: '等待用戶', color: '#ffb648', glyph: '!' },
  error:        { label: '錯誤',     color: '#ff5d6c', glyph: '!' },
  other:        { label: '其他狀態', color: '#8e8ba8', glyph: '?' },
  unknown:      { label: '超過 12 小時未更新', color: '#6f7890', glyph: '?' },
};

// 超過這個時間沒有新狀態，就標示「超過 12 小時未更新」
export const STALE_SEC = 12 * 3600;
// 給畫面用的狀態：沒資料 → unknown；有資料但太舊 → stale = true
export function viewStatus(state, key, nowMs = Date.now()) {
  const s = state.bots[key];
  if (!s || !s.time) return { s: null, status: 'unknown', stale: true };
  const stale = nowMs / 1000 - s.time > STALE_SEC;
  return { s, status: s.status in STATUS ? s.status : 'other', stale };
}

const EXTRA_PALETTE = ['#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#f87171'];
const MAX_EVENTS = 30;

export function normStatus(s) {
  const v = String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return Object.prototype.hasOwnProperty.call(STATUS, v) && v !== 'unknown' && v !== 'other' ? v : 'other';
}

function firstToken(name) {
  return String(name ?? '').trim().split(/\s*[·•|｜:：]\s*|\s+/)[0].toLowerCase();
}

// 把 FEED 中的 bot 名稱對應到已知 bot；找不到就回傳 key = 'x:' + 名稱
export function resolveBot(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const b of BOTS) if (b.name.toLowerCase() === lower) return b.key;
  const ft = firstToken(name);
  for (const b of BOTS) {
    const bt = firstToken(b.name);
    if (ft && (ft === bt || ft === b.key || ft === b.short.toLowerCase())) return b.key;
  }
  for (const b of BOTS) if (lower.startsWith(b.short.toLowerCase()) || b.name.toLowerCase().startsWith(lower)) return b.key;
  if (name.includes('阿卡拉')) return 'akara';
  return 'x:' + name.slice(0, 60);
}

export function emptyState() {
  return { bots: {}, extras: {}, looks: {}, groups: {}, chat: {}, roster: [], usage: null, routines: {}, events: [], lastId: null, lastTime: 0, seen: new Set() };
}

export function botMeta(state, key) {
  const known = BOTS.find(b => b.key === key);
  if (known) return known;
  const name = key.slice(2);
  const idx = Object.keys(state.extras).indexOf(key);
  return { key, name, short: firstToken(name) || name, floor: 0, color: EXTRA_PALETTE[(idx < 0 ? 0 : idx) % EXTRA_PALETTE.length] };
}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function str(v, max = 300) { return typeof v === 'string' ? v.slice(0, max) : (v == null ? '' : String(v).slice(0, max)); }
function validColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : null; }

function touchExtra(state, key, t) {
  if (key && key.startsWith('x:')) state.extras[key] = Math.max(state.extras[key] || 0, t);
}

function pushEvent(state, ev) {
  if (state.events.some(e => e.id === ev.id)) return;
  state.events.push(ev);
  state.events.sort((a, b) => b.time - a.time);
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
}

// 解析 ntfy 的一個 message 事件，回傳是否有變更
export function applyNtfy(state, ev) {
  if (!isObj(ev) || ev.event !== 'message') return false;
  const time = Number(ev.time) || Math.floor(Date.now() / 1000);
  const id = str(ev.id, 40) || ('t' + time + ':' + str(ev.message, 200));
  if (!state.seen) state.seen = new Set();
  if (state.seen.has(id)) return false;
  state.seen.add(id);
  if (time >= state.lastTime) { state.lastTime = time; state.lastId = id; }
  let body = null;
  const raw = str(ev.message, 4000);
  try { body = JSON.parse(raw); } catch { body = null; }
  const name = (k) => botMeta(state, k).short;

  if (!isObj(body)) {
    pushEvent(state, { id, time, kind: 'text', bot: null, summary: '文字訊息：' + raw.slice(0, 80) });
    return true;
  }

  // 1. 狀態訊息 {bot,status,step}
  if ('bot' in body && ('status' in body || 'step' in body)) {
    const key = resolveBot(body.bot);
    if (!key) return false;
    touchExtra(state, key, time);
    const status = normStatus(body.status);
    const prev = state.bots[key];
    if (!prev || time >= prev.time) state.bots[key] = { status, step: str(body.step, 300), time, rawStatus: str(body.status, 40) };
    pushEvent(state, { id, time, kind: 'status', bot: key, status, summary: `${name(key)}：${STATUS[status].label}${body.step ? '｜' + str(body.step, 120) : ''}` });
    return true;
  }
  // 2. roster
  if (Array.isArray(body.roster)) {
    state.roster = body.roster.map(n => str(n, 80)).filter(Boolean);
    for (const n of state.roster) touchExtra(state, resolveBot(n), time);
    pushEvent(state, { id, time, kind: 'roster', bot: null, summary: `名冊更新（${state.roster.length} 位）` });
    return true;
  }
  // 3. looks
  if (isObj(body.looks)) {
    let n = 0;
    for (const [bn, lk] of Object.entries(body.looks)) {
      const key = resolveBot(bn); if (!key || !isObj(lk)) continue;
      touchExtra(state, key, time);
      state.looks[key] = { color: validColor(lk.color), shape: str(lk.shape, 20), accessory: str(lk.accessory, 20) };
      n++;
    }
    pushEvent(state, { id, time, kind: 'looks', bot: null, summary: `外型設定更新（${n} 位）` });
    return true;
  }
  // 4. groups
  if (isObj(body.groups)) {
    for (const [bn, g] of Object.entries(body.groups)) { const key = resolveBot(bn); if (key) state.groups[key] = str(g, 40); }
    pushEvent(state, { id, time, kind: 'groups', bot: null, summary: `分組更新（${Object.keys(body.groups).length} 位）` });
    return true;
  }
  // 5. chat（對話連結）
  if (isObj(body.chat)) {
    for (const [bn, url] of Object.entries(body.chat)) {
      const key = resolveBot(bn); const u = str(url, 300);
      if (key && /^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !/^(javascript|data|vbscript|file):/i.test(u)) state.chat[key] = u;
    }
    pushEvent(state, { id, time, kind: 'chat', bot: null, summary: '對話連結更新' });
    return true;
  }
  // 6. usage
  if (body.type === 'usage' || isObj(body.usage)) {
    const u = isObj(body.usage) ? body.usage : body;
    const bots = {};
    if (isObj(u.bots)) for (const [bn, v] of Object.entries(u.bots)) { const key = resolveBot(bn); const num = Number(v); if (key && isFinite(num)) bots[key] = num; }
    const total = Number(u.total_used_pct);
    if (!state.usage || time >= state.usage.time) state.usage = { total: isFinite(total) ? total : null, resetsAt: str(u.resets_at, 40), bots, time };
    pushEvent(state, { id, time, kind: 'usage', bot: null, summary: `用量更新：總用量 ${isFinite(total) ? total + '%' : '—'}` });
    return true;
  }
  // 7. routines {"routines":{"bot":..,"items":[...]}}
  if (isObj(body.routines) || Array.isArray(body.routines)) {
    const list = Array.isArray(body.routines) ? body.routines : [body.routines];
    for (const r of list) {
      if (!isObj(r)) continue;
      const key = resolveBot(r.bot); if (!key) continue;
      touchExtra(state, key, time);
      const items = (Array.isArray(r.items) ? r.items : []).filter(isObj).slice(0, 30)
        .map(it => ({ name: str(it.name, 120), schedule: str(it.schedule, 160), next: str(it.next_run, 40) }));
      const prev = state.routines[key];
      if (!prev || time >= prev.time) state.routines[key] = { items, time };
      pushEvent(state, { id, time, kind: 'routines', bot: key, summary: `${name(key)} 排程更新（${items.length} 項）` });
    }
    return true;
  }
  pushEvent(state, { id, time, kind: 'other', bot: null, summary: '其他訊息：' + Object.keys(body).slice(0, 5).join('、') });
  return true;
}

export function allBotKeys(state) {
  return [...BOTS.map(b => b.key), ...Object.keys(state.extras)];
}

export function lookColor(state, key) {
  return state.looks[key]?.color || botMeta(state, key).color;
}

// 序列化（localStorage 用）
export function serialize(state) {
  const { seen, ...rest } = state; return JSON.stringify(rest);
}
export function deserialize(json) {
  const s = emptyState();
  try {
    const o = JSON.parse(json);
    if (isObj(o)) for (const k of Object.keys(s)) if (k !== 'seen' && k in o && typeof o[k] === typeof s[k]) s[k] = o[k];
    if (o && o.usage && isObj(o.usage)) s.usage = o.usage;
  } catch { /* 忽略壞資料 */ }
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.roster)) s.roster = [];
  if (!isObj(s.bots)) s.bots = {};
  // 舊版快取的 'unknown'（格式不明）改成 'other'
  for (const v of Object.values(s.bots)) if (isObj(v) && v.status === 'unknown') v.status = 'other';
  return s;
}

// 時間格式（台北時間）
const fmt = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export function taipei(tSec) { return tSec ? fmt.format(new Date(tSec * 1000)) : '—'; }
export function taipeiIso(iso) { const d = new Date(iso); return isNaN(d) ? (iso || '—') : fmt.format(d); }
export function relative(tSec, nowMs = Date.now()) {
  if (!tSec) return '';
  const diff = Math.round(nowMs / 1000 - tSec);
  const a = Math.abs(diff), suf = diff >= 0 ? '前' : '後';
  if (a < 45) return diff >= 0 ? '剛剛' : '即將';
  if (a < 3600) return `${Math.round(a / 60)} 分鐘${suf}`;
  if (a < 86400) return `${Math.round(a / 3600)} 小時${suf}`;
  return `${Math.round(a / 86400)} 天${suf}`;
}
