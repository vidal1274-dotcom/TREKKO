/* SERVICE WORKER v13 — cache propre, notifie l'UI à la mise à jour */
const CACHE_NAME = 'trekko-v13';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Notifier tous les onglets ouverts qu'une nouvelle version est active
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
        });
      })
  );
});

/* Navigation HTML : bypass total du cache navigateur */
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
  }
});
