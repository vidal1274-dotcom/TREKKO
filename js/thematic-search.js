/* =========================================================
   BLOC 01 — IMPORTS ET CONFIG
   ========================================================= */
import { THEMATIC_CATEGORIES, OVERPASS_ENDPOINT } from './config.js';
import { fetchNearbyPlaces, renderNearbyResults } from './nearby.js';
import { getMap } from './map.js?v=3';

/* =========================================================
   BLOC 02 — RECHERCHE THÉMATIQUE PAR CATÉGORIE
   ========================================================= */
export async function searchThematic(lat, lon, categoryId, radiusM = 5000) {
  const cat = THEMATIC_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return { results: [], category: null };
  const results = await fetchNearbyPlaces(lat, lon, categoryId, radiusM);
  return { results, category: cat };
}

/* =========================================================
   BLOC 03 — AFFICHAGE SUR CARTE
   ========================================================= */
export function addThematicMarkersToMap(places) {
  const map = getMap();
  if (!map || !places.length) return;
  places.forEach(place => {
    L.marker([place.lat, place.lon])
      .bindPopup(`<b>${place.icon} ${place.name}</b><br><span style="font-size:11px;color:#aaa">Source: OpenStreetMap — à vérifier</span>`)
      .addTo(map);
  });
}

/* =========================================================
   BLOC 04 — CATÉGORIES DISPONIBLES
   ========================================================= */
export function getThematicCategories() {
  return THEMATIC_CATEGORIES;
}

export function renderCategoryButtons(container, onCategorySelect) {
  if (!container) return;
  container.innerHTML = THEMATIC_CATEGORIES.map(cat => `
    <button class="filter-chip" data-cat="${cat.id}" title="${cat.label}">
      ${cat.icon} ${cat.label}
    </button>`).join('');

  container.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      onCategorySelect(btn.dataset.cat);
    });
  });
}

/* =========================================================
   BLOC 05 — RECHERCHE BORNE RECHARGE (cas spécial)
   ========================================================= */
export async function searchChargingStationsNearby(lat, lon, radiusM = 10000) {
  const results = await fetchNearbyPlaces(lat, lon, 'recharge', radiusM);
  return {
    results,
    googleMapsUrl: `https://www.google.com/maps/search/borne+recharge+electrique/@${lat},${lon},13z`,
    chargemap: `https://chargemap.com/`,
    disclaimer: '⚠️ Données OpenStreetMap — vérifiez disponibilité et tarif sur place ou via Chargemap.'
  };
}
