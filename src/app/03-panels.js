/* ===== CodePop app: explain bar, sheets (terminal / problems / lines / missions), missions, settings ===== */
let exOpen = false, askQ = '', askRes = null, askNone = false, probOpen = null, linesOpen = 0, lastExLine = 0;
const pkey = p => p.code + ':' + p.line + ':' + (p.off || 0);
const curLine = () => Math.max(1, ed.lastCaret > 0 ? ed.lastCaret : 1);
const LESSONS = C.LESSONS;
function applyEditsStr(src, edits) { for (const x of edits.slice().sort((a, b) => b.s - a.s)) src = src.slice(0, x.s) + x.t + src.slice(x.e); return src; }
function applyEdits(edits) {
  const ta = ed.ta; for (const x of edits.slice().sort((a, b) => b.s - a.s)) ta.setRangeText(x.t, x.s, x.e, 'end');
  const f = edits.reduce((m, x) => x.s < m.s ? x : m), pos = f.s + f.t.length;
  ta.setSelectionRange(pos, pos); ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function probText(p) {
  if (p.runtime) return 'main.cpp:' + p.line + ': error: ' + p.msg;
  if (S.lang === 'html') return H.formatProblem(p).text;
  const f = CP.format(ed.value, p); return f.length ? f[0].text : p.msg;
}

/* ---------- explain bar ---------- */
function renderExplain() {
  const box = $('#explain'), th = theme(), src = ed.value; const ln0 = curLine();
  if (ln0 !== lastExLine) { lastExLine = ln0; askRes = null; askNone = false; }
  let h = '<div class="mascot" id="mascot" role="button" tabindex="0" aria-label="' + esc(L(th.name)) + '">' + th.mascot + '</div><div class="bubble">';
  const m = S.mission && LESSONS.find(l => l.id === S.mission);
  if (m) h += '<div class="goal"><span>🎯 <b>' + esc(L(m.title)) + ':</b> ' + esc(L(m.goal)) + '</span></div>';
  if (sayMsg) h += '<div class="say' + (sayMsg.bad ? ' bad' : '') + '">' + esc(sayMsg.text) + '</div>';
  if (!src.trim() || !infos.length) {
    h += '<div class="ex-what">' + esc(S.spoken === 'en' && th.say && th.say.hi ? th.say.hi[0] : (C.GENERIC_SAY[S.spoken] || C.GENERIC_SAY.en).hi[0]) + '</div>';
    h += moreBlock(null);
  } else {
    let ln = Math.min(ln0, infos.length);
    if (infos[ln - 1] && infos[ln - 1].id === 'blank') { let k = ln - 1; while (k >= 1 && infos[k - 1].id === 'blank') k--; if (k >= 1) ln = k; }
    const info = infos[ln - 1] || infos[infos.length - 1], r = E.render(info, S.spoken, S.skin);
    h += '<div class="bub-row"><span class="ex-chip" dir="ltr">' + esc(r.chip || '…') + '</span><span class="ex-line">' + esc(t('line')) + ' ' + ln + '</span>' +
      '<span class="bub-btns"><button class="mini" data-act="prev" aria-label="' + esc(t('prev')) + '">▲</button><button class="mini" data-act="next" aria-label="' + esc(t('next')) + '">▼</button><button class="mini' + (exOpen ? ' on' : '') + '" data-act="more" aria-label="' + esc(t('why')) + '">💡</button></span></div>';
    h += '<div class="ex-what"><span class="em">' + r.e + '</span>' + r.what + '</div>';
    const pr = allProblems().find(p => p.line === ln);
    if (pr) {
      const card = C.PROB[pr.code] ? (C.PROB[pr.code][S.spoken] || C.PROB[pr.code].en) : null;
      h += '<button class="oops-row" data-act="fix" data-k="' + esc(pkey(pr)) + '"><span>🐛 ' + esc(card ? card[0] : pr.msg) + '</span><b>' + esc(t('fix.tapme')) + '</b></button>';
    }
    h += moreBlock(r);
  }
  box.innerHTML = h + '</div>';
}
function moreBlock(r) {
  if (!exOpen) return '';
  const th = theme(); let h = '<div class="ex-more">';
  if (r) {
    h += '<div class="ex-sec"><h6>' + esc(t('why')) + '</h6>' + r.why + '</div>';
    if (r.play) h += '<div class="ex-sec play"><h6>' + th.emoji + ' ' + esc(L(th.name)) + '</h6>' + r.play + '</div>';
    if (r.extras && r.extras.length) h += '<div class="ex-extra">' + r.extras.map(x => '<span>' + x.e + ' <code>' + esc(x.chip) + '</code></span>').join('') + '</div>';
  }
  h += '<div class="ask"><input id="askIn" type="text" value="' + esc(askQ) + '" placeholder="' + esc(t('ask.ph')) + '" enterkeyhint="search" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="btn sm" data-act="ask">' + esc(t('ask')) + '</button></div>';
  if (askRes) h += '<div class="ex-sec"><h6><code>' + esc(askRes.chip) + '</code></h6>' + askRes.e + ' ' + askRes.what + '<br><small>' + askRes.why + '</small>' + (askRes.play ? '<div class="ex-sec play" style="margin-top:4px">' + askRes.play + '</div>' : '') + '</div>';
  else if (askNone) h += '<div class="ex-sec">' + esc(t('ask.none')) + '</div>';
  return h + '</div>';
}
function doAsk() {
  const i = $('#askIn'); askQ = i ? i.value : askQ; askRes = askQ.trim() ? E.ask(S.lang, askQ, S.spoken, S.skin) : null; askNone = !!askQ.trim() && !askRes;
  if (askQ.trim()) Tel.tip('ask:' + askQ.trim().toLowerCase()); renderExplain(); sfx.tap(); const j = $('#askIn'); if (j) j.focus({ preventScroll: true });
}
$('#explain').addEventListener('click', e => {
  const b = e.target.closest('[data-act],#mascot'); if (!b) return;
  const a = b.dataset.act || 'mascot';
  if (a === 'prev') ed.gotoLine(curLine() - 1);
  else if (a === 'next') ed.gotoLine(curLine() + 1);
  else if (a === 'more') { exOpen = !exOpen; if (exOpen) Tel.tip('why:' + curLine()); renderExplain(); }
  else if (a === 'ask') doAsk();
  else if (a === 'fix') { probOpen = b.dataset.k; Tel.help(b.dataset.k); openTab('problems', true); }
  else if (a === 'mascot') flash(say('hi'));
  if (a !== 'ask') sfx.tap();
});
$('#explain').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'askIn') { e.preventDefault(); doAsk(); } });

