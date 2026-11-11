'use strict';
/* Front-end tests in jsdom: layout modes, Arena (demo backend), challenge flow, telemetry, hidden codes, reviewer console, and server-mode plumbing against the real server. */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '../build/node_modules/jsdom'));
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : (typeof x === 'string' ? x : JSON.stringify(x))); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
function boot(opts = {}) {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push('jsdomError: ' + (e.detail && e.detail.stack || e.message))); vc.on('error', e => errs.push('console.error: ' + e));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: opts.url || 'https://codepop.test/', virtualConsole: vc, beforeParse(w) { if (opts.cfg) w.CODEPOP_CONFIG = opts.cfg; if (opts.fetch) w.fetch = opts.fetch; } });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.id === 'main' ? w.innerWidth - 16 : this.id === 'app' ? Math.min(w.innerWidth, 1700) : 0; } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.id === 'main' ? w.innerHeight - 90 : 0; } });
  const click = s => { const el = typeof s === 'string' ? $(s) : s; if (!el) throw new Error('no element ' + s); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const type = txt => { const ta = $('#ta'); ta.value = txt; ta.setSelectionRange(txt.length, txt.length); ta.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const keys = n => { const ta = $('#ta'); for (let i = 0; i < n; i++) ta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', bubbles: true })); };
  const size = (iw, ih) => { Object.defineProperty(w, 'innerWidth', { value: iw, configurable: true }); Object.defineProperty(w, 'innerHeight', { value: ih, configurable: true }); w.dispatchEvent(new w.Event('resize')); };
  return { dom, w, d, $, $$, click, type, keys, size, P: w.__codepop };
}
const wrap = body => '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n' + body + '\n    return 0;\n}\n';
const SOL_DOUBLE = wrap('    int n;\n    cin >> n;\n    cout << n * 2 << endl;');
const SOL_HELLO = wrap('    string name;\n    cin >> name;\n    cout << "Hello, " << name << "!" << endl;');

(async () => {
  /* ================= demo mode ================= */
  const U = boot(); const { w, d, $, $$, click, type, keys, size, P } = U;
  ok('boot without errors', !!P && !errs.length, errs.join('\n'));
  ok('demo mode', P.Api.mode === 'demo');
  ok('language tabs live in the editor header', $$('.ed-top #langSeg .file').length === 2 && $('.ed-top #langSeg [data-l=html]').getAttribute('aria-selected') === 'true');
  ok('old header language switch is gone', !$('#top #langSeg'));
  ok('arena button in header', !!$('#top #btnArena') && $('#btnArena').textContent.includes('Arena'));
  click('#langSeg [data-l=cpp]'); ok('file tab switches language', P.S.lang === 'cpp' && $('#app').dataset.lang === 'cpp'); click('#langSeg [data-l=html]');

  /* ---- layout modes ---- */
  size(1280, 800); ok('desktop = side by side', $('#app').dataset.layout === 'row' && $('#app').dataset.side === 'l');
  ok('desktop shows live pane head + terminal pane', w.getComputedStyle($('#liveHead')).display === 'flex' && !$('#paneTerm').hidden);
  click('#btnSwap'); ok('swap sides', $('#app').dataset.side === 'r' && P.S.side === 'r'); click('#btnSwap'); ok('swap back', $('#app').dataset.side === 'l');
  click('#liveSeg [data-v=screen]'); ok('live: screen only hides the terminal pane', $('#paneTerm').hidden && $('#app').dataset.live === 'screen');
  click('#liveSeg [data-v=term]'); ok('live: terminal only', !$('#paneTerm').hidden && $('#app').dataset.live === 'term');
  click('#liveSeg [data-v=both]'); ok('live: both', !$('#paneTerm').hidden && $('#app').dataset.live === 'both');
  const before = P.S.vsplit; $('#splitter').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); ok('splitter arrows resize (code pane grows)', P.S.vsplit > before, [before, P.S.vsplit]);
  click('#btnSwap'); const b2 = P.S.vsplit; $('#splitter').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); ok('with swapped sides the same arrow moves the other way', P.S.vsplit < b2); click('#btnSwap');
  ok('code pane width is set in px', /px$/.test($('#work').style.getPropertyValue('--codew')), $('#work').style.getPropertyValue('--codew'));
  size(390, 800); ok('phone portrait = stacked', $('#app').dataset.layout === 'col' && $('#paneTerm').hidden && $('#screenWrap').style.height.endsWith('px'));
  const ta = $('#ta'); ta.focus(); size(390, 480); d.dispatchEvent(new w.Event('focusin', { bubbles: true })); await wait(120);
  ok('keyboard open => side by side (terminal pane + code pane)', $('#app').classList.contains('kb') && $('#app').dataset.layout === 'row' && $('#app').dataset.narrow === '1', [$('#app').className, $('#app').dataset.layout]);
  ok('keyboard mode hides header, dock and sheet to save room', w.getComputedStyle($('#top')).display === 'none' && w.getComputedStyle($('#dock')).display === 'none');
  ok('keyboard mode still shows Run + both panes', w.getComputedStyle($('#btnRun')).display !== 'none' && !$('#paneTerm').hidden);
  ta.blur(); size(390, 800); d.dispatchEvent(new w.Event('focusout', { bubbles: true })); await wait(200);
  ok('keyboard closed => back to stacked', $('#app').dataset.layout === 'col' && !$('#app').classList.contains('kb'), $('#app').className);
  size(844, 390); ok('phone landscape = side by side', $('#app').dataset.layout === 'row'); size(1280, 800);
  type('<html><body><h1>Hi</h1></body></html>'); await wait(700);
  ok('terminal pane shows live steps while typing', $$('#ptBox .tl.step').length >= 2, $('#ptBody').innerHTML.slice(0, 200));
  type(''); await wait(300);

  /* ---- arena: sign in ---- */
  click('#btnArena'); ok('hub opens', !$('#hub').hidden && $('#hubTitle').textContent.includes('Arena'));
  ok('not signed in: sign-in card + tabs', !!$('#devName') && $$('#hubTabs button').length === 4 && !$('[data-act=guest]').disabled);
  click('#hubTabs [data-tab=top]'); await wait(50); ok('top 10 visible without sign-in (10 practice players)', $$('#hubBody .rank').length === 10, $$('#hubBody .rank').length);
  ok('top 10 is ordered best first', $$('#hubBody .rank .pt')[0].textContent === '1840' && $$('#hubBody .rank .rn')[0].textContent === '🥇');
  click('#hubTabs [data-tab=play]'); await wait(30);
  $('#devName').value = 'Tester'; click('[data-act=guest]'); await wait(80);
  ok('signed in', !!P.me && P.me.nickname === 'Tester' && $('#hubWho').textContent.includes('Tester'));
  ok('play tab lists 16 challenges in 4 levels', $$('.chal').length === 16 && $$('.lvl').length === 4, $$('.chal').length);
  ok('level 2+ locked, level 1 open', $$('.chal.locked').length === 12 && $$('.chal:not(.locked)').length === 4);
  click('#hubBody [data-act=lang][data-v=html]'); await wait(40); ok('language filter', $$('.chal').length === 8 && $$('.chal .tag.cpp').length === 0);
  click('#hubBody [data-act=lang][data-v=cpp]'); await wait(40);

  /* ---- start a challenge ---- */
  click('.chal[data-id=c-evenodd]'); ok('locked challenge detail explains how to unlock', $('#modal2Card').textContent.includes('Solve one Level 1') && !$('[data-act=go]'));
  click('#modal2Card [data-act=m2close]');
  click('.chal[data-id=c-double]'); ok('challenge detail', $('#modal2Card').textContent.includes('Double') && !!$('[data-act=go]') && !!$('[data-act=friends]'), $('#modal2Card').textContent.slice(0, 120));
  click('#modal2Card [data-act=go]'); await wait(150);
  ok('challenge started: hub closed, bar shown, skeleton loaded, cpp tab active', $('#hub').hidden && !$('#chBar').hidden && P.S.lang === 'cpp' && $('#ta').value.includes('int main') && !!P.A, [$('#hub').hidden, P.S.lang]);
  ok('task window is open with the statement', !$('#modal2').hidden && $('#taskBox').textContent.length > 40);
  const toks = P.Core.scanCode($('#taskTitle').textContent + P.A.html); ok('3 distinct hidden codes inside the task', toks.length === 3 && new Set(toks).size === 3, toks);
  ok('hidden instructions exist but are visually hidden (cp-h)', $$('#taskBox .cp-h').length === 2 && /Integrity requirement/.test($('#taskBox .cp-h').textContent));
  ok('title has invisible code but reads normally', /[​-‍]/.test($('#taskTitle').textContent) && $('#taskTitle').textContent.replace(/[​-‍]/g, '') === 'Double Trouble' || $('#taskTitle').textContent.replace(/[​-‍]/g, '').length > 3, $('#taskTitle').textContent);
  $('#taskBox').dispatchEvent(new w.Event('copy', { bubbles: true })); ok('copying the task is recorded', P.Tel.snapshot().telemetry.copyEvents === 1);
  click('#modal2Card [data-act=m2close]');
  ok('switching language during a challenge is blocked', (click('#langSeg [data-l=html]'), P.S.lang === 'cpp'));
  ok('hub shows resume card', (click('#btnArena'), true) && (await wait(60), !!$('[data-act=resume]'))); click('#hubClose');

  /* ---- counters: errors, fixes, help, tips ---- */
  type('int main() { cout << 5 }'); await wait(300); click('#btnRun'); await wait(200);
  ok('failing run counts as an error', P.Tel.counts().errors === 1, P.Tel.counts());
  click('#btnRun'); await wait(150); ok('each failing run counts', P.Tel.counts().errors === 2);
  P.openTab('problems', true); const ph = $('.phead'); if (ph) click(ph); ok('opening a problem card counts as help (once)', P.Tel.counts().help === 1, P.Tel.counts()); if (ph) { click(ph); click(ph); } ok('re-opening the same card does not count again', P.Tel.counts().help === 1);
  if ($('[data-act=pfix]')) click('[data-act=pfix]'); await wait(200); ok('auto-fix counts', P.Tel.counts().fixes === 1, P.Tel.counts());
  P.openTab('lines', true); ok('lines tab counts as a tip', P.Tel.counts().tips === 1, P.Tel.counts()); P.openTab('lines', true); ok('same tip is not double counted', P.Tel.counts().tips === 1);
  click('#explain [data-act=more]'); ok('💡 counts as a tip', P.Tel.counts().tips === 2, P.Tel.counts());
  ok('counters are stored with the active attempt', P.S.active.counters.errors === 2 && P.S.active.counters.help === 1);
  if (!$('#sheet').hidden) click('#sheetClose');

  /* ---- type a solution (real keystrokes), wait the minimum time, submit ---- */
  P.ed.setValue(SOL_DOUBLE, 0); $('#ta').dispatchEvent(new w.Event('input', { bubbles: true })); keys(SOL_DOUBLE.length); await wait(8800);
  ok('timer is running', /^\d+:\d\d$/.test($('#cbTime').textContent), $('#cbTime').textContent);
  click('#cbSubmit'); await wait(900);
  ok('result window shows a verified, solved result', !$('#modal2').hidden && $('#modal2Card').textContent.includes('Solved!') && $('.verdict.clean') && /Verified/.test($('#modal2Card').textContent), $('#modal2Card').textContent.slice(0, 300));
  ok('score breakdown shows penalties', $$('#modal2Card .parts div').length >= 4 && $$('#modal2Card .parts b.neg').length >= 1, $$('#modal2Card .parts div').map(x => x.textContent));
  ok('XP rewarded', P.S.xp > 0);
  ok('attempt closed', P.A === null && $('#chBar').hidden);
  click('#modal2Card [data-act=arena]'); await wait(80); ok('arena reopens', !$('#hub').hidden && $('#modal2').hidden);
  ok('level 2 cpp unlocked after solving level 1', $$('.chal.locked').length === 10, $$('.chal.locked').length);
  click('#hubTabs [data-tab=top]'); await wait(80); ok('you appear on the board with your score', $$('#hubBody .rank.me').length === 1 || /#\d+/.test($('#hubBody').textContent), $('#hubBody').textContent.slice(0, 200));

  /* ---- flagged paths ---- */
  click('#hubTabs [data-tab=play]'); await wait(60); click('.chal[data-id=c-hello]'); click('#modal2Card [data-act=go]'); await wait(150);
  const toks2 = P.Core.scanCode($('#taskTitle').textContent + P.A.html);
  $('#taskBox').dispatchEvent(new w.Event('copy', { bubbles: true })); click('#modal2Card [data-act=m2close]');
  const pe = new w.Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(pe, 'clipboardData', { value: { getData: () => SOL_HELLO } }); $('#ta').dispatchEvent(pe);
  P.ed.setValue(SOL_HELLO, 0); $('#ta').dispatchEvent(new w.Event('input', { bubbles: true })); await wait(8800); click('#cbSubmit'); await wait(900);
  ok('copy the task + paste the answer => under review, points on hold', $('.verdict.review') && /on hold|Under review/i.test($('#modal2Card').textContent) && /not counted yet/.test($('#modal2Card').textContent), $('#modal2Card').textContent.slice(0, 260));
  ok('reasons are explained without exposing codes', /copied/.test($('.verdict').textContent) && !/cp[a-z2-7]{6}/.test($('#modal2Card').textContent));
  click('#modal2Card [data-act=retry]'); await wait(200); ok('retry starts a new attempt and keeps the code', !!P.A && $('#ta').value.includes('Hello'), P.A && P.A.attemptId);
  const toks3 = P.Core.scanCode($('#taskTitle') ? $('#taskTitle').textContent + P.A.html : P.A.html);
  click('#modal2Card [data-act=m2close]'); keys(60);
  P.ed.setValue(SOL_HELLO.replace('int main() {', '// ' + P.Core.zwEncode(toks3[1]) + '\nint main() {'), 0); $('#ta').dispatchEvent(new w.Event('input', { bubbles: true })); await wait(8800); click('#cbSubmit'); await wait(900);
  ok('an AI echoing the hidden code => AI-copy suspected', $('.verdict.ai') && /AI-copy/.test($('#modal2Card').textContent), $('#modal2Card').textContent.slice(0, 200));
  click('#modal2Card [data-act=m2close]');

  /* ---- groups ---- */
  click('#btnArena'); click('#hubTabs [data-tab=groups]'); await wait(60);
  $('#gCode').value = 'nope12'; click('[data-act=joingroup]'); await wait(60); ok('bad join code is explained', /No group with that code/.test($('#toast').textContent), $('#toast').textContent);
  $('#gCode').value = 'demo42'; click('[data-act=joingroup]'); await wait(80);
  ok('joined the demo group; group page shows ranking and share', $('#hubBody').textContent.includes('Pixel Squad') && $$('#hubBody .rank').length >= 6 && !!$('[data-act=share]'), $('#hubBody').textContent.slice(0, 160));
  click('[data-act=share]'); await wait(80); ok('share falls back to a copyable invite with the join link', /#join-DEMO42/.test($('#modal2Card').textContent) && /Join my CodePop group/.test($('#modal2Card').textContent), $('#modal2Card').textContent);
  click('#modal2Card [data-act=m2close]');
  click('[data-act=newch]'); await wait(40); ok('new group challenge form lists only unlocked challenges', $$('#ncC option').length === 6 && $$('#ncM option').length >= 5, $$('#ncC option').length);
  $('#ncC').value = 'c-double'; click('#modal2Card [data-act=mk]'); await wait(100);
  ok('group challenge created, standings include bots and you', $$('#hubBody .stand').length === 1 && $$('#hubBody .stand .rank').length >= 6, $$('#hubBody .stand .rank').length);
  click('[data-act=newch]'); await wait(40); $('#ncC').value = 'c-hello'; $('#ncM').value = 'b2'; click('#modal2Card [data-act=mk]'); await wait(100);
  ok('duel has exactly two players', $$('#hubBody .stand').some(s => s.querySelectorAll('.rank').length === 2) && $$('#hubBody .stand').length === 2);
  click('[data-act=backg]'); await wait(40); $('#gName').value = 'Class 5B'; click('[data-act=mkgroup]'); await wait(100); ok('create group', $('#hubBody').textContent.includes('Class 5B') && /[A-Z2-9]{6}/.test($('.sharebox .code').textContent));
  click('[data-act=leave]'); await wait(80); ok('leave group', !$('#hubBody').textContent.includes('Class 5B'));

  /* ---- me: profile, projects, privacy log, reviewer ---- */
  click('#hubTabs [data-tab=me]'); await wait(80);
  ok('me tab', $('#nick').value === 'Tester' && $$('.avs button').length === 24 && /Nobody has looked/.test($('#hubBody').textContent));
  $('#nick').value = 'Tester Two'; click('[data-act=savenick]'); await wait(60); ok('nickname saved', P.me.nickname === 'Tester Two');
  $('#nick').value = '<b>x</b>'; click('[data-act=savenick]'); await wait(60); ok('invalid nickname rejected', P.me.nickname === 'Tester Two' && /Nickname/.test($('#toast').textContent), $('#toast').textContent);
  const oldAv = P.me.avatar; click($$('.avs button').find(b => b.getAttribute('aria-pressed') === 'false')); await wait(60); ok('avatar changed', P.me.avatar !== oldAv, [oldAv, P.me.avatar]);
  type(''); P.ed.setValue('<h1>My page</h1>', 0); click('[data-act=saveproj]'); await wait(80); ok('project saved', /My .* project/.test($('#hubBody').textContent) && $$('[data-act=openproj]').length === 1);
  click('[data-act=openproj]'); await wait(80); ok('project opens into the editor', $('#hub').hidden && $('#ta').value.includes('My page'));
  click('#btnArena'); click('#hubTabs [data-tab=me]'); await wait(80);
  ok('no reviewer tab for normal players', $$('#hubTabs button').length === 4);
  click('[data-act=rev]'); await wait(100); ok('demo: reviewer preview switches on the hidden console tab', $$('#hubTabs button').length === 5 && $('#hubTabs [data-tab=review]') && $('#hubBody').textContent.includes('Review queue'));
  ok('queue has sample cases and my flagged attempts', $$('#hubBody .card .tag.warn').length >= 1 && /Max R\./.test($('#hubBody').textContent) && /Tester Two/.test($('#hubBody').textContent), $('#hubBody').textContent.slice(0, 300));
  click('[data-act=viewatt][data-id]'); await wait(60); ok('reviewer can open code', !!$('#modal2Card .code-view')); click('#modal2Card [data-act=m2close]');
  $('#uq').value = 'tester'; click('[data-act=usearch]'); await wait(60); click('[data-act=uprojs]'); await wait(60); click('[data-act=vp]'); await wait(60);
  ok('reviewer can open a saved project', /My page/.test($('#modal2Card .code-view').textContent), $('#modal2Card').textContent); click('#modal2Card [data-act=m2close]');
  const clr = $$('[data-act=clear]'); click(clr[clr.length - 1]); await wait(80); ok('reviewer decision', /Cleared/.test($('#toast').textContent));
  click('#hubTabs [data-tab=me]'); await wait(80);
  ok('the player now sees who looked at their work', /Reviewer \(demo\)/.test($('#hubBody').textContent) && /view project/.test($('#hubBody').textContent) && /list projects/.test($('#hubBody').textContent), $('#hubBody').textContent.slice(0, 600));
  click('[data-act=rev]'); await wait(80); ok('preview off hides the console again', $$('#hubTabs button').length === 4);
  click('[data-act=logout]'); await wait(60); ok('sign out', !P.me && !!$('#devName'));
  click('#hubClose');

  ok('no runtime errors in demo mode', !errs.length, errs.join('\n'));
  U.dom.window.close();

  /* ---- invite link opens the groups tab ---- */
  const V = boot({ url: 'https://codepop.test/#join-DEMO42' }); await wait(700);
  ok('invite link opens the Arena on the Groups tab', !V.$('#hub').hidden && V.$('#hubTabs [data-tab=groups]').getAttribute('aria-pressed') === 'true');
  V.$('#devName').value = 'Kid'; V.click('[data-act=guest]'); await wait(100);
  ok('after sign-in the invite is offered', /You were invited/.test(V.$('#hubBody').textContent) && /DEMO42/.test(V.$('#hubBody').textContent), V.$('#hubBody').textContent.slice(0, 200));
  V.click('[data-act=joinp]'); await wait(100); ok('joined from the invite', V.$('#hubBody').textContent.includes('Pixel Squad')); V.dom.window.close();

  /* ================= server mode against the real server ================= */
  const { createApp } = require('../server/index.js');
  const ctx = createApp({ dbFile: ':memory:', verifyGoogle: async () => ({ sub: 'x' }), markerSecret: 'test-secret', allowDevLogin: true, adminEmails: ['rev@example.com'], webDir: path.join(__dirname, 'nope') });
  const srv = await new Promise(r => { const s = ctx.app.listen(0, '127.0.0.1', () => r(s)); }); const base = 'http://127.0.0.1:' + srv.address().port;
  const jar = {}; const f = async (url, o = {}) => {
    const h = Object.assign({}, o.headers); const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '); if (ck) h.cookie = ck;
    const r = await fetch(base + url, Object.assign({}, o, { headers: h }));
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'), i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } return { ok: r.ok, status: r.status, json: () => r.json() };
  };
  const S1 = boot({ cfg: { mode: 'server', googleClientId: '', devLogin: true }, fetch: f }); await wait(200);
  ok('server mode detected', S1.P.Api.mode === 'server');
  S1.click('#btnArena'); await wait(150);
  ok('server mode: no demo guest button, dev login form (google not configured message)', !S1.$('[data-act=guest]') && !!S1.$('[data-act=devlogin]') && /not configured/.test(S1.$('#hubBody').textContent), S1.$('#hubBody').textContent.slice(0, 200));
  S1.$('#devName').value = 'Server Kid'; S1.click('[data-act=devlogin]'); await wait(300);
  ok('server mode: signed in through the real API (cookie session)', !!S1.P.me && S1.P.me.nickname.startsWith('Server') && !!jar.cp_sid, S1.P.me);
  ok('server mode: challenges from the server', S1.$$('.chal').length === 16);
  S1.click('.chal[data-id=c-double]'); S1.click('#modal2Card [data-act=go]'); await wait(400);
  ok('server mode: challenge started with server-issued hidden codes', !!S1.P.A && P_ok(S1.P.Core.scanCode(S1.$('#taskTitle').textContent + S1.P.A.html)), S1.P.A && S1.P.A.attemptId);
  function P_ok(t) { return t.length === 3 && ctx.db.prepare('SELECT COUNT(*) n FROM markers').get().n === 3; }
  S1.click('#modal2Card [data-act=m2close]');
  ctx.db.prepare('UPDATE attempts SET started = started - 300000').run();
  S1.P.ed.setValue(SOL_DOUBLE, 0); S1.$('#ta').dispatchEvent(new S1.w.Event('input', { bubbles: true })); S1.keys(SOL_DOUBLE.length);
  S1.click('#cbSubmit'); await wait(1500);
  ok('server mode: judged on the server, verified and counted', S1.$('#modal2Card').textContent.includes('Solved!') && ctx.db.prepare('SELECT counted, solved FROM attempts WHERE submitted IS NOT NULL').get().counted === 1, S1.$('#modal2Card').textContent.slice(0, 200));
  S1.click('#modal2Card [data-act=arena]'); await wait(300); S1.click('#hubTabs [data-tab=top]'); await wait(300);
  ok('server mode: leaderboard from the server includes the player', /Server/.test(S1.$('#hubBody').textContent), S1.$('#hubBody').textContent.slice(0, 200));
  S1.click('#hubTabs [data-tab=groups]'); await wait(200); S1.$('#gName').value = 'Server Crew'; S1.click('[data-act=mkgroup]'); await wait(300);
  ok('server mode: group created and invite link is a real /join URL', S1.$('#hubBody').textContent.includes('Server Crew') && S1.P.Api.shareUrl('ABC234') === 'https://codepop.test/join/ABC234');
  S1.click('#hubTabs [data-tab=me]'); await wait(300); ok('server mode: me tab, no demo reviewer switch', !!S1.$('#nick') && !S1.$('[data-act=rev]') && S1.$$('#hubTabs button').length === 4);
  S1.P.ed.setValue('<h1>x</h1>', 0); S1.click('[data-act=saveproj]'); await wait(300);
  ok('server mode: project saved on the server', ctx.db.prepare('SELECT COUNT(*) n FROM projects').get().n === 1);
  ok('no runtime errors in server mode', !errs.length, errs.join('\n'));
  S1.dom.window.close(); await new Promise(r => srv.close(r)); ctx.close();
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
