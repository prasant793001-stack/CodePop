/* CodePop service worker: the app shell works offline (free coding needs no network); the API is never cached. */
const V = 'codepop-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const store = (req, res) => { if (res && res.ok && res.type === 'basic') { const c = res.clone(); caches.open(V).then(x => x.put(req, c)).catch(() => { }); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/join/') || u.pathname === '/healthz') return;      // always live
  if (u.pathname === '/config.js') { e.respondWith(fetch(r).then(res => store(r, res)).catch(() => caches.match(r))); return; } // last known mode when offline
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(res => { if (res.ok) store(new Request('/'), res); return res; }).catch(() => caches.match('/'))); return; }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => store(r, res))));
});
