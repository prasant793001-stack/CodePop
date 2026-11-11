/* ===== CodePop app: editor instance, analysis, screen, terminal, run ===== */
const ed = new window.CPEditor({ ta: $('#ta'), hl: $('#hl'), gut: $('#gut'), lang: S.lang });
const frame = $('#frame'), crt = $('#crt'), conOut = $('#conOut'), boxesEl = $('#boxes');
const SPEED = { slow: 800, med: 420, fast: 150 };
let infos = [], problems = [], compiled = null, runtimeProblem = null, runSrc = '';
let screenOn = false, forceCon = false, running = false, stepping = false, runId = 0, handle = null, pendingInput = null, prevVars = {};
let readyT = 0, sheetTab = null, sayMsg = null, sayT = null, anT = null, rnT = null;
const TAG_RE = /<[a-zA-Z!][^>]*>/;
const sheetOpen = () => !$('#sheet').hidden;
const allProblems = () => runtimeProblem && ed.value === runSrc ? problems.concat([runtimeProblem]) : problems;

/* ---------- LED / screen ---------- */
function setLed(m) { $('#led').className = 'led' + (m && m !== 'off' ? ' ' + m : ''); }
function setScreen(mode) {
  const was = screenOn; screenOn = mode !== 'off';
  $('#screenOff').hidden = mode !== 'off'; frame.hidden = mode !== 'web'; $('#console').hidden = mode !== 'con';
  crt.classList.toggle('web', mode === 'web');
  if (screenOn && !was) { crt.classList.remove('boot'); void crt.offsetWidth; crt.classList.add('boot'); sfx.on(); }
  if (!screenOn) setLed('off');
}
function flash(text, bad) {
  sayMsg = { text, bad }; clearTimeout(sayT); sayT = setTimeout(() => { sayMsg = null; renderExplain(); }, 4200); renderExplain(); hopMascot();
}
function setBadge() {
  const b = $('#badge'), ps = allProblems(), src = ed.value.trim();
  if (ps.length) { b.hidden = false; b.className = 'badge'; b.textContent = ps.length; }
  else if (src) { b.hidden = false; b.className = 'badge ok'; b.textContent = '✓'; }
  else b.hidden = true;
}
function lineInfo(n) {
  const lines = ed.value.split('\n'); let off = 0; n = Math.max(1, Math.min(n || 1, lines.length));
  for (let i = 0; i < n - 1; i++) off += lines[i].length + 1; return { off, len: lines[n - 1].length };
}

/* ---------- terminal ---------- */
let termEntries = [], termFilter = 'all';
const OUTK = ['out', 'err', 'warn', 'src', 'caret', 'note'];
function termVisible(en) { return termFilter === 'all' || (termFilter === 'out' ? OUTK.includes(en.k) : !OUTK.includes(en.k)); }
function termNode(en) {
  const d = document.createElement('div'); d.className = 'tl ' + en.k;
  if (en.line) d.dataset.line = en.line;
  d.innerHTML = (en.line && !en.noLn ? '<span class="ln-n">L' + en.line + '</span>' : '') + en.html; return d;
}
function termPush(en) {
  termEntries.push(en); if (termEntries.length > 700) termEntries.shift();
  if (paneTermOn() && termVisible(en)) { const pb = $('#ptBox'); if (pb) { const empty = pb.querySelector('.empty'); if (empty) empty.remove(); pb.appendChild(termNode(en)); const sb = $('#ptBody'); sb.scrollTop = sb.scrollHeight; } }
  if (sheetTab === 'term' && sheetOpen() && termVisible(en)) {
    const box = $('#termBox'); if (box) { const empty = box.querySelector('.empty'); if (empty) empty.remove(); box.appendChild(termNode(en)); const sb = $('#sheetBody'); sb.scrollTop = sb.scrollHeight; }
  }
}
function termClear() { termEntries = []; if (paneTermOn()) renderPaneTerm(); if (sheetTab === 'term' && sheetOpen()) renderTerm(); }
function termStep(html, line, noLn) { termPush({ k: 'step', html, line, noLn }); }
function termFmt(lines) { for (const l of lines) termPush({ k: ['err', 'warn', 'src', 'caret', 'note'].includes(l.cls) ? l.cls : 'note', html: esc(l.text) || '&nbsp;' }); }

