/* =========================================================
   offline-routes-store.js — Stockage IndexedDB des parcours
   randonnée téléchargés (base dédiée, isolée de storage.js)
   ========================================================= */
import { safeText, isValidLatLon, parseSafeJson, generateId } from './utils.js';

const ORS_DB_NAME    = 'trekko-offline-routes-db';
const ORS_STORE      = 'offlineRoutes';
const ORS_VERSION    = 1;
const SCHEMA_VERSION = 1;
const MAX_ROUTES     = 50;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 Mo

let _db = null;

/* ── Ouverture DB dédiée ──────────────────────────────────── */
async function openOfflineRoutesDb() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ORS_DB_NAME, ORS_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ORS_STORE)) {
        db.createObjectStore(ORS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

/* ── Helpers internes ─────────────────────────────────────── */
function _safeNumber(v, fallback = null) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function _safeCoordPair(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const lon = _safeNumber(pair[0]);
  const lat = _safeNumber(pair[1]);
  if (lon === null || lat === null) return null;
  if (!isValidLatLon(lat, lon)) return null;
  return [lon, lat];
}

function _safeCoordinates(coords) {
  if (!Array.isArray(coords)) return [];
  return coords.map(_safeCoordPair).filter(Boolean);
}

function _computeBbox(coords) {
  if (!coords || coords.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function _getAll(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(ORS_STORE, 'readonly').objectStore(ORS_STORE).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

/* ── Validation ───────────────────────────────────────────── */
export function validateOfflineHikingRoute(route) {
  if (!route || typeof route !== 'object') return { valid: false, error: 'Objet invalide' };
  if (!route.id || typeof route.id !== 'string') return { valid: false, error: 'id manquant' };
  if (!route.title || typeof route.title !== 'string' || !route.title.trim()) {
    return { valid: false, error: 'title manquant ou vide' };
  }
  if (route.schemaVersion !== SCHEMA_VERSION) {
    return { valid: false, error: `schemaVersion invalide (attendu ${SCHEMA_VERSION})` };
  }
  return { valid: true, error: null };
}

/* ── Normalisation (sanitise + structure) ─────────────────── */
export function normalizeHikingRouteForOffline(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const now = new Date().toISOString();

  const VALID_TYPES      = ['hike', 'walk', 'trail'];
  const VALID_DIFFICULTY = ['facile', 'moyen', 'difficile', 'unknown'];
  const VALID_SOURCES    = ['osm', 'trekko', 'import', 'manual'];

  // Géométrie GeoJSON LineString
  let geometry = null;
  if (
    raw.geometry?.type === 'LineString' &&
    Array.isArray(raw.geometry.coordinates)
  ) {
    const safeCoords = _safeCoordinates(raw.geometry.coordinates);
    if (safeCoords.length >= 2) {
      geometry = { type: 'LineString', coordinates: safeCoords };
    }
  }

  // Point de départ
  let startPoint = null;
  const rawSp = raw.startPoint;
  if (rawSp) {
    const spLat = _safeNumber(rawSp.lat);
    const spLon = _safeNumber(rawSp.lon);
    if (spLat !== null && spLon !== null && isValidLatLon(spLat, spLon)) {
      startPoint = {
        label: safeText(rawSp.label, 'Départ'),
        lat: spLat,
        lon: spLon
      };
    }
  }
  if (!startPoint && geometry) {
    const [lon, lat] = geometry.coordinates[0];
    startPoint = { label: 'Départ', lat, lon };
  }

  const status = geometry ? 'complete' : (startPoint ? 'partial' : 'partial');
  const bbox   = geometry ? _computeBbox(geometry.coordinates) : null;

  return {
    id:            safeText(raw.id) || generateId('offline-route'),
    schemaVersion: SCHEMA_VERSION,
    title:         safeText(raw.title, 'Parcours sans titre'),
    source:        VALID_SOURCES.includes(raw.source) ? raw.source : 'manual',
    sourceLabel:   safeText(raw.sourceLabel, 'Importé'),
    sourceUrl:     null,
    status,
    type:          VALID_TYPES.includes(raw.type) ? raw.type : 'hike',
    distanceKm:    _safeNumber(raw.distanceKm),
    durationMin:   _safeNumber(raw.durationMin),
    difficulty:    VALID_DIFFICULTY.includes(raw.difficulty) ? raw.difficulty : 'unknown',
    startPoint,
    geometry,
    waypoints:     [],
    bbox,
    downloadedAt:  safeText(raw.downloadedAt) || now,
    updatedAt:     now,
    notes:         safeText(raw.notes, '')
  };
}

/* ── Migration (schéma futur) ─────────────────────────────── */
export function migrateOfflineRoute(route) {
  if (!route || typeof route !== 'object') return null;
  if (route.schemaVersion === SCHEMA_VERSION) return route;
  // Placeholder pour migrations futures v1 → v2+
  return null;
}

/* ── Sauvegarde ───────────────────────────────────────────── */
export async function saveOfflineHikingRoute(route) {
  const normalized = normalizeHikingRouteForOffline(route);
  if (!normalized) throw new Error('Impossible de normaliser le parcours');

  const { valid, error } = validateOfflineHikingRoute(normalized);
  if (!valid) throw new Error(`Parcours invalide : ${error}`);

  const db = await openOfflineRoutesDb();
  const existing = await _getAll(db);
  const isUpdate = existing.some(r => r.id === normalized.id);

  if (!isUpdate && existing.length >= MAX_ROUTES) {
    throw new Error(`Limite de ${MAX_ROUTES} parcours téléchargés atteinte.`);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORS_STORE, 'readwrite');
    tx.objectStore(ORS_STORE).put(normalized);
    tx.oncomplete = () => resolve(normalized);
    tx.onerror    = e => reject(e.target.error);
  });
}

/* ── Liste tous les parcours ──────────────────────────────── */
export async function getOfflineHikingRoutes() {
  try {
    const db     = await openOfflineRoutesDb();
    const routes = await _getAll(db);
    return routes
      .map(r => r.schemaVersion === SCHEMA_VERSION ? r : migrateOfflineRoute(r))
      .filter(Boolean)
      .sort((a, b) => new Date(b.downloadedAt || 0) - new Date(a.downloadedAt || 0));
  } catch { return []; }
}

/* ── Récupère un parcours par id ──────────────────────────── */
export async function getOfflineHikingRoute(id) {
  try {
    const db = await openOfflineRoutesDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(ORS_STORE, 'readonly').objectStore(ORS_STORE).get(String(id));
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  } catch { return null; }
}

/* ── Suppression ──────────────────────────────────────────── */
export async function deleteOfflineHikingRoute(id) {
  const db = await openOfflineRoutesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORS_STORE, 'readwrite');
    tx.objectStore(ORS_STORE).delete(String(id));
    tx.oncomplete = () => resolve(true);
    tx.onerror    = e => reject(e.target.error);
  });
}

