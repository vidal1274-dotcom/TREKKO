/* =========================================================
   BLOC 01 — IMPORTS ET CONFIG
   ========================================================= */
import { getBestDeals } from './economy-engine.js';
import { estimateTripEnergyCost } from './trip-energy-estimator.js';
import { formatCurrency } from './utils.js';
import { filterUnvisited } from './visited.js';

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
   BLOC 06 — RENDU HTML
   ========================================================= */
export function renderSurpriseCard(card) {
  if (!card) return '<p class="info-disclaimer">Aucune surprise disponible avec ces critères.</p>';
  const { site, tags, energy, headline, tip } = card;
  const tagHtml = tags.map(t => `<span class="badge badge-eco">${t}</span>`).join(' ');
  const energyStr = energy?.total_cost != null ? `Trajet estimé : ${formatCurrency(energy.total_cost)}` : 'Configurer le véhicule pour estimer le trajet';

  return `
    <div class="site-card" style="border-color:#e94560;cursor:pointer" onclick="window.__openSiteDetail('${site.id}')">
      <div class="site-name">${headline}</div>
      <div class="site-sector">${site.secteur || ''} ${site.distance_km ? '· ' + site.distance_km + ' km' : ''}</div>
      <div class="site-badges" style="margin:8px 0">${tagHtml}</div>
      <div class="site-summary">${site.programme_court ? site.programme_court.substring(0,150)+'…' : ''}</div>
      <div class="site-summary" style="margin-top:4px;color:#f5a623">💡 ${tip}</div>
      <div class="site-footer" style="margin-top:10px">
        <span class="site-energy-cost">⚡ ${energyStr}</span>
        <span class="badge badge-eco">Score éco : ${site.eco_score || '—'}/100</span>
      </div>
    </div>`;
}
