/* SERVICE WORKER v15 */
const CACHE_NAME = 'trekko-v15';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Toutes les requêtes : réseau direct, pas de cache navigateur */
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' }).catch(() => fetch(event.request))
  );
});