/* ---------- sheet ---------- */
function updateDock() { $$('#dock button').forEach(b => b.setAttribute('aria-pressed', String(sheetOpen() && b.dataset.tab === sheetTab))); }
function openTab(name, force) {
  if (!force && sheetTab === name && sheetOpen()) { closeSheet(); return; }
  sheetTab = name; $('#sheet').hidden = false; updateDock(); renderSheet(); sfx.tap(); if (name === 'lines') Tel.tip('lines');
}
function closeSheet() { $('#sheet').hidden = true; sheetTab = null; updateDock(); }
function renderSheet(keep) {
  if (!sheetTab) return; const sb = $('#sheetBody'), sc = sb.scrollTop;
  $('#sheetTitle').textContent = t('tab.' + sheetTab);
  ({ term: renderTerm, problems: renderProblems, lines: renderLines, missions: renderMissions })[sheetTab]();
  if (keep) sb.scrollTop = sc;
}
function renderTerm() {
  $('#sheetTools').innerHTML = ['all', 'out', 'steps'].map(f => '<button class="tchip" data-f="' + f + '" aria-pressed="' + (termFilter === f) + '">' + esc(t('term.' + f)) + '</button>').join('') + '<button class="tchip" data-f="clear">🗑</button>';
  const vis = termEntries.filter(termVisible), sb = $('#sheetBody');
  sb.innerHTML = '<div class="term" id="termBox"></div>'; const box = $('#termBox');
  if (!vis.length) box.innerHTML = '<div class="empty" style="color:#8aa0c4"><big>🖥️</big>' + esc(t('term.empty')) + '</div>';
  else { const f = document.createDocumentFragment(); vis.forEach(en => f.appendChild(termNode(en))); box.appendChild(f); }
  sb.scrollTop = sb.scrollHeight;
}
$('#sheetTools').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (!b || sheetTab !== 'term') return;
  if (b.dataset.f === 'clear') termClear(); else { termFilter = b.dataset.f; renderTerm(); } sfx.tap();
});
$('#sheetBody').addEventListener('click', e => {
  const tl = e.target.closest('.tl[data-line]'); if (tl) { ed.gotoLine(+tl.dataset.line); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'ptoggle') { probOpen = probOpen === b.dataset.k ? null : b.dataset.k; if (probOpen) Tel.help(probOpen); renderProblems(); const p = allProblems().find(x => pkey(x) === b.dataset.k); if (p && p.line && probOpen) ed.gotoLine(p.line); sfx.tap(); }
  else if (a === 'pfix') fixProblem(b.dataset.k);
  else if (a === 'pgo') { const p = allProblems().find(x => pkey(x) === b.dataset.k); closeSheet(); if (p) ed.gotoLine(p.line || 1, true); }
  else if (a === 'lcard') { const n = +b.dataset.n; linesOpen = linesOpen === n ? 0 : n; if (linesOpen) Tel.tip('l' + n); ed.gotoLine(n); renderLines(); sfx.tap(); }
  else if (a === 'mstart') startMission(b.dataset.id, false);
  else if (a === 'mstarter') startMission(b.dataset.id, true);
  else if (a === 'mfree') { S.mission = null; blankEditor(); closeSheet(); renderExplain(); save(); }
});
$('#sheetClose').addEventListener('click', () => { closeSheet(); sfx.tap(); });
$$('#dock button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));

/* ---------- problems ---------- */
function diffHtml(p) {
  const fix = p.fixes && p.fixes[0]; if (!fix) return '';
  const src = ed.value, out = applyEditsStr(src, fix.edits), a = src.split('\n'), b = out.split('\n');
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length - 1, jb = b.length - 1; while (ja >= i && jb >= i && a[ja] === b[jb]) { ja--; jb--; }
  let del = a.slice(i, ja + 1), add = b.slice(i, jb + 1), s0 = i;
  if (!del.length && i > 0) { del = [a[i - 1]]; add = [b[i - 1]].concat(add); s0 = i - 1; }
  const row = (cls, n, l) => '<div class="' + cls + '">' + esc((n + 1) + ' │ ' + l) + '</div>';
  return '<div class="diff"><div class="lab">' + esc(t('before')) + '</div>' + (del.length ? del.slice(0, 4).map((l, k) => row('del', s0 + k, l)).join('') : row('del', i, '')) +
    '<div class="lab">' + esc(t('after')) + '</div>' + add.slice(0, 5).map((l, k) => row('add', s0 + k, l)).join('') + '</div>';
}
function probCard(p) {
  const key = pkey(p), open = probOpen === key;
  const card = C.PROB[p.code] ? (C.PROB[p.code][S.spoken] || C.PROB[p.code].en) : null;
  const title = card ? card[0] : p.code, sev = p.sev === 'error' || p.sev === 'link' ? 'e' : p.sev === 'warning' ? 'w' : 'h';
  let h = '<div class="pcard"><button class="phead" data-act="ptoggle" data-k="' + esc(key) + '"><span class="psev ' + sev + '">' + (sev === 'e' ? '✖' : sev === 'w' ? '!' : 'i') + '</span><span class="pt"><b>' + esc(title) + '</b><small>' + esc(probText(p)) + '</small></span>' + (p.line ? '<span class="pgo">' + esc(t('line')) + ' ' + p.line + '</span>' : '') + '</button>';
  if (open && card) {
    const d = p.data || {};
    h += '<div class="pbody"><div class="ex-sec"><h6>' + esc(t('meaning')) + '</h6>' + E.fmt(card[1], d) + '</div><div class="ex-sec"><h6>' + esc(t('howfix')) + '</h6>' + E.fmt(card[2], d) + '</div>' + diffHtml(p) +
      '<div class="ex-sec tip"><h6>💡 ' + esc(t('tip')) + '</h6>' + E.fmt(card[3], d) + '</div><div class="pact">' +
      (p.fixes && p.fixes.length ? '<button class="btn good" data-act="pfix" data-k="' + esc(key) + '">✨ ' + esc(t('apply')) + '</button>' : '') +
      (p.line ? '<button class="btn alt" data-act="pgo" data-k="' + esc(key) + '">📍 ' + esc(t('jump')) + '</button>' : '') + '</div></div>';
  }
  return h + '</div>';
}
function renderProblems() {
  const ps = allProblems(); $('#sheetTools').innerHTML = ps.length ? '<span class="tchip" aria-pressed="true">' + esc(t('prob.count', { n: ps.length })) + '</span>' : '';
  $('#sheetBody').innerHTML = ps.length ? ps.map(probCard).join('') : '<div class="empty"><big>✅</big>' + esc(t(ed.value.trim() ? 'prob.none' : 'lines.empty')) + '</div>';
}
function fixProblem(key) {
  const p = allProblems().find(x => pkey(x) === key); if (!p || !p.fixes || !p.fixes.length) return;
  applyEdits(p.fixes[0].edits); probOpen = null; Tel.fix(); sfx.fix(); hopMascot(); toast('✨ ' + t('applied')); addXp(5);
  const run = () => { analyze(); if (sheetTab === 'problems') renderProblems(); }; run();
}

/* ---------- lines tab ---------- */
function renderLines() {
  $('#sheetTools').innerHTML = '';
  if (!ed.value.trim() || !infos.length) { $('#sheetBody').innerHTML = '<div class="empty"><big>🔍</big>' + esc(t('lines.empty')) + '</div>'; return; }
  const cur = curLine(); let h = '<div class="empty" style="padding:0 0 8px;font-size:13px">' + esc(t('tabs.hint')) + '</div>';
  infos.forEach((info, i) => {
    if (info.id === 'blank') return; const r = E.render(info, S.spoken, S.skin), n = i + 1;
    h += '<button class="lcard' + (n === cur ? ' cur' : '') + '" data-act="lcard" data-n="' + n + '"><span class="lnum">' + n + '</span><span class="lem">' + r.e + '</span><span class="lbody"><span class="lc" dir="ltr">' + esc(r.chip || '') + '</span>' + r.what +
      (linesOpen === n ? '<div class="ex-sec" style="margin-top:5px"><h6>' + esc(t('why')) + '</h6>' + r.why + '</div>' + (r.play ? '<div class="ex-sec play" style="margin-top:5px">' + r.play + '</div>' : '') : '') + '</span></button>';
  });
  $('#sheetBody').innerHTML = h;
}

/* ---------- missions ---------- */
const bare = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/"(?:\\.|[^"\\\n])*"/g, '""');
const has = (src, re) => re.test(src);
const noErr = () => !allProblems().some(p => p.sev === 'error' || p.sev === 'link');
const MCHK = {
  html1: c => /<h1[^>]*>\s*[^<\s][^<]*<\/h1>/i.test(c.src) && /<body/i.test(c.src) && noErr() && !(c.src.match(/<h1[^>]*>([^<]*)<\/h1>/i) || [, ''])[1].trim().startsWith('Welcome to ' + theme().v.place),
  html2: c => /<p[^>]*>[\s\S]*<(b|strong)>[\s\S]*<\/(b|strong)>[\s\S]*<\/p>/i.test(c.src) && noErr(),
  html3: c => /<img\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/i.test(c.src) && /<a\b[^>]*\bhref\s*=/i.test(c.src) && noErr(),
  html4: c => ((c.src.match(/<li[\s>]/gi) || []).length >= 3) && /<(ul|ol)[\s>]/i.test(c.src) && /<button/i.test(c.src) && noErr(),
  html5: c => { const m = c.src.match(/<style[^>]*>([\s\S]*?)<\/style>/i); return !!m && /\bcolor\s*:/i.test(m[1]) && /\bbackground(-color)?\s*:/i.test(m[1]) && noErr(); },
  html6: c => /<h1/i.test(c.src) && /<p[\s>]/i.test(c.src) && /<img/i.test(c.src) && /<button/i.test(c.src) && /<style/i.test(c.src) && noErr(),
  cpp1: c => c.ran && c.exit === 0 && c.out.trim().length > 0 && /\bcout\b/.test(bare(c.src)),
  cpp2: c => c.ran && c.exit === 0 && /\b(int|double|string|bool|char|long|auto)\s+\w+\s*=/.test(bare(c.src)) && c.out.trim().length > 0,
  cpp3: c => c.ran && c.exit === 0 && /[\w)\]]\s*[+\-*\/%]\s*[\w(]/.test(bare(c.src).replace(/#include.*$/gm, '')) && c.out.trim().length > 0,
  cpp4: c => c.ran && c.exit === 0 && /\bif\s*\(/.test(bare(c.src)) && /\belse\b/.test(bare(c.src)),
  cpp5: c => c.ran && c.exit === 0 && /\b(for|while)\s*\(/.test(bare(c.src)) && c.out.split('\n').filter(Boolean).length >= 3,
  cpp6: c => { if (!(c.ran && c.exit === 0 && c.ast)) return false; const f = (c.ast.funcs || []).find(x => x.name !== 'main' && x.body); return !!f && (bare(c.src).match(new RegExp('\\b' + f.name + '\\s*\\(', 'g')) || []).length >= 2; }
};
function checkMission(ctx) {
  const id = S.mission; if (!id || S.done[id]) return; const m = LESSONS.find(l => l.id === id); if (!m || m.lang !== S.lang || !MCHK[id]) return;
  let ok = false; try { ok = MCHK[id](Object.assign({ src: ed.value, ran: false, out: '', exit: -1 }, ctx || {})); } catch (e) { ok = false; }
  if (!ok) return;
  S.done[id] = 1; save(); sfx.level(); confetti(40); toast('🏆 ' + t('missions.done') + '  +50 ' + t('xp')); addXp(50); flash(say('ok')); renderExplain();
  if (sheetTab === 'missions') renderMissions();
}
function blankEditor() { const prev = ed.value; ed.setValue(''); if (prev.trim()) toast(t('clear.code'), { label: '↶', fn: () => ed.setValue(prev) }); }
function starterId() {
  if (S.mission && LESSONS.find(l => l.id === S.mission && l.lang === S.lang)) return S.mission;
  const own = LESSONS.filter(l => l.lang === S.lang); return (own.find(l => !S.done[l.id]) || own[0]).id;
}
function loadStarter(id) {
  const prev = ed.value; ed.setValue(C.STARTER[id || starterId()](theme().v), 0);
  toast(t('starter'), prev.trim() ? { label: '↶', fn: () => ed.setValue(prev) } : null);
}
function startMission(id, withStarter) {
  const m = LESSONS.find(l => l.id === id); if (!m) return;
  if (m.lang !== S.lang) setLang(m.lang);
  S.mission = id; save();
  if (withStarter) loadStarter(id); else blankEditor();
  closeSheet(); renderExplain(); hopMascot(); sfx.ok();
}
function renderMissions() {
  $('#sheetTools').innerHTML = '<span class="tchip" aria-pressed="true">' + esc(t('level')) + ' ' + lvOf(S.xp) + ' · ' + S.xp + ' ' + esc(t('xp')) + '</span>';
  let h = '<button class="mcard' + (!S.mission ? ' act' : '') + '" data-act="mfree"><span class="mnum">🎨</span><span class="mtxt"><b>' + esc(t('missions.free')) + '</b></span></button>';
  LESSONS.filter(l => l.lang === S.lang).forEach((l, i) => {
    const done = S.done[l.id], act = S.mission === l.id;
    h += '<div class="mcard' + (act ? ' act' : '') + (done ? ' done' : '') + '"><span class="mnum">' + (done ? '✓' : i + 1) + '</span><span class="mtxt"><b>' + esc(L(l.title)) + '</b><small>' + esc(L(l.goal)) + '</small></span><span class="mbtns"><button class="btn sm" data-act="mstart" data-id="' + l.id + '">' + esc(t('missions.go')) + '</button><button class="btn sm alt" data-act="mstarter" data-id="' + l.id + '" aria-label="' + esc(t('starter')) + '">📥</button></span></div>';
  });
  $('#sheetBody').innerHTML = h;
}

/* ---------- settings ---------- */
const PREV = {
  blocky: ['#3fa9f5', 'linear-gradient(45deg,#2f93e0 25%,transparent 25%,transparent 75%,#2f93e0 75%)', '14px 14px', "'Bungee'", 9],
  space: ['#1a1245', 'radial-gradient(circle at 25% 30%,#fff 0 1px,transparent 1.5px),radial-gradient(circle at 70% 65%,#9be7ff 0 1px,transparent 1.5px)', '30px 30px', "'Audiowide'", 11],
  dino: ['#86d14b', 'radial-gradient(circle,#74bf3a 0 5px,transparent 6px)', '16px 16px', "'Bowlby One'", 10],
  snack: ['#ffcf33', 'repeating-linear-gradient(-45deg,#ffbf0f 0 6px,transparent 6px 12px)', 'auto', "'Lilita One'", 12.5],
  goal: ['#1faa59', 'repeating-linear-gradient(90deg,#1a9a50 0 12px,transparent 12px 24px)', 'auto', "'Russo One'", 11],
  candy: ['#ffb6dc', 'radial-gradient(circle,#fff 0 3px,transparent 4px)', '14px 14px', "'Chewy'", 13],
  arcade: ['#0a0a1f', 'linear-gradient(#2a2a6a 1px,transparent 1px),linear-gradient(90deg,#2a2a6a 1px,transparent 1px)', '10px 10px', "'Press Start 2P'", 6.5],
  reef: ['#19c3d6', 'radial-gradient(circle at 50% 100%,transparent 0 5px,#12aebf 6px 7px,transparent 8px)', '16px 9px', "'Fredoka'", 12.5]
};
let resetArmed = false;
function openSettings() { resetArmed = false; renderSettings(); $('#modal').hidden = false; sfx.tap(); }
function closeModal() { $('#modal').hidden = true; }
function renderSettings() {
  const th = C.THEMES.map(x => { const p = PREV[x.id]; return '<button class="tcard" data-act="skin" data-id="' + x.id + '" aria-pressed="' + (S.skin === x.id) + '" style="--tc-bg:' + p[0] + ';--tc-pat:' + p[1] + ';--tc-size:' + p[2] + ';font-family:' + p[3] + ',\'Baloo 2\',sans-serif;font-size:' + p[4] + 'px"><span class="te">' + x.emoji + '</span><span>' + esc(L(x.name)) + '</span></button>'; }).join('');
  const sw = (id, on, label) => '<div class="row"><label for="' + id + '">' + esc(label) + '</label><button class="sw" id="' + id + '" role="switch" aria-checked="' + on + '" data-act="' + id + '"></button></div>';
  $('#modalCard').innerHTML =
    '<div class="mh"><h3>' + esc(t('settings')) + '</h3><button class="round sm" data-act="mclose" aria-label="' + esc(t('close')) + '">✕</button></div>' +
    '<div class="sec">' + esc(t('set.spoken')) + '</div><div class="chips">' + C.LANGS.map(l => '<button class="pill" data-act="spoken" data-id="' + l.id + '" aria-pressed="' + (S.spoken === l.id) + '">' + esc(l.name) + '</button>').join('') + '</div>' +
    '<div class="sec">' + esc(t('set.theme')) + '</div><div class="themes">' + th + '</div>' +
    '<div class="sec">' + esc(t('set.font')) + ' · ' + S.size + 'px</div><input type="range" id="sizeR" min="13" max="22" step="1" value="' + S.size + '">' +
    '<div style="height:6px"></div>' + sw('auto', S.auto, t('set.auto')) + sw('sound', S.sound, t('set.sound')) +
    '<div class="sec">' + esc(t('set.speed')) + '</div><div class="chips">' + ['slow', 'med', 'fast'].map(s => '<button class="pill" data-act="speed" data-id="' + s + '" aria-pressed="' + (S.speed === s) + '">' + esc(t('speed.' + s)) + '</button>').join('') + '</div>' +
    '<div style="height:14px"></div><button class="btn alt" data-act="reset">' + esc(t('set.reset')) + (resetArmed ? ' ?' : '') + '</button>';
}
function setSkin(id) {
  S.skin = id; document.documentElement.setAttribute('data-skin', id); save();
  const th = theme(); $('#logoMark').textContent = th.emoji;
  try { const c = getComputedStyle(document.body).backgroundColor; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = c; } catch (e) { }
  renderExplain(); if (!$('#modal').hidden) renderSettings(); if (sheetOpen() && sheetTab !== 'term') renderSheet(true);
  confetti(16); hopMascot(); sfx.ok();
}
function setSpoken(id) {
  S.spoken = id; save(); applyI18n(); ed.setPlaceholder(t('ph.' + S.lang)); updateXp();
  analyze(); if (!$('#modal').hidden) renderSettings(); if (sheetOpen()) renderSheet(true); sfx.tap();
}
$('#modal').addEventListener('click', e => {
  if (e.target.id === 'modal') { closeModal(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'mclose') closeModal();
  else if (a === 'skin') setSkin(b.dataset.id);
  else if (a === 'spoken') setSpoken(b.dataset.id);
  else if (a === 'speed') { S.speed = b.dataset.id; save(); renderSettings(); sfx.tap(); }
  else if (a === 'auto') { S.auto = !S.auto; save(); renderSettings(); sfx.tap(); if (S.auto) analyze(); }
  else if (a === 'sound') { S.sound = !S.sound; save(); renderSettings(); sfx.tap(); }
  else if (a === 'reset') {
    if (!resetArmed) { resetArmed = true; renderSettings(); }
    else { S.xp = 0; S.done = {}; S.mission = null; S.seenTerm = false; save(); updateXp(); renderExplain(); closeModal(); toast(t('set.reset') + ' ✓'); }
  }
});
$('#modal').addEventListener('input', e => {
  if (e.target.id === 'sizeR') { S.size = +e.target.value; save(); applySize(); const sec = e.target.previousElementSibling; if (sec) sec.textContent = t('set.font') + ' · ' + S.size + 'px'; }
});
