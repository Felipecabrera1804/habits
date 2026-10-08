// Service worker: caches the app so it works fully offline.
// Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'habits-v2';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive when online), fall back to cache.
// Only successful responses replace the cache; if the site is down or
// returns an error page (404, 500...), the cached app keeps being used.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = () => caches.match(e.request, { ignoreSearch: true });
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      }
      return (await cached()) || res;
    } catch {
      return (await cached()) || Response.error();
    }
  })());
});
