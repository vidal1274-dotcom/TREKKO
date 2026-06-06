/* =========================================================
   ROUTING-UTILS — Distances par route via OSRM
   =========================================================
   Provider : OSRM (open-source, auto-hébergeable)
   Cache    : localStorage, TTL 24 h
   Fallback : null — jamais de haversine présentée comme route

   Configuration (optionnelle, dans index.html ou un script de config) :
     window._TREKKO_OSRM_URL     = 'https://votre-serveur-osrm.example.com';
     window._TREKKO_OSRM_PROFILE = 'driving'; // 'driving' | 'cycling' | 'walking'

   URL publique de démo (développement uniquement, pas de SLA) :
     https://router.project-osrm.org
   ========================================================= */

/* ---- Configuration ---- */
function _cfg() {
  return {
    osrmUrl: (typeof window !== 'undefined' && window._TREKKO_OSRM_URL)
      || 'https://router.project-osrm.org',
    profile: (typeof window !== 'undefined' && window._TREKKO_OSRM_PROFILE)
      || 'driving',
    timeout:     8000,
    cacheTTL:    86_400_000, // 24 h
    cachePrefix: 'trekko_osrm_',
  };
}

/* ---- Sécurité URL ---- */
function _safeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? url : null;
  } catch { return null; }
}

/* ---- Validation coordonnées ---- */
export function isValidCoordinate(lat, lon) {
  const la = Number(lat), lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo) &&
    la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

function _normPoint(p) {
  const lat = Number(p?.lat);
  const lon = Number(p?.lon ?? p?.lng);
  return isValidCoordinate(lat, lon) ? { lat, lon } : null;
}

/* ---- Cache localStorage ---- */
function _cacheKey(points, profile) {
  const r = n => Math.round(n * 10000) / 10000;
  const coords = points.map(p => `${r(p.lat)},${r(p.lon)}`).join(';');
  return `${_cfg().cachePrefix}${profile}:${coords}`;
}

export function getCachedRouteDistance(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { data, exp } = JSON.parse(raw);
    if (Date.now() > exp) { localStorage.removeItem(key); return undefined; }
    return data; // null = échec mis en cache
  } catch { return undefined; }
}

export function setCachedRouteDistance(key, data) {
  try {
    const cfg = _cfg();
    localStorage.setItem(key, JSON.stringify({ data, exp: Date.now() + cfg.cacheTTL }));
  } catch { /* quota localStorage plein — silencieux */ }
}

export function clearRouteDistanceCache() {
  try {
    const prefix = _cfg().cachePrefix;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

/* ---- Requête OSRM ---- */
export function buildOsrmRouteUrl(points, profile) {
  const cfg = _cfg();
  const safeBase = _safeUrl(cfg.osrmUrl);
  if (!safeBase) return null;
  // OSRM attend : LON,LAT (longitude d'abord)
  const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
  return `${safeBase}/route/v1/${profile}/${coords}?overview=false&alternatives=false&steps=false`;
}

async function _fetchOsrm(points) {
  const cfg = _cfg();
  const url = buildOsrmRouteUrl(points, cfg.profile);
  if (!url) return null;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), cfg.timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const d = await res.json();
    if (d.code !== 'Ok' || !d.routes?.[0]) return null;
    const route = d.routes[0];
    return {
      totalKm: route.distance / 1000,                        // mètres → km
      legs:    (route.legs || []).map(l => l.distance / 1000) // une entrée par segment
    };
  } finally {
    clearTimeout(tid);
  }
}

/* ---- API publique ---- */

/**
 * Distance par route entre deux points.
 * Retourne km (Number) ou null si indisponible / erreur.
 * Résultat mis en cache 24 h.
 */
export async function getRouteDistance(lat1, lon1, lat2, lon2) {
  const p1 = _normPoint({ lat: lat1, lon: lon1 });
  const p2 = _normPoint({ lat: lat2, lon: lon2 });
  if (!p1 || !p2) return null;

  const cfg = _cfg();
  const key = _cacheKey([p1, p2], cfg.profile);
  const hit = getCachedRouteDistance(key);
  if (hit !== undefined) return hit;

  try {
    const r = await _fetchOsrm([p1, p2]);
    const km = (r?.totalKm > 0 && Number.isFinite(r.totalKm)) ? r.totalKm : null;
    setCachedRouteDistance(key, km);
    return km;
  } catch(e) {
    if (e.name !== 'AbortError') console.warn('[osrm] getRouteDistance:', e.message);
    return null; // pas de cache sur erreur réseau — retry possible
  }
}

/**
 * Distances inter-étapes pour une liste de points (OSRM multi-segments).
 * Retourne un tableau de longueur égale à points.length :
 *   [{distFromPrev: km|null, cumulative: km|null}, ...]
 * Le premier élément a toujours distFromPrev: null.
 */
export async function getRouteLegDistances(points) {
  const valid = (points || []).map(p => _normPoint(p));
  const n = valid.length;
  const empty = () => valid.map(() => ({ distFromPrev: null, cumulative: null }));
  if (n < 2) return n === 0 ? [] : [{ distFromPrev: null, cumulative: null }];

  const cfg = _cfg();

  // Si tous les points sont valides → une seule requête OSRM avec legs
  const allValid = valid.every(Boolean);
  if (allValid) {
    const key = _cacheKey(valid, cfg.profile);
    const hit = getCachedRouteDistance(key);
    if (hit !== undefined) return hit ?? empty();

    try {
      const r = await _fetchOsrm(valid);
      if (!r || r.legs.length !== n - 1) {
        setCachedRouteDistance(key, null);
        return empty();
      }
      const result = [{ distFromPrev: null, cumulative: null }];
      let cum = 0;
      for (const km of r.legs) {
        cum += km;
        result.push({ distFromPrev: km, cumulative: cum });
      }
      setCachedRouteDistance(key, result);
      return result;
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('[osrm] getRouteLegDistances:', e.message);
      return empty();
    }
  }

  // Points partiellement invalides → requêtes pairées pour les segments valides
  const result = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0 || !valid[i] || !valid[i - 1]) {
      result.push({ distFromPrev: null, cumulative: cum > 0 ? cum : null });
      continue;
    }
    const km = await getRouteDistance(valid[i-1].lat, valid[i-1].lon, valid[i].lat, valid[i].lon);
    if (km != null) cum += km;
    result.push({ distFromPrev: km, cumulative: cum > 0 ? cum : null });
  }
  return result;
}

/**
 * Formate une distance route.
 * '🚗 28 km'  |  '🚗 3,4 km'  |  '🚗 850 m'  |  null
 */
export function formatRouteDistance(km) {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  if (km < 1)  return `🚗 ${Math.round(km * 1000)} m`;
  if (km < 10) return `🚗 ${km.toFixed(1).replace('.', ',')} km`;
  return `🚗 ${Math.round(km)} km`;
}
