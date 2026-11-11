'use strict';
const crypto = require('crypto');

/* ---- tiny in-memory rate limiter (swap for Redis if you run several instances) ---- */
function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req); const now = Date.now(); let h = hits.get(k);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
    if (++h.n > max) { res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000))); return res.status(429).json({ error: 'slow_down' }); }
    next();
  };
}
const ipKey = req => 'ip:' + (req.ip || 'x');
const userKey = req => 'u:' + (req.user ? req.user.id : req.ip);

/* ---- cookies ---- */
function parseCookies(h) { const o = {}; String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');

/* ---- CSRF: JSON + custom header + same-origin Origin; cookies are SameSite=Lax HttpOnly ---- */
function csrf(allowedOrigins) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-codepop') !== '1') return res.status(403).json({ error: 'csrf' });
    const origin = req.get('origin');
    if (origin) {
      const host = req.get('host'); let ok = false;
      try { ok = new URL(origin).host === host; } catch (e) { ok = false; }
      if (!ok && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'csrf_origin' });
    }
    next();
  };
}

/* ---- input helpers ---- */
const str = (v, max, min = 0) => { if (typeof v !== 'string') return null; const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); return s.length >= min && s.length <= max ? s : null; };
const int = (v, lo, hi, d = 0) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const safeText = s => String(s).replace(/[<>&"'`]/g, '');   // display names never carry markup

module.exports = { rateLimit, ipKey, userKey, parseCookies, sha, rid, csrf, str, int, safeText };
