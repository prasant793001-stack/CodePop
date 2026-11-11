/* ===== CodePop app: API layer. Server mode talks to the CodePop server; demo mode simulates it in the browser ===== */
const CFG = window.CODEPOP_CONFIG || {};
const SERVER = CFG.mode === 'server';
const AVATARS = CFG.avatars || ['🦊', '🐼', '🐸', '🦄', '🐙', '🦖', '🚀', '🤖', '👾', '🐯', '🦁', '🐧', '🐳', '🦉', '🐝', '🍕', '⚽', '🎮', '🌈', '⭐', '🔥', '🧁', '🛸', '🪁'];
Object.assign(C.UI.en, {
  'arena.title': 'Arena', 'arena.install': 'Install', 'live.title': 'Live', 'live.screen': 'Screen only', 'live.term': 'Terminal only', 'live.both': 'Screen + terminal', 'live.swap': 'Swap left / right'
});
Object.assign(C.UI.es, { 'arena.title': 'Arena', 'arena.install': 'Instalar', 'live.title': 'En vivo', 'live.screen': 'Solo pantalla', 'live.term': 'Solo terminal', 'live.both': 'Pantalla + terminal', 'live.swap': 'Cambiar lados' });
Object.assign(C.UI.hi, { 'arena.title': 'अखाड़ा', 'arena.install': 'इंस्टॉल', 'live.title': 'लाइव', 'live.screen': 'सिर्फ़ स्क्रीन', 'live.term': 'सिर्फ़ टर्मिनल', 'live.both': 'स्क्रीन + टर्मिनल', 'live.swap': 'बाएँ-दाएँ बदलें' });
Object.assign(C.UI.ar, { 'arena.title': 'الساحة', 'arena.install': 'تثبيت', 'live.title': 'مباشر', 'live.screen': 'الشاشة فقط', 'live.term': 'الطرفية فقط', 'live.both': 'الشاشة + الطرفية', 'live.swap': 'تبديل الجانبين' });

const fail = (code, status) => { const e = new Error(code); e.code = code; e.status = status || 400; return e; };

/* ---------- server client ---------- */
async function http(method, url, body) {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: Object.assign({ 'X-CodePop': '1' }, body !== undefined ? { 'content-type': 'application/json' } : {}), body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { }
  if (!r.ok) throw fail((j && j.error) || ('http_' + r.status), r.status);
  return j;
}
const serverApi = {
  mode: 'server',
  me: () => http('GET', '/api/me').then(r => r.user),
  google: cred => http('POST', '/api/auth/google', { credential: cred }).then(r => r.user),
  dev: (name, email) => http('POST', '/api/auth/dev', { name, email }).then(r => r.user),
  logout: () => http('POST', '/api/auth/logout', {}),
  update: p => http('PATCH', '/api/me', p).then(r => r.user),
  remove: () => http('DELETE', '/api/me'),
  exportData: () => http('GET', '/api/me/export'),
  challenges: lang => http('GET', '/api/challenges' + (lang ? '?lang=' + lang : '')),
  start: cid => http('POST', '/api/challenges/' + encodeURIComponent(cid) + '/start', {}),
  submit: (id, body) => http('POST', '/api/attempts/' + encodeURIComponent(id) + '/submit', body),
  board: () => http('GET', '/api/leaderboard'),
  groups: () => http('GET', '/api/groups').then(r => r.groups),
  createGroup: name => http('POST', '/api/groups', { name }).then(r => r.group),
  joinGroup: code => http('POST', '/api/groups/join', { code }).then(r => r.group),
  group: id => http('GET', '/api/groups/' + encodeURIComponent(id)),
  addChallenge: (gid, o) => http('POST', '/api/groups/' + encodeURIComponent(gid) + '/challenges', o).then(r => r.challenge),
  leaveGroup: id => http('POST', '/api/groups/' + encodeURIComponent(id) + '/leave', {}),
  projects: () => http('GET', '/api/projects').then(r => r.projects),
  project: id => http('GET', '/api/projects/' + encodeURIComponent(id)).then(r => r.project),
  saveProject: p => http('PUT', '/api/projects', p).then(r => r.project),
  deleteProject: id => http('DELETE', '/api/projects/' + encodeURIComponent(id)),
  accessLog: () => http('GET', '/api/access-log').then(r => r.entries),
  adminQueue: () => http('GET', '/api/admin/queue').then(r => r.items),
  adminAttempt: id => http('GET', '/api/admin/attempts/' + encodeURIComponent(id)).then(r => r.attempt),
  adminDecide: (id, decision, note) => http('POST', '/api/admin/attempts/' + encodeURIComponent(id) + '/decision', { decision, note }),
  adminUsers: q => http('GET', '/api/admin/users?q=' + encodeURIComponent(q || '')).then(r => r.users),
  adminProjects: uid => http('GET', '/api/admin/users/' + encodeURIComponent(uid) + '/projects').then(r => r.projects),
  adminProject: (uid, pid) => http('GET', '/api/admin/users/' + encodeURIComponent(uid) + '/projects/' + encodeURIComponent(pid)).then(r => r.project),
  shareUrl: code => location.origin + '/join/' + code
};

