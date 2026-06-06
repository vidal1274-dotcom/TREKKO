/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { OVERPASS_ENDPOINT, THEMATIC_CATEGORIES } from './config.js';
import { cacheSet, cacheGet } from './storage.js';
import { escapeHTML, buildGoogleMapsLink, buildWazeLink } from './utils.js';
import { getStoredOrigin } from './geolocation.js';
import { getRouteDistance, formatRouteDistance } from './routing-utils.js';

// AbortController par catégorie — annule les requêtes obsolètes
const _controllers = {};

/* =========================================================
   BLOC 02 — REQUÊTE OVERPASS
   ========================================================= */
export async function fetchNearbyPlaces(lat, lon, categoryId, radiusM = 5000) {
  const cat = THEMATIC_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return [];

  const cacheKey = `overpass_${categoryId}_${Math.round(lat*100)}_${Math.round(lon*100)}_${radiusM}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Annuler la requête précédente pour cette catégorie
  if (_controllers[categoryId]) {
    _controllers[categoryId].abort();
  }
  const controller = new AbortController();
  _controllers[categoryId] = controller;

  const [key, value] = cat.tags.split('=');
  const query = `[out:json][timeout:10];node["${key}"="${value}"](around:${radiusM},${lat},${lon});out body 20;`;

  try {
    const resp = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const results = (data.elements || []).map(el => ({
      id: el.id,
      lat: el.lat,
      lon: el.lon,
      name: el.tags?.name || cat.label,
      type: categoryId,
      icon: cat.icon,
      tags: el.tags
    }));
    await cacheSet(cacheKey, results, 3600000);
    return results;
  } catch(e) {
    if (e.name === 'AbortError') return []; // requête annulée — silencieux
    console.warn('[nearby] Overpass error', e.message);
    return [];
  } finally {
    if (_controllers[categoryId] === controller) delete _controllers[categoryId];
  }
}

/* =========================================================
   BLOC 03 — RENDU HTML RÉSULTATS
   ========================================================= */
export async function renderNearbyResults(places, category) {
  if (!places.length) return `<p style="color:#aaa;font-size:13px">Aucun résultat trouvé dans ce rayon. <span class="verify-tag">À vérifier</span></p>`;

  const origin = getStoredOrigin();
  const visible = places.slice(0, 10);

  // Fetch OSRM distances en parallèle (max 5 requêtes simultanées pour ne pas surcharger)
  const distances = await Promise.all(
    visible.map(p =>
      (origin?.lat && p.lat && p.lon)
        ? getRouteDistance(origin.lat, origin.lon, p.lat, p.lon)
        : Promise.resolve(null)
    )
  );

  return visible.map((p, i) => {
    const mapsUrl  = buildGoogleMapsLink(p.lat, p.lon, p.name);
    const wazeUrl  = buildWazeLink(p.lat, p.lon);
    const distStr  = formatRouteDistance(distances[i]); // '🚗 X km' ou null
    return `
    <div class="site-card">
      <div class="site-name">${p.icon} ${escapeHTML(p.name)}</div>
      <div class="site-sector" style="font-size:12px">
        ${distStr ? `<span class="distance-badge">${distStr}</span> · ` : ''}Source : OpenStreetMap — <span class="verify-tag">à vérifier</span>
      </div>
      <div class="nearby-actions">
        ${mapsUrl ? `<a href="${escapeHTML(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="nearby-btn nearby-btn-maps">🗺️ Maps</a>` : ''}
        ${wazeUrl ? `<a href="${escapeHTML(wazeUrl)}" target="_blank" rel="noopener noreferrer" class="nearby-btn nearby-btn-waze">🚗 Waze</a>` : ''}
      </div>
    </div>`;
  }).join('');
}
