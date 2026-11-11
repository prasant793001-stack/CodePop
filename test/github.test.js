'use strict';
/* Push to GitHub: the dialog, validation, the GitHub API flow against a stub, and token hygiene. No real network. */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '../build/node_modules/jsdom'));
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : (typeof x === 'string' ? x : JSON.stringify(x))); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
const TOKEN = 'cp_test_token_0123456789_abcdefghijklmnop';

/* ---------- a tiny fake api.github.com ---------- */
function stub(repos) {
  const st = { calls: [], offline: false, token: TOKEN, repos, conflictOnce: false, boom: null, rate: false };
  st.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null, credentials: init.credentials, referrerPolicy: init.referrerPolicy }; st.calls.push(call);
    const resp = (status, json, hdr = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => json, headers: { get: k => (hdr[String(k).toLowerCase()] !== undefined ? hdr[String(k).toLowerCase()] : null) } });
    if (st.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url); if (u.origin !== 'https://api.github.com') return resp(404, { message: 'Not Found' });
    if (call.headers.Authorization !== 'Bearer ' + st.token) return resp(401, { message: 'Bad credentials' });
    if (st.rate) return resp(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });
    if (st.boom) return resp(500, { message: st.boom });
    const m = /^\/repos\/([^/]+\/[^/]+?)(?:\/contents\/(.+))?$/.exec(u.pathname); if (!m) return resp(404, { message: 'Not Found' });
    const r = st.repos[m[1]]; if (!r) return resp(404, { message: 'Not Found' });
    if (!m[2]) return resp(200, { default_branch: r.def || 'main', private: !!r.priv, archived: !!r.archived, permissions: r.push === false ? { push: false, pull: true } : { push: true, pull: true } });
    const fp = decodeURIComponent(m[2]); const ref = u.searchParams.get('ref') || r.def || 'main';
    if (call.method === 'GET') {
      if (r.empty) return resp(404, { message: 'This repository is empty.' });
      if (!(r.branches || ['main']).includes(ref)) return resp(404, { message: 'No commit found for the provided ref.' });
      const folder = Object.keys(r.files || {}).some(f => f.slice(f.indexOf(':') + 1).startsWith(fp + '/')); if (folder) return resp(200, [{ name: 'x', type: 'file' }]);
      const f = (r.files || {})[ref + ':' + fp]; return f ? resp(200, { sha: f.sha, type: 'file' }) : resp(404, { message: 'Not Found' });
    }
    if (call.method === 'PUT') {
      const b = call.body;
      if (st.conflictOnce) { st.conflictOnce = false; return resp(409, { message: 'is at abc but expected def' }); }
      if (r.empty) { if (b.branch) return resp(404, { message: 'Branch ' + b.branch + ' not found' }); r.empty = false; r.files = r.files || {}; r.files[(r.def || 'main') + ':' + fp] = { sha: 's1', content: b.content }; return resp(201, { commit: { html_url: 'https://github.com/' + m[1] + '/commit/c1' }, content: { html_url: 'https://github.com/' + m[1] + '/blob/main/' + fp } }); }
      const br = b.branch || r.def || 'main'; if (!(r.branches || ['main']).includes(br)) return resp(422, { message: 'Branch ' + br + ' not found' });
      const key = br + ':' + fp, ex = (r.files = r.files || {})[key];
      if (ex && !b.sha) return resp(422, { message: "Invalid request.\n\n\"sha\" wasn't supplied." });
      if (ex && b.sha !== ex.sha) return resp(409, { message: 'sha does not match' });
      r.files[key] = { sha: 's' + (Object.keys(r.files).length + 1) + Date.now() % 1000, content: b.content };
      return resp(ex ? 200 : 201, { commit: { html_url: 'https://github.com/' + m[1] + '/commit/c2' }, content: { html_url: 'https://github.com/' + m[1] + '/blob/' + br + '/' + fp } });
    }
    return resp(405, { message: 'no' });
  };
  return st;
}

