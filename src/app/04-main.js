/* ===== CodePop app: language switch, keys, splitter, viewport, buttons, init ===== */
function applySize() {
  const r = document.documentElement.style; r.setProperty('--fs', S.size + 'px'); r.setProperty('--lh', Math.round(S.size * 1.62) + 'px'); ed.render();
}
function buildKeys() {
  const k = $('#keys'); k.innerHTML = '';
  window.CPKeys[S.lang].forEach((x, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = x[0]; b.dataset.i = i;
    if (/^[a-z]/i.test(x[0]) || (x[1].startsWith('<') && x[1].length > 3)) b.className = 'w'; k.appendChild(b);
  });
}
$('#keys').addEventListener('mousedown', e => e.preventDefault());
$('#keys').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const x = window.CPKeys[S.lang][+b.dataset.i]; ed.insert(x[1], x[2]); Tel.typed(x[1].length); sfx.tap();
});

function setLang(l) {
  if (l === S.lang) return;
  if (A && l !== A.lang) { toast('Finish or quit your challenge first'); return; }
  stopRun(true); clearTimeout(rnT); clearTimeout(anT); S.code[S.lang] = ed.value;
  S.lang = l; S.mission = null; runtimeProblem = null; forceCon = false; prevVars = {}; frame._src = null; probOpen = null; linesOpen = 0; askRes = null; askNone = false;
  app.dataset.lang = l; $$('#langSeg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.l === l)));
  ed.setLang(l); ed.setPlaceholder(t('ph.' + l)); buildKeys(); applyI18n();
  setScreen('off'); conClear(); renderBoxes(null); termClear(); updateRunBtns();
  ed.setValue(S.code[l] || ''); save(); analyze();
  if (sheetOpen()) renderSheet();
}

/* ---------- buttons ---------- */
$('#btnRun').addEventListener('click', () => {
  if (S.lang === 'cpp') { runCpp({}); return; }
  clearTimeout(rnT); frame._src = null; analyze(); clearTimeout(rnT);
  if (renderHtml()) {
    const bad = problems.some(p => p.sev === 'error'); if (bad) Tel.err(); sfx.run(); flash(say(bad ? 'oops' : 'ok'), bad);
    if (!S.seenTerm) { S.seenTerm = true; save(); if (!sheetOpen()) openTab('term'); }
  } else { flash(t('screen.hint.html'), true); sfx.err(); }
});
$('#btnStep').addEventListener('click', () => runCpp({ step: true }));
$('#btnStop').addEventListener('click', () => { stopRun(false); sfx.tap(); });
$('#btnUndo').addEventListener('click', () => ed.undo());
$('#btnRedo').addEventListener('click', () => ed.redo());
$('#btnStarter').addEventListener('click', () => { loadStarter(); sfx.ok(); });
$('#btnBlank').addEventListener('click', () => { blankEditor(); sfx.tap(); });
$('#btnSet').addEventListener('click', openSettings);
$('#xpPill').addEventListener('click', () => { toast(t('level') + ' ' + lvOf(S.xp) + ' · ' + S.xp + ' ' + t('xp')); openTab('missions', true); });
$('#logo').addEventListener('click', () => { confetti(12); hopMascot(); sfx.ok(); });
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); $('#btnRun').click(); } else if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (sheetOpen()) closeSheet(); } });

/* ---------- splitter (horizontal bar when stacked, vertical bar when side by side) ---------- */
const isRow = () => app.dataset.layout === 'row';
function applySplit() {
  const main = $('#main');
  if (isRow()) {
    const tot = main.clientWidth - 22; if (tot <= 0) return;
    const px = Math.round(Math.max(150, Math.min(tot - 130, S.vsplit * tot)));
    $('#work').style.setProperty('--codew', px + 'px'); $('#screenWrap').style.height = ''; return;
  }
  const mh = main.clientHeight; if (!mh) return;
  $('#work').style.removeProperty('--codew');
  $('#screenWrap').style.height = Math.round(Math.max(96, Math.min(mh * 0.7, S.split * mh))) + 'px';
}
(function () {
  const sp = $('#splitter'); let drag = false;
  sp.addEventListener('pointerdown', e => { drag = true; try { sp.setPointerCapture(e.pointerId); } catch (x) { } sp.classList.add('drag'); e.preventDefault(); });
  sp.addEventListener('pointermove', e => {
    if (!drag) return; const r = $('#main').getBoundingClientRect();
    if (isRow()) {
      const tot = r.width - 22, x = e.clientX - r.left - 11, f = S.side === 'l' ? x / tot : 1 - x / tot;
      S.vsplit = Math.max(0.2, Math.min(0.8, f));
    } else { const sh = Math.max(90, Math.min(r.height * 0.7, e.clientY - r.top - 9)); S.split = sh / r.height; }
    applySplit(); ed.sync();
  });
  const end = () => { if (drag) { drag = false; sp.classList.remove('drag'); save(); ed.sync(); } };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('keydown', e => {
    const k = e.key;
    if (isRow() && (k === 'ArrowLeft' || k === 'ArrowRight')) { const d = (k === 'ArrowLeft' ? -0.04 : 0.04) * (S.side === 'l' ? 1 : -1); S.vsplit = Math.max(0.2, Math.min(0.8, S.vsplit + d)); applySplit(); ed.sync(); save(); e.preventDefault(); }
    else if (!isRow() && (k === 'ArrowUp' || k === 'ArrowDown')) { S.split = Math.max(0.15, Math.min(0.7, S.split + (k === 'ArrowUp' ? -0.04 : 0.04))); applySplit(); save(); e.preventDefault(); }
  });
  sp.addEventListener('dblclick', () => { S.vsplit = 0.5; S.split = 0.36; applySplit(); ed.sync(); save(); });
})();

/* ---------- viewport / on-screen keyboard ---------- */
function onVV() {
  const vv = window.visualViewport, h = Math.round(vv ? vv.height : window.innerHeight);
  document.documentElement.style.setProperty('--vvh', h + 'px');
  const ae = document.activeElement, typing = ae && (ae === ed.ta || ae.id === 'conInput' || ae.id === 'askIn');
  const kb = !!typing && (window.innerHeight - h > 140 || window.innerHeight < 560);
  app.classList.toggle('kb', kb);
  app.style.transform = vv && vv.offsetTop ? 'translateY(' + Math.round(vv.offsetTop) + 'px)' : '';
  applyLayout(); ed.sync();
}
window.addEventListener('resize', onVV);
if (window.visualViewport) { window.visualViewport.addEventListener('resize', onVV); window.visualViewport.addEventListener('scroll', onVV); }
document.addEventListener('focusin', () => setTimeout(onVV, 60));
document.addEventListener('focusout', () => setTimeout(onVV, 120));

