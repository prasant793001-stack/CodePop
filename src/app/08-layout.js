/* ===== CodePop app: layout (stacked or side by side), swap sides, live pane views, terminal pane ===== */
const paneTermOn = () => !$('#paneTerm').hidden;
function wantRow() {
  const vv = window.visualViewport, w = window.innerWidth, h = vv ? vv.height : window.innerHeight;
  return app.classList.contains('kb') || w >= 900 || (w > h * 1.15 && h < 620);
}
let paneWas = false;
function applyLayout() {
  const row = wantRow(), was = app.dataset.layout;
  app.dataset.layout = row ? 'row' : 'col'; app.dataset.side = S.side; app.dataset.live = S.live;
  app.dataset.narrow = row && app.clientWidth < 700 ? '1' : '0';
  const show = row && S.live !== 'screen'; $('#paneTerm').hidden = !show;
  if (row && sheetTab === 'term' && sheetOpen()) closeSheet();
  $$('#liveSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.live)));
  applySplit();
  if (show && (!paneWas || was !== app.dataset.layout)) renderPaneTerm();
  paneWas = show;
}
function renderPaneTerm() {
  $('#ptTools').innerHTML = ['all', 'out', 'steps'].map(f => '<button class="tchip" data-f="' + f + '" aria-pressed="' + (termFilter === f) + '">' + esc(t('term.' + f)) + '</button>').join('') + '<button class="tchip" data-f="clear" aria-label="Clear">🗑</button>';
  const vis = termEntries.filter(termVisible), body = $('#ptBody'); body.innerHTML = '<div class="term" id="ptBox"></div>'; const box = $('#ptBox');
  if (!vis.length) box.innerHTML = '<div class="empty" style="color:#8aa0c4"><big>🖥️</big>' + esc(t('term.empty')) + '</div>';
  else { const f = document.createDocumentFragment(); vis.forEach(en => f.appendChild(termNode(en))); box.appendChild(f); }
  body.scrollTop = body.scrollHeight;
}
$('#ptTools').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'clear') { termEntries = []; if (sheetTab === 'term' && sheetOpen()) renderTerm(); } else termFilter = b.dataset.f;
  renderPaneTerm(); sfx.tap();
});
$('#ptBody').addEventListener('click', e => { const tl = e.target.closest('.tl[data-line]'); if (tl) ed.gotoLine(+tl.dataset.line); });
$('#liveSeg').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; S.live = b.dataset.v; save(); applyLayout(); ed.sync(); sfx.tap(); });
$('#btnSwap').addEventListener('click', () => { S.side = S.side === 'l' ? 'r' : 'l'; save(); applyLayout(); ed.sync(); sfx.tap(); });