/* ---------- demo backend (same shapes as the server; lives in this browser only) ---------- */
const DKEY = 'codepop.demo.v1', DSEC = 'codepop-demo-secret';
const BOTS = [
  { id: 'b1', nickname: 'Pixel P.', avatar: '🐼', total: 1840, solved: 9 }, { id: 'b2', nickname: 'Zara K.', avatar: '🦄', total: 1620, solved: 8 },
  { id: 'b3', nickname: 'Max R.', avatar: '🚀', total: 1390, solved: 7 }, { id: 'b4', nickname: 'Lina S.', avatar: '🐸', total: 1210, solved: 7 },
  { id: 'b5', nickname: 'Omar H.', avatar: '🦖', total: 980, solved: 5 }, { id: 'b6', nickname: 'Kai T.', avatar: '🤖', total: 860, solved: 5 },
  { id: 'b7', nickname: 'Nora B.', avatar: '🐙', total: 640, solved: 4 }, { id: 'b8', nickname: 'Sam L.', avatar: '🦊', total: 520, solved: 3 },
  { id: 'b9', nickname: 'Ivy C.', avatar: '🧁', total: 330, solved: 2 }, { id: 'b10', nickname: 'Leo M.', avatar: '⚽', total: 180, solved: 1 }
];
const botOf = id => BOTS.find(b => b.id === id);
const SEEDED = [
  { id: 'seed1', uid: 'b3', cid: 'c-prime', score: 410, verdict: 'ai', submitted: Date.now() - 3600e3, tel: { typedChars: 0, pastedChars: 380, copyEvents: 1 }, decision: null, code: '#include <iostream>\n// (sample) hidden challenge code found in this solution\nusing namespace std;\nint main() { /* … */ }',
    reasons: [{ code: 'marker-other', level: 'high', text: 'Hidden code of ANOTHER player #2 of this challenge appears in the solution (••••••).' }, { code: 'copy-paste', level: 'med', text: 'The challenge text was copied and 380 characters were pasted back.' }] },
  { id: 'seed2', uid: 'b6', cid: 'h-profile', score: 330, verdict: 'review', submitted: Date.now() - 7200e3, tel: { typedChars: 12, pastedChars: 410, copyEvents: 1 }, decision: null, code: '<!DOCTYPE html>\n<html>\n<!-- (sample) pasted page -->\n<body><h1>Kai</h1></body>\n</html>',
    reasons: [{ code: 'copy-paste', level: 'med', text: 'The challenge text was copied and 410 characters were pasted back.' }, { code: 'too-fast', level: 'med', text: 'Solved much faster than any normal attempt.' }] }
];
let D = (() => { try { const j = JSON.parse(localStorage.getItem(DKEY) || 'null'); if (j && typeof j === 'object') return j; } catch (e) { } return null; })() || { me: null, attempts: [], projects: [], groups: [], log: [], reviewer: false, decided: {} };
D.decided = D.decided || {};
const dsave = () => { try { localStorage.setItem(DKEY, JSON.stringify(D)); } catch (e) { } };
const drid = () => Math.random().toString(36).slice(2, 10);
const dhash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const mask = txt => String(txt).replace(/cp[a-z2-7]{6}/g, '••••••');
const dsolved = () => Array.from(new Set(D.attempts.filter(a => a.counted && a.solved).map(a => a.cid)));
const dbest = () => { const m = {}; D.attempts.filter(a => a.counted && a.submitted).forEach(a => { m[a.cid] = Math.max(m[a.cid] || 0, a.score); }); return m; };
const dme = () => { if (!D.me) throw fail('login_required', 401); return D.me; };
const dpub = u => u && { id: u.id, nickname: u.nickname, avatar: u.avatar, isAdmin: !!D.reviewer, created: u.created };
const dlog = (action, detail) => { D.log.unshift({ ts: Date.now(), action, actor: 'Reviewer (demo)', detail: detail || null }); D.log = D.log.slice(0, 60); };
function botScore(bid, cid) { const ch = Core.byId(cid), pts = Core.LEVELS[ch.level - 1].points, r = dhash(bid + cid); return r < 0.18 ? null : Math.round(pts * (0.55 + 0.5 * dhash(cid + bid))); }
function dknown(cid) { const m = new Map(); ['me'].concat(BOTS.map(b => b.id)).forEach(uid => Core.tokens(DSEC, uid, cid).forEach((tk, i) => m.set(tk, { uid, cid, slot: i }))); return m; }
const demoApi = {
  mode: 'demo',
  async me() { return D.me ? dpub(D.me) : null; },
  async google() { throw fail('google_unavailable'); },
  async dev(name) {
    const nick = String(name || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 14) || 'Guest';
    D.me = D.me || { id: 'me', created: Date.now(), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] }; D.me.nickname = nick; dsave(); return dpub(D.me);
  },
  async logout() { D.me = null; D.reviewer = false; dsave(); },
  async update(p) { const u = dme(); if (typeof p.nickname === 'string' && /^[\p{L}\p{N} ._-]{2,20}$/u.test(p.nickname.trim())) u.nickname = p.nickname.trim(); else if (typeof p.nickname === 'string') throw fail('bad_nickname'); if (AVATARS.includes(p.avatar)) u.avatar = p.avatar; dsave(); return dpub(u); },
  async remove() { D = { me: null, attempts: [], projects: [], groups: [], log: [], reviewer: false, decided: {} }; dsave(); },
  async exportData() { const u = dme(); return { user: dpub(u), projects: D.projects, attempts: D.attempts.map(a => ({ id: a.id, cid: a.cid, score: a.score, solved: a.solved, verdict: a.verdict, counted: a.counted, code: a.code })) }; },
  async challenges(lang) {
    const solved = dsolved(), best = dbest(), pend = {};
    D.attempts.filter(a => a.submitted && !a.counted && !a.decision && a.verdict !== 'clean').forEach(a => { pend[a.cid] = 1; });
    return { levels: Core.LEVELS, challenges: Core.listing(lang || null).map(c => ({ ...c, best: best[c.id] ?? null, solved: solved.includes(c.id), pending: !!pend[c.id], locked: !Core.unlocked(c.lang, c.level, solved) })) };
  },
  async start(cid) {
    dme(); const ch = Core.byId(cid); if (!ch) throw fail('no_such_challenge', 404);
    if (!Core.unlocked(ch.lang, ch.level, dsolved())) throw fail('locked', 403);
    const a = { id: drid(), cid, started: Date.now(), submitted: null }; D.attempts.push(a); dsave();
    return { attemptId: a.id, startedAt: a.started, challenge: Core.render(ch, Core.tokens(DSEC, 'me', cid)) };
  },
  async submit(id, body) {
    dme(); const a = D.attempts.find(x => x.id === id); if (!a) throw fail('no_such_attempt', 404); if (a.submitted) throw fail('already_submitted', 409);
    const ch = Core.byId(a.cid), code = String(body.code || '').slice(0, 20000), elapsed = (Date.now() - a.started) / 1000, c = body.counters || {}, t = body.telemetry || null;
    const cl = (v, n) => Math.max(0, Math.min(n, Math.floor(+v) || 0)), counters = { errors: cl(c.errors, 50), fixes: cl(c.fixes, 50), help: cl(c.help, 50), tips: cl(c.tips, 50) };
    const j = await Core.judge(code, ch, { CP, H }), sc = Core.score(ch, j, counters, elapsed, code), known = dknown(ch.id);
    const as = Core.assess({ code, known, selfUid: 'me', cid: ch.id, tel: t, elapsedSec: elapsed, ch, skeletonLen: ch.skeleton.length });
    Object.assign(a, { submitted: Date.now(), code, score: sc.total, solved: sc.solved ? 1 : 0, parts: sc.parts, tel: t, counters, verdict: as.verdict, reasons: as.reasons, counted: as.verdict === 'clean' ? 1 : 0 }); dsave();
    return { attemptId: a.id, score: sc, tests: j.tests, compileErrors: j.compileErrors || 0, integrity: { verdict: as.verdict, ...Core.VERDICT[as.verdict], reasons: as.verdict === 'clean' ? [] : as.reasons.map(r => ({ code: r.code, level: r.level, text: mask(r.text) })) }, counted: !!a.counted };
  },
  async board() {
    const rows = BOTS.map(b => ({ uid: b.id, nickname: b.nickname, avatar: b.avatar, total: b.total, solved: b.solved }));
    if (D.me) { const best = dbest(), tot = Object.values(best).reduce((x, y) => x + y, 0); if (tot > 0) rows.push({ uid: 'me', nickname: D.me.nickname, avatar: D.me.avatar, total: tot, solved: dsolved().length }); }
    rows.sort((a, b) => b.total - a.total || b.solved - a.solved); const mi = rows.findIndex(r => r.uid === 'me');
    return { top: rows.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r, me: r.uid === 'me' })), players: rows.length, me: mi >= 0 ? { rank: mi + 1, total: rows[mi].total, solved: rows[mi].solved } : null };
  },
  async groups() { dme(); return D.groups.map(g => ({ id: g.id, name: g.name, code: g.code, mine: true, members: g.members.length })); },
  async createGroup(name) {
    dme(); const n = String(name || '').trim(); if (n.length < 2 || !/^[\p{L}\p{N} ._!-]{2,30}$/u.test(n)) throw fail('bad_name');
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    const g = { id: drid(), name: n, code, members: ['me'].concat(BOTS.slice().sort(() => Math.random() - .5).slice(0, 3).map(b => b.id)), challenges: [] }; D.groups.unshift(g); dsave(); return { id: g.id, name: g.name, code: g.code, mine: true, members: g.members.length };
  },
  async joinGroup(code) {
    dme(); code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); let g = D.groups.find(x => x.code === code);
    if (!g && code === 'DEMO42') { g = { id: drid(), name: 'Pixel Squad', code, members: ['me', 'b1', 'b2', 'b4', 'b5', 'b8'], challenges: [] }; D.groups.unshift(g); dsave(); }
    if (!g) throw fail('no_such_group', 404); return { id: g.id, name: g.name, code: g.code };
  },
  async group(id) {
    dme(); const g = D.groups.find(x => x.id === id); if (!g) throw fail('no_such_group', 404); const now = Date.now(), pts = {};
    const person = uid => uid === 'me' ? D.me : botOf(uid);
    const challenges = g.challenges.slice().reverse().map(gc => {
      const ch = Core.byId(gc.cid), uids = gc.mode === 'duel' ? gc.participants : g.members;
      const st = uids.map(uid => {
        const p = person(uid); let score = null, solved = false, status = 'none';
        if (uid === 'me') { const best = D.attempts.filter(a => a.cid === gc.cid && a.counted && a.submitted >= gc.created && a.submitted <= gc.due).sort((x, y) => y.score - x.score)[0]; if (best) { score = best.score; solved = !!best.solved; status = 'done'; } else if (D.attempts.some(a => a.cid === gc.cid && a.submitted >= gc.created && !a.counted && !a.decision && a.verdict !== 'clean')) status = 'review'; }
        else { score = botScore(uid + gc.id, gc.cid); if (score !== null) { solved = true; status = 'done'; } }
        if (score) pts[uid] = (pts[uid] || 0) + score; return { uid, nickname: p.nickname, avatar: p.avatar, score, solved, status };
      }).sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
      return { id: gc.id, cid: gc.cid, title: ch.title, emoji: ch.emoji, lang: ch.lang, level: ch.level, mode: gc.mode, creator: D.me.nickname, created: gc.created, due: gc.due, open: gc.due > now, standings: st };
    });
    return { group: { id: g.id, name: g.name, code: g.code, mine: true }, members: g.members.map(uid => { const p = person(uid); return { uid, nickname: p.nickname, avatar: p.avatar, points: pts[uid] || 0, you: uid === 'me' }; }).sort((a, b) => b.points - a.points), challenges };
  },
  async addChallenge(gid, o) {
    dme(); const g = D.groups.find(x => x.id === gid); if (!g) throw fail('no_such_group', 404); const ch = Core.byId(o.cid); if (!ch) throw fail('no_such_challenge', 404);
    const hours = Math.max(1, Math.min(336, Math.floor(+o.hours) || 72)), now = Date.now(); let mode = 'group', participants = null;
    if (o.invitee) { if (o.invitee === 'me' || !g.members.includes(o.invitee)) throw fail('bad_invitee'); mode = 'duel'; participants = ['me', o.invitee]; }
    const gc = { id: drid(), cid: ch.id, mode, participants, created: now, due: now + hours * 3600e3 }; g.challenges.push(gc); dsave(); return { id: gc.id, cid: gc.cid, mode, due: gc.due };
  },
  async leaveGroup(id) { D.groups = D.groups.filter(g => g.id !== id); dsave(); },
  async projects() { dme(); return D.projects.slice().sort((a, b) => b.updated - a.updated).map(p => ({ id: p.id, name: p.name, lang: p.lang, updated: p.updated, size: p.code.length })); },
  async project(id) { dme(); const p = D.projects.find(x => x.id === id); if (!p) throw fail('not_found', 404); return { id: p.id, name: p.name, lang: p.lang, code: p.code, updated: p.updated }; },
  async saveProject(p) {
    dme(); const name = String(p.name || '').trim().slice(0, 60); if (!name || (p.lang !== 'cpp' && p.lang !== 'html')) throw fail('bad_project'); const now = Date.now();
    let x = p.id && D.projects.find(q => q.id === p.id); if (x) Object.assign(x, { name, lang: p.lang, code: String(p.code || '').slice(0, 50000), updated: now });
    else { if (D.projects.length >= 50) throw fail('too_many_projects'); x = { id: drid(), name, lang: p.lang, code: String(p.code || '').slice(0, 50000), created: now, updated: now }; D.projects.push(x); }
    dsave(); return { id: x.id, name: x.name, lang: x.lang, updated: x.updated };
  },
  async deleteProject(id) { D.projects = D.projects.filter(p => p.id !== id); dsave(); },
  async accessLog() { dme(); return D.log; },
  /* reviewer console (demo: switch it on in the Me tab) */
  async adminQueue() {
    if (!D.reviewer) throw fail('not_found', 404);
    const mine = D.attempts.filter(a => a.submitted && a.verdict && a.verdict !== 'clean' && !a.decision).map(a => ({ id: a.id, cid: a.cid, score: a.score, verdict: a.verdict, reasons: (a.reasons || []).map(r => ({ code: r.code, level: r.level, text: mask(r.text) })), tel: a.tel, submitted: a.submitted, uid: 'me', nickname: D.me.nickname, avatar: D.me.avatar }));
    const seeded = SEEDED.filter(s => !D.decided[s.id]).map(s => ({ id: s.id, cid: s.cid, score: s.score, verdict: s.verdict, reasons: s.reasons, tel: s.tel, submitted: s.submitted, uid: s.uid, nickname: botOf(s.uid).nickname, avatar: botOf(s.uid).avatar }));
    return mine.concat(seeded).map(i => ({ ...i, title: Core.byId(i.cid).title }));
  },
  async adminAttempt(id) {
    if (!D.reviewer) throw fail('not_found', 404); const s = SEEDED.find(x => x.id === id);
    if (s) return { id: s.id, cid: s.cid, uid: s.uid, nickname: botOf(s.uid).nickname, code: s.code, score: s.score, verdict: s.verdict, reasons: s.reasons, parts: [], tel: s.tel, decision: null };
    const a = D.attempts.find(x => x.id === id); if (!a) throw fail('not_found', 404); dlog('view_attempt', a.cid + ' ' + a.id);
    return { id: a.id, cid: a.cid, uid: 'me', nickname: D.me.nickname, code: a.code, score: a.score, verdict: a.verdict, reasons: (a.reasons || []).map(r => ({ code: r.code, level: r.level, text: mask(r.text) })), parts: a.parts || [], tel: a.tel, decision: a.decision || null };
  },
  async adminDecide(id, decision) {
    if (!D.reviewer) throw fail('not_found', 404); const d = decision === 'clear' ? 'cleared' : decision === 'reject' ? 'rejected' : null; if (!d) throw fail('bad_decision');
    const a = D.attempts.find(x => x.id === id); if (a) { a.decision = d; a.counted = d === 'cleared' ? 1 : 0; dlog('decision', d + ' ' + a.cid); } else D.decided[id] = d; dsave(); return { ok: true, decision: d };
  },
  async adminUsers(q) {
    if (!D.reviewer) throw fail('not_found', 404); q = String(q || '').toLowerCase(); const rows = BOTS.map(b => ({ id: b.id, nickname: b.nickname, avatar: b.avatar, projects: 0, attempts: b.solved }));
    if (D.me) rows.unshift({ id: 'me', nickname: D.me.nickname, avatar: D.me.avatar, projects: D.projects.length, attempts: D.attempts.length }); return rows.filter(r => !q || r.nickname.toLowerCase().includes(q));
  },
  async adminProjects(uid) { if (!D.reviewer) throw fail('not_found', 404); if (uid !== 'me') return []; dlog('list_projects'); dsave(); return D.projects.map(p => ({ id: p.id, name: p.name, lang: p.lang, updated: p.updated, size: p.code.length })); },
  async adminProject(uid, pid) { if (!D.reviewer) throw fail('not_found', 404); const p = uid === 'me' && D.projects.find(x => x.id === pid); if (!p) throw fail('not_found', 404); dlog('view_project', p.name); dsave(); return { id: p.id, name: p.name, lang: p.lang, code: p.code, updated: p.updated }; },
  setReviewer(on) { D.reviewer = !!on; dsave(); },
  shareUrl: code => location.href.split('#')[0] + '#join-' + code
};
const Api = SERVER ? serverApi : demoApi;
