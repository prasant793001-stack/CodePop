'use strict';
const express = require('express');
const helmet = require('helmet');
const path = require('path'), fs = require('fs');
const { Worker } = require('worker_threads');
const { openDb } = require('./db');
const { load } = require('./engines');
const S = require('./security');

const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦖', '🚀', '🤖', '👾', '🐯', '🦁', '🐧', '🐳', '🦉', '🐝', '🍕', '⚽', '🎮', '🌈', '⭐', '🔥', '🧁', '🛸', '🪁'];
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOUR = 3600e3;

function createApp(opts = {}) {
  const cfg = Object.assign({
    dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    adminIps: (process.env.ADMIN_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
    markerSecret: process.env.MARKER_SECRET || '',
    production: process.env.NODE_ENV === 'production',
    allowDevLogin: process.env.ALLOW_DEV_LOGIN === '1',
    trustProxy: process.env.TRUST_PROXY || '',
    webDir: path.join(__dirname, '..', 'dist', 'web'),
    sessionDays: 30, adminSessionHours: 8, judgeConcurrency: 3, judgeTimeoutMs: 15000, allowedOrigins: []
  }, opts);
  if (!cfg.markerSecret) { if (cfg.production) throw new Error('MARKER_SECRET is required in production'); cfg.markerSecret = 'dev-only-marker-secret'; }
  const db = openDb(cfg.dbFile || path.join(cfg.dataDir, 'codepop.db'));
  const { Core } = load();
  let verifyGoogle = cfg.verifyGoogle;
  if (!verifyGoogle) {
    const { OAuth2Client } = require('google-auth-library'); const client = new OAuth2Client(cfg.googleClientId);
    verifyGoogle = async cred => { const t = await client.verifyIdToken({ idToken: cred, audience: cfg.googleClientId }); const p = t.getPayload(); return { sub: p.sub, email: p.email, email_verified: !!p.email_verified, name: p.name || '' }; };
  }

  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', /^\d+$/.test(cfg.trustProxy) ? Number(cfg.trustProxy) : cfg.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'], styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'", 'https://accounts.google.com', 'https://api.github.com'], frameSrc: ["'self'", 'https://accounts.google.com'],
      objectSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"], frameAncestors: ["'none'"], manifestSrc: ["'self'"], workerSrc: ["'self'"],
      ...(cfg.production ? { upgradeInsecureRequests: [] } : {}) } },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, crossOriginEmbedderPolicy: false,
    hsts: cfg.production ? { maxAge: 31536000, includeSubDomains: true } : false
  }));
  app.use(express.json({ limit: '256kb' }));
  app.use((err, req, res, next) => { if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) return res.status(400).json({ error: 'bad_body' }); next(err); });

  /* ---------- static site + config ---------- */
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/config.js', (req, res) => {
    res.set('Cache-Control', 'no-store').type('application/javascript');
    res.send('window.CODEPOP_CONFIG=' + JSON.stringify({ mode: 'server', googleClientId: cfg.googleClientId, devLogin: cfg.allowDevLogin, avatars: AVATARS }) + ';');
  });
  app.get('/join/:code', (req, res) => res.redirect('/?join=' + encodeURIComponent(String(req.params.code).slice(0, 12))));
  if (fs.existsSync(cfg.webDir)) {
    app.use(express.static(cfg.webDir, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (/sw\.js$|index\.html$|manifest/.test(p)) res.set('Cache-Control', 'no-cache'); } }));
    app.get('/', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(cfg.webDir, 'index.html')));
  }

  /* ---------- sessions / auth ---------- */
  const api = express.Router();
  api.use(S.csrf(cfg.allowedOrigins));
  api.use(S.rateLimit({ windowMs: 60e3, max: 300, key: S.ipKey }));
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const isAdminUser = u => !!u && !!u.email && !!u.email_verified && cfg.adminEmails.includes(u.email.toLowerCase());
  api.use((req, res, next) => {
    const sid = S.parseCookies(req.headers.cookie).cp_sid; req.user = null;
    if (sid) {
      const row = db.prepare('SELECT s.created sc, s.exp, u.* FROM sessions s JOIN users u ON u.id = s.uid WHERE s.hash = ? AND s.exp > ?').get(S.sha(sid), Date.now());
      if (row && !row.banned) { req.user = row; req.sessCreated = row.sc; }
    }
    next();
  });
  const needUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'login_required' });
  const needAdmin = (req, res, next) => {
    if (!req.user || !isAdminUser(req.user)) return res.status(404).json({ error: 'not_found' });   // reviewers' area does not even exist for others
    if (cfg.adminIps.length && !cfg.adminIps.includes(req.ip)) return res.status(404).json({ error: 'not_found' });
    if (Date.now() - req.sessCreated > cfg.adminSessionHours * HOUR) return res.status(401).json({ error: 'reauth' });
    next();
  };
  const audit = (req, action, target, detail) => db.prepare('INSERT INTO audit(ts, actor, action, target, detail, ip) VALUES (?,?,?,?,?,?)').run(Date.now(), req.user ? req.user.id : null, action, target || null, detail ? String(detail).slice(0, 300) : null, req.ip || null);
  const pubUser = u => ({ id: u.id, nickname: u.nickname, avatar: u.avatar, isAdmin: isAdminUser(u), created: u.created });
  const mkSession = (req, res, uid) => {
    const sid = S.rid(32), now = Date.now(), exp = now + cfg.sessionDays * 24 * HOUR;
    db.prepare('INSERT INTO sessions(hash, uid, created, exp, ip, ua) VALUES (?,?,?,?,?,?)').run(S.sha(sid), uid, now, exp, req.ip || null, String(req.get('user-agent') || '').slice(0, 160));
    res.cookie('cp_sid', sid, { httpOnly: true, sameSite: 'lax', secure: cfg.production, maxAge: cfg.sessionDays * 24 * HOUR, path: '/' });
  };
  const upsertUser = p => {
    let u = db.prepare('SELECT * FROM users WHERE sub = ?').get(p.sub); const now = Date.now();
    if (!u) {
      const parts = S.safeText(p.name || '').split(/\s+/).filter(Boolean);
      const nick = parts.length ? (parts[0].slice(0, 12) + (parts.length > 1 ? ' ' + parts[parts.length - 1][0] + '.' : '')) : 'Player' + S.int(Math.random() * 9000 + 1000, 1000, 9999);
      db.prepare('INSERT INTO users(id, sub, email, email_verified, name, nickname, avatar, role, created, last_login) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(S.rid(8), p.sub, p.email || null, p.email_verified ? 1 : 0, p.name || null, nick, AVATARS[Math.floor(Math.random() * AVATARS.length)], 'player', now, now);
      u = db.prepare('SELECT * FROM users WHERE sub = ?').get(p.sub);
    } else db.prepare('UPDATE users SET last_login = ?, email = ?, email_verified = ? WHERE id = ?').run(now, p.email || u.email, p.email_verified ? 1 : 0, u.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  };
  const authLimit = S.rateLimit({ windowMs: 60e3, max: 20, key: S.ipKey });
  api.get('/me', (req, res) => res.json({ user: req.user ? pubUser(req.user) : null }));
  api.post('/auth/google', authLimit, async (req, res) => {
    const cred = S.str(req.body && req.body.credential, 4096, 20); if (!cred) return res.status(400).json({ error: 'bad_credential' });
    let p; try { p = await verifyGoogle(cred); } catch (e) { return res.status(401).json({ error: 'google_rejected' }); }
    if (!p || !p.sub) return res.status(401).json({ error: 'google_rejected' });
    const u = upsertUser(p); if (u.banned) return res.status(403).json({ error: 'banned' });
    mkSession(req, res, u.id); req.user = u; audit(req, 'login', u.id, 'google'); res.json({ user: pubUser(u) });
  });
  api.post('/auth/dev', authLimit, (req, res) => {   // only when ALLOW_DEV_LOGIN=1 (local development and tests)
    if (!cfg.allowDevLogin || cfg.production) return res.status(404).json({ error: 'not_found' });
    const name = S.str(req.body && req.body.name, 40, 1) || 'Dev Player'; const email = S.str(req.body && req.body.email, 80) || '';
    const u = upsertUser({ sub: 'dev:' + name.toLowerCase(), email, email_verified: !!email, name }); mkSession(req, res, u.id); res.json({ user: pubUser(u) });
  });
  api.post('/auth/logout', (req, res) => {
    const sid = S.parseCookies(req.headers.cookie).cp_sid; if (sid) db.prepare('DELETE FROM sessions WHERE hash = ?').run(S.sha(sid));
    res.clearCookie('cp_sid', { path: '/' }); res.json({ ok: true });
  });
  api.patch('/me', needUser, (req, res) => {
    const nick = S.str(req.body.nickname, 20, 2), av = req.body.avatar;
    if (nick !== null && !/^[\p{L}\p{N} ._-]+$/u.test(nick)) return res.status(400).json({ error: 'bad_nickname' });
    if (nick !== null) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nick, req.user.id);
    if (typeof av === 'string' && AVATARS.includes(av)) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(av, req.user.id);
    res.json({ user: pubUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });
  api.get('/me/export', needUser, (req, res) => res.json({
    user: pubUser(req.user), projects: db.prepare('SELECT id, name, lang, code, created, updated FROM projects WHERE uid = ?').all(req.user.id),
    attempts: db.prepare('SELECT id, cid, started, submitted, score, solved, verdict, counted, code FROM attempts WHERE uid = ?').all(req.user.id)
  }));
  api.delete('/me', needUser, (req, res) => {
    const uid = req.user.id; audit(req, 'delete_account', uid);
    db.transaction(() => {
      for (const g of db.prepare('SELECT id FROM groups WHERE owner = ?').all(uid)) {   // a group outlives its founder: hand it to the next member (an empty group is removed by the cascade)
        const nx = db.prepare('SELECT uid FROM group_members WHERE gid = ? AND uid != ? ORDER BY joined LIMIT 1').get(g.id, uid);
        if (nx) db.prepare('UPDATE groups SET owner = ? WHERE id = ?').run(nx.uid, g.id);
      }
      db.prepare('DELETE FROM markers WHERE uid = ?').run(uid); db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    })();
    rankCache.t = 0; res.clearCookie('cp_sid', { path: '/' }); res.json({ ok: true });
  });

  /* ---------- judge pool (worker threads, timeout, small concurrency) ---------- */
  let running = 0; const queue = [];
  const pump = () => { while (running < cfg.judgeConcurrency && queue.length) { const j = queue.shift(); running++; runWorker(j.cid, j.code).then(j.res, j.rej).finally(() => { running--; pump(); }); } };
  const judge = (cid, code) => new Promise((res, rej) => { queue.push({ cid, code, res, rej }); pump(); });
  function runWorker(cid, code) {
    return new Promise(resolve => {
      const ch = Core.byId(cid), total = ch.tests ? ch.tests.length : ch.checks.length;
      const w = new Worker(path.join(__dirname, 'judge-worker.js'), { workerData: { cid, code }, resourceLimits: { maxOldGenerationSizeMb: 192 } });
      const fail = why => { clearTimeout(t); w.terminate(); resolve({ ok: false, why, compileErrors: 0, tests: [], passed: 0, total }); };
      const t = setTimeout(() => fail('timeout'), cfg.judgeTimeoutMs);
      w.once('message', m => { clearTimeout(t); w.terminate(); resolve(m.ok ? m.res : { ok: false, why: 'judge_error', compileErrors: 0, tests: [], passed: 0, total }); });
      w.once('error', () => fail('worker_error'));
    });
  }

  /* ---------- challenges ---------- */
  const solvedIds = uid => db.prepare('SELECT DISTINCT cid FROM attempts WHERE uid = ? AND counted = 1 AND solved = 1').all(uid).map(r => r.cid);
  api.get('/challenges', (req, res) => {
    const lang = req.query.lang === 'cpp' || req.query.lang === 'html' ? req.query.lang : null;
    const solved = req.user ? solvedIds(req.user.id) : [];
    const best = {}, pend = {};
    if (req.user) {
      for (const r of db.prepare('SELECT cid, MAX(score) s FROM attempts WHERE uid = ? AND counted = 1 GROUP BY cid').all(req.user.id)) best[r.cid] = r.s;
      for (const r of db.prepare("SELECT cid, COUNT(*) n FROM attempts WHERE uid = ? AND counted = 0 AND decision IS NULL AND verdict IN ('review','ai') GROUP BY cid").all(req.user.id)) pend[r.cid] = r.n;
    }
    res.json({ levels: Core.LEVELS, challenges: Core.listing(lang).map(c => ({ ...c, best: best[c.id] ?? null, solved: solved.includes(c.id), pending: !!pend[c.id], locked: !Core.unlocked(c.lang, c.level, solved) })) });
  });
  api.post('/challenges/:id/start', needUser, S.rateLimit({ windowMs: 60e3, max: 30, key: S.userKey }), (req, res) => {
    const ch = Core.byId(req.params.id); if (!ch) return res.status(404).json({ error: 'no_such_challenge' });
    if (!Core.unlocked(ch.lang, ch.level, solvedIds(req.user.id))) return res.status(403).json({ error: 'locked' });
    const tokens = Core.tokens(cfg.markerSecret, req.user.id, ch.id), now = Date.now();
    const ins = db.prepare('INSERT OR IGNORE INTO markers(token, uid, cid, slot, created) VALUES (?,?,?,?,?)'); tokens.forEach((t, i) => ins.run(t, req.user.id, ch.id, i, now));
    const id = S.rid(10); db.prepare('INSERT INTO attempts(id, uid, cid, started) VALUES (?,?,?,?)').run(id, req.user.id, ch.id, now);
    res.json({ attemptId: id, startedAt: now, challenge: Core.render(ch, tokens) });
  });
  const cleanReasons = list => list.map(r => ({ code: r.code, level: r.level, text: r.text.replace(/cp[a-z2-7]{6}/g, '••••••') }));
  api.post('/attempts/:id/submit', needUser, S.rateLimit({ windowMs: 60e3, max: 20, key: S.userKey }), async (req, res) => {
    const att = db.prepare('SELECT * FROM attempts WHERE id = ? AND uid = ?').get(String(req.params.id).slice(0, 40), req.user.id);
    if (!att) return res.status(404).json({ error: 'no_such_attempt' });
    if (att.submitted) return res.status(409).json({ error: 'already_submitted' });
    if (Date.now() - att.started > 6 * HOUR) return res.status(410).json({ error: 'expired' });
    const code = S.str(req.body.code, 20000); if (code === null) return res.status(400).json({ error: 'bad_code' });
    const ch = Core.byId(att.cid), elapsed = (Date.now() - att.started) / 1000, c = req.body.counters || {}, t = req.body.telemetry || null;
    const counters = { errors: S.int(c.errors, 0, 50), fixes: S.int(c.fixes, 0, 50), help: S.int(c.help, 0, 50), tips: S.int(c.tips, 0, 50) };
    const tel = t ? { typedChars: S.int(t.typedChars, 0, 1e6), pastedChars: S.int(t.pastedChars, 0, 1e6), pasteCount: S.int(t.pasteCount, 0, 1e4), maxPaste: S.int(t.maxPaste, 0, 1e6), copyEvents: S.int(t.copyEvents, 0, 1e4), blurCount: S.int(t.blurCount, 0, 1e4), medianKeyMs: S.int(t.medianKeyMs, 0, 1e5), keyCount: S.int(t.keyCount, 0, 1e6) } : null;
    const j = await judge(ch.id, code);
    if (j.why) return res.status(503).json({ error: 'judge_busy', why: j.why });
    const sc = Core.score(ch, j, counters, elapsed, code);
    const found = Core.scanCode(code), known = new Map();
    for (const tok of found) { const r = db.prepare('SELECT * FROM markers WHERE token = ?').get(tok); if (r) known.set(tok, { uid: r.uid, cid: r.cid, slot: r.slot }); }
    const as = Core.assess({ code, known, selfUid: req.user.id, cid: ch.id, tel, elapsedSec: elapsed, ch, skeletonLen: ch.skeleton.length });
    const counted = as.verdict === 'clean' ? 1 : 0;
    db.prepare('UPDATE attempts SET submitted = ?, code = ?, score = ?, solved = ?, parts = ?, tel = ?, counters = ?, verdict = ?, reasons = ?, counted = ? WHERE id = ?')
      .run(Date.now(), code, sc.total, sc.solved ? 1 : 0, JSON.stringify(sc.parts), JSON.stringify(tel), JSON.stringify(counters), as.verdict, JSON.stringify(as.reasons), counted, att.id);
    if (as.verdict !== 'clean') audit(req, 'flagged_attempt', req.user.id, as.verdict + ' ' + ch.id);
    rankCache.t = 0;
    res.json({ attemptId: att.id, score: sc, tests: j.tests, compileErrors: j.compileErrors || 0, integrity: { verdict: as.verdict, ...Core.VERDICT[as.verdict], reasons: as.verdict === 'clean' ? [] : cleanReasons(as.reasons) }, counted: !!counted });
  });

  /* ---------- leaderboard ---------- */
  const rankCache = { t: 0, rows: [] };
  function ranking() {
    if (Date.now() - rankCache.t < 10000) return rankCache.rows;
    rankCache.rows = db.prepare(`WITH best AS (SELECT uid, cid, MAX(score) s, MAX(solved) sv FROM attempts WHERE counted = 1 GROUP BY uid, cid)
      SELECT u.id uid, u.nickname, u.avatar, SUM(best.s) total, SUM(best.sv) solved FROM best JOIN users u ON u.id = best.uid WHERE u.banned = 0
      GROUP BY best.uid ORDER BY total DESC, solved DESC, u.created ASC`).all();
    rankCache.t = Date.now(); return rankCache.rows;
  }
  api.get('/leaderboard', (req, res) => {
    const rows = ranking(); const me = req.user ? rows.findIndex(r => r.uid === req.user.id) : -1;
    res.json({ top: rows.slice(0, 10).map((r, i) => ({ rank: i + 1, uid: r.uid, nickname: r.nickname, avatar: r.avatar, total: r.total, solved: r.solved, me: !!req.user && r.uid === req.user.id })), players: rows.length,
      me: me >= 0 ? { rank: me + 1, total: rows[me].total, solved: rows[me].solved } : null });
  });

  /* ---------- groups, challenges and duels ---------- */
  const memberOf = (gid, uid) => !!db.prepare('SELECT 1 FROM group_members WHERE gid = ? AND uid = ?').get(gid, uid);
  const newCode = () => { for (let k = 0; k < 20; k++) { let c = ''; for (let i = 0; i < 6; i++) c += CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)]; if (!db.prepare('SELECT 1 FROM groups WHERE code = ?').get(c)) return c; } throw new Error('code'); };
  api.get('/groups', needUser, (req, res) => res.json({ groups: db.prepare(`SELECT g.id, g.name, g.code, g.owner = ? mine, (SELECT COUNT(*) FROM group_members WHERE gid = g.id) members FROM groups g JOIN group_members m ON m.gid = g.id WHERE m.uid = ? ORDER BY g.created DESC`).all(req.user.id, req.user.id).map(g => ({ ...g, mine: !!g.mine })) }));
  api.post('/groups', needUser, S.rateLimit({ windowMs: 3600e3, max: 10, key: S.userKey }), (req, res) => {
    const name = S.str(req.body.name, 30, 2); if (!name || !/^[\p{L}\p{N} ._!-]+$/u.test(name)) return res.status(400).json({ error: 'bad_name' });
    if (db.prepare('SELECT COUNT(*) n FROM group_members WHERE uid = ?').get(req.user.id).n >= 15) return res.status(400).json({ error: 'too_many_groups' });
    const id = S.rid(8), code = newCode(), now = Date.now();
    db.transaction(() => { db.prepare('INSERT INTO groups(id, name, owner, code, created) VALUES (?,?,?,?,?)').run(id, name, req.user.id, code, now); db.prepare('INSERT INTO group_members(gid, uid, joined) VALUES (?,?,?)').run(id, req.user.id, now); })();
    res.json({ group: { id, name, code, mine: true, members: 1 } });
  });
  api.post('/groups/join', needUser, S.rateLimit({ windowMs: 60e3, max: 10, key: S.userKey }), (req, res) => {
    const code = (S.str(req.body.code, 12, 4) || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const g = code && db.prepare('SELECT * FROM groups WHERE code = ?').get(code);
    if (!g) return res.status(404).json({ error: 'no_such_group' });
    if (db.prepare('SELECT COUNT(*) n FROM group_members WHERE gid = ?').get(g.id).n >= 50) return res.status(400).json({ error: 'group_full' });
    db.prepare('INSERT OR IGNORE INTO group_members(gid, uid, joined) VALUES (?,?,?)').run(g.id, req.user.id, Date.now());
    res.json({ group: { id: g.id, name: g.name, code: g.code } });
  });
  function standings(gc, memberIds) {
    const uids = gc.mode === 'duel' ? JSON.parse(gc.participants || '[]') : memberIds, out = [];
    for (const uid of uids) {
      const u = db.prepare('SELECT nickname, avatar FROM users WHERE id = ?').get(uid); if (!u) continue;
      const rows = db.prepare('SELECT score, solved, counted, verdict, decision FROM attempts WHERE uid = ? AND cid = ? AND submitted BETWEEN ? AND ?').all(uid, gc.cid, gc.created, gc.due);
      const done = rows.filter(r => r.counted).sort((a, b) => b.score - a.score)[0];
      const pending = rows.some(r => !r.counted && r.decision === null && r.verdict !== 'clean');
      out.push({ uid, nickname: u.nickname, avatar: u.avatar, score: done ? done.score : null, solved: done ? !!done.solved : false, status: done ? 'done' : pending ? 'review' : 'none' });
    }
    return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }
  api.get('/groups/:id', needUser, (req, res) => {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(String(req.params.id).slice(0, 20));
    if (!g || !memberOf(g.id, req.user.id)) return res.status(404).json({ error: 'no_such_group' });
    const mem = db.prepare('SELECT u.id, u.nickname, u.avatar FROM group_members m JOIN users u ON u.id = m.uid WHERE m.gid = ? ORDER BY m.joined').all(g.id), ids = mem.map(m => m.id), now = Date.now();
    const pts = {}; ids.forEach(i => pts[i] = 0);
    const challenges = db.prepare('SELECT * FROM group_challenges WHERE gid = ? ORDER BY created DESC LIMIT 30').all(g.id).map(gc => {
      const ch = Core.byId(gc.cid), st = standings(gc, ids); st.forEach(s => { if (s.score) pts[s.uid] = (pts[s.uid] || 0) + s.score; });
      const creator = db.prepare('SELECT nickname FROM users WHERE id = ?').get(gc.creator);
      return { id: gc.id, cid: gc.cid, title: ch.title, emoji: ch.emoji, lang: ch.lang, level: ch.level, mode: gc.mode, creator: creator ? creator.nickname : '?', created: gc.created, due: gc.due, open: gc.due > now, standings: st };
    });
    res.json({ group: { id: g.id, name: g.name, code: g.code, mine: g.owner === req.user.id }, members: mem.map(m => ({ uid: m.id, nickname: m.nickname, avatar: m.avatar, points: pts[m.id] || 0, you: m.id === req.user.id })).sort((a, b) => b.points - a.points), challenges });
  });
  api.post('/groups/:id/challenges', needUser, S.rateLimit({ windowMs: 3600e3, max: 30, key: S.userKey }), (req, res) => {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(String(req.params.id).slice(0, 20));
    if (!g || !memberOf(g.id, req.user.id)) return res.status(404).json({ error: 'no_such_group' });
    const ch = Core.byId(req.body.cid); if (!ch) return res.status(404).json({ error: 'no_such_challenge' });
    const hours = S.int(req.body.hours, 1, 24 * 14, 72); let mode = 'group', parts = null;
    if (req.body.invitee) {
      const inv = S.str(req.body.invitee, 40); if (!inv || inv === req.user.id || !memberOf(g.id, inv)) return res.status(400).json({ error: 'bad_invitee' });
      mode = 'duel'; parts = JSON.stringify([req.user.id, inv]);
    }
    if (db.prepare('SELECT COUNT(*) n FROM group_challenges WHERE gid = ? AND due > ?').get(g.id, Date.now()).n >= 10) return res.status(400).json({ error: 'too_many_open' });
    const id = S.rid(8), now = Date.now(); db.prepare('INSERT INTO group_challenges(id, gid, cid, creator, mode, participants, created, due) VALUES (?,?,?,?,?,?,?,?)').run(id, g.id, ch.id, req.user.id, mode, parts, now, now + hours * HOUR);
    res.json({ challenge: { id, cid: ch.id, mode, due: now + hours * HOUR } });
  });
  api.post('/groups/:id/leave', needUser, (req, res) => {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(String(req.params.id).slice(0, 20)); if (!g) return res.status(404).json({ error: 'no_such_group' });
    db.prepare('DELETE FROM group_members WHERE gid = ? AND uid = ?').run(g.id, req.user.id);
    if (g.owner === req.user.id) { const nx = db.prepare('SELECT uid FROM group_members WHERE gid = ? ORDER BY joined LIMIT 1').get(g.id); if (nx) db.prepare('UPDATE groups SET owner = ? WHERE id = ?').run(nx.uid, g.id); else db.prepare('DELETE FROM groups WHERE id = ?').run(g.id); }
    res.json({ ok: true });
  });

  /* ---------- saved projects (owner only) ---------- */
  api.get('/projects', needUser, (req, res) => res.json({ projects: db.prepare('SELECT id, name, lang, updated, length(code) size FROM projects WHERE uid = ? ORDER BY updated DESC').all(req.user.id) }));
  api.get('/projects/:id', needUser, (req, res) => {
    const p = db.prepare('SELECT id, name, lang, code, updated FROM projects WHERE id = ? AND uid = ?').get(String(req.params.id).slice(0, 40), req.user.id);
    p ? res.json({ project: p }) : res.status(404).json({ error: 'not_found' });
  });
  api.put('/projects', needUser, S.rateLimit({ windowMs: 60e3, max: 40, key: S.userKey }), (req, res) => {
    const name = S.str(req.body.name, 60, 1), lang = req.body.lang === 'cpp' || req.body.lang === 'html' ? req.body.lang : null, code = S.str(req.body.code, 50000);
    if (!name || !lang || code === null) return res.status(400).json({ error: 'bad_project' });
    const now = Date.now(); let id = req.body.id ? String(req.body.id).slice(0, 40) : null;
    if (id && db.prepare('SELECT 1 FROM projects WHERE id = ? AND uid = ?').get(id, req.user.id)) db.prepare('UPDATE projects SET name = ?, lang = ?, code = ?, updated = ? WHERE id = ? AND uid = ?').run(name, lang, code, now, id, req.user.id);
    else {
      if (db.prepare('SELECT COUNT(*) n FROM projects WHERE uid = ?').get(req.user.id).n >= 50) return res.status(400).json({ error: 'too_many_projects' });
      id = S.rid(8); db.prepare('INSERT INTO projects(id, uid, name, lang, code, created, updated) VALUES (?,?,?,?,?,?,?)').run(id, req.user.id, name, lang, code, now, now);
    }
    res.json({ project: { id, name, lang, updated: now } });
  });
  api.delete('/projects/:id', needUser, (req, res) => { db.prepare('DELETE FROM projects WHERE id = ? AND uid = ?').run(String(req.params.id).slice(0, 40), req.user.id); res.json({ ok: true }); });
  api.get('/access-log', needUser, (req, res) => res.json({ entries: db.prepare("SELECT a.ts, a.action, a.detail, u.nickname actor FROM audit a LEFT JOIN users u ON u.id = a.actor WHERE a.target = ? AND a.actor != ? AND a.action LIKE 'admin_%' ORDER BY a.ts DESC LIMIT 50").all(req.user.id, req.user.id).map(e => ({ ts: e.ts, action: e.action.replace('admin_', ''), actor: e.actor || 'Reviewer', detail: e.detail })) }));

  /* ---------- reviewer area (hidden: 404 for everyone who is not an allow-listed, verified reviewer; every read is logged and shown to the player) ---------- */
  const admin = express.Router(); admin.use(needAdmin);
  admin.get('/queue', (req, res) => {
    const rows = db.prepare(`SELECT a.id, a.cid, a.score, a.verdict, a.reasons, a.tel, a.submitted, u.id uid, u.nickname, u.avatar FROM attempts a JOIN users u ON u.id = a.uid
      WHERE a.verdict IN ('review','ai') AND a.decision IS NULL AND a.submitted IS NOT NULL ORDER BY a.submitted DESC LIMIT 100`).all();
    res.json({ items: rows.map(r => ({ id: r.id, cid: r.cid, title: Core.byId(r.cid).title, score: r.score, verdict: r.verdict, reasons: JSON.parse(r.reasons || '[]'), tel: JSON.parse(r.tel || 'null'), submitted: r.submitted, uid: r.uid, nickname: r.nickname, avatar: r.avatar })) });
  });
  admin.get('/attempts/:id', (req, res) => {
    const a = db.prepare('SELECT a.*, u.nickname FROM attempts a JOIN users u ON u.id = a.uid WHERE a.id = ?').get(String(req.params.id).slice(0, 40)); if (!a) return res.status(404).json({ error: 'not_found' });
    audit(req, 'admin_view_attempt', a.uid, a.cid + ' ' + a.id); res.json({ attempt: { id: a.id, cid: a.cid, uid: a.uid, nickname: a.nickname, code: a.code, score: a.score, verdict: a.verdict, reasons: JSON.parse(a.reasons || '[]'), parts: JSON.parse(a.parts || '[]'), tel: JSON.parse(a.tel || 'null'), decision: a.decision } });
  });
  admin.post('/attempts/:id/decision', (req, res) => {
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(String(req.params.id).slice(0, 40)); if (!a) return res.status(404).json({ error: 'not_found' });
    const d = req.body.decision === 'clear' ? 'cleared' : req.body.decision === 'reject' ? 'rejected' : null; if (!d) return res.status(400).json({ error: 'bad_decision' });
    db.prepare('UPDATE attempts SET decision = ?, decided_by = ?, decided_at = ?, note = ?, counted = ? WHERE id = ?').run(d, req.user.id, Date.now(), S.str(req.body.note || '', 300) || null, d === 'cleared' ? 1 : 0, a.id);
    audit(req, 'admin_decision', a.uid, d + ' ' + a.cid); rankCache.t = 0; res.json({ ok: true, decision: d });
  });
  admin.get('/users', (req, res) => {
    const q = '%' + (S.str(String(req.query.q || ''), 40) || '').replace(/[%_]/g, '') + '%';
    const rows = db.prepare(`SELECT u.id, u.nickname, u.avatar, u.email, u.created, u.last_login, (SELECT COUNT(*) FROM projects WHERE uid = u.id) projects, (SELECT COUNT(*) FROM attempts WHERE uid = u.id) attempts
      FROM users u WHERE u.nickname LIKE ? OR u.email LIKE ? ORDER BY u.last_login DESC LIMIT 50`).all(q, q);
    audit(req, 'admin_search_users', null, String(req.query.q || '').slice(0, 40)); res.json({ users: rows });
  });
  admin.get('/users/:uid/projects', (req, res) => {
    const uid = String(req.params.uid).slice(0, 40); if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) return res.status(404).json({ error: 'not_found' });
    audit(req, 'admin_list_projects', uid); res.json({ projects: db.prepare('SELECT id, name, lang, updated, length(code) size FROM projects WHERE uid = ? ORDER BY updated DESC').all(uid) });
  });
  admin.get('/users/:uid/projects/:pid', (req, res) => {
    const uid = String(req.params.uid).slice(0, 40), p = db.prepare('SELECT id, name, lang, code, updated FROM projects WHERE id = ? AND uid = ?').get(String(req.params.pid).slice(0, 40), uid);
    if (!p) return res.status(404).json({ error: 'not_found' }); audit(req, 'admin_view_project', uid, p.name); res.json({ project: p });
  });
  api.use('/admin', admin);
  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'server_error' }); });

  const sweep = setInterval(() => { db.prepare('DELETE FROM sessions WHERE exp < ?').run(Date.now()); }, 6 * HOUR); sweep.unref();
  return { app, db, cfg, close: () => { clearInterval(sweep); db.close(); } };
}

function loadDotEnv() {   // tiny .env reader (no dependency): real environment variables always win
  for (const f of [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '.env')]) {
    try { for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line); if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); } break; } catch (e) { }
  }
}
if (require.main === module) {
  loadDotEnv();
  const port = Number(process.env.PORT || 3000);
  const { app, cfg } = createApp();
  app.listen(port, () => {
    console.log('CodePop listening on :' + port);
    if (!cfg.googleClientId) console.log('  ! GOOGLE_CLIENT_ID is not set: Google sign-in is disabled' + (cfg.allowDevLogin ? ' (dev login is on)' : ''));
    if (!cfg.adminEmails.length) console.log('  ! ADMIN_EMAILS is not set: nobody can open the reviewer area');
  });
}
module.exports = { createApp, AVATARS };
