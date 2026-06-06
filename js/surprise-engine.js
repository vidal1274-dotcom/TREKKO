/* =========================================================
   BLOC 01 — IMPORTS ET CONFIG
   ========================================================= */
import { getBestDeals } from './economy-engine.js';
import { estimateTripEnergyCost } from './trip-energy-estimator.js';
import { formatCurrency, buildGoogleMapsLink, escapeHTML, getWazeUrlForPlace } from './utils.js';
import { filterUnvisited } from './visited.js';
import { getRouteDistance, formatRouteDistance } from './routing-utils.js';
import { getStoredOrigin } from './geolocation.js';

/* =========================================================
   BLOC 02 — GÉNÉRATION D'UNE IDÉE SURPRISE
   ========================================================= */
export function generateSurprise(sites, vehicleProfile, options = {}) {
  const { maxBudget = 30, maxKm = 60, preferGratuit = false, avoidTolls = true } = options;

  let candidates = filterUnvisited([...sites]).filter(s => s.has_gps || s.distance_km != null);

  // Filtres préférentiels
  if (preferGratuit) candidates = candidates.filter(s => (s.budget_indicatif||'').toLowerCase().includes('gratu'));
  if (maxKm) candidates = candidates.filter(s => s.distance_km == null || s.distance_km <= maxKm);
  if (avoidTolls) {
    const sansPeage = candidates.filter(s => (s.vigilance||'').includes('sans péage'));
    if (sansPeage.length > 0) candidates = sansPeage;
  }

  // Filtrer par budget énergie
  if (vehicleProfile && vehicleProfile.vehicle_type !== 'unknown') {
    candidates = candidates.filter(site => {
      if (!site.distance_km) return true;
      const energy = estimateTripEnergyCost(site, site.distance_km, vehicleProfile);
      if (!energy?.total_cost) return true;
      return energy.total_cost <= maxBudget * 0.4; // énergie max 40% du budget
    });
  }

  if (candidates.length === 0) candidates = [...sites];

  // Sélection aléatoire parmi les meilleurs
  const pool = getBestDeals(candidates, Math.min(15, candidates.length));
  if (pool.length === 0) return null;

  const site = pool[Math.floor(Math.random() * Math.min(8, pool.length))];
  return buildSurpriseCard(site, vehicleProfile);
}

/* =========================================================
   BLOC 03 — CARTE SURPRISE
   ========================================================= */
function buildSurpriseCard(site, vehicleProfile) {
  const energy = vehicleProfile && site.distance_km
    ? estimateTripEnergyCost(site, site.distance_km, vehicleProfile)
    : null;

  const tags = [];
  if ((site.budget_indicatif||'').toLowerCase().includes('gratu')) tags.push('Gratuit 🟢');
  if ((site.vigilance||'').includes('sans péage')) tags.push('Sans péage 🔵');
  if (site.distance_km && site.distance_km < 30) tags.push('Très proche 📍');
  if (energy?.total_cost != null && energy.total_cost < 8) tags.push(`Trajet ~${formatCurrency(energy.total_cost)} 💰`);

  return {
    site,
    tags,
    energy,
    headline: buildSurpriseHeadline(site, energy),
    tip: buildSurpriseTip(site)
  };
}

/* =========================================================
   BLOC 04 — TITRES ET CONSEILS
   ========================================================= */
function buildSurpriseHeadline(site, energy) {
  const headlines = [
    `🎯 Et si on allait à ${site.destination} ?`,
    `✨ Coup de cœur : ${site.destination}`,
    `🗺️ Idée du jour : ${site.destination}`,
    `💡 Découvrir ${site.destination}`,
    `🎲 Surprise : ${site.destination}`
  ];
  return headlines[Math.floor(Math.random() * headlines.length)];
}

function buildSurpriseTip(site) {
  const tips = [];
  const budget = (site.budget_indicatif||'').toLowerCase();
  if (budget.includes('gratu')) tips.push('Entrée gratuite signalée.');
  if (budget.includes('pique') || (site.programme_court||'').toLowerCase().includes('pique')) tips.push('Idéal pour un pique-nique.');
  if ((site.niveau_marche||'').toLowerCase().includes('facile')) tips.push('Marche facile.');
  if ((site.vigilance||'').includes('sans péage')) tips.push('Pas de péage sur le trajet probable.');
  return tips.join(' ') || 'Découverte à confirmer sur place.';
}

/* =========================================================
   BLOC 05 — MINI-PROGRAMME SURPRISE
   ========================================================= */
