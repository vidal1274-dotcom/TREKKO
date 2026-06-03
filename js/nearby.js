/* =========================================================
   BLOC POI — IMPORTS ET CONTRÔLEURS
   _controllers map categoryId → AbortController actif.
   Chaque nouvelle requête annule la précédente pour éviter
   les réponses périmées (race condition).
   ========================================================= */
import { OVERPASS_ENDPOINT, THEMATIC_CATEGORIES } from './config.js';
import { cacheSet, cacheGet } from './storage.js';

// AbortController par catégorie — annule les requêtes obsolètes
const _controllers = {};

/* =========================================================
   BLOC POI — REQUÊTE OVERPASS (AbortController)
   Requête POST vers l'API Overpass avec cache 1 h (cacheSet/Get).
   AbortController par catégorie annule les requêtes obsolètes.
   Normalise les éléments OSM en objets {id, lat, lon, name, type}.
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
   BLOC POI — RENDU RÉSULTATS
   Génère les cartes HTML (max 10) avec lien Google Maps.
   Affiche un message "Aucun résultat" si le tableau est vide.
   buildGoogleMapsLink() reste privée (helper interne).
   ========================================================= */
export function renderNearbyResults(places, category) {
  if (!places.length) return `<p style="color:#aaa;font-size:13px">Aucun résultat trouvé dans ce rayon. <span class="verify-tag">À vérifier</span></p>`;
  return places.slice(0, 10).map(p => `
    <div class="site-card" style="cursor:pointer" onclick="window.open('${buildGoogleMapsLink(p.lat,p.lon,p.name)}','_blank')">
      <div class="site-name">${p.icon} ${p.name}</div>
      <div class="site-sector" style="font-size:12px">Source : OpenStreetMap — <span class="verify-tag">à vérifier</span></div>
    </div>`).join('');
}

function buildGoogleMapsLink(lat, lon, name) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || '')}&query_place_id=${lat},${lon}`;
}
