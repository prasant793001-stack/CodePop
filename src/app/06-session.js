/* ===== CodePop app: challenge sessions, telemetry + counters, task view, submit and result ===== */
let m2h = {};
function m2Open(html, handlers) { $('#modal2Card').innerHTML = html; m2h = handlers || {}; $('#modal2').hidden = false; }
function m2Close() { $('#modal2').hidden = true; m2h = {}; }
$('#modal2').addEventListener('click', e => {
  if (e.target.id === 'modal2') { if (m2h.backdrop !== false) m2Close(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'm2close') { m2Close(); return; }
  if (m2h[a]) m2h[a](b);
});

/* ---------- telemetry + help counters (only while a challenge is active) ---------- */
const Tel = (() => {
  const fresh = () => ({ typedChars: 0, pastedChars: 0, pasteCount: 0, maxPaste: 0, copyEvents: 0, blurCount: 0, medianKeyMs: 0, keyCount: 0 });
  let on = false, tel = fresh(), cnt = { errors: 0, fixes: 0, help: 0, tips: 0 }, helpSeen = new Set(), tipSeen = new Set(), gaps = [], lastKey = 0, lastKd = 0;
  const persist = () => { if (S.active) { S.active.counters = Object.assign({}, cnt); save(); } };
  return {
    get on() { return on; },
    start(counters) { tel = fresh(); cnt = Object.assign({ errors: 0, fixes: 0, help: 0, tips: 0 }, counters || {}); helpSeen = new Set(); tipSeen = new Set(); gaps = []; lastKey = 0; on = true; },
    stop() { on = false; },
    key() { lastKd = performance.now(); },
    typed(n, fromInput) {
      if (!on) return; const now = performance.now(); if (fromInput && now - lastKd < 40) return;
      tel.typedChars += n || 1; tel.keyCount++; if (lastKey && now - lastKey < 5000) { gaps.push(now - lastKey); if (gaps.length > 300) gaps.shift(); } lastKey = now;
    },
    paste(n) { if (!on) return; tel.pasteCount++; tel.pastedChars += n; tel.maxPaste = Math.max(tel.maxPaste, n); },
    copy() { if (on) tel.copyEvents++; },
    blur() { if (on) tel.blurCount++; },
    err() { if (on) { cnt.errors++; persist(); } },
    fix() { if (on) { cnt.fixes++; persist(); } },
    help(k) { if (on && !helpSeen.has(k)) { helpSeen.add(k); cnt.help++; persist(); } },
    tip(k) { if (on && !tipSeen.has(k)) { tipSeen.add(k); cnt.tips++; persist(); } },
    counts() { return Object.assign({}, cnt); },
    snapshot() { const g = gaps.slice().sort((a, b) => a - b); tel.medianKeyMs = g.length ? Math.round(g[g.length >> 1]) : 0; return { counters: Object.assign({}, cnt), telemetry: Object.assign({}, tel) }; }
  };
})();
ed.ta.addEventListener('keydown', e => { if (Tel.on) { Tel.key(); if (e.key && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey) Tel.typed(1); } });
ed.ta.addEventListener('beforeinput', e => { if (!Tel.on) return; if (e.inputType === 'insertText' || e.inputType === 'insertCompositionText') Tel.typed((e.data || '').length || 1, true); else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') Tel.typed(1, true); });
ed.ta.addEventListener('paste', e => { if (!Tel.on) return; let n = 0; try { n = ((e.clipboardData && e.clipboardData.getData('text')) || '').length; } catch (x) { } Tel.paste(n || 1); });
window.addEventListener('blur', () => Tel.blur());

/* ---------- active challenge ---------- */
let A = S.active && S.active.attemptId ? S.active : null, tickT = null, submitting = false;
const fmtT = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function renderChBar() {
  const bar = $('#chBar'); if (!A) { bar.hidden = true; bar.innerHTML = ''; clearInterval(tickT); return; }
  bar.hidden = false;
  bar.innerHTML = '<span class="cb-t">' + esc(A.emoji || '🏁') + ' ' + esc(A.title) + '</span><span class="cb-time" id="cbTime">' + fmtT(Date.now() - A.t0) + '</span>' +
    '<button class="btn alt sm" data-act="task">📖 <span>' + esc('Task') + '</span></button><button class="btn good sm" data-act="submit" id="cbSubmit">✅ <span>' + esc('Submit') + '</span></button><button class="cb-x" data-act="quit" aria-label="Quit challenge">✕</button>';
  clearInterval(tickT); tickT = setInterval(() => { const el = $('#cbTime'); if (el && A) el.textContent = fmtT(Date.now() - A.t0); }, 1000);
}
$('#chBar').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; sfx.tap();
  if (b.dataset.act === 'task') openTask(); else if (b.dataset.act === 'submit') submitChallenge(); else if (b.dataset.act === 'quit') askQuit();
});
function openTask() {
  if (!A) return;
  const chk = A.checks && A.checks.length ? '<ul class="chk">' + A.checks.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '';
  m2Open('<div class="mh"><h3 id="taskTitle"></h3><button class="round sm" data-act="m2close" aria-label="Close">✕</button></div>' +
    '<div class="row2" style="margin-bottom:4px"><span class="tag ' + esc(A.lang) + '">' + (A.lang === 'cpp' ? 'C++' : 'HTML') + '</span><span class="tag">⭐ ' + A.points + ' pts</span><span class="tag">⏱ ' + Math.round(A.par / 60) + ' min</span></div>' +
    '<div class="task" id="taskBox">' + A.html + chk + '</div>' +
    '<p class="muted" style="margin:8px 0 2px">💡 ' + esc('Bonus for: ' + A.technique + '. Fewer errors, fixes, solutions and tips = more points.') + '</p>' +
    '<div class="row2" style="margin-top:6px"><button class="btn good" data-act="m2close">' + esc('Start coding ▶') + '</button></div>', {});
  $('#taskTitle').textContent = A.titleText; const box = $('#taskBox'); box.addEventListener('copy', () => Tel.copy());
}
function askQuit() {
  m2Open('<div class="mh"><h3>' + esc('Quit this challenge?') + '</h3></div><p>' + esc('Your code goes back to what you had before. This attempt will not count.') + '</p><div class="row2"><button class="btn alt" data-act="m2close">' + esc('Keep going') + '</button><button class="btn" data-act="yes">' + esc('Quit') + '</button></div>', { yes: () => { m2Close(); endChallenge(true); } });
}
function endChallenge(restore) {
  if (!A) return; const lang = A.lang;
  Tel.stop(); S.active = A = null; renderChBar();
  if (restore) { if (S.lang !== lang) setLang(lang); ed.setValue(S.stash[lang] || '', 0); S.stashOn[lang] = false; }
  save(); renderExplain();
}
async function beginChallenge(cid, opt) {
  opt = opt || {};
  const r = await Api.start(cid), ch = r.challenge;
  if (!S.stashOn[ch.lang]) { S.stash[ch.lang] = S.lang === ch.lang ? ed.value : (S.code[ch.lang] || ''); S.stashOn[ch.lang] = true; }
  const keep = typeof opt.keepCode === 'string' ? opt.keepCode : null;
  if (S.lang !== ch.lang) { S.active = A = null; setLang(ch.lang); }
  S.mission = null; closeSheet();
  S.active = A = { attemptId: r.attemptId, cid, lang: ch.lang, t0: Date.now(), title: ch.title, titleText: ch.titleText, emoji: (Core.byId(cid) || {}).emoji, html: ch.html, checks: ch.checks, technique: ch.technique, points: ch.points, par: ch.par, skeleton: ch.skeleton, gid: opt.gid || null, counters: { errors: 0, fixes: 0, help: 0, tips: 0 } };
  Tel.start(); ed.setValue(keep !== null ? keep : ch.skeleton, 0); save(); renderChBar(); renderExplain(); closeHub(); openTask(); sfx.ok();
  return A;
}
const SUBMIT_ERR = { judge_busy: 'The judge is busy, try again in a moment.', login_required: 'Please sign in again.', expired: 'This attempt expired, start the challenge again.', already_submitted: 'This attempt was already sent.', no_such_attempt: 'This attempt is gone, start the challenge again.' };
async function submitChallenge() {
  if (!A || submitting) return;
  if (!ed.value.trim()) { toast('Write some code first!'); return; }
  submitting = true; const b = $('#cbSubmit'); if (b) b.disabled = true; toast('Checking your code…');
  const snap = Tel.snapshot(), cur = A; cur.code = ed.value;
  try {
    const res = await Api.submit(cur.attemptId, { code: ed.value, counters: snap.counters, telemetry: snap.telemetry });
    Tel.stop(); S.active = A = null; save(); renderChBar(); showResult(res, cur);
  } catch (e) {
    toast(SUBMIT_ERR[e.code] || ('Could not submit (' + (e.code || 'network') + ')'));
    if (['expired', 'already_submitted', 'no_such_attempt'].includes(e.code)) { Tel.stop(); S.active = A = null; save(); renderChBar(); }
  } finally { submitting = false; const b2 = $('#cbSubmit'); if (b2) b2.disabled = false; }
}
function showResult(res, cur) {
  const sc = res.score, solved = sc.solved, integ = Object.assign({}, res.integrity), good = solved && res.counted;
  if (!solved && integ.verdict === 'clean') { integ.label = 'No problems'; integ.text = 'Nothing suspicious here. Fix the failing tests and try again!'; }
  const parts = sc.parts.map(p => '<div><span>' + esc(p.label) + (p.count ? ' <small>×' + p.count + '</small>' : '') + (p.detail ? ' <small>' + esc(p.detail) + '</small>' : '') + '</span><b class="' + (p.points < 0 ? 'neg' : 'pos') + '">' + (p.points > 0 ? '+' : '') + p.points + '</b></div>').join('');
  const fails = res.tests.filter(t => !t.pass), tr = (fails.length ? fails : res.tests.slice(0, 2)).slice(0, 3).map(t => '<div class="testrow"><span>' + (t.pass ? '✅' : '❌') + '</span><span>' + esc(t.name) + (t.input !== undefined && !t.pass ? '<br><small>' + esc('input ' + JSON.stringify(t.input) + ' → expected ' + JSON.stringify(t.expected) + ', got ' + JSON.stringify(t.got)) + '</small>' : '') + '</span></div>').join('');
  const reasons = integ.reasons && integ.reasons.length ? '<ul>' + integ.reasons.map(r => '<li>' + esc(r.text) + '</li>').join('') + '</ul>' : '';
  const nextLvl = Core.byId(cur.cid);
  m2Open('<div class="mh"><h3>' + (good ? '🎉 ' + esc('Solved!') : solved ? '⏳ ' + esc('Solved, on hold') : '🔧 ' + esc('Not quite yet')) + '</h3><button class="round sm" data-act="m2close" aria-label="Close">✕</button></div>' +
    '<div class="row2"><div class="big">' + (res.counted ? '+' : '') + sc.total + '</div><small class="muted">' + esc(res.counted ? 'points counted' : 'points (not counted yet)') + '</small></div>' +
    '<div class="bar"><u style="width:' + Math.min(100, Math.round(100 * sc.total / (cur.points * 1.3))) + '%"></u></div><div class="parts">' + parts + '</div>' +
    '<div class="verdict ' + esc(integ.verdict) + '"><span class="vi">' + esc(integ.icon) + '</span><div><b>' + esc(integ.label) + '</b><div style="font-weight:600">' + esc(integ.text) + '</div>' + reasons + '</div></div>' +
    (tr ? '<div class="sec">' + esc('Tests') + ' · ' + res.tests.filter(t => t.pass).length + '/' + res.tests.length + '</div>' + tr : '') +
    '<div class="row2" style="margin-top:10px"><button class="btn alt" data-act="retry">↻ ' + esc('Try again') + '</button><button class="btn good" data-act="arena">🏆 ' + esc('Arena') + '</button>' + ((S.stashOn[cur.lang] && (S.stash[cur.lang] || '').trim()) ? '<button class="btn alt" data-act="mine">↩ ' + esc('My code') + '</button>' : '') + '</div>',
    { retry: async () => { m2Close(); try { await beginChallenge(cur.cid, { keepCode: cur.code, gid: cur.gid }); } catch (e) { toast('Could not restart (' + (e.code || 'network') + ')'); } }, arena: () => { m2Close(); openHub(cur.gid ? 'groups' : 'play', cur.gid ? { gid: cur.gid } : null); }, mine: () => { m2Close(); ed.setValue(S.stash[cur.lang] || '', 0); S.stashOn[cur.lang] = false; save(); toast('Your own code is back'); } });
  if (good) { confetti(50); sfx.level(); addXp(Math.max(10, Math.round(sc.total / 8))); } else if (res.counted === false && !solved) sfx.err(); else sfx.fix();
}
