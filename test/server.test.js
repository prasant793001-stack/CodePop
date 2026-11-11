'use strict';
/* End-to-end server tests: real HTTP against createApp() with an in-memory database and a fake Google verifier. */
const path = require('path');
const { createApp } = require('../server/index.js');
const { load } = require('../server/engines.js');
const { Core } = load();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : (typeof x === 'string' ? x : JSON.stringify(x))); } };
const wrap = body => '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n' + body + '\n    return 0;\n}\n';
const REF = {
  'c-double': wrap('    int n;\n    cin >> n;\n    cout << n * 2 << endl;'),
  'c-hello': wrap('    string name;\n    cin >> name;\n    cout << "Hello, " << name << "!" << endl;'),
  'h-nametag': '<!DOCTYPE html>\n<html>\n<head>\n  <title>Me</title>\n</head>\n<body>\n  <h1>Zara Khan</h1>\n  <p>Zara loves robots and pizza.</p>\n</body>\n</html>\n'
};
const WRONG_DOUBLE = wrap('    int n;\n    cin >> n;\n    cout << n + 2 << endl;');
const toks = c => Core.scanCode(c.titleText + c.html);
const human = code => ({ typedChars: code.length, pastedChars: 0, pasteCount: 0, maxPaste: 0, copyEvents: 0, blurCount: 1, medianKeyMs: 160, keyCount: code.length });
const gtoken = (sub, email, verified, name) => ['g', sub, email, verified ? 1 : 0, name].join('|') + '|padding-to-be-long-enough';
const fakeGoogle = async cred => { const p = String(cred).split('|'); if (p[0] !== 'g') throw new Error('bad'); return { sub: 'gid-' + p[1], email: p[2] || undefined, email_verified: p[3] === '1', name: p[4] }; };

class Client {
  constructor(base) { this.base = base; this.jar = {}; }
  async req(method, url, body, o = {}) {
    const h = { ...(o.headers || {}) };
    if (method !== 'GET' && !o.noCsrf) h['x-codepop'] = '1';
    if (body !== undefined && !o.raw) h['content-type'] = 'application/json';
    const ck = Object.entries(this.jar).map(([k, v]) => k + '=' + v).join('; '); if (ck) h.cookie = ck;
    const r = await fetch(this.base + url, { method, headers: h, body: o.raw ? body : body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const sc of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc) || v === '') delete this.jar[k]; else this.jar[k] = v; }
    let j = null; const text = await r.text(); try { j = JSON.parse(text); } catch (e) { }
    return { status: r.status, json: j, text, headers: r.headers };
  }
  get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b === undefined ? {} : b); } put(u, b) { return this.req('PUT', u, b); } patch(u, b) { return this.req('PATCH', u, b); } del(u) { return this.req('DELETE', u); }
  async google(sub, email, verified, name) { return this.post('/api/auth/google', { credential: gtoken(sub, email, verified, name) }); }
}
async function mk(extra = {}) {
  const ctx = createApp({ dbFile: ':memory:', verifyGoogle: fakeGoogle, markerSecret: 'test-secret', allowDevLogin: true, adminEmails: ['boss@example.com'], webDir: path.join(__dirname, 'nope'), ...extra });
  const srv = await new Promise(r => { const s = ctx.app.listen(0, '127.0.0.1', () => r(s)); });
  return { ctx, base: 'http://127.0.0.1:' + srv.address().port, close: () => new Promise(r => srv.close(() => { ctx.close(); r(); })) };
}
const backdate = (ctx, id, ms) => ctx.db.prepare('UPDATE attempts SET started = started - ? WHERE id = ?').run(ms, id);
async function play(c, ctx, cid, code, o = {}) {
  const st = await c.post('/api/challenges/' + cid + '/start'); if (st.status !== 200) return { st };
  backdate(ctx, st.json.attemptId, o.elapsedMs || 300000);
  const sub = await c.post('/api/attempts/' + st.json.attemptId + '/submit', { code, counters: o.counters || { errors: 0, fixes: 0, help: 0, tips: 0 }, telemetry: o.tel === undefined ? human(code) : o.tel });
  return { st, sub };
}

