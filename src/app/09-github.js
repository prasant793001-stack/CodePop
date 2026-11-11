/* ===== CodePop app: Push to GitHub =====
   The browser talks straight to api.github.com with the player's OWN fine-grained token.
   The token never touches the CodePop server, is never written to localStorage / state / exports,
   and lives in memory (or, only if the player ticks the box, in sessionStorage until the tab closes). */
Object.assign(C.UI.en, { 'git.push': 'Push to GitHub' });
Object.assign(C.UI.es, { 'git.push': 'Subir a GitHub' });
Object.assign(C.UI.hi, { 'git.push': 'GitHub पर पुश करें' });
Object.assign(C.UI.ar, { 'git.push': 'ارفع إلى GitHub' });

const GH_API = 'https://api.github.com';
const GH_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=CodePop&description=' + encodeURIComponent('Push my CodePop projects') + '&expires_in=30&contents=write';
const Gh = (() => {
  const SK = 'codepop.gh.tok'; let tok = '';
  try { tok = sessionStorage.getItem(SK) || ''; } catch (e) { }
  return {
    get has() { return !!tok; }, get value() { return tok; },
    set(v, keep) { tok = v || ''; try { if (keep && tok) sessionStorage.setItem(SK, tok); else sessionStorage.removeItem(SK); } catch (e) { } },
    clear() { this.set('', false); }
  };
})();

/* ---------- validation (nothing is sent unless every field passes) ---------- */
function ghRepoName(s) {
  s = String(s || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/.exec(s);
  return !m || /^\.+$/.test(m[2]) || m[2].toLowerCase() === '.git' ? null : m[1] + '/' + m[2];
}
function ghBranchName(s) {          /* '' = use the repo's default branch, null = invalid */
  s = String(s || '').trim(); if (!s) return '';
  return /^[A-Za-z0-9._\/-]{1,100}$/.test(s) && !/^[\/.-]|\/$|\.\.|\/\/|\.lock$/.test(s) ? s : null;
}
function ghFilePath(s) {            /* null = invalid */
  s = String(s || '').trim().replace(/^\.\//, '');
  if (!s || s.length > 200 || /^\/|\/$|\\|\/\/|[\u0000-\u001f\u007f]/.test(s)) return null;
  return s.split('/').every(g => g === g.trim() && !/^\.+$/.test(g) && g.toLowerCase() !== '.git' && /^[\p{L}\p{N}._+@() -]+$/u.test(g)) ? s : null;
}
const ghSlug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const ghB64 = s => btoa(encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))));   /* UTF-8 safe */
const ghUrl = u => typeof u === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9._\-\/%?=&#~+@()]+$/.test(u) ? u : '';

