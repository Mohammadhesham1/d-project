const CACHE = 'aldahih-v2';
const STATIC = ['./', 'index.html', 'app.js', 'releases.js', 'downloads.js', 'manifest.json', 'icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(STATIC.map(u => c.add(u)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  const isData = /\.json(\?|$)/.test(e.request.url);
  e.respondWith(
    isData
      // البيانات: الشبكة أولاً علشان الحلقات الجديدة تظهر
      ? fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })
          .catch(() => caches.match(e.request))
      : caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
          if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
          return res;
        }))
  );
});