(async () => {
  const T = await mk(); const { ctx } = T;
  const anon = new Client(T.base);

  /* ---------- basics + headers ---------- */
  const hz = await anon.get('/healthz'); ok('healthz', hz.status === 200 && hz.json.ok);
  ok('x-powered-by hidden', !hz.headers.get('x-powered-by'));
  const csp = hz.headers.get('content-security-policy') || '';
  ok('csp present, no framing, objects off', /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /accounts\.google\.com/.test(csp), csp);
  const dir = n => (csp.split(';').map(x => x.trim()).find(x => x.startsWith(n + ' ')) || '');
  ok('csp lets the page call api.github.com (Push to GitHub) from connect-src only', /https:\/\/api\.github\.com/.test(dir('connect-src')) && !/api\.github\.com/.test(dir('script-src') + dir('frame-src') + dir('default-src') + dir('img-src')), dir('connect-src'));
  ok('nosniff', hz.headers.get('x-content-type-options') === 'nosniff');
  const cfgjs = await anon.get('/config.js'); ok('config.js is server mode', /mode":"server"/.test(cfgjs.text) && /avatars/.test(cfgjs.text) && cfgjs.headers.get('cache-control') === 'no-store');
  ok('join link redirects', (await anon.get('/join/ab12cd')).status === 302);
  ok('unknown api route 404', (await anon.get('/api/nope')).status === 404);
  ok('/api/me anonymous', (await anon.get('/api/me')).json.user === null);

  /* ---------- csrf ---------- */
  ok('POST without header blocked', (await anon.req('POST', '/api/auth/dev', { name: 'X' }, { noCsrf: true })).status === 403);
  ok('POST with foreign origin blocked', (await anon.req('POST', '/api/auth/dev', { name: 'X' }, { headers: { origin: 'https://evil.example' } })).status === 403);
  ok('POST with same origin allowed', (await new Client(T.base).req('POST', '/api/auth/dev', { name: 'Same Origin' }, { headers: { origin: T.base } })).status === 200);
  ok('bad json body', (await anon.req('POST', '/api/auth/google', '{nope', { raw: true, headers: { 'content-type': 'application/json' } })).status === 400);

  /* ---------- google login + sessions ---------- */
  ok('google: short credential rejected', (await anon.post('/api/auth/google', { credential: 'x' })).status === 400);
  ok('google: bad credential rejected', (await anon.post('/api/auth/google', { credential: 'not-a-google-token-at-all' })).status === 401);
  const ada = new Client(T.base);
  const lg = await ada.google('ada', 'ada@example.com', true, 'Ada Lovelace');
  ok('google login ok', lg.status === 200 && lg.json.user && lg.json.user.nickname === 'Ada L.', lg.json);
  const setc = lg.headers.get('set-cookie') || '';
  ok('cookie flags', /cp_sid=/.test(setc) && /HttpOnly/i.test(setc) && /SameSite=Lax/i.test(setc), setc);
  ok('me shows no email / google id', JSON.stringify((await ada.get('/api/me')).json).indexOf('example.com') < 0);
  ok('avatar is an emoji from the list', ctx.cfg && require('../server/index.js').AVATARS.includes(lg.json.user.avatar));
  const sidVal = ada.jar.cp_sid; const row = ctx.db.prepare('SELECT * FROM sessions').all();
  ok('session stored hashed (cookie value never in db)', row.length >= 1 && row.every(r => r.hash !== sidVal) && ctx.db.prepare('SELECT COUNT(*) n FROM sessions WHERE hash = ?').get(require('../server/security.js').sha(sidVal)).n === 1);
  const again = await new Client(T.base).google('ada', 'ada@example.com', true, 'Ada Lovelace'); ok('same google account = same player', again.json.user.id === lg.json.user.id);
  const out = new Client(T.base); await out.google('tmp', 'tmp@example.com', true, 'Tom P'); const oldSid = out.jar.cp_sid;
  ok('logout ok', (await out.post('/api/auth/logout')).status === 200);
  const replay = new Client(T.base); replay.jar.cp_sid = oldSid; ok('old session cookie is dead after logout', (await replay.get('/api/me')).json.user === null);
  const forged = new Client(T.base); forged.jar.cp_sid = 'a'.repeat(64); ok('forged cookie rejected', (await forged.get('/api/me')).json.user === null);
  ctx.db.prepare('UPDATE sessions SET exp = 1 WHERE hash = ?').run(require('../server/security.js').sha(oldSid)); // expired rows are ignored
  const T2 = await mk({ allowDevLogin: false }); ok('dev login disabled by default config', (await new Client(T2.base).post('/api/auth/dev', { name: 'a' })).status === 404); await T2.close();

  /* ---------- profile ---------- */
  ok('nickname with markup rejected', (await ada.patch('/api/me', { nickname: '<b>x</b>' })).status === 400);
  const pn = await ada.patch('/api/me', { nickname: 'Ada Codes', avatar: '🦄' }); ok('nickname + avatar update', pn.json.user.nickname === 'Ada Codes' && pn.json.user.avatar === '🦄', pn.json);
  const pa = await ada.patch('/api/me', { avatar: '<script>' }); ok('avatar outside list ignored', pa.json.user.avatar === '🦄');
  ok('profile needs login', (await anon.patch('/api/me', { nickname: 'zzz' })).status === 401);

  /* ---------- challenges: listing, locking, start ---------- */
  const lst0 = await ada.get('/api/challenges'); ok('listing: 16 challenges, level>1 locked', lst0.json.challenges.length === 16 && lst0.json.challenges.filter(c => c.level === 1).every(c => !c.locked) && lst0.json.challenges.filter(c => c.level > 1).every(c => c.locked));
  ok('listing hides statements, tests and skeletons', !('statement' in lst0.json.challenges[0]) && !('skeleton' in lst0.json.challenges[0]) && !('examples' in lst0.json.challenges[0]) && typeof lst0.json.challenges[0].tests === 'number');
  ok('listing filter by language', (await ada.get('/api/challenges?lang=html')).json.challenges.every(c => c.lang === 'html'));
  ok('start needs login', (await anon.post('/api/challenges/c-double/start')).status === 401);
  ok('start locked level 2 blocked', (await ada.post('/api/challenges/c-evenodd/start')).status === 403);
  ok('start unknown challenge', (await ada.post('/api/challenges/zzz/start')).status === 404);
  const s1 = await ada.post('/api/challenges/c-double/start');
  ok('start ok', s1.status === 200 && s1.json.attemptId && s1.json.challenge.html && s1.json.challenge.skeleton.length > 20);
  const adaTok = toks(s1.json.challenge); ok('3 distinct hidden codes in the challenge', adaTok.length === 3 && new Set(adaTok).size === 3, adaTok);
  ok('markers stored for all 3 slots', ctx.db.prepare('SELECT COUNT(*) n FROM markers WHERE uid = ? AND cid = ?').get(lg.json.user.id, 'c-double').n === 3);
  const visible = s1.json.challenge.html.replace(/<span class="cp-h"[\s\S]*?<\/span>/g, '') + s1.json.challenge.titleText.replace(/[\u200b-\u200d]/g, '');
  ok('hidden codes are never in visible text (only inside the hidden .cp-h instructions and as invisible characters)', !adaTok.some(t => visible.indexOf(t) >= 0) && /class="cp-h"/.test(s1.json.challenge.html) && s1.json.challenge.titleText !== s1.json.challenge.title && s1.json.challenge.titleText.replace(/[\u200b-\u200d]/g, '') === s1.json.challenge.title);
  const s1b = await ada.post('/api/challenges/c-double/start'); ok('same player+challenge = same codes (stable)', JSON.stringify(toks(s1b.json.challenge)) === JSON.stringify(adaTok));
  const bo = new Client(T.base); const bob = await bo.google('bob', 'bob@example.com', true, 'Bob Stone'); const sBob = await bo.post('/api/challenges/c-double/start');
  const bobTok = toks(sBob.json.challenge); ok('different player = different codes', bobTok.every(t => adaTok.indexOf(t) < 0), bobTok);

  /* ---------- submit: clean path ---------- */
  ok('submit needs login', (await anon.post('/api/attempts/' + s1.json.attemptId + '/submit', { code: 'x' })).status === 401);
  ok("can't submit someone else's attempt", (await bo.post('/api/attempts/' + s1.json.attemptId + '/submit', { code: REF['c-double'] })).status === 404);
  ok('bad code field', (await ada.post('/api/attempts/' + s1.json.attemptId + '/submit', { code: 12345 })).status === 400);
  backdate(ctx, s1.json.attemptId, 300000);
  const sub1 = await ada.post('/api/attempts/' + s1.json.attemptId + '/submit', { code: REF['c-double'], counters: { errors: 0, fixes: 0, help: 0, tips: 0 }, telemetry: human(REF['c-double']) });
  ok('submit solved + verified', sub1.status === 200 && sub1.json.score.solved && sub1.json.integrity.verdict === 'clean' && sub1.json.counted === true, sub1.json);
  ok('score breakdown present', Array.isArray(sub1.json.score.parts) && sub1.json.score.total >= 100, sub1.json.score);
  ok('tests returned', sub1.json.tests.length >= 3 && sub1.json.tests.every(t => t.pass));
  ok('double submit blocked', (await ada.post('/api/attempts/' + s1.json.attemptId + '/submit', { code: REF['c-double'] })).status === 409);
  const lst1 = await ada.get('/api/challenges'); const cd = lst1.json.challenges.find(c => c.id === 'c-double');
  ok('listing shows solved + best', cd.solved && cd.best === sub1.json.score.total);
  ok('level 2 cpp unlocked after solving level 1', lst1.json.challenges.filter(c => c.lang === 'cpp' && c.level === 2).every(c => !c.locked) && lst1.json.challenges.filter(c => c.lang === 'html' && c.level === 2).every(c => c.locked));
  ok('now can start level 2', (await ada.post('/api/challenges/c-evenodd/start')).status === 200);

  /* ---------- scoring: helps, errors, wrong answers ---------- */
  const clean2 = await play(ada, ctx, 'c-double', REF['c-double'], { counters: { errors: 0, fixes: 0, help: 0, tips: 0 } });
  const messy = await play(ada, ctx, 'c-double', REF['c-double'], { counters: { errors: 4, fixes: 2, help: 3, tips: 5 } });
  ok('errors/help/tips lower the score', messy.sub.json.score.total < clean2.sub.json.score.total, [clean2.sub.json.score.total, messy.sub.json.score.total]);
  const huge = await play(ada, ctx, 'c-double', REF['c-double'], { counters: { errors: 99999, fixes: 99999, help: 99999, tips: 99999 } });
  ok('counters are clamped, score stays positive', huge.sub.status === 200 && huge.sub.json.score.total > 0);
  const wrong = await play(ada, ctx, 'c-double', WRONG_DOUBLE);
  ok('wrong answer: not solved, partial credit lower', wrong.sub.json.score.solved === false && wrong.sub.json.score.total < messy.sub.json.score.total, wrong.sub.json.score);
  const empty = await play(ada, ctx, 'c-double', '   '); ok('empty code handled', empty.sub.status === 200 && !empty.sub.json.score.solved);
  const htmlRun = await play(ada, ctx, 'h-nametag', REF['h-nametag']); ok('html challenge judged and solved', htmlRun.sub.status === 200 && htmlRun.sub.json.score.solved, htmlRun.sub && htmlRun.sub.json);
  const loop = await play(ada, ctx, 'c-double', wrap('    int n;\n    cin >> n;\n    while (true) { n++; }\n'));
  ok('infinite loop is stopped, server survives', loop.sub.status === 200 && !loop.sub.json.score.solved && (await anon.get('/healthz')).status === 200);
  const par = await Promise.all([1, 2, 3, 4, 5, 6].map(() => play(ada, ctx, 'c-double', REF['c-double'])));
  ok('6 parallel submissions all judged (pool queues them)', par.every(p => p.sub.status === 200 && p.sub.json.score.solved));

  /* ---------- hidden-code detection ---------- */
  const carol = new Client(T.base); await carol.google('carol', 'carol@example.com', true, 'Carol Diaz');
  const sC = await carol.post('/api/challenges/c-double/start'); const cTok = toks(sC.json.challenge);
  backdate(ctx, sC.json.attemptId, 300000);
  const withOwn = REF['c-double'].replace('int main() {', '// ' + Core.zwEncode(cTok[1]) + '\nint main() {');
  const flagOwn = await carol.post('/api/attempts/' + sC.json.attemptId + '/submit', { code: withOwn, counters: { errors: 0, fixes: 0, help: 0, tips: 0 }, telemetry: human(withOwn) });
  ok("AI echoed the player's own hidden code => flagged, on hold", flagOwn.json.integrity.verdict === 'ai' && flagOwn.json.counted === false, flagOwn.json.integrity);
  ok('reasons never reveal the actual codes', !/cp[a-z2-7]{6}/.test(JSON.stringify(flagOwn.json.integrity)) && flagOwn.json.integrity.reasons.length > 0);
  const sC2 = await carol.post('/api/challenges/c-double/start'); backdate(ctx, sC2.json.attemptId, 300000);
  const plain = REF['c-double'].replace('int main() {', '// ' + cTok[2] + '\nint main() {');
  const flagPlain = await carol.post('/api/attempts/' + sC2.json.attemptId + '/submit', { code: plain, telemetry: human(plain) });
  ok('code echoed as plain text (invisible chars stripped) is still caught', flagPlain.json.integrity.verdict === 'ai');
  const sD = await bo.post('/api/challenges/c-double/start'); backdate(ctx, sD.json.attemptId, 300000);
  const stolen = REF['c-double'].replace('int main() {', '// ' + Core.zwEncode(adaTok[0]) + '\nint main() {');
  const flagOther = await bo.post('/api/attempts/' + sD.json.attemptId + '/submit', { code: stolen, telemetry: human(stolen) });
  ok("another player's hidden code => flagged as copied", flagOther.json.integrity.verdict === 'ai' && /ANOTHER/.test(JSON.stringify(ctx.db.prepare('SELECT reasons FROM attempts WHERE id = ?').get(sD.json.attemptId))), flagOther.json.integrity);
  const sP = await carol.post('/api/challenges/c-hello/start'); backdate(ctx, sP.json.attemptId, 300000);
  const pasted = await carol.post('/api/attempts/' + sP.json.attemptId + '/submit', { code: REF['c-hello'], telemetry: { typedChars: 4, pastedChars: REF['c-hello'].length, pasteCount: 1, maxPaste: REF['c-hello'].length, copyEvents: 1, blurCount: 2, medianKeyMs: 150, keyCount: 4 } });
  ok('copy challenge + paste solution => under review (no hidden code needed)', pasted.json.integrity.verdict === 'review' && pasted.json.counted === false, pasted.json.integrity);
  const sF = await carol.post('/api/challenges/c-hello/start');
  const quick = await carol.post('/api/attempts/' + sF.json.attemptId + '/submit', { code: REF['c-hello'], telemetry: human(REF['c-hello']) });
  ok('very fast solve alone is only a soft signal (still counted)', quick.json.integrity.verdict === 'clean');
  const sN = await carol.post('/api/challenges/c-hello/start'); backdate(ctx, sN.json.attemptId, 300000);
  const noTel = await carol.post('/api/attempts/' + sN.json.attemptId + '/submit', { code: REF['c-hello'] });
  ok('no telemetry alone is only a soft signal', noTel.json.integrity.verdict === 'clean');
  const lstC = await carol.get('/api/challenges'); ok('flagged attempts show as pending review', lstC.json.challenges.find(c => c.id === 'c-double').pending === true);

  /* ---------- leaderboard ---------- */
  const lb = await ada.get('/api/leaderboard'); ok('leaderboard shape', Array.isArray(lb.json.top) && lb.json.top.length >= 1 && lb.json.top.length <= 10);
  const adaRow = lb.json.top.find(r => r.me); ok('ada is on the board and marked as me', !!adaRow && lb.json.me && lb.json.me.rank === adaRow.rank);
  ok('leaderboard holds no emails or ids that expose accounts', !/@/.test(JSON.stringify(lb.json)));
  const carolRank = (await carol.get('/api/leaderboard')).json; ok('carol: only her clean attempts count (c-hello)', !carolRank.me || carolRank.me.total < 400, carolRank.me);
  const bobRank = (await bo.get('/api/leaderboard')).json; ok('bob: stolen-code attempt gives him no points', bobRank.me === null, bobRank.me);
  const sorted = lb.json.top.every((r, i, a) => i === 0 || a[i - 1].total >= r.total); ok('sorted by score', sorted);
  for (let i = 0; i < 14; i++) { const id = 'bulk' + i; ctx.db.prepare('INSERT INTO users(id, sub, nickname, avatar, created) VALUES (?,?,?,?,?)').run(id, 'bulk-sub-' + i, 'Bulk' + i, '🤖', Date.now()); ctx.db.prepare('INSERT INTO attempts(id, uid, cid, started, submitted, score, solved, verdict, counted) VALUES (?,?,?,?,?,?,?,?,1)').run('ba' + i, id, 'c-hello', 1, 2, 1000 + i, 1, 'clean'); }
  await new Promise(r => setTimeout(r, 10)); ctx.db.prepare('SELECT 1').get();
  // ranking is cached for 10s; a fresh submission resets the cache, so trigger one
  await play(ada, ctx, 'c-double', REF['c-double']);
  const lb2 = (await ada.get('/api/leaderboard')).json; ok('top 10 only, even with 16+ players', lb2.top.length === 10 && lb2.players >= 16, [lb2.top.length, lb2.players]);
  ok('top 10 ranks 1..10, best first', lb2.top[0].rank === 1 && lb2.top[0].total >= lb2.top[9].total && lb2.top[0].nickname.startsWith('Bulk'));
  ok('player outside the top 10 still gets their own rank', lb2.me && lb2.me.rank > 10 && !lb2.top.some(r => r.me), lb2.me);

  /* ---------- projects ---------- */
  ok('projects need login', (await anon.get('/api/projects')).status === 401);
  const pj = await ada.put('/api/projects', { name: 'My robot', lang: 'cpp', code: '#include <iostream>\nint main(){}' }); ok('project create', pj.status === 200 && pj.json.project.id);
  ok('project bad language', (await ada.put('/api/projects', { name: 'x', lang: 'rust', code: 'fn main(){}' })).status === 400);
  ok('project list', (await ada.get('/api/projects')).json.projects.some(p => p.id === pj.json.project.id));
  const pj2 = await ada.put('/api/projects', { id: pj.json.project.id, name: 'My robot v2', lang: 'cpp', code: 'int main(){return 0;}' }); ok('project update keeps id', pj2.json.project.id === pj.json.project.id && (await ada.get('/api/projects/' + pj.json.project.id)).json.project.name === 'My robot v2');
  ok("another player can't read my project", (await bo.get('/api/projects/' + pj.json.project.id)).status === 404);
  ok("another player can't overwrite my project (creates their own)", (await bo.put('/api/projects', { id: pj.json.project.id, name: 'hack', lang: 'cpp', code: 'x' })).json.project.id !== pj.json.project.id && (await ada.get('/api/projects/' + pj.json.project.id)).json.project.name === 'My robot v2');
  ok("another player can't delete my project", ((await bo.del('/api/projects/' + pj.json.project.id)), (await ada.get('/api/projects/' + pj.json.project.id)).status === 200));
  const pjH = await ada.put('/api/projects', { name: 'Home page', lang: 'html', code: '<h1>hi</h1>' });

  /* ---------- reviewer area: hidden + gated + audited ---------- */
  ok('admin area invisible to anonymous (404, not 401)', (await anon.get('/api/admin/queue')).status === 404);
  ok('admin area invisible to normal players', (await ada.get('/api/admin/queue')).status === 404);
  const impostor = new Client(T.base); const ig = await impostor.google('imp', 'boss@example.com', false, 'Not Boss'); // email NOT verified by Google
  ok('allow-listed email without verification is NOT admin', ig.json.user.isAdmin === false && (await impostor.get('/api/admin/queue')).status === 404);
  const boss = new Client(T.base); const bl = await boss.google('boss', 'boss@example.com', true, 'Big Boss');
  ok('verified allow-listed reviewer is admin', bl.json.user.isAdmin === true);
  const q = await boss.get('/api/admin/queue'); ok('review queue lists flagged attempts', q.status === 200 && q.json.items.length >= 3 && q.json.items.every(i => i.verdict === 'ai' || i.verdict === 'review'), q.json);
  ok('queue never contains hidden codes', !/cp[a-z2-7]{6}/.test(JSON.stringify(q.json.items.map(i => i.reasons.map(r => r.text.replace(/\(cp[a-z2-7]{6}\)/g, '')))))) ;
  const flaggedOwn = q.json.items.find(i => i.nickname === 'Carol D.' && i.verdict === 'ai');
  const av = await boss.get('/api/admin/attempts/' + flaggedOwn.id); ok('reviewer can open an attempt (code + signals)', av.status === 200 && /int main/.test(av.json.attempt.code) && av.json.attempt.reasons.length > 0);
  const log1 = await carol.get('/api/access-log'); ok('player sees "who viewed my work"', log1.json.entries.some(e => e.action === 'view_attempt'), log1.json);
  ok("log shows the reviewer's name, newest first", log1.json.entries[0].actor.length > 0 && log1.json.entries.every((e, i, a) => !i || a[i - 1].ts >= e.ts));
  ok("own actions aren't listed as reviewer access", (await boss.get('/api/access-log')).json.entries.length === 0);
  const ulist = await boss.get('/api/admin/users?q=ada'); ok('reviewer can search players', ulist.status === 200 && ulist.json.users.some(u => u.nickname === 'Ada Codes'));
  ok('search is injection-safe', (await boss.get("/api/admin/users?q=" + encodeURIComponent("' OR 1=1 --"))).status === 200);
  const adaId = lg.json.user.id; const pl = await boss.get('/api/admin/users/' + adaId + '/projects'); ok('reviewer can list saved projects', pl.status === 200 && pl.json.projects.length >= 2);
  const pv = await boss.get('/api/admin/users/' + adaId + '/projects/' + pj.json.project.id); ok('reviewer can open a saved project', pv.status === 200 && /main/.test(pv.json.project.code));
  const adaLog = (await ada.get('/api/access-log')).json.entries; ok('owner is told: project list + project opened', adaLog.some(e => e.action === 'list_projects') && adaLog.some(e => e.action === 'view_project' && e.detail === 'My robot v2'), adaLog);
  ok('wrong project id under a user = 404', (await boss.get('/api/admin/users/' + adaId + '/projects/nope')).status === 404);
  ok('normal players cannot use reviewer project route', (await bo.get('/api/admin/users/' + adaId + '/projects/' + pj.json.project.id)).status === 404);
  const dec = await boss.post('/api/admin/attempts/' + flaggedOwn.id + '/decision', { decision: 'clear', note: 'Checked, looks hand-typed' }); ok('reviewer can clear', dec.status === 200 && dec.json.decision === 'cleared');
  ok('bad decision rejected', (await boss.post('/api/admin/attempts/' + flaggedOwn.id + '/decision', { decision: 'maybe' })).status === 400);
  const after = (await carol.get('/api/leaderboard')).json; ok('cleared attempt now counts on the board', after.me && after.me.total > 0, after.me);
  ok('cleared item leaves the queue', !(await boss.get('/api/admin/queue')).json.items.some(i => i.id === flaggedOwn.id));
  const rej = (await boss.get('/api/admin/queue')).json.items[0]; await boss.post('/api/admin/attempts/' + rej.id + '/decision', { decision: 'reject' });
  ok('rejected attempt stays uncounted', ctx.db.prepare('SELECT counted, decision FROM attempts WHERE id = ?').get(rej.id).counted === 0);
  ok('every reviewer read is in the audit table', ctx.db.prepare("SELECT COUNT(*) n FROM audit WHERE action LIKE 'admin_%'").get().n >= 6);
  ctx.cfg.adminIps.push('203.0.113.9'); ok('IP allow-list: reviewer from other IP gets 404', (await boss.get('/api/admin/queue')).status === 404); ctx.cfg.adminIps.length = 0;
  ok('IP allow-list off again', (await boss.get('/api/admin/queue')).status === 200);
  ctx.db.prepare('UPDATE sessions SET created = created - ? WHERE uid = ?').run(9 * 3600e3, bl.json.user.id);
  const stale = await boss.get('/api/admin/queue'); ok('old session must sign in again for reviewer work (401 reauth)', stale.status === 401 && stale.json.error === 'reauth', stale.json);
  ok('…but the same session still works for normal play', (await boss.get('/api/challenges')).status === 200);
  ctx.db.prepare('DELETE FROM sessions WHERE uid = ?').run(bl.json.user.id);

  /* ---------- groups, group challenges, duels ---------- */
  const dave = new Client(T.base); const dv = await dave.google('dave', 'dave@example.com', true, 'Dave Ray'); const eve = new Client(T.base); await eve.google('eve', 'eve@example.com', true, 'Eve Moss');
  ok('groups need login', (await anon.get('/api/groups')).status === 401);
  ok('group name validation', (await carol.post('/api/groups', { name: '<img>' })).status === 400 && (await carol.post('/api/groups', { name: 'x' })).status === 400);
  const g = await carol.post('/api/groups', { name: 'Class 5B 🚀'.replace('🚀', '') }); ok('group created with a join code', g.status === 200 && /^[A-Z2-9]{6}$/.test(g.json.group.code), g.json);
  ok('join with a bad code', (await dave.post('/api/groups/join', { code: 'ZZZZZZ' })).status === 404);
  ok('join with lowercase code + spaces works', (await dave.post('/api/groups/join', { code: ' ' + g.json.group.code.toLowerCase() + ' ' })).status === 200);
  ok('joining twice is harmless', (await dave.post('/api/groups/join', { code: g.json.group.code })).status === 200);
  ok('non-member cannot open the group', (await eve.get('/api/groups/' + g.json.group.id)).status === 404);
  ok('non-member cannot add challenges', (await eve.post('/api/groups/' + g.json.group.id + '/challenges', { cid: 'c-double' })).status === 404);
  ok('my groups list', (await dave.get('/api/groups')).json.groups.some(x => x.id === g.json.group.id && x.members === 2 && x.mine === false));
  const gc = await carol.post('/api/groups/' + g.json.group.id + '/challenges', { cid: 'c-double', hours: 48 }); ok('group challenge created', gc.status === 200 && gc.json.challenge.mode === 'group');
  ok('unknown challenge rejected', (await carol.post('/api/groups/' + g.json.group.id + '/challenges', { cid: 'nope' })).status === 404);
  const carolId = (await carol.get('/api/me')).json.user.id, daveId = dv.json.user.id;
  const duel = await carol.post('/api/groups/' + g.json.group.id + '/challenges', { cid: 'c-hello', invitee: daveId }); ok('duel with a group member', duel.status === 200 && duel.json.challenge.mode === 'duel', duel.json);
  ok('duel with outsider rejected', (await carol.post('/api/groups/' + g.json.group.id + '/challenges', { cid: 'c-hello', invitee: (await eve.get('/api/me')).json.user.id })).status === 400);
  ok("can't duel yourself", (await carol.post('/api/groups/' + g.json.group.id + '/challenges', { cid: 'c-hello', invitee: carolId })).status === 400);
  await play(carol, ctx, 'c-double', REF['c-double']); await play(dave, ctx, 'c-double', WRONG_DOUBLE); await play(dave, ctx, 'c-hello', REF['c-hello']);
  const gv = await dave.get('/api/groups/' + g.json.group.id); ok('group page loads', gv.status === 200 && gv.json.members.length === 2 && gv.json.challenges.length === 2, gv.json);
  const gcv = gv.json.challenges.find(c => c.mode === 'group'); ok('group standings: both listed, best first', gcv.standings.length === 2 && gcv.standings[0].nickname === 'Carol D.' && gcv.standings[0].score > gcv.standings[1].score, gcv.standings);
  const dcv = gv.json.challenges.find(c => c.mode === 'duel'); ok('duel standings: only the two duelists; carol has not played', dcv.standings.length === 2 && dcv.standings.find(s => s.nickname === 'Carol D.').status === 'none' && dcv.standings[0].nickname === 'Dave R.', dcv.standings);
  ok('member points add up', gv.json.members[0].points >= gv.json.members[1].points && gv.json.members.some(m => m.you && m.points > 0));
  ok('attempts before the challenge existed are not counted', (await (async () => { const rows = gcv.standings.map(s => s.score); return rows.every(s => s === null || s <= 130); })()));
  ok('leave group; owner passes on', (await carol.post('/api/groups/' + g.json.group.id + '/leave')).status === 200 && (await dave.get('/api/groups/' + g.json.group.id)).json.group.mine === true);
  ok('left member loses access', (await carol.get('/api/groups/' + g.json.group.id)).status === 404);
  ok('last member leaving removes the group', ((await dave.post('/api/groups/' + g.json.group.id + '/leave')).status === 200) && ctx.db.prepare('SELECT COUNT(*) n FROM groups WHERE id = ?').get(g.json.group.id).n === 0);

  const fr = new Client(T.base), gi = new Client(T.base); await fr.google('frank', 'frank@example.com', true, 'Frank Wu'); await gi.google('gina', 'gina@example.com', true, 'Gina Ng');
  const g2 = await fr.post('/api/groups', { name: 'Founders' }); await gi.post('/api/groups/join', { code: g2.json.group.code });
  await fr.del('/api/me'); const g2v = await gi.get('/api/groups/' + g2.json.group.id);
  ok('group survives its founder deleting their account (ownership passes on)', g2v.status === 200 && g2v.json.group.mine === true && g2v.json.members.length === 1, g2v.json);
  const g3 = await gi.post('/api/groups', { name: 'Solo' }); await gi.del('/api/me'); ok('a deleted last member removes an empty group', ctx.db.prepare('SELECT COUNT(*) n FROM groups WHERE id IN (?, ?)').get(g2.json.group.id, g3.json.group.id).n === 0);

  /* ---------- account export, delete, ban ---------- */
  const ex = await ada.get('/api/me/export'); ok('data export has projects and attempts', ex.status === 200 && ex.json.projects.length >= 2 && ex.json.attempts.length >= 5);
  const del = await ada.del('/api/me'); ok('delete account', del.status === 200 && (await ada.get('/api/me')).json.user === null);
  ok('everything of the deleted player is gone', ['users WHERE id', 'projects WHERE uid', 'attempts WHERE uid', 'markers WHERE uid', 'sessions WHERE uid'].every(t => ctx.db.prepare('SELECT COUNT(*) n FROM ' + t + ' = ?').get(adaId).n === 0));
  ctx.db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(daveId); ok('banned player is signed out', (await dave.get('/api/me')).json.user === null);
  ok('banned player cannot log back in', (await new Client(T.base).google('dave', 'dave@example.com', true, 'Dave Ray')).status === 403);
  ok('banned players are off the leaderboard', !(await anon.get('/api/leaderboard')).json.top.some(r => r.uid === daveId));
  await T.close();

  /* ---------- rate limits (fresh app so earlier calls do not count) ---------- */
  const R = await mk(); const rc = new Client(R.base); let hit429 = false;
  for (let i = 0; i < 25; i++) { const r = await rc.post('/api/auth/google', { credential: 'not-a-google-token-at-all' }); if (r.status === 429) { hit429 = true; ok('429 carries Retry-After', !!r.headers.get('retry-after')); break; } }
  ok('login attempts are rate limited', hit429);
  await R.close();

  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
