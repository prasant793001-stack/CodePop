/* ===== CodePop app: core (state, i18n, helpers, sound, fx) ===== */
const C = window.CONTENT, E = window.EXPL, CP = window.CP, H = window.HTMLX, Core = window.CPCore;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = E.esc;
const app = $('#app');
const KEY = 'codepop.v1';
const THEME_IDS = C.THEMES.map(t => t.id), SPOKEN_IDS = C.LANGS.map(l => l.id);

const DEF = { lang: 'html', spoken: 'en', skin: 'blocky', size: 16, auto: true, sound: true, speed: 'med', xp: 0, done: {}, mission: null, split: 0.36, vsplit: 0.5, side: 'l', live: 'both', seenTerm: false, active: null, stash: {}, stashOn: {}, git: { repo: '', branch: '' }, code: { html: '', cpp: '' } };
function loadState() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
const S = Object.assign({}, DEF, loadState());
S.code = Object.assign({ html: '', cpp: '' }, S.code || {});
S.done = S.done && typeof S.done === 'object' ? S.done : {};
if (!THEME_IDS.includes(S.skin)) S.skin = DEF.skin;
if (!SPOKEN_IDS.includes(S.spoken)) S.spoken = DEF.spoken;
if (S.lang !== 'html' && S.lang !== 'cpp') S.lang = 'html';
if (!['slow', 'med', 'fast'].includes(S.speed)) S.speed = 'med';
S.size = Math.max(13, Math.min(22, +S.size || 16));
S.split = Math.max(0.15, Math.min(0.7, +S.split || 0.36));
S.vsplit = Math.max(0.22, Math.min(0.78, +S.vsplit || 0.5));
if (S.side !== 'r') S.side = 'l';
if (!['screen', 'term', 'both'].includes(S.live)) S.live = 'both';
if (!S.stash || typeof S.stash !== 'object') S.stash = {};
if (!S.stashOn || typeof S.stashOn !== 'object') S.stashOn = {};
if (!S.git || typeof S.git !== 'object') S.git = {};
S.git = { repo: String(S.git.repo || '').slice(0, 140), branch: String(S.git.branch || '').slice(0, 100) };   /* never holds a token */
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }, 250); }

/* ---------- i18n ---------- */
function t(key, p) {
  const ui = C.UI[S.spoken] || C.UI.en;
  let s = ui[key]; if (s === undefined) s = C.UI.en[key]; if (s === undefined) s = key;
  return p ? s.replace(/\{(\w+)\}/g, (m, k) => p[k] !== undefined ? p[k] : m) : s;
}
/* escaped template, with chosen params wrapped as <code> */
function tf(key, p, codeKeys) {
  const tpl = t(key); let out = '', last = 0; const re = /\{(\w+)\}/g; let m;
  while ((m = re.exec(tpl))) {
    out += esc(tpl.slice(last, m.index)); const v = p[m[1]];
    out += v === undefined ? esc(m[0]) : (codeKeys && codeKeys.includes(m[1]) ? '<code>' + esc(String(v)) + '</code>' : esc(String(v)));
    last = re.lastIndex;
  }
  return out + esc(tpl.slice(last));
}
const L = (o) => o ? (o[S.spoken] || o.en || '') : '';
const theme = () => E.theme(S.skin);
const pick = a => a[Math.floor(Math.random() * a.length)];
function say(kind) {
  const th = theme();
  const arr = S.spoken === 'en' && th.say && th.say[kind] ? th.say[kind] : ((C.GENERIC_SAY[S.spoken] || C.GENERIC_SAY.en)[kind] || ['']);
  return pick(arr);
}
function applyI18n() {
  document.documentElement.lang = S.spoken;
  const rtl = (C.LANGS.find(l => l.id === S.spoken) || {}).dir === 'rtl';
  app.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  $$('[data-t]').forEach(n => { n.textContent = t(n.dataset.t); });
  $$('[data-tip]').forEach(n => { n.title = t(n.dataset.tip); });
  $('#offHint').textContent = t(S.lang === 'cpp' ? 'screen.hint.cpp' : 'screen.hint.html');
  $('#xpPill').title = t('xp');
  $('#btnSet').title = t('settings');
}

/* ---------- toast / sound / fx ---------- */
let toastT;
function toast(msg, act) {
  const el = $('#toast'); el.textContent = msg; el.style.pointerEvents = act ? 'auto' : 'none';
  if (act) { const b = document.createElement('button'); b.textContent = ' ' + act.label; b.style.cssText = 'margin-inline-start:8px;font-weight:800;background:#fff;border:2px solid var(--ink);border-radius:10px;padding:0 8px'; b.onclick = () => { act.fn(); el.classList.remove('show'); }; el.appendChild(b); }
  el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), act ? 4200 : 2200);
}
let AC = null;
function tone(f, d, type, vol, at) {
  if (!S.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime + (at || 0);
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + d + 0.02);
  } catch (e) { }
}
const sfx = {
  tap() { tone(520, .05, 'triangle', .04); },
  run() { tone(330, .08, 'square', .04); tone(494, .08, 'square', .04, .07); tone(659, .12, 'square', .04, .14); },
  ok() { tone(523, .09, 'triangle', .06); tone(784, .16, 'triangle', .06, .09); },
  err() { tone(196, .14, 'sawtooth', .05); tone(147, .22, 'sawtooth', .05, .12); },
  fix() { tone(440, .07, 'triangle', .06); tone(660, .07, 'triangle', .06, .07); tone(880, .12, 'triangle', .06, .14); },
  level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, 'square', .05, i * .1)); },
  on() { tone(90, .35, 'sawtooth', .04); tone(1200, .12, 'sine', .03, .25); }
};
function confetti(n) {
  const fx = $('#fx'), th = theme(), set = [th.emoji, th.mascot, '⭐', '✨', '🎉', th.emoji];
  n = n || 34;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span'); s.className = 'confetti'; s.textContent = pick(set);
    s.style.left = (Math.random() * 100) + '%'; s.style.fontSize = (16 + Math.random() * 18) + 'px';
    s.style.setProperty('--dx', ((Math.random() - .5) * 160) + 'px'); s.style.setProperty('--rot', ((Math.random() - .5) * 900) + 'deg');
    s.style.setProperty('--d', (1.2 + Math.random() * 1.2) + 's'); s.style.animationDelay = (Math.random() * .4) + 's';
    fx.appendChild(s); setTimeout(() => s.remove(), 3200);
  }
}
const lvOf = xp => Math.floor(xp / 100) + 1;
function updateXp() { $('#xpLv').textContent = '⭐ ' + lvOf(S.xp); $('#xpBar').style.width = (S.xp % 100) + '%'; }
function addXp(n) {
  const before = lvOf(S.xp); S.xp += n; save(); updateXp();
  if (lvOf(S.xp) > before) {
    sfx.level(); confetti(46);
    const d = document.createElement('div'); d.className = 'levelup'; d.textContent = t('cheer.level') + ' ' + lvOf(S.xp); $('#fx').appendChild(d); setTimeout(() => d.remove(), 1700);
  }
}
function hopMascot() { const m = $('#mascot'); if (!m) return; m.classList.remove('hop'); void m.offsetWidth; m.classList.add('hop'); }
