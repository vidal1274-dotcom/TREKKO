/* =========================================================
   BLOC 01 — INDEXEDDB SETUP
   ========================================================= */
const DB_NAME = 'sorties-nimes-db';
const DB_VERSION = 2;
let _db = null;

const STORES = {
  SITES: 'sites',
  PHOTOS: 'photos',
  VEHICLE: 'vehicle',
  NAS_CONFIG: 'nas_config',
  SYNC_QUEUE: 'sync_queue',
  CACHE: 'cache',
  GPS_CORRECTIONS: 'gps_corrections'
};

export { STORES };

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.SITES)) {
        db.createObjectStore(STORES.SITES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
        const ps = db.createObjectStore(STORES.PHOTOS, { keyPath: 'id' });
        ps.createIndex('site_id', 'site_id', { unique: false });
        ps.createIndex('sync_status', 'sync_status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.VEHICLE)) {
        db.createObjectStore(STORES.VEHICLE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.NAS_CONFIG)) {
        db.createObjectStore(STORES.NAS_CONFIG, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const sq = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        sq.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        db.createObjectStore(STORES.CACHE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.GPS_CORRECTIONS)) {
        db.createObjectStore(STORES.GPS_CORRECTIONS, { keyPath: 'site_id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

/* =========================================================
   BLOC 02 — CRUD GÉNÉRIQUE
   ========================================================= */
export async function dbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* =========================================================
   BLOC 03 — LOCALSTORAGE (paramètres légers)
   ========================================================= */
export function lsSet(key, value) {
  try { localStorage.setItem(`sorties_${key}`, JSON.stringify(value)); return true; }
  catch(e) { console.warn('[storage] localStorage write failed', e); return false; }
}

export function lsGet(key, defaultVal = null) {
  try {
    const raw = localStorage.getItem(`sorties_${key}`);
    return raw != null ? JSON.parse(raw) : defaultVal;
  } catch(e) { return defaultVal; }
}

export function lsDel(key) {
  try { localStorage.removeItem(`sorties_${key}`); } catch(e) {}
}

/* =========================================================
   BLOC 04 — CACHE JSON
   ========================================================= */
export async function cacheSet(key, data, ttlMs = 3600000) {
  await dbPut(STORES.CACHE, { key, data, expires_at: Date.now() + ttlMs });
}

export async function cacheGet(key) {
  const record = await dbGet(STORES.CACHE, key);
  if (!record) return null;
  if (Date.now() > record.expires_at) { await dbDelete(STORES.CACHE, key); return null; }
  return record.data;
}

/* =========================================================
   BLOC 05 — CORRECTIONS GPS
   ========================================================= */
export async function saveGpsCorrection(siteId, lat, lon) {
  await dbPut(STORES.GPS_CORRECTIONS, { site_id: siteId, lat, lon, corrected_at: new Date().toISOString() });
}

export async function loadGpsCorrection(siteId) {
  return dbGet(STORES.GPS_CORRECTIONS, siteId);
}

export async function loadAllGpsCorrections() {
  return dbGetAll(STORES.GPS_CORRECTIONS);
}