export function buildSurpriseMiniProgram(site) {
  const steps = [];
  steps.push({ time: '09h00', label: `Départ depuis Nages vers ${site.destination}`, icon: '🚗' });
  if (site.distance_km && site.distance_km > 30) {
    steps.push({ time: '~10h00', label: `Arrivée à ${site.destination}`, icon: '📍' });
  } else {
    steps.push({ time: '~09h30', label: `Arrivée à ${site.destination}`, icon: '📍' });
  }
  if (site.programme_court) {
    steps.push({ time: '10h00–13h00', label: site.programme_court.substring(0, 100), icon: '🎯' });
  }
  steps.push({ time: '13h00', label: 'Pause repas (pique-nique ou restaurant)', icon: '🍽️' });
  steps.push({ time: '14h00–17h00', label: 'Suite de la visite ou balade', icon: '🚶' });
  steps.push({ time: '17h00', label: 'Retour vers Nages', icon: '🏠' });
  return steps;
}

/* =========================================================
   BLOC 06 — RENDU HTML (carte compacte mobile-first)
   ========================================================= */

// Accordéon accessible depuis les onclick inline
window.__toggleSurpriseDetails = function(detailsId, btn) {
  const el = document.getElementById(detailsId);
  if (!el) return;
  const isHidden = el.classList.toggle('hidden');
  btn.setAttribute('aria-expanded', String(!isHidden));
  btn.textContent = isHidden ? 'Voir détails ▾' : 'Masquer ▴';
};

export async function renderSurpriseCard(card) {
  if (!card) return '<p class="info-disclaimer">Aucune surprise disponible avec ces critères.</p>';
  const { site, tip } = card;

  // --- Titre (échappé)
  const title = escapeHTML(site.destination || '—');

  // --- Distance route (OSRM) — null si indisponible
  const origin  = getStoredOrigin();
  const roadKm  = await getRouteDistance(origin.lat, origin.lon, site.lat, site.lon);
  const distStr = formatRouteDistance(roadKm); // '🚗 28 km' ou null

  // --- Ligne méta : distance · Gratuit (valeurs numériques/constantes, pas d'injection)
  const isGratuit = site.gratuit || (site.budget_indicatif || '').toLowerCase().includes('gratu');
  const priceStr  = isGratuit ? 'Gratuit' : null;
  const metaLine  = [distStr, priceStr].filter(Boolean).join(' · ');

  // --- Tags courts depuis type_sortie (échappés, max 3)
  const rawTags = (site.type_sortie || '').split(/[\/,]/).map(p => p.trim()).filter(Boolean).slice(0, 3);
  const tagsHtml = rawTags.map(t => `<span class="sc-tag">${escapeHTML(t)}</span>`).join('');

  // --- Bouton Maps (buildGoogleMapsLink utilise encodeURIComponent sur le nom + guard lat/lon)
  const mapsUrl = buildGoogleMapsLink(site.lat, site.lon, site.destination);
  const mapsBtn = mapsUrl
    ? `<a href="${escapeHTML(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="sc-action-btn sc-maps-btn">🗺️ Ouvrir dans Maps</a>`
    : '';

  // --- Bouton Waze (deep link officiel uniquement)
  const wazeUrl = getWazeUrlForPlace(site);
  const wazeBtn = wazeUrl
    ? `<a href="${escapeHTML(wazeUrl)}" target="_blank" rel="noopener noreferrer" class="sc-action-btn sc-waze-btn">🚗 Waze</a>`
    : '';

  // --- Lien Photos (encodeURIComponent + escapeHTML sur l'URL finale)
  const photoQuery = encodeURIComponent(`${site.destination} ${site.secteur || ''} photos`);
  const photoUrl   = `https://www.google.com/search?tbm=isch&q=${photoQuery}`;
  const photoBtn   = `<a href="${escapeHTML(photoUrl)}" target="_blank" rel="noopener noreferrer" class="sc-action-btn sc-photo-btn">📷 Photos</a>`;

  // --- Description et conseil (échappés, zone dépliée uniquement)
  const descHtml = site.programme_court
    ? `<p class="sc-desc">${escapeHTML(site.programme_court.substring(0, 220))}</p>`
    : '';
  const tipHtml  = tip ? `<p class="sc-tip">💡 ${escapeHTML(tip)}</p>` : '';

  // site.id = clé alphanumérique+underscore depuis sites.json — sûre comme attribut id/onclick
  const detailsId = `sc-details-${site.id}`;

  return `
    <div class="sc-card">
      <div class="sc-title">✨ ${title}</div>
      ${metaLine ? `<div class="sc-meta">${metaLine}</div>` : ''}
      ${tagsHtml  ? `<div class="sc-tags">${tagsHtml}</div>`   : ''}
      <button class="sc-toggle-btn" onclick="window.__toggleSurpriseDetails('${detailsId}', this)" aria-expanded="false">
        Voir détails ▾
      </button>
      <div id="${detailsId}" class="sc-details hidden" aria-hidden="true">
        ${descHtml}
        ${tipHtml}
        <div class="sc-actions">
          ${mapsBtn}
          ${wazeBtn}
          ${photoBtn}
        </div>
      </div>
    </div>`;
}