/* ---------- GitHub calls ---------- */
async function ghCall(method, path, body) {
  let r;
  try {
    r = await fetch(GH_API + path, {
      method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + Gh.value }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw ghErr('network'); }      /* offline, blocked by the page's policy, or CORS */
  let json = null; try { json = await r.json(); } catch (e) { }
  let rate0 = false; try { rate0 = r.headers.get('x-ratelimit-remaining') === '0'; } catch (e) { }
  return { status: r.status, ok: r.ok, json, rate0 };
}
const GH_MSG = {
  bad_token: 'GitHub did not accept that token. It may be wrong, expired, or from another account. Make a new one and paste it again.',
  no_repo: 'I cannot see that repo. Check the spelling, and that your token was given access to it (Repository access → Only select repositories).',
  no_write: 'Your token can look but not write. Edit it: Repository permissions → Contents → Read and write.',
  forbidden: 'GitHub said no. Does your token have Contents: Read and write on this repo?',
  rate: 'GitHub says slow down. Try again in a few minutes.',
  archived: 'That repo is archived, so it is read-only.',
  is_folder: 'That path is a folder. Add a file name, like my-project/index.html.',
  conflict: 'The file changed on GitHub while you were pushing. Press Push again.',
  no_branch: 'That branch does not exist in the repo. Leave Branch empty to use the default one.',
  network: 'Could not reach GitHub. Are you online? (The practice demo page cannot talk to GitHub, but your own CodePop site can.) You can still download the file below.',
  bad_text: 'This code has a character GitHub cannot store. Remove odd symbols and try again.'
};
const ghErr = (code, r) => { const e = new Error(code); e.code = code; e.gh = r && r.json && r.json.message ? String(r.json.message).slice(0, 160) : ''; return e; };
const ghFromStatus = r => r.status === 401 ? 'bad_token' : (r.status === 403 || r.status === 429) ? (r.rate0 ? 'rate' : 'forbidden') : r.status === 404 ? 'no_repo' : 'other';

async function ghPush(o) {          /* o = { repo, branch, path, message, code } -> { commitUrl, fileUrl, branch, emptyRepo } */
  const info = await ghCall('GET', '/repos/' + o.repo);
  if (!info.ok) throw ghErr(ghFromStatus(info), info);
  const rj = info.json || {};
  if (rj.archived) throw ghErr('archived');
  if (rj.permissions && rj.permissions.push === false) throw ghErr('no_write');
  const explicit = !!o.branch, branch = o.branch || rj.default_branch || '';
  const enc = o.path.split('/').map(encodeURIComponent).join('/');
  const cur = await ghCall('GET', '/repos/' + o.repo + '/contents/' + enc + (branch ? '?ref=' + encodeURIComponent(branch) : ''));
  let sha = '', empty = false;
  if (cur.status === 200) { if (Array.isArray(cur.json)) throw ghErr('is_folder'); sha = (cur.json && cur.json.sha) || ''; }
  else if (cur.status === 404) empty = /empty/i.test((cur.json && cur.json.message) || '');
  else throw ghErr(ghFromStatus(cur), cur);
  let content; try { content = ghB64(o.code); } catch (e) { throw ghErr('bad_text'); }
  const body = { message: o.message, content };
  if (sha) body.sha = sha;
  if (branch && !empty) body.branch = branch;
  let put = await ghCall('PUT', '/repos/' + o.repo + '/contents/' + enc, body);
  if (!put.ok && body.branch && !explicit && (put.status === 404 || put.status === 422)) { delete body.branch; put = await ghCall('PUT', '/repos/' + o.repo + '/contents/' + enc, body); }   /* default branch not born yet */
  if (!put.ok) {
    const m = String((put.json && put.json.message) || '');
    if (put.status === 409 || (put.status === 422 && /sha/i.test(m))) throw ghErr('conflict', put);
    if (put.status === 422 && explicit && /branch/i.test(m)) throw ghErr('no_branch', put);
    if (put.status === 404) throw ghErr('no_write', put);
    throw ghErr(put.status === 401 || put.status === 403 ? ghFromStatus(put) : 'other', put);
  }
  const j = put.json || {};
  return { commitUrl: ghUrl(j.commit && j.commit.html_url), fileUrl: ghUrl(j.content && j.content.html_url), branch: empty ? (rj.default_branch || 'the default branch') : branch, emptyRepo: empty, updated: !!sha };
}

/* ---------- dialog ---------- */
let ghCtx = null, ghBusy = false;
function openGitPush(src) {
  if (A) { toast('Finish or quit your challenge first'); return; }
  src = src || { name: 'my ' + (S.lang === 'cpp' ? 'cpp' : 'web') + ' project', lang: S.lang, code: ed.value };
  const code = String(src.code || '');
  if (!code.trim()) { toast('Write some code first!'); return; }
  const lang = src.lang === 'cpp' ? 'cpp' : 'html', file = lang === 'cpp' ? 'main.cpp' : 'index.html';
  const slug = ghSlug(src.name) || (lang === 'cpp' ? 'my-cpp-project' : 'my-web-project');
  ghCtx = { code, lang, file, repo: (S.git && S.git.repo) || '', branch: (S.git && S.git.branch) || '', path: slug + '/' + file, msg: 'Push from CodePop' };
  drawGit(null);
}
function ghReadFields() {
  const g = id => { const el = $('#' + id); return el ? el.value : null; };
  if (!ghCtx) return;
  const r = g('ghRepo'), b = g('ghBranch'), p = g('ghPath'), m = g('ghMsg');
  if (r !== null) ghCtx.repo = r; if (b !== null) ghCtx.branch = b; if (p !== null) ghCtx.path = p; if (m !== null) ghCtx.msg = m;
}
function ghStat(cls, html) { const st = $('#ghStat'); if (!st) return; st.hidden = false; st.className = 'verdict ' + cls; st.innerHTML = html; }
function drawGit(status) {
  const c = ghCtx; if (!c) return;
  const tokenBlock = Gh.has
    ? '<div class="verdict clean"><span class="vi">🔑</span><div style="flex:1"><b>' + esc('Token ready') + '</b><div style="font-weight:600">' + esc('Kept only here. It is sent to GitHub and nowhere else.') + '</div></div><button class="btn alt sm" data-act="ghforget">' + esc('Forget') + '</button></div>'
    : '<div class="gh-f"><label for="ghTok">' + esc('Your GitHub token') + '</label><input class="in" id="ghTok" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="github_pat_…"></div>' +
      '<p class="muted" style="margin:6px 0 0">1) <a class="gh-a" href="' + GH_TOKEN_URL + '" target="_blank" rel="noopener noreferrer">' + esc('Make a token on GitHub ↗') + '</a> · 2) ' + esc('Repository access → Only select repositories → pick your repo') + ' · 3) ' + esc('Contents must say Read and write') + ' · 4) ' + esc('paste it here.') + ' ' + esc('A token is like a password: never share it.') + '</p>' +
      '<label class="gh-k"><input type="checkbox" id="ghKeep"> ' + esc('Keep it until I close this tab') + '</label>';
  m2Open('<div class="mh"><h3>🐙 ' + esc('Push to GitHub') + '</h3><button class="round sm" data-act="m2close" aria-label="Close">✕</button></div>' +
    '<p class="muted" style="margin:0">' + esc('Send this ' + (c.lang === 'cpp' ? 'C++' : 'web') + ' code (' + c.code.length + ' characters) to a repo you own. Your code goes straight from this browser to GitHub.') + '</p>' +
    tokenBlock +
    '<div class="gh-2"><div class="gh-f"><label for="ghRepo">' + esc('Repo') + '</label><input class="in" id="ghRepo" maxlength="140" placeholder="your-name/your-repo" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(c.repo) + '"></div>' +
    '<div class="gh-f"><label for="ghBranch">' + esc('Branch (optional)') + '</label><input class="in" id="ghBranch" maxlength="100" placeholder="main" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(c.branch) + '"></div></div>' +
    '<div class="gh-f"><label for="ghPath">' + esc('File in the repo') + '</label><input class="in" id="ghPath" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(c.path) + '"></div>' +
    '<div class="gh-f"><label for="ghMsg">' + esc('Commit message') + '</label><input class="in" id="ghMsg" maxlength="100" value="' + esc(c.msg) + '"></div>' +
    '<div id="ghStat" class="verdict" role="status" hidden></div>' +
    '<div class="row2" style="margin-top:8px"><button class="btn good" id="ghGo" data-act="ghpush">🚀 ' + esc('Push') + '</button><button class="btn alt sm" data-act="ghdl">⬇ ' + esc('Download file') + '</button><button class="btn alt sm" data-act="ghcopy">📋 ' + esc('Copy code') + '</button></div>' +
    '<p class="muted" style="margin:8px 0 0">' + esc('Choose a Private repo if you do not want the world to read your code.') + ' <a class="gh-a" href="https://github.com/new" target="_blank" rel="noopener noreferrer">' + esc('New repo ↗') + '</a> · ' + esc('GitHub accounts are for ages 13 and up, so ask a parent or teacher to help.') + '</p>',
    { backdrop: false, ghpush: ghGo, ghforget: () => { ghReadFields(); Gh.clear(); drawGit(null); }, ghdl: ghDownload, ghcopy: ghCopy });
  if (status) ghStat(status.cls, status.html);
}
async function ghGo() {
  if (ghBusy || !ghCtx) return;
  ghReadFields(); const c = ghCtx, bad = h => ghStat('review', h);
  const repo = ghRepoName(c.repo), br = ghBranchName(c.branch), path = ghFilePath(c.path);
  if (!repo) return bad('<span class="vi">✏️</span><div>' + esc('Repo should look like your-name/your-repo.') + '</div>');
  if (br === null) return bad('<span class="vi">✏️</span><div>' + esc('That branch name has odd characters. Leave it empty to use the default.') + '</div>');
  if (!path) return bad('<span class="vi">✏️</span><div>' + esc('File should look like my-project/index.html (letters, numbers, dots, dashes; no ..).') + '</div>');
  let fresh = false;
  if (!Gh.has) {
    const v = String(($('#ghTok') || {}).value || '').trim();
    if (!/^[A-Za-z0-9_-]{20,255}$/.test(v)) return bad('<span class="vi">🔑</span><div>' + esc('Paste your GitHub token first (it starts with github_pat_).') + '</div>');
    const keep = !!($('#ghKeep') && $('#ghKeep').checked); Gh.set(v, keep); fresh = true;
  }
  const message = String(c.msg || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'Push from CodePop';
  ghBusy = true;
  if (fresh) drawGit(null);                       /* swaps the token box for “Token ready” so the secret leaves the page */
  const go = $('#ghGo'); if (go) go.disabled = true; ghStat('review', '<span class="vi">⏳</span><div>' + esc('Talking to GitHub…') + '</div>');
  try {
    const r = await ghPush({ repo, branch: br, path, message, code: c.code });
    S.git = { repo, branch: br }; save(); ghCtx.repo = repo; ghCtx.branch = br;
    const links = (r.commitUrl ? '<a class="gh-a" href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener noreferrer">' + esc('See the commit ↗') + '</a> ' : '') + (r.fileUrl ? '<a class="gh-a" href="' + esc(r.fileUrl) + '" target="_blank" rel="noopener noreferrer">' + esc('Open the file ↗') + '</a>' : '');
    ghStat('clean', '<span class="vi">🎉</span><div><b>' + esc(r.updated ? 'Updated on GitHub!' : 'Pushed to GitHub!') + '</b><div style="font-weight:600">' + esc(repo + ' · ' + r.branch + ' · ' + path) + (r.emptyRepo ? esc(' (first commit in an empty repo)') : '') + '</div><div>' + links + '</div></div>');
    confetti(26); sfx.ok();
  } catch (e) {
    const code = e && e.code && GH_MSG[e.code] ? e.code : 'other';
    if (code === 'bad_token') { ghReadFields(); Gh.clear(); drawGit({ cls: 'ai', html: '<span class="vi">🔑</span><div>' + esc(GH_MSG.bad_token) + '</div>' }); }
    else ghStat(code === 'network' ? 'review' : 'ai', '<span class="vi">' + (code === 'network' ? '📡' : '🚫') + '</span><div>' + esc(code === 'other' ? 'GitHub said: ' + (e.gh || 'something went wrong') : GH_MSG[code]) + '</div>');
    sfx.err();
  } finally { ghBusy = false; const g2 = $('#ghGo'); if (g2) g2.disabled = false; }
}
function ghDownload() {
  if (!ghCtx) return; ghReadFields();
  const name = (ghFilePath(ghCtx.path) || ghCtx.file).split('/').pop();
  try { const u = URL.createObjectURL(new Blob([ghCtx.code], { type: 'text/plain;charset=utf-8' })), l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); toast('Downloading ' + name + '… then drag it onto your repo page on GitHub'); }
  catch (e) { toast('Could not download here, try Copy code'); }
}
async function ghCopy() {
  if (!ghCtx) return;
  try { await navigator.clipboard.writeText(ghCtx.code); toast('Code copied 📋'); } catch (e) { toast('Could not copy here'); }
}
$('#btnGit').addEventListener('click', () => { sfx.tap(); openGitPush(); });
