/* ===== CodePop app: init (runs last so every module is ready) ===== */
(function init() {
  document.documentElement.setAttribute('data-skin', S.skin);
  const th = theme(); $('#logoMark').textContent = th.emoji;
  if (S.mission && !LESSONS.find(l => l.id === S.mission && l.lang === S.lang)) S.mission = null;
  if (A && A.lang !== S.lang) S.lang = A.lang;
  applyI18n(); applySize(); updateXp(); app.dataset.lang = S.lang;
  $$('#langSeg button').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.l === S.lang)); b.addEventListener('click', () => { setLang(b.dataset.l); sfx.tap(); }); });
  buildKeys(); ed.setPlaceholder(t('ph.' + S.lang)); setScreen('off'); updateRunBtns(); updateDock();
  ed.setValue(S.code[S.lang] || ''); ed.ta.setSelectionRange(0, 0); ed.lastCaret = 1;
  if (A) { Tel.start(A.counters); renderChBar(); }
  analyze(); renderExplain(); onVV(); updateWho();
  Api.me().then(u => { me = u; updateWho(); }).catch(() => { });
  try { const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(document.body).backgroundColor; } catch (e) { }
  window.__codepop = { S, ed, analyze, runCpp, renderHtml, openTab, setLang, setSkin, setSpoken, startMission, Api, Tel, Core, openHub, closeHub, beginChallenge, submitChallenge, applyLayout, gh: { repoName: ghRepoName, branchName: ghBranchName, filePath: ghFilePath, slug: ghSlug, b64: ghB64, get hasToken() { return Gh.has; } }, get A() { return A; }, get me() { return me; }, get problems() { return allProblems(); }, get infos() { return infos; } };
})();