function boot(opts = {}) {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push('jsdomError: ' + (e.detail && e.detail.stack || e.message))); vc.on('error', e => errs.push('console.error: ' + e));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://codepop.test/', virtualConsole: vc, beforeParse(w) { if (opts.fetch) w.fetch = opts.fetch; } });
  const w = dom.window, d = w.document, $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
  const click = s => { const el = typeof s === 'string' ? $(s) : s; if (!el) throw new Error('no element ' + s); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const set = (id, v) => { const el = $('#' + id); if (!el) throw new Error('no field ' + id); el.value = v; };
  const toastText = () => $('#toast').textContent;
  return { dom, w, d, $, $$, click, set, toastText, P: w.__codepop };
}
const modalText = U => U.$('#modal2Card').textContent;
const statText = U => (U.$('#ghStat') || { textContent: '' }).textContent;
const SRC = '<h1>Hello 🚀 café – ñ</h1>\n<p>Line two</p>\n';
const b64dec = s => Buffer.from(s, 'base64').toString('utf8');
const all = U => { const out = []; try { for (let i = 0; i < U.w.localStorage.length; i++) out.push(U.w.localStorage.getItem(U.w.localStorage.key(i))); } catch (e) { } return out.join('\n'); };

(async () => {
  const gh = stub({
    'kid/code': { priv: true, def: 'main', branches: ['main', 'dev'], files: { 'main:old/index.html': { sha: 'sOLD' } } },
    'kid/empty': { priv: false, def: 'main', empty: true },
    'kid/ro': { push: false }, 'kid/arch': { archived: true }
  });
  const U = boot({ fetch: gh.fetch }); const { $, $$, click, set, P, w } = U;
  ok('boots clean', !!P && !errs.length, errs.join('\n'));

  /* ---- button + guards ---- */
  ok('push button lives in the editor toolbar with a tooltip', !!$('.ed-btns #btnGit') && $('#btnGit').title === 'Push to GitHub', $('#btnGit') && $('#btnGit').title);
  P.setSpoken('es'); ok('tooltip is translated (es)', $('#btnGit').title === 'Subir a GitHub'); P.setSpoken('hi'); ok('tooltip is translated (hi)', /GitHub/.test($('#btnGit').title)); P.setSpoken('ar'); ok('tooltip is translated (ar)', /GitHub/.test($('#btnGit').title)); P.setSpoken('en');
  click('#btnGit'); ok('empty editor: nothing to push, no dialog', $('#modal2').hidden && /Write some code/.test(U.toastText()), U.toastText());

  /* ---- first push ---- */
  P.ed.setValue(SRC, 0); click('#btnGit');
  ok('dialog opens', !$('#modal2').hidden && /Push to GitHub/.test(modalText(U)));
  const tk = $('#ghTok'); ok('token box is a password field with autofill off', !!tk && tk.type === 'password' && tk.getAttribute('autocomplete') === 'off');
  const mk = $('#modal2Card a[href^="https://github.com/settings/personal-access-tokens/new"]');
  ok('"make a token" link is prefilled for least privilege (contents write, 30 days) and opens safely', !!mk && /contents=write/.test(mk.href) && /expires_in=30/.test(mk.href) && /noopener/.test(mk.rel) && mk.target === '_blank', mk && mk.href);
  ok('all links in the dialog are noopener', $$('#modal2Card a').every(a => /noopener/.test(a.rel) && /^https:\/\/github\.com\//.test(a.href)));
  ok('default file path from the language', $('#ghPath').value === 'my-web-project/index.html', $('#ghPath').value);
  ok('private-repo advice + age note are shown', /Private/.test(modalText(U)) && /13/.test(modalText(U)));
  ok('download and copy fallbacks exist', !!$('[data-act=ghdl]') && !!$('[data-act=ghcopy]'));
  ok('backdrop tap does not close the dialog (would lose a typed token)', (() => { $('#modal2').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return !$('#modal2').hidden; })());

  set('ghRepo', 'kid/code'); click('[data-act=ghpush]'); await wait(20); ok('no token: asks for it, no network', gh.calls.length === 0 && /Paste your GitHub token/.test(statText(U)), statText(U));
  set('ghTok', TOKEN); set('ghRepo', 'kid/code'); click('[data-act=ghpush]'); await wait(60);
  const seq = gh.calls.map(c => c.method + ' ' + new URL(c.url).pathname + new URL(c.url).search);
  ok('call sequence: repo, file lookup, commit', JSON.stringify(seq) === JSON.stringify(['GET /repos/kid/code', 'GET /repos/kid/code/contents/my-web-project/index.html?ref=main', 'PUT /repos/kid/code/contents/my-web-project/index.html']), seq);
  const put = gh.calls[2];
  ok('commit body: UTF-8 content intact (emoji, accents), default message, default branch, no sha', b64dec(put.body.content) === SRC && put.body.message === 'Push from CodePop' && put.body.branch === 'main' && put.body.sha === undefined, put.body);
  ok('every request goes to api.github.com only, never to the CodePop origin', gh.calls.every(c => c.url.startsWith('https://api.github.com/')));
  ok('every request carries the bearer token, no cookies, no referrer', gh.calls.every(c => c.headers.Authorization === 'Bearer ' + TOKEN && c.credentials === 'omit' && c.referrerPolicy === 'no-referrer'));
  ok('success message with links', /Pushed to GitHub/.test(statText(U)) && !!$('#ghStat a[href="https://github.com/kid/code/commit/c2"]') && $$('#ghStat a').every(a => /noopener/.test(a.rel)), statText(U));
  ok('token box was swapped for "Token ready" (secret no longer on the page)', !$('#ghTok') && /Token ready/.test(modalText(U)) && !U.d.documentElement.outerHTML.includes(TOKEN));
  ok('token is not in localStorage, state, or demo data', !all(U).includes(TOKEN) && !JSON.stringify(P.S).includes(TOKEN) && !JSON.stringify(P.S).includes('github_pat'));
  ok('sessionStorage untouched when "keep" was off', w.sessionStorage.getItem('codepop.gh.tok') === null);
  ok('repo is remembered (not the token)', P.S.git.repo === 'kid/code' && Object.keys(P.S.git).sort().join() === 'branch,repo', P.S.git);
  ok('hasToken in memory', P.gh.hasToken === true);

  /* ---- second push updates the file: sha is sent ---- */
  U.click('[data-act=m2close]'); gh.calls.length = 0; P.ed.setValue(SRC + '<!-- v2 -->\n', 0); click('#btnGit');
  ok('reopened: repo prefilled, token still ready, no password box', $('#ghRepo').value === 'kid/code' && !$('#ghTok') && /Token ready/.test(modalText(U)));
  click('[data-act=ghpush]'); await wait(60);
  ok('pushing the same file again updates it (sha looked up automatically)', /Updated on GitHub/.test(statText(U)) && gh.calls[2].body.sha !== undefined, statText(U));
  gh.calls.length = 0; set('ghPath', 'old/index.html'); click('[data-act=ghpush]'); await wait(60);
  ok('existing file: sha is sent and the message says Updated', gh.calls[2] && gh.calls[2].body.sha === 'sOLD' && /Updated on GitHub/.test(statText(U)), [gh.calls[2] && gh.calls[2].body, statText(U)]);
  gh.calls.length = 0; set('ghPath', 'my-web-project/index.html'); click('[data-act=ghpush]'); await wait(60);
  ok('pushing the same file again picks up the new sha (no 422)', /Updated on GitHub/.test(statText(U)) && gh.calls[2].body.sha !== undefined, statText(U));

  /* ---- forget ---- */
  click('[data-act=ghforget]'); ok('forget: token gone, password box back, fields kept', P.gh.hasToken === false && !!$('#ghTok') && $('#ghRepo').value === 'kid/code');

  /* ---- keep-for-this-tab ---- */
  set('ghTok', TOKEN); $('#ghKeep').checked = true; gh.calls.length = 0; click('[data-act=ghpush]'); await wait(60);
  ok('keep ticked: token goes to sessionStorage only', w.sessionStorage.getItem('codepop.gh.tok') === TOKEN && !all(U).includes(TOKEN));
  click('[data-act=ghforget]'); ok('forget wipes sessionStorage too', w.sessionStorage.getItem('codepop.gh.tok') === null);

  /* ---- explicit branch ---- */
  set('ghTok', TOKEN); set('ghBranch', 'dev'); set('ghPath', 'x/dev.html'); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(60);
  ok('explicit branch is used for lookup and commit', /ref=dev/.test(gh.calls[1].url) && gh.calls[2].body.branch === 'dev' && /Pushed/.test(statText(U)), [gh.calls.map(c => c.url), statText(U)]);
  set('ghBranch', 'nope'); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(60);
  ok('missing branch: friendly message', /branch does not exist/.test(statText(U)), statText(U));
  set('ghBranch', ''); 

  /* ---- empty repo (the very first commit) ---- */
  set('ghRepo', 'kid/empty'); set('ghPath', 'first/index.html'); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(60);
  const ep = gh.calls[gh.calls.length - 1];
  ok('empty repo: commit is sent without a branch and says so', ep.method === 'PUT' && ep.body.branch === undefined && /first commit in an empty repo/.test(statText(U)), [ep.body && Object.keys(ep.body), statText(U)]);

  /* ---- error paths ---- */
  const tryIt = async (repo, p) => { set('ghRepo', repo); if (p) set('ghPath', p); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(60); return statText(U); };
  ok('repo not found / not shared with the token', /cannot see that repo/.test(await tryIt('kid/ghost', 'a/b.html')));
  ok('token can read but not write', /look but not write/.test(await tryIt('kid/ro')) && gh.calls.length === 1, gh.calls.length);
  ok('archived repo', /archived/.test(await tryIt('kid/arch')));
  gh.repos['kid/code'].files['main:dir/inner.html'] = { sha: 'x' }; ok('a folder path is refused with advice', /path is a folder/.test(await tryIt('kid/code', 'dir')), statText(U));
  gh.conflictOnce = true; ok('conflict (409) is explained', /changed on GitHub/.test(await tryIt('kid/code', 'c/conflict.html')), statText(U));
  gh.rate = true; ok('rate limit is explained', /slow down/.test(await tryIt('kid/code', 'c/rate.html'))); gh.rate = false;
  gh.boom = '<img src=x onerror=alert(1)>'; const bt = await tryIt('kid/code', 'c/boom.html');
  ok('unknown GitHub errors are shown as text, never as HTML', /GitHub said: <img src=x onerror=alert\(1\)>/.test(bt) && !$('#modal2Card img') && !$('#ghStat img'), bt); gh.boom = null;
  gh.offline = true; const off = await tryIt('kid/code', 'c/off.html');
  ok('offline / blocked: explains and keeps the download fallback', /Could not reach GitHub/.test(off) && !!$('[data-act=ghdl]') && P.gh.hasToken === true, off); gh.offline = false;
  gh.token = 'cp_test_token_ROTATED_ROTATED_ROTATED'; const bad = await tryIt('kid/code', 'c/bad.html');
  ok('rejected token: clear message, token is dropped, password box returns, fields stay', /did not accept that token/.test(bad) && P.gh.hasToken === false && !!$('#ghTok') && $('#ghRepo').value === 'kid/code', bad);
  ok('after errors nothing leaked into storage', !all(U).includes(TOKEN) && !JSON.stringify(P.S).includes('github_pat'));
  gh.token = TOKEN;

  /* ---- validation: nothing is sent for bad input ---- */
  set('ghTok', TOKEN);
  const bads = [['repo', 'nope', 'ghRepo', 'a.html'], ['repo', 'a/b/c', 'ghRepo', 'a.html'], ['repo', '../x', 'ghRepo', 'a.html'], ['repo', 'kid/..', 'ghRepo', 'a.html'], ['repo', '-bad/repo', 'ghRepo', 'a.html']];
  for (const [, v, id, pth] of bads) { set('ghRepo', v); set('ghPath', pth); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(20); ok('bad repo "' + v + '" is refused locally', gh.calls.length === 0 && /Repo should look like/.test(statText(U)), statText(U)); }
  set('ghRepo', 'kid/code');
  for (const p of ['../evil.html', '/abs.html', 'a//b.html', '.git/config', 'a\\b.html', 'dir/', '', 'a/./b.html', 'a/.../b', 'x'.repeat(201), 'tab\there.html', '  ']) {
    set('ghPath', p); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(20); ok('bad path ' + JSON.stringify(p.slice(0, 20)) + ' is refused locally', gh.calls.length === 0 && /File should look like/.test(statText(U)), statText(U));
  }
  set('ghPath', 'a.html');
  for (const b of ['bad branch', '..x', '/lead', 'a//b', 'x.lock', '-dash']) { set('ghBranch', b); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(20); ok('bad branch "' + b + '" is refused locally', gh.calls.length === 0 && /branch name/.test(statText(U)), statText(U)); }
  set('ghBranch', '');
  ok('pasted GitHub URL is normalised', P.gh.repoName('https://github.com/Kid/Code.git') === 'Kid/Code' && P.gh.repoName('github.com/kid/code') === null && P.gh.repoName('https://github.com/kid/code/') === 'kid/code');
  set('ghRepo', 'https://github.com/kid/code.git'); set('ghPath', 'urlpaste/index.html'); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(60);
  ok('a pasted repo URL works end to end', gh.calls[0] && gh.calls[0].url === 'https://api.github.com/repos/kid/code' && /Pushed/.test(statText(U)), statText(U));
  ok('slug and path helpers', P.gh.slug('Space Invaders!!') === 'space-invaders' && P.gh.slug('Ça va? ñ') === 'ca-va-n' && P.gh.slug('日本語') === '' && P.gh.filePath('my-proj/index.html') === 'my-proj/index.html' && P.gh.filePath('ünï/código.html') === 'ünï/código.html');
  ok('b64 helper round-trips UTF-8', b64dec(P.gh.b64('héllo 🚀 日本')) === 'héllo 🚀 日本');
  click('[data-act=ghforget]');
  for (const junk of ['short', 'has space inside a long enough token value', 'Bearer ' + TOKEN, 'token_with_accent_é_________________']) { set('ghTok', junk); set('ghRepo', 'kid/code'); set('ghPath', 'a.html'); gh.calls.length = 0; click('[data-act=ghpush]'); await wait(20); ok('junk token ' + JSON.stringify(junk.slice(0, 12)) + ' is refused before sending', gh.calls.length === 0 && /Paste your GitHub token/.test(statText(U)) && P.gh.hasToken === false, statText(U)); }
  set('ghTok', TOKEN); click('[data-act=ghpush]'); await wait(60);

  /* ---- download fallback ---- */
  let made = null; w.URL.createObjectURL = b => { made = b; return 'blob:fake'; }; w.URL.revokeObjectURL = () => { };
  const clicked = []; const oc = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { clicked.push([this.download, this.href]); };
  set('ghPath', 'folder/page.html'); click('[data-act=ghdl]'); await wait(10);
  ok('download gives the file under its own name', made && made.size > 0 && clicked.length === 1 && clicked[0][0] === 'page.html', clicked);
  w.HTMLAnchorElement.prototype.click = oc;

  /* ---- guards: not during a challenge ---- */
  U.click('[data-act=m2close]');
  click('#btnArena'); await wait(30); $('#devName').value = 'Kid'; click('[data-act=guest]'); await wait(80); U.click('#hubClose');
  await P.beginChallenge('c-hello'); await wait(60); ok('challenge is active', !!P.A);
  U.click('[data-act=m2close]'); click('#btnGit'); ok('no pushing while a challenge is running', $('#modal2').hidden && /Finish or quit/.test(U.toastText()), U.toastText());

  /* ---- from the Arena: Me tab ---- */
  U.click('#chBar [data-act=quit]'); await wait(20); U.click('#modal2Card [data-act=yes]'); await wait(40); ok('challenge ended', !P.A);
  P.setLang('cpp'); P.ed.setValue('#include <iostream>\nint main(){ std::cout << "Hi"; }\n', 0);
  click('#btnArena'); click('#hubTabs [data-tab=me]'); await wait(80);
  ok('Me tab offers push for current code', !!$('[data-act=pushcur]'));
  $('#pname').value = 'Space Invaders!'; click('[data-act=saveproj]'); await wait(80);
  ok('each saved project has a push button', $$('[data-act=pushproj]').length === 1);
  click('[data-act=pushproj]'); await wait(60);
  ok('project push opens the dialog with that project’s language and a slug path', !$('#modal2').hidden && $('#ghPath').value === 'space-invaders/main.cpp', $('#ghPath') && $('#ghPath').value);
  U.click('[data-act=m2close]'); click('[data-act=pushcur]'); ok('push current code from the Me tab', !$('#modal2').hidden && $('#ghPath').value === 'my-cpp-project/main.cpp', $('#ghPath') && $('#ghPath').value);
  ok('the dialog sits above the Arena (z-index)', Number(w.getComputedStyle($('#modal2')).zIndex) > Number(w.getComputedStyle($('#hub')).zIndex), [w.getComputedStyle($('#modal2')).zIndex, w.getComputedStyle($('#hub')).zIndex]);

  /* ---- server CSP is checked in server.test.js; here: the static build has no token anywhere ---- */
  ok('built page contains no real token', !html.includes('cp_test_token'));
  ok('no runtime errors', !errs.length, errs.join('\n'));
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
