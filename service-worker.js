/* SERVICE WORKER v14 — cache propre, rechargement forcé à chaque update */
const CACHE_NAME = 'trekko-v14';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => {
        try { c.navigate(c.url); } catch (_) {}
      }))
  );
});

/* Toutes les requêtes passent au réseau sans cache */
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request)));
});
