/* =========================================================
   BLOC 01 — IMPORTS ET CONSTANTES
   ========================================================= */
import { formatCurrency, haversineDistance, escapeHTML, formatDistApprox } from './utils.js';
import { estimateTripEnergyCost } from './trip-energy-estimator.js';
import { lsGet, lsSet, lsDel } from './storage.js';
import { UCHAUD_COORDS } from './config.js';
import { getStoredOrigin } from './geolocation.js';
import { filterUnvisited } from './visited.js?v=25';

const LS_KEY          = 'day_plan';
const VISIT_MIN       = 90;
const MEAL_MIN        = 60;
const DEPART_HOUR_MIN = 9 * 60;

/** Profils de vitesse selon le type de route. */
export const TRAVEL_SPEEDS = {
  city:     { label: 'Ville / local',     kmh: 35 },
  road:     { label: 'Route mixte',        kmh: 60 },
  mixed:    { label: 'Route + nationale',  kmh: 70 },
  highway:  { label: 'Autoroute',          kmh: 95 },
  mountain: { label: 'Montagne / lente',   kmh: 40 }
};

/* =========================================================
   BLOC 02 — ORIGINE GPS INTELLIGENTE
   ========================================================= */
/**
 * Retourne les meilleures coordonnées de départ disponibles :
 * 1. GPS temps réel (window._currentGpsCoords si disponible)
 * 2. Dernière position connue (localStorage via geolocation.js)
 * 3. Fallback Uchaud / Nages
 */
export function getBestOriginCoords() {
  // 1. GPS temps réel exposé par app.js — != null pour éviter le falsy-zero (lat=0 / lon=0)
  const gps = window._currentGpsCoords;
  if (gps?.lat != null && gps?.lon != null) {
    return { ...gps, label: 'position actuelle GPS', source: 'gps' };
  }
  // 2. Dernière position connue
  const stored = getStoredOrigin();
  if (stored && stored.lat !== UCHAUD_COORDS[0]) {
    return { lat: stored.lat, lon: stored.lon, label: stored.label || 'position enregistrée', source: 'stored' };
  }
  // 3. Fallback
  return { lat: UCHAUD_COORDS[0], lon: UCHAUD_COORDS[1], label: 'position par défaut (Nages)', source: 'default' };
}

/* =========================================================
   BLOC 03 — GÉNÉRATION AUTOMATIQUE (nearest-neighbor)
   ========================================================= */
/**
 * Algorithme nearest-neighbor isolé — permettra un vrai routage plus tard.
 * @param {Array} pool — sites candidats avec lat/lon
 * @param {number} originLat
 * @param {number} originLon
 * @param {number} maxStops
 * @returns {Array} sites ordonnés
 */