/* ── Vider tous les parcours ──────────────────────────────── */
export async function clearOfflineHikingRoutes() {
  const db = await openOfflineRoutesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORS_STORE, 'readwrite');
    tx.objectStore(ORS_STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror    = e => reject(e.target.error);
  });
}

/* ── Vérifie disponibilité hors ligne ─────────────────────── */
export async function isRouteAvailableOffline(id) {
  const route = await getOfflineHikingRoute(id);
  return !!route;
}

/* ── Estimation du stockage utilisé ──────────────────────── */
export async function estimateOfflineStorageUsage() {
  try {
    const routes = await getOfflineHikingRoutes();
    const bytes  = JSON.stringify(routes).length * 2; // approximation UTF-16
    const kb     = Math.round(bytes / 1024);
    return { routes: routes.length, kb, limitKb: 5120, percent: Math.min(100, Math.round(kb / 51.2)) };
  } catch { return { routes: 0, kb: 0, limitKb: 5120, percent: 0 }; }
}

/* ── Export JSON sécurisé ─────────────────────────────────── */
export async function exportOfflineRouteAsJson(id) {
  const route = await getOfflineHikingRoute(id);
  if (!route) throw new Error('Parcours introuvable');

  const blob = new Blob([JSON.stringify(route, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `trekko-parcours-${safeText(route.id, 'export')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Import JSON sécurisé ─────────────────────────────────── */
export async function importOfflineRouteFromJson(file) {
  if (!file || !(file instanceof File)) throw new Error('Fichier invalide');
  if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Seuls les fichiers .json sont acceptés');
  if (file.size > MAX_FILE_BYTES) throw new Error('Fichier trop volumineux (max 2 Mo)');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const raw = parseSafeJson(e.target.result, null);
        if (!raw || typeof raw !== 'object') throw new Error('JSON invalide ou mal formé');
        if (Array.isArray(raw)) throw new Error('Le fichier doit contenir un seul parcours, pas un tableau');
        const saved = await saveOfflineHikingRoute(raw);
        resolve(saved);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
    reader.readAsText(file, 'utf-8');
  });
}
