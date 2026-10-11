/* Stephony — service worker : tout est mis en cache pour fonctionner hors-ligne */
const VERSION = 'stephony-v1.1.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/omr.js', 'js/omr-worker.js', 'js/symbols-model.js', 'js/synth.js', 'js/midi.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-64.png', 'assets/demo.jpg', 'assets/demo2.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // image partagée depuis la galerie Android (« Partager » → Stephony)
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('image');
      if (file) { const c = await caches.open('stephony-share'); await c.put('shared-image', new Response(file)); }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res.ok) { const c = await caches.open(VERSION); c.put(e.request, res.clone()); }
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
