const CACHE_NAME = 'ladivisa-v3';
const META_CACHE = 'ladivisa-meta';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== META_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetPath = (e.notification.data && e.notification.data.url) || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.navigate(targetUrl).then((c) => (c ? c.focus() : client.focus()));
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag !== 'check-bcv-rate') return;
  e.waitUntil((async () => {
    try {
      const res = await fetch('/api/bcv?t=' + Date.now());
      if (!res.ok) return;
      const data = await res.json();
      const curr = Number(data && data.usd);
      if (!curr || !Number.isFinite(curr)) return;

      const meta = await caches.open(META_CACHE);
      const prevRes = await meta.match('/__meta/bcv');
      const prev = prevRes ? Number(await prevRes.text()) : null;

      await meta.put('/__meta/bcv', new Response(String(curr)));
      if (!prev || !Number.isFinite(prev) || Math.abs(curr - prev) < 0.01) return;

      const diff = Math.abs(curr - prev).toFixed(2).replace('.', ',');
      const prevTxt = prev.toFixed(2).replace('.', ',');
      const currTxt = curr.toFixed(2).replace('.', ',');
      const up = curr > prev;

      await self.registration.showNotification(
        up ? '📈 Subió el Dólar BCV' : '📉 Bajó el Dólar BCV',
        {
          body: `Pasó de Bs ${prevTxt} a Bs ${currTxt} (${up ? '+' : '-'}${diff} Bs). Toca para calcular.`,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'bcv-rate-change',
          renotify: true,
          data: { url: '/#convertidor' }
        }
      );
    } catch (err) {}
  })());
});
