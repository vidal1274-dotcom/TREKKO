/* SERVICE WORKER v11 — supprime tous les caches, aucune interception réseau */
const CACHE_NAME = 'trekko-v11';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Pas de fetch handler → toutes les requêtes passent au réseau directement */