/* ---------- HTML screen ---------- */
function htmlStep(ev) {
  const code = ['tag', 'prop', 'v', 'src'];
  switch (ev.kind) {
    case 'open': return termStep(tf('ht.open', { line: ev.line, tag: ev.tag, noun: ev.noun, text: ev.text || '' }, code), ev.line, true);
    case 'close': return termStep(tf('ht.close', { line: ev.line, tag: ev.tag }, code), ev.line, true);
    case 'css': return termStep(tf('ht.css', { line: ev.line, prop: ev.prop, v: ev.v }, code), ev.line, true);
    case 'pic': return termStep(tf('ht.pic', { src: ev.src, list: Object.keys(C.STICKERS).join(', ') }, code), ev.line, true);
  }
}
function renderHtml() {
  const src = ed.value;
  if (!TAG_RE.test(src)) { setScreen('off'); frame._src = null; termClear(); return false; }
  setScreen('web');
  if (frame._src !== src) {
    frame._src = src; frame.srcdoc = H.previewDoc(src); clearTimeout(readyT);
    readyT = setTimeout(() => termPush({ k: 'err', html: esc('The preview frame was blocked by this page\'s security settings.') }), 3000);
  }
  termClear(); termStep(esc(t('ht.on')), 0);
  for (const ev of H.buildLog(src, S.spoken)) htmlStep(ev);
  for (const p of problems) if (p.sev === 'error' || p.sev === 'warning') termFmt([H.formatProblem(p)]);
  setLed(problems.some(p => p.sev === 'error') ? 'bad' : 'on');
  checkMission({ src });
  return true;
}
window.addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return; const d = e.data; if (!d || !d.codepop) return;
  if (d.type === 'ready') clearTimeout(readyT);
  else if (d.type === 'log') termPush({ k: d.data.k === 'error' ? 'err' : 'note', html: tf('ht.log', { text: d.data.text }, []) });
  else if (d.type === 'link') termStep(tf('ht.link', { url: String(d.data).slice(0, 80) }, ['url']), 0);
});

