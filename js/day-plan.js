/* =========================================================
   BLOC 01 — IMPORTS ET CONSTANTES
   ========================================================= */
import { formatCurrency, haversineDistance } from './utils.js';
import { estimateTripEnergyCost } from './trip-energy-estimator.js';
import { lsGet, lsSet, lsDel } from './storage.js';
import { UCHAUD_COORDS } from './config.js';
import { filterUnvisited } from './visited.js';

const LS_KEY          = 'day_plan';
const VISIT_MIN       = 90;   // durée visite par défaut
const MEAL_MIN        = 60;   // pause repas
const AVG_SPEED_KMH   = 70;   // vitesse moyenne route
const DEPART_HOUR_MIN = 9 * 60; // 09h00

/* =========================================================
   BLOC 02 — GÉNÉRATION AUTOMATIQUE (nearest-neighbor)
   ========================================================= */
export function generateDayPlan(sites, vehicleProfile, options = {}) {
  const {
    maxKm     = 80,
    minStops  = 3,
    maxStops  = 5,
    avoidTolls = vehicleProfile?.avoid_tolls ?? true
  } = options;

  // 1. Candidats : GPS requis + dans le rayon + non visités
  let candidates = filterUnvisited(sites).filter(s =>
    s.has_gps && s.lat && s.lon &&
    (s.distance_km == null || s.distance_km <= maxKm)
  );

  if (candidates.length === 0) return null;

  // 2. Top 20 par eco_score
  const pool = [...candidates]
    .sort((a, b) => (b.eco_score || 0) - (a.eco_score || 0))
    .slice(0, 20);

  // 3. Nearest-neighbor depuis Nages
  const [originLat, originLon] = UCHAUD_COORDS;
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

  if (selected.length < minStops) return null;

  // 4. Itinéraire chronologique
  const steps = [];
  let cur = DEPART_HOUR_MIN;
  steps.push({ time: _fmt(cur), icon: '🚗', label: 'Départ depuis Nages', type: 'depart' });

  let totalKm = 0;
  let prevLat = originLat, prevLon = originLon;
  let mealInserted = false;

  selected.forEach((site, idx) => {
    const segKm    = haversineDistance(prevLat, prevLon, site.lat, site.lon) * 1.2;
    const travMin  = Math.round((segKm / AVG_SPEED_KMH) * 60);
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

    // Repas entre 12h et 14h, une seule fois
    if (!mealInserted && cur >= 12 * 60 && cur < 14 * 60 && idx < selected.length - 1) {
      steps.push({ time: _fmt(cur), icon: '🍽️', label: 'Pause repas (restaurant ou pique-nique)', type: 'meal' });
      cur += MEAL_MIN;
      mealInserted = true;
    }

    prevLat = site.lat; prevLon = site.lon;
  });

  // Retour
  const retKm  = haversineDistance(prevLat, prevLon, originLat, originLon) * 1.2;
  const retMin = Math.round((retKm / AVG_SPEED_KMH) * 60);
  totalKm += retKm;
  cur += retMin;
  steps.push({ time: _fmt(cur), icon: '🏠', label: `Retour vers Nages (~${Math.round(retKm)} km)`, type: 'return' });

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
    generatedAt: new Date().toISOString()
  };
}

function _fmt(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
}

/* =========================================================
   BLOC 03 — PERSISTANCE LOCALSTORAGE
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

export function loadSavedDayPlan() {
  return lsGet(LS_KEY, null);
}

export function deleteSavedDayPlan() {
  lsDel(LS_KEY);
}

/* =========================================================
   BLOC 04 — RENDU HTML
   ========================================================= */
export function renderDayPlan(plan) {
  if (!plan || !plan.steps) return '<p class="dp-disclaimer">Aucun programme disponible.</p>';

  const stepsHtml = plan.steps.map(s => {
    const click = s.site?.id ? `onclick="window.__openSiteDetail('${s.site.id}')"` : '';
    return `
      <div class="dp-step dp-step-${s.type}" ${click}>
        <div class="dp-step-time">${s.time}</div>
        <div class="dp-step-icon">${s.icon}</div>
        <div class="dp-step-body">
          <div class="dp-step-label">${s.label}</div>
          ${s.travelKm ? `<div class="dp-step-meta">${s.travelKm} km · ~${s.travelMin} min de trajet</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const costStr = plan.energyCost != null
    ? `⚡ Coût énergie estimé : <strong>${formatCurrency(plan.energyCost)}</strong>`
    : '⚙️ Configurez votre véhicule pour estimer le coût';

  const dH = Math.floor(plan.totalDurationMin / 60);
  const dM = plan.totalDurationMin % 60;

  return `
    <div class="day-plan-wrapper">
      <div class="dp-header">
        <div class="dp-title">📅 Programme de la journée</div>
        <div class="dp-meta-row">
          <span class="dp-badge">🗺️ ${plan.sites.length} étape${plan.sites.length > 1 ? 's' : ''}</span>
          <span class="dp-badge">📍 ~${plan.totalDistanceKm} km</span>
          <span class="dp-badge">⏱ ${dH}h${String(dM).padStart(2,'0')}</span>
        </div>
        <div class="dp-cost-line">${costStr}</div>
        <div class="dp-disclaimer">⚠️ Horaires indicatifs — vérifiez les horaires d'ouverture réels.</div>
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
   BLOC 05 — EXPORT TEXTE
   ========================================================= */
export function exportPlanAsText(plan) {
  const lines = [
    `Programme TREKKO — ${new Date(plan.generatedAt).toLocaleDateString('fr-FR')}`, ''
  ];
  plan.steps.forEach(s => lines.push(`${s.time}  ${s.icon}  ${s.label}`));
  lines.push('', `Distance totale : ~${plan.totalDistanceKm} km`);
  if (plan.energyCost != null) lines.push(`Coût énergie estimé : ${plan.energyCost.toFixed(2)} €`);
  lines.push('⚠️ Horaires indicatifs.');
  return lines.join('\n');
}

export function exportPlanAsJson(plan) {
  return JSON.stringify(plan, null, 2);
}