function _nearestNeighbor(pool, originLat, originLon, maxStops) {
  const selected  = [];
  const remaining = [...pool];
  let curLat = originLat, curLon = originLon;
  const count = Math.min(maxStops, remaining.length);

  for (let i = 0; i < count; i++) {
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((s, idx) => {
      const d = haversineDistance(curLat, curLon, s.lat, s.lon);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    curLat = picked.lat; curLon = picked.lon;
  }
  return selected;
}

export function generateDayPlan(sites, vehicleProfile, options = {}) {
  const {
    maxKm        = 80,
    minStops     = 3,
    maxStops     = 5,
    speedProfile = 'mixed'
    // avoidTolls : réservé — actuellement non implémenté dans le nearest-neighbor
  } = options;

  const speedKmh = TRAVEL_SPEEDS[speedProfile]?.kmh ?? TRAVEL_SPEEDS.mixed.kmh;
  const speedLabel = TRAVEL_SPEEDS[speedProfile]?.label ?? 'Route mixte';

  // Origine GPS intelligente
  const origin = getBestOriginCoords();
  const originLat = origin.lat;
  const originLon = origin.lon;

  // 1. Candidats : GPS requis + dans le rayon + non visités
  const candidates = filterUnvisited(sites).filter(s =>
    s.has_gps && s.lat && s.lon &&
    (s.distance_km == null || s.distance_km <= maxKm)
  );

  if (candidates.length === 0) return null;

  // 2. Top 20 par eco_score
  const pool = [...candidates]
    .sort((a, b) => (b.eco_score || 0) - (a.eco_score || 0))
    .slice(0, 20);

  // 3. Nearest-neighbor depuis l'origine
  const selected = _nearestNeighbor(pool, originLat, originLon, maxStops);
  if (selected.length < minStops) return null;

  // 4. Itinéraire chronologique
  const steps = [];
  let cur = DEPART_HOUR_MIN;
  steps.push({
    time: _fmt(cur), icon: '🚗',
    label: `Départ depuis ${escapeHTML(origin.label)}`,
    type: 'depart'
  });

  let totalKm = 0;
  let prevLat = originLat, prevLon = originLon;
  let mealInserted = false;

  selected.forEach((site, idx) => {
    const segKm   = haversineDistance(prevLat, prevLon, site.lat, site.lon) * 1.2;
    const travMin = Math.round((segKm / speedKmh) * 60);
    totalKm += segKm;
    cur += travMin;

    steps.push({
      time: _fmt(cur), icon: '📍',
      label: `Arrivée : ${site.destination}`,
      type: 'arrival', site,
      travelKm: Math.round(segKm), travelMin: travMin
    });

    cur += 15; // parking
    if (site.programme_court) {
      steps.push({
        time: _fmt(cur), icon: '🎯',
        label: site.programme_court.substring(0, 120),
        type: 'activity', site
      });
    }
    cur += VISIT_MIN;

    if (!mealInserted && cur >= 12 * 60 && cur < 14 * 60 && idx < selected.length - 1) {
      steps.push({ time: _fmt(cur), icon: '🍽️', label: 'Pause repas (restaurant ou pique-nique)', type: 'meal' });
      cur += MEAL_MIN;
      mealInserted = true;
    }

    prevLat = site.lat; prevLon = site.lon;
  });

  // Retour
  const retKm  = haversineDistance(prevLat, prevLon, originLat, originLon) * 1.2;
  const retMin = Math.round((retKm / speedKmh) * 60);
  totalKm += retKm;
  cur += retMin;
  steps.push({ time: _fmt(cur), icon: '🏠', label: `Retour vers ${escapeHTML(origin.label)} (≈ ${Math.round(retKm)} km)`, type: 'return' });

  // 5. Coût énergie
  let energyCost = null;
  if (vehicleProfile && vehicleProfile.vehicle_type !== 'unknown') {
    const est = estimateTripEnergyCost(null, totalKm / 2, vehicleProfile);
    energyCost = est?.total_cost ?? null;
  }

  return {
    sites: selected,
    steps,
    totalDistanceKm: Math.round(totalKm),
    totalDurationMin: cur - DEPART_HOUR_MIN,
    energyCost,
    originLabel: origin.label,
    originSource: origin.source,
    speedLabel,
    generatedAt: new Date().toISOString()
  };
}

function _fmt(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
}

function _fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
}

/* =========================================================
   BLOC 04 — PERSISTANCE LOCALSTORAGE
   ========================================================= */
export function saveDayPlan(plan) {
  lsSet(LS_KEY, {
    ...plan,
    sites: plan.sites.map(s => ({
      id: s.id, destination: s.destination,
      lat: s.lat, lon: s.lon, has_gps: s.has_gps,
      distance_km: s.distance_km, eco_score: s.eco_score,
      programme_court: s.programme_court,
      budget_indicatif: s.budget_indicatif
    }))
  });
}

export function loadSavedDayPlan() { return lsGet(LS_KEY, null); }
export function deleteSavedDayPlan() { lsDel(LS_KEY); }

/* =========================================================
   BLOC 05 — RENDU HTML
   ========================================================= */
export function renderDayPlan(plan) {
  if (!plan || !plan.steps) return '<p class="dp-disclaimer">Aucun programme disponible.</p>';

  const stepsHtml = plan.steps.map(s => {
    let legHtml = '';
    if (s.travelKm && s.type === 'arrival') {
      const wazeUrl = s.site?.lat ? `https://waze.com/ul?ll=${s.site.lat},${s.site.lon}&navigate=yes` : null;
      const gmUrl   = s.site?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${s.site.lat},${s.site.lon}` : null;
      legHtml = `
        <div class="dp-leg">
          <div class="dp-leg-bar"></div>
          <div class="dp-leg-pill">
            🚗 <strong>≈ ${s.travelKm} km</strong> &nbsp;·&nbsp; ~${_fmtDuration(s.travelMin)}
            ${wazeUrl ? `<a href="${wazeUrl}" target="_blank" rel="noopener" class="dp-leg-nav dp-nav-waze">Waze</a>` : ''}
            ${gmUrl   ? `<a href="${gmUrl}"   target="_blank" rel="noopener" class="dp-leg-nav dp-nav-gm">Maps</a>` : ''}
          </div>
          <div class="dp-leg-bar"></div>
        </div>`;
    }

    const click = s.site?.id ? `onclick="window.__openSiteDetail('${s.site.id}')"` : '';

    let extras = '';
    if (s.type === 'arrival' && s.site) {
      if (s.site.budget_indicatif) extras += `<span class="dp-tag dp-tag-budget">💰 ${s.site.budget_indicatif}</span>`;
      if (s.site.eco_score != null) extras += `<span class="dp-tag dp-tag-eco">🌿 ${s.site.eco_score}/10</span>`;
      if (s.site.distance_km != null) extras += `<span class="dp-tag">📍 ${formatDistApprox(s.site.distance_km) || Math.round(s.site.distance_km) + ' km'} depuis le départ</span>`;
    }

    return legHtml + `
      <div class="dp-step dp-step-${s.type}" ${click}>
        <div class="dp-step-time">${s.time}</div>
        <div class="dp-step-icon">${s.icon}</div>
        <div class="dp-step-body">
          <div class="dp-step-label">${s.label}</div>
          ${extras ? `<div class="dp-step-tags">${extras}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const costStr = plan.energyCost != null
    ? `⚡ Coût énergie estimé : <strong>${formatCurrency(plan.energyCost)}</strong>`
    : '⚙️ Configurez votre véhicule pour estimer le coût';

  const dH = Math.floor(plan.totalDurationMin / 60);
  const dM = plan.totalDurationMin % 60;

  const safeLabel = escapeHTML(plan.originLabel || '');
  const originBadge = plan.originSource === 'gps'
    ? `<span class="dp-badge dp-badge-gps">📍 Depuis ${safeLabel}</span>`
    : plan.originSource === 'stored'
      ? `<span class="dp-badge">📍 Depuis ${safeLabel}</span>`
      : `<span class="dp-badge dp-badge-warn">📍 Position par défaut — activez le GPS</span>`;

  return `
    <div class="day-plan-wrapper">
      <div class="dp-header">
        <div class="dp-title">📅 Programme de la journée</div>
        <div class="dp-meta-row">
          <span class="dp-badge">🗺️ ${plan.sites.length} étape${plan.sites.length > 1 ? 's' : ''}</span>
          <span class="dp-badge">📍 ~${plan.totalDistanceKm} km</span>
          <span class="dp-badge">⏱ ${dH}h${String(dM).padStart(2,'0')}</span>
          ${originBadge}
        </div>
        <div class="dp-cost-line">${costStr}</div>
        <div class="dp-speed-line">🚗 Temps estimés selon : <strong>${plan.speedLabel || 'Route mixte'}</strong></div>
        <div class="dp-disclaimer">⚠️ Distances estimées à vol d'oiseau (×1.2). Vérifiez dans Waze ou Google Maps.</div>
      </div>
      <div class="dp-steps">${stepsHtml}</div>
      <div class="dp-actions">
        <button class="btn-primary" id="btn-dp-map">🗺️ Voir sur la carte</button>
        <button class="btn-secondary" id="btn-dp-save">💾 Sauvegarder</button>
        <button class="btn-secondary" id="btn-dp-regen">🔄 Régénérer</button>
        <button class="btn-secondary" id="btn-dp-copy">📋 Copier</button>
        <button class="btn-secondary dp-btn-delete" id="btn-dp-delete">🗑️ Supprimer</button>
      </div>
    </div>`;
}

/* =========================================================
   BLOC 06 — EXPORT TEXTE
   ========================================================= */
export function exportPlanAsText(plan) {
  const lines = [
    `Programme TREKKO — ${new Date(plan.generatedAt).toLocaleDateString('fr-FR')}`,
    `Départ : ${plan.originLabel || 'inconnu'}`,
    `Profil route : ${plan.speedLabel || 'mixte'}`, ''
  ];
  plan.steps.forEach(s => lines.push(`${s.time}  ${s.icon}  ${s.label}`));
  lines.push('', `Distance totale : ~${plan.totalDistanceKm} km`);
  if (plan.energyCost != null) lines.push(`Coût énergie estimé : ${plan.energyCost.toFixed(2)} €`);
  lines.push('⚠️ Horaires indicatifs — distances à vol d\'oiseau.');
  return lines.join('\n');
}

export function exportPlanAsJson(plan) {
  return JSON.stringify(plan, null, 2);
}