/* ---------- C++ console ---------- */
function conClear() { conOut.textContent = ''; }
function conWrite(s, cls) {
  if (cls) { const sp = document.createElement('span'); sp.className = cls; sp.textContent = s; conOut.appendChild(sp); } else conOut.appendChild(document.createTextNode(s));
  conOut.scrollTop = conOut.scrollHeight;
}
function renderBoxes(vars) {
  if (!vars || !vars.length) { boxesEl.hidden = true; return; }
  boxesEl.hidden = false; const cur = {};
  boxesEl.innerHTML = vars.map(v => { cur[v.name] = v.text; return '<div class="vbox' + (prevVars[v.name] !== undefined && prevVars[v.name] !== v.text ? ' pop' : '') + '"><i>' + esc(v.ty) + ' ' + esc(v.name) + '</i><b>' + esc(v.text) + '</b></div>'; }).join('');
  prevVars = cur;
}
function updateRunBtns() {
  $('#btnRun').hidden = running; $('#btnStep').hidden = running || S.lang !== 'cpp'; $('#btnStop').hidden = !running;
}
function hideInput() { $('#conForm').hidden = true; }
function askInput() {
  return new Promise(res => {
    pendingInput = res; const f = $('#conForm'), i = $('#conInput'); f.hidden = false; i.value = ''; i.placeholder = t('screen.input');
    setLed('run'); setTimeout(() => i.focus({ preventScroll: true }), 40);
  });
}
$('#conForm').addEventListener('submit', e => {
  e.preventDefault(); const i = $('#conInput'), v = i.value, p = pendingInput; if (!p) return;
  pendingInput = null; conWrite(v + '\n', 'inp'); hideInput(); setLed('run'); p(v);
});
function stopRun(silent) {
  if (!running && !pendingInput) return;
  runId++; if (handle) handle.abort(); handle = null;
  if (pendingInput) { const p = pendingInput; pendingInput = null; p(null); }
  hideInput(); running = false; stepping = false; ed.setExecLine(0); updateRunBtns();
  if (!silent) { setLed('on'); conWrite('\n■\n', 'sys'); }
}
const RT_MSG = {
  div0: () => 'Floating point exception (core dumped)',
  oob: d => "terminate called after throwing an instance of 'std::out_of_range'\n  what():  index " + d.idx + ' is out of range (size ' + d.len + ')\nAborted (core dumped)',
  stack: () => 'Segmentation fault (core dumped)\n(too many functions calling each other)',
  stoi: () => "terminate called after throwing an instance of 'std::invalid_argument'\n  what():  stoi\nAborted (core dumped)",
  toolong: () => 'Timed out: the program ran too long (does a loop never end?)',
  outputcap: () => 'Stopped: way too much output',
  badsize: () => "terminate called after throwing an instance of 'std::length_error'\nAborted (core dumped)"
};
const rtMsg = er => RT_MSG[er.code] ? RT_MSG[er.code](er.data || {}) : (er.msg || er.code);
function onEv(e) {
  const line = e.line;
  switch (e.k) {
    case 'declare': return termStep(e.val !== '' && e.val !== undefined ? tf('st.declare', { type: e.ty, name: e.name, val: e.val }, ['type', 'name', 'val']) : tf('st.declare0', { type: e.ty, name: e.name }, ['type', 'name']), line);
    case 'assign': return termStep(tf('st.assign', { name: e.name, old: e.old, val: e.val }, ['name', 'old', 'val']), line);
    case 'print': return termStep(tf('st.print', { text: String(e.text).replace(/\n/g, '⏎') }, ['text']), line);
    case 'if': return termStep(tf(e.res ? 'st.if.t' : 'st.if.f', { cond: e.cond }, ['cond']), line);
    case 'loopcheck': return termStep(tf(e.res ? 'st.loop.t' : 'st.loop.f', { cond: e.cond, round: e.round }, ['cond']), line);
    case 'call': return termStep(tf('st.call', { name: e.name, args: (e.args || []).join(', ') }, ['name', 'args']), line);
    case 'return': return termStep(e.val ? tf('st.return', { val: e.val }, ['val']) : esc(t('st.return0')), line);
    case 'break': return termStep(esc(t('st.break')), line);
    case 'continue': return termStep(esc(t('st.continue')), line);
    case 'input': return termStep(tf('st.input', { name: e.name }, ['name']), line);
    case 'got': return termStep(tf('st.got', { val: e.val, name: e.name }, ['val', 'name']), line);
    case 'more': return termStep(esc(t('st.more')), 0);
  }
}
async function runCpp(o) {
  o = o || {}; stopRun(true);
  const src = ed.value; if (!src.trim()) return;
  const c = CP.compile(src); compiled = c; problems = c.problems; runtimeProblem = null; runSrc = src;
  ed.setMarks(problems); setBadge();
  const id = ++runId; forceCon = true;
  termClear(); conClear(); setScreen('con'); renderBoxes(null); prevVars = {};
  for (const p of problems.filter(p => p.sev !== 'hint')) termFmt(CP.format(src, p));
  if (!c.ok) {
    conWrite(t('screen.failed') + '\n', 'e'); setLed('bad');
    if (!o.auto) { Tel.err(); sfx.err(); flash(say('oops'), true); if (!sheetOpen()) openTab('problems'); else if (sheetTab === 'problems') renderProblems(); }
    return;
  }
  running = true; stepping = !!o.step; updateRunBtns(); setLed('run');
  if (!o.auto) { sfx.run(); if (!S.seenTerm) { S.seenTerm = true; save(); if (!sheetOpen()) openTab('term'); } }
  const delay = o.step ? SPEED[S.speed] : 0; let outBuf = '', outAll = '';
  const io = {
    out: s => { conWrite(s); outAll += s; outBuf += s; let i; while ((i = outBuf.indexOf('\n')) >= 0) { termPush({ k: 'out', html: esc(outBuf.slice(0, i)) || '&nbsp;' }); outBuf = outBuf.slice(i + 1); } },
    err: s => conWrite(s, 'e'),
    readLine: () => askInput(),
    ev: e => { if (id === runId) onEv(e); },
    line: n => { if (id === runId) ed.setExecLine(n); },
    vars: v => { if (id === runId) renderBoxes(v); }
  };
  handle = CP.execute(c.ast, io, { delay, events: true, maxMs: c.usesCin ? 36e5 : 3000 });
  const r = await handle.promise;
  if (id !== runId) return;
  if (outBuf) termPush({ k: 'out', html: esc(outBuf) });
  running = false; stepping = false; handle = null; ed.setExecLine(0); updateRunBtns(); hideInput();
  if (r.aborted) { setLed('on'); return; }
  if (r.error) {
    const er = r.error, li = lineInfo(er.line || 1);
    if (outAll && !outAll.endsWith('\n')) conWrite('\n');
    const rm = rtMsg(er); conWrite(rm + '\n', 'e'); termPush({ k: 'err', html: esc((er.line ? 'main.cpp:' + er.line + ': ' : '') + rm) });
    runtimeProblem = { sev: 'error', code: er.code, msg: rm.split('\n')[0], line: er.line || 0, data: er.data || {}, fixes: [], runtime: true, off: li.off, len: li.len, col: 1 };
    ed.setMarks(allProblems()); setBadge(); setLed('bad');
    if (!o.auto) { Tel.err(); sfx.err(); flash(say('oops'), true); if (!sheetOpen()) openTab('problems'); }
    else if (sheetTab === 'problems') renderProblems();
    return;
  }
  if (outAll && !outAll.endsWith('\n')) conWrite('\n');
  conWrite(t('screen.finished') + '\n', 'sys'); termPush({ k: 'info', html: tf('st.exit', { code: r.exit }, ['code']) });
  setLed('on'); if (!o.auto) { sfx.ok(); flash(say('ok')); }
  checkMission({ src, ran: true, out: outAll, exit: r.exit, ast: c.ast });
}

/* ---------- analysis pipeline ---------- */
function analyze() {
  const src = ed.value, has = src.trim().length > 0;
  infos = has ? E.analyze(S.lang, src) : [];
  if (S.lang === 'html') { problems = has ? H.lint(src) : []; compiled = null; }
  else { compiled = has ? CP.compile(src) : null; problems = compiled ? compiled.problems : []; }
  if (runtimeProblem && src !== runSrc) runtimeProblem = null;
  ed.setMarks(allProblems()); setBadge(); renderExplain();
  if (sheetOpen() && (sheetTab === 'lines' || sheetTab === 'problems')) renderSheet(true);
  clearTimeout(rnT);
  if (S.lang === 'html') {
    if (!has || !TAG_RE.test(src)) { if (screenOn) { setScreen('off'); frame._src = null; termClear(); } }
    else if (S.auto) rnT = setTimeout(renderHtml, 380);
  } else {
    if (!has) { forceCon = false; if (!running) { conClear(); renderBoxes(null); setScreen('off'); termClear(); } }
    else if ((compiled && compiled.ok) || forceCon) {
      if (!screenOn) { setScreen('con'); }
      if (!running && !conOut.childNodes.length) conWrite(t('screen.ready'), 'sys');
      if (S.auto && compiled.ok && !compiled.usesCin && !running) rnT = setTimeout(() => runCpp({ auto: true }), 750);
    } else if (!forceCon && screenOn && !running) setScreen('off');
  }
}
function scheduleAnalyze(d) { clearTimeout(anT); anT = setTimeout(analyze, d === undefined ? 130 : d); }
ed.on('change', v => {
  S.code[S.lang] = v; save();
  if (running && stepping) stopRun(true);
  scheduleAnalyze();
});
ed.on('caret', () => renderExplain());
