/* =========================================================
   BLOC CIRCUIT — CRÉATEUR DE CIRCUITS INTELLIGENTS
   Formulaire, prompt builder, appel IA, scoring, affichage,
   sauvegarde offline.
   ========================================================= */
import { generateCircuit, getAiStatus, getModel } from './ai-service.js';
import { showToast, escapeHTML, getWazeUrlForPlace } from './utils.js';
import { getRouteLegDistances, formatRouteDistance } from './routing-utils.js';

const LS_CIRCUITS    = 'trekko_saved_circuits';
const LS_LAST_PARAMS = 'trekko_last_circuit_params';

/* =========================================================
   BLOC CIRCUIT — INITIALISATION
   ========================================================= */
export function initCircuitCreator() {
  _wireForm();
  _loadSavedCircuits();
}

function _el(id) { return document.getElementById(id); }

/* =========================================================
   BLOC CIRCUIT — CÂBLAGE DU FORMULAIRE
   ========================================================= */
function _wireForm() {
  _el('circuit-generate-btn')?.addEventListener('click', _onGenerate);
  _el('circuit-reset-btn')?.addEventListener('click', _onReset);
  _el('circuit-save-btn')?.addEventListener('click', _onSave);
  _el('circuit-export-btn')?.addEventListener('click', _onExport);
  _el('circuit-copy-btn')?.addEventListener('click', _onCopyText);

  // Durée personnalisée
  _el('circuit-duration')?.addEventListener('change', e => {
    const custom = _el('circuit-duration-custom');
    if (custom) custom.classList.toggle('hidden', e.target.value !== 'custom');
  });

  // Sites personnalisés
  _el('circuit-sites')?.addEventListener('change', e => {
    const custom = _el('circuit-sites-custom');
    if (custom) custom.classList.toggle('hidden', e.target.value !== 'custom');
  });

  // Restaurer derniers paramètres
  _restoreLastParams();
}

/* =========================================================
   BLOC CIRCUIT — CONSTRUCTION DU PROMPT
   ========================================================= */
function _buildPrompt(params) {
  const prefs = Object.entries(params.preferences || {})
    .filter(([, v]) => v)
    .map(([k]) => _prefLabel(k))
    .filter(Boolean)
    .join(', ') || 'Aucune préférence spécifique';

  return `Tu es un assistant expert en circuits touristiques économiques et réalistes.
Ta mission : proposer un parcours optimisé à partir des informations suivantes.

DEMANDE :
- Pays : ${params.country}
- Ville de départ : ${params.startLocation}
- Durée : ${_durationLabel(params.duration)} (${params.durationDays} jour(s))
- Sites souhaités : ${params.requestedSites}
- Transport : ${_transportLabel(params.transportMode)}
- Budget maximum : ${params.budget} € pour ${params.peopleCount} personne(s)
- Préférences : ${prefs}

RÈGLES OBLIGATOIRES :
- Proposer exactement ${params.requestedSites} sites réalistes et visitables
- Limiter la distance journalière à ce qui est faisable en ${params.durationDays} jour(s)
- Indiquer "à vérifier" pour toute information incertaine
- Favoriser les lieux gratuits ou peu coûteux si le budget est limité
- Éviter les journées irréalistes ou les détours inutiles
- Équilibrer les journées en temps et en fatigue
- Inclure des pauses repas si besoin
${params.preferences?.avoidTolls ? '- Éviter les autoroutes à péage' : ''}
${params.preferences?.freeParking ? '- Privilégier le stationnement gratuit' : ''}
${params.preferences?.lowCost ? '- Privilégier les lieux gratuits ou à entrée libre' : ''}

FORMAT DE RÉPONSE : JSON uniquement, structure exacte ci-dessous.
Ne mettre AUCUN texte avant ou après le JSON.

{
  "country": "${params.country}",
  "startLocation": "${params.startLocation}",
  "durationDays": ${params.durationDays},
  "requestedSites": ${params.requestedSites},
  "peopleCount": ${params.peopleCount},
  "transportMode": "${params.transportMode}",
  "budget": ${params.budget},
  "summary": "Résumé du circuit en 2-3 phrases",
  "itinerary": [
    {
      "day": 1,
      "title": "Titre de la journée",
      "estimatedDistanceKm": 0,
      "estimatedTravelTime": "Xh",
      "estimatedCost": 0,
      "sites": [
        {
          "name": "Nom du site",
          "type": "patrimoine|nature|musee|plage|village|monument|insolite|autre",
          "description": "Description courte",
          "reason": "Pourquoi ce site est recommandé",
          "visitDuration": "Xh",
          "estimatedCost": 0,
          "parkingInfo": "Info parking",
          "parkingCost": 0,
          "coordinates": { "lat": null, "lng": null },
          "positivePoints": [],
          "negativePoints": [],
          "tips": [],
          "sources": [],
          "reliability": "verified|probable|uncertain|to_check",
          "score": 0
        }
      ]
    }
  ],
  "costs": {
    "fuelOrElectricity": 0,
    "tolls": 0,
    "parking": 0,
    "entries": 0,
    "food": 0,
    "accommodation": 0,
    "total": 0,
    "perPerson": 0
  },
  "warnings": [],
  "alternatives": [],
  "offlineSummary": "Résumé compact pour consultation hors connexion"
}`;
}

function _prefLabel(key) {
  const map = {
    avoidTolls: 'sans péages', freeParking: 'parking gratuit', lowCost: 'budget serré',
    nature: 'nature', heritage: 'patrimoine', villages: 'villages', monuments: 'monuments',
    museums: 'musées', beaches: 'plages', hiking: 'randonnées', viewpoints: 'points de vue',
    unusual: 'lieux insolites', free: 'lieux gratuits', familyFriendly: 'famille avec enfants',
    offBeaten: 'lieux peu fréquentés', rainAlternative: 'alternative pluie',
    picnic: 'pique-nique', optimizeFuel: 'optimiser carburant',
    optimizeTime: 'optimiser le temps de trajet', avoidCrowded: 'éviter foules'
  };
  return map[key] || null;
}

function _durationLabel(dur) {
  const m = { '1day':'1 jour','2days':'2 jours','3days':'3 jours',
    'weekend':'week-end (2j)','week':'semaine (7j)','custom':'durée personnalisée' };
  return m[dur] || dur;
}

function _transportLabel(t) {
  const m = { 'car_thermal':'voiture thermique','car_electric':'voiture électrique',
    'public':'transports en commun','walking':'marche','bike':'vélo' };
  return m[t] || t;
}

function _durationToDays(dur, customDays) {
  const m = { '1day':1,'2days':2,'3days':3,'weekend':2,'week':7 };
  return dur === 'custom' ? (parseInt(customDays) || 2) : (m[dur] || 1);
}

/* =========================================================
   BLOC CIRCUIT — SCORING LOCAL (post-traitement)
   ========================================================= */
function _scoreSite(site, params) {
  let score = site.score || 50;
  if (site.estimatedCost === 0)              score += 10;
  if (site.reliability === 'verified')       score += 15;
  if (site.reliability === 'uncertain')      score -= 10;
  if (site.reliability === 'to_check')       score -= 5;
  if (params.preferences?.lowCost && site.estimatedCost > 20) score -= 8;
  if (params.preferences?.freeParking && site.parkingCost > 0) score -= 5;
  if (params.preferences?.avoidTolls && site.type === 'peage') score -= 20;
  if (site.negativePoints?.length > 3)       score -= 5;
  if (site.positivePoints?.length > 2)       score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function _enrichCircuit(circuit, params) {
  circuit.itinerary?.forEach(day => {
    day.sites?.forEach(site => {
      site.score = _scoreSite(site, params);
    });
    // Re-trier par score décroissant dans chaque journée
    day.sites?.sort((a, b) => (b.score || 0) - (a.score || 0));
  });
  return circuit;
}

/* =========================================================
   BLOC CIRCUIT — GÉNÉRATION
   ========================================================= */
async function _onGenerate() {
  const status = await getAiStatus();
  if (!status.reachable) {
    showToast('Impossible de contacter le backend IA. Vérifiez que le serveur est démarré sur le port 3001.', 'error');
    return;
  }
  if (!status.configured) {
    showToast('Clé API absente côté serveur. Ajoutez OPENAI_API_KEY dans le fichier .env du backend.', 'warning');
    return;
  }

  const params = _collectParams();
  if (!_validateParams(params)) return;

  _saveLastParams(params);
  _showGenerating(true);
  _el('circuit-results')?.classList.add('hidden');

  try {
    let circuit = await generateCircuit(params);
    circuit = _enrichCircuit(circuit, params);
    circuit._generatedAt = new Date().toISOString();
    circuit._params = params;
    await _renderCircuit(circuit);
    _el('circuit-results')?.classList.remove('hidden');
    showToast('Circuit généré avec succès !', 'success');
  } catch (e) {
    showToast(e.message, 'error');
    const errEl = _el('circuit-error');
    if (errEl) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  } finally {
    _showGenerating(false);
  }
}

function _collectParams() {
  const dur = _el('circuit-duration')?.value || '1day';
  const customDays = _el('circuit-duration-custom-val')?.value;
  const sitesVal = _el('circuit-sites')?.value || '5';
  const customSites = _el('circuit-sites-custom-val')?.value;
  const requestedSites = sitesVal === 'custom' ? (parseInt(customSites) || 5) : parseInt(sitesVal);

  return {
    country:        _el('circuit-country')?.value?.trim() || '',
    startLocation:  _el('circuit-start')?.value?.trim() || '',
    duration:       dur,
    durationDays:   _durationToDays(dur, customDays),
    requestedSites,
    transportMode:  _el('circuit-transport')?.value || 'car_thermal',
    budget:         parseFloat(_el('circuit-budget')?.value) || 100,
    peopleCount:    parseInt(_el('circuit-people')?.value) || 2,
    preferences: {
      nature:         !!_el('pref-nature')?.checked,
      heritage:       !!_el('pref-heritage')?.checked,
      villages:       !!_el('pref-villages')?.checked,
      monuments:      !!_el('pref-monuments')?.checked,
      museums:        !!_el('pref-museums')?.checked,
      beaches:        !!_el('pref-beaches')?.checked,
      hiking:         !!_el('pref-hiking')?.checked,
      viewpoints:     !!_el('pref-viewpoints')?.checked,
      unusual:        !!_el('pref-unusual')?.checked,
      free:           !!_el('pref-free')?.checked,
      familyFriendly: !!_el('pref-family')?.checked,
      offBeaten:      !!_el('pref-offbeaten')?.checked,
      avoidTolls:     !!_el('pref-no-tolls')?.checked,
      freeParking:    !!_el('pref-free-parking')?.checked,
      lowCost:        !!_el('pref-low-cost')?.checked,
      picnic:         !!_el('pref-picnic')?.checked,
      rainAlternative:!!_el('pref-rain')?.checked,
      avoidCrowded:   !!_el('pref-uncrowded')?.checked
    }
  };
}

function _validateParams(params) {
  if (!params.country) { showToast('Indiquez un pays.', 'warning'); return false; }
  if (!params.startLocation) { showToast('Indiquez une ville de départ.', 'warning'); return false; }
  if (params.requestedSites < 1 || params.requestedSites > 20) {
    showToast('Le nombre de sites doit être entre 1 et 20.', 'warning'); return false;
  }
  return true;
}

function _showGenerating(loading) {
  const btn = _el('circuit-generate-btn');
  const spinner = _el('circuit-spinner');
  const errEl = _el('circuit-error');
  if (btn) { btn.disabled = loading; btn.textContent = loading ? '⏳ Génération en cours…' : '🤖 Générer avec IA'; }
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (errEl) errEl.classList.add('hidden');
}

/* =========================================================
   BLOC CIRCUIT — RENDU HTML
   ========================================================= */
function _reliabilityBadge(r) {
  const map = {
    verified:  { icon: '✅', label: 'Vérifié',      cls: 'badge-ok' },
    probable:  { icon: '🟡', label: 'Probable',      cls: 'badge-warn' },
    uncertain: { icon: '⚠️', label: 'Incertain',    cls: 'badge-uncertain' },
    to_check:  { icon: '🔍', label: 'À vérifier',   cls: 'badge-check' }
  };
  const b = map[r] || map.to_check;
  return `<span class="circuit-reliability ${b.cls}">${b.icon} ${b.label}</span>`;
}

function _scoreBar(score) {
  const color = score >= 75 ? '#2ecc71' : score >= 50 ? '#f5a623' : '#e74c3c';
  return `<div class="circuit-score-bar"><div style="width:${score}%;background:${color}"></div></div>`;
}

function _renderSite(site, stepDist = null) {
  const neg = site.negativePoints?.length
    ? `<div class="circuit-site-negatives">⚠️ ${site.negativePoints.map(p => escapeHTML(p)).join(' · ')}</div>` : '';
  const tips = site.tips?.length
    ? `<div class="circuit-site-tips">💡 ${site.tips.map(t => escapeHTML(t)).join(' · ')}</div>` : '';
  const parking = site.parkingInfo
    ? `<span class="circuit-chip">🅿️ ${escapeHTML(site.parkingInfo)}${site.parkingCost ? ` ~${site.parkingCost}€` : ' (gratuit)'}</span>` : '';
  const mapsUrl = (site.coordinates?.lat && site.coordinates?.lng)
    ? `https://www.google.com/maps?q=${site.coordinates.lat},${site.coordinates.lng}` : null;
  const mapBtn = mapsUrl
    ? `<a href="${escapeHTML(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="circuit-site-map-btn">🗺️ Maps</a>` : '';
  const wazeUrl = getWazeUrlForPlace(site);
  const wazeBtn = wazeUrl
    ? `<a href="${escapeHTML(wazeUrl)}" target="_blank" rel="noopener noreferrer" class="circuit-site-waze-btn">🚗 Waze</a>` : '';

  const prevDist = stepDist?.distFromPrev != null
    ? formatRouteDistance(stepDist.distFromPrev) : null;
  const cumDist  = stepDist?.cumulative != null
    ? formatRouteDistance(stepDist.cumulative) : null;
  const distHtml = prevDist
    ? `<div class="step-distance">📍 Depuis l'étape précédente : ${prevDist}${cumDist ? ` · Cumul : ${cumDist}` : ''}</div>`
    : '';

  return `
    <div class="circuit-site-card">
      <div class="circuit-site-header">
        <span class="circuit-site-name">${escapeHTML(site.name)}</span>
        <span class="circuit-site-type">${escapeHTML(site.type || '')}</span>
        ${_reliabilityBadge(site.reliability)}
      </div>
      ${_scoreBar(site.score || 0)}
      ${distHtml}
      <p class="circuit-site-desc">${escapeHTML(site.description || '')}</p>
      <p class="circuit-site-reason">📌 ${escapeHTML(site.reason || '')}</p>
      <div class="circuit-chips">
        <span class="circuit-chip">⏱ ${escapeHTML(site.visitDuration || '?')}</span>
        <span class="circuit-chip ${site.estimatedCost === 0 ? 'chip-free' : ''}">💰 ${site.estimatedCost === 0 ? 'Gratuit' : `~${site.estimatedCost}€/pers.`}</span>
        ${parking}
        ${mapBtn}
        ${wazeBtn}
      </div>
      ${neg}${tips}
    </div>`;
}

async function _renderDay(day) {
  // Extraire les coordonnées des sites IA (format: coordinates.lat + coordinates.lng)
  const pts = (day.sites || []).map(s => ({
    lat: s.coordinates?.lat,
    lon: s.coordinates?.lng
  }));
  const stepDists = await getRouteLegDistances(pts);

  const sites = (day.sites || []).map((s, i) => _renderSite(s, stepDists[i])).join('');

  // Distance totale : OSRM local si disponible, fallback IA
  const lastDist   = stepDists.length ? stepDists[stepDists.length - 1] : null;
  const localTotal = lastDist?.cumulative ?? null;
  let distDisplay;
  if (localTotal != null) {
    distDisplay = formatRouteDistance(localTotal) || `🚗 ${Math.round(localTotal)} km`;
  } else if (day.estimatedDistanceKm != null) {
    distDisplay = `≈ ${day.estimatedDistanceKm} km (estimé IA)`;
  } else {
    distDisplay = '?';
  }

  return `
    <div class="circuit-day">
      <div class="circuit-day-header">
        <span class="circuit-day-title">📅 Jour ${day.day} — ${escapeHTML(day.title || '')}</span>
        <div class="circuit-day-meta">
          <span>🚗 ${distDisplay}</span>
          <span>⏱ ~${escapeHTML(day.estimatedTravelTime || '?')}</span>
          <span>💰 ~${day.estimatedCost || '?'}€</span>
        </div>
      </div>
      <div class="circuit-day-sites">${sites}</div>
    </div>`;
}

function _renderCosts(costs) {
  if (!costs) return '';
  return `
    <div class="circuit-costs">
      <h4>💰 Estimation des coûts</h4>
      <div class="circuit-costs-grid">
        ${costs.fuelOrElectricity ? `<div>⛽ Carburant / recharge</div><div>~${costs.fuelOrElectricity}€</div>` : ''}
        ${costs.tolls ? `<div>🛣️ Péages</div><div>~${costs.tolls}€</div>` : ''}
        ${costs.parking ? `<div>🅿️ Parking</div><div>~${costs.parking}€</div>` : ''}
        ${costs.entries ? `<div>🎟️ Entrées</div><div>~${costs.entries}€</div>` : ''}
        ${costs.food ? `<div>🍽️ Repas</div><div>~${costs.food}€</div>` : ''}
        ${costs.accommodation ? `<div>🏨 Hébergement</div><div>~${costs.accommodation}€</div>` : ''}
        <div class="costs-total">Total estimé</div><div class="costs-total">~${costs.total}€</div>
        ${costs.perPerson ? `<div>👤 Par personne</div><div>~${costs.perPerson}€</div>` : ''}
      </div>
      <p class="circuit-disclaimer">⚠️ Estimation indicative — à vérifier avant le départ.</p>
    </div>`;
}

let _currentCircuit = null;

async function _renderCircuit(circuit) {
  _currentCircuit = circuit;
  const container = _el('circuit-results-content');
  if (!container) return;

  const days = (await Promise.all((circuit.itinerary || []).map(d => _renderDay(d)))).join('');
  const warnings = circuit.warnings?.length
    ? `<div class="circuit-warnings">${circuit.warnings.map(w => `<p>⚠️ ${escapeHTML(w)}</p>`).join('')}</div>` : '';
  const alts = circuit.alternatives?.length
    ? `<div class="circuit-alternatives"><h4>🔄 Alternatives</h4>${circuit.alternatives.map(a => `<p>• ${escapeHTML(a)}</p>`).join('')}</div>` : '';

  container.innerHTML = `
    <div class="circuit-summary-header">
      <h3>🗺️ ${escapeHTML(circuit.startLocation)} — ${escapeHTML(circuit.country)}</h3>
      <p class="circuit-summary-text">${escapeHTML(circuit.summary || '')}</p>
      <div class="circuit-meta-chips">
        <span>📅 ${circuit.durationDays}j</span>
        <span>📍 ${(circuit.itinerary || []).reduce((acc, d) => acc + (d.sites?.length || 0), 0)} sites</span>
        <span>🤖 ${escapeHTML(circuit._model || getModel())}</span>
      </div>
    </div>
    ${days}
    ${_renderCosts(circuit.costs)}
    ${warnings}${alts}
  `;
}

/* =========================================================
   BLOC CIRCUIT — SAUVEGARDE OFFLINE
   ========================================================= */
function _onSave() {
  if (!_currentCircuit) { showToast('Aucun circuit à sauvegarder.', 'warning'); return; }
  const saved = _loadAllCircuits();
  const id = `circuit_${Date.now()}`;
  saved.unshift({ id, ...(_currentCircuit), _savedAt: new Date().toISOString() });
  // Garder max 10 circuits
  if (saved.length > 10) saved.pop();
  localStorage.setItem(LS_CIRCUITS, JSON.stringify(saved));
  showToast('Circuit sauvegardé pour consultation hors ligne.', 'success');
  _loadSavedCircuits();
}

function _loadAllCircuits() {
  try { return JSON.parse(localStorage.getItem(LS_CIRCUITS) || '[]'); } catch { return []; }
}

function _loadSavedCircuits() {
  const list = _el('circuit-saved-list');
  if (!list) return;
  const circuits = _loadAllCircuits();
  if (!circuits.length) {
    list.innerHTML = '<p class="circuit-empty">Aucun circuit sauvegardé.</p>';
    return;
  }
  list.innerHTML = circuits.map(c => `
    <div class="circuit-saved-item" data-id="${c.id}">
      <div class="circuit-saved-info">
        <strong>${escapeHTML(c.startLocation || '')} — ${escapeHTML(c.country || '')}</strong>
        <span>${c.durationDays}j · ${(c.itinerary || []).reduce((a, d) => a + (d.sites?.length || 0), 0)} sites</span>
        <span class="circuit-saved-date">${new Date(c._savedAt || c._generatedAt || 0).toLocaleDateString('fr-FR')}</span>
      </div>
      <div class="circuit-saved-actions">
        <button class="btn-xs" onclick="_circuitLoad('${c.id}')">📖 Voir</button>
        <button class="btn-xs btn-danger" onclick="_circuitDelete('${c.id}')">🗑️</button>
      </div>
    </div>`).join('');
}

// Exposer pour les onclick inline
window._circuitLoad = async (id) => {
  const c = _loadAllCircuits().find(x => x.id === id);
  if (!c) return;
  _currentCircuit = c;
  await _renderCircuit(c);
  _el('circuit-results')?.classList.remove('hidden');
  _el('circuit-results-content')?.scrollIntoView({ behavior: 'smooth' });
};
window._circuitDelete = (id) => {
  const saved = _loadAllCircuits().filter(x => x.id !== id);
  localStorage.setItem(LS_CIRCUITS, JSON.stringify(saved));
  _loadSavedCircuits();
  showToast('Circuit supprimé.', 'info');
};

/* =========================================================
   BLOC CIRCUIT — EXPORT / COPIE
   ========================================================= */
function _onExport() {
  if (!_currentCircuit) { showToast('Aucun circuit à exporter.', 'warning'); return; }
  const json = JSON.stringify(_currentCircuit, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = `trekko-circuit-${(_currentCircuit.startLocation || 'circuit').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast('Circuit exporté en JSON.', 'success');
}

function _onCopyText() {
  if (!_currentCircuit) { showToast('Aucun circuit à copier.', 'warning'); return; }
  const c = _currentCircuit;
  const lines = [
    `TREKKO — Circuit ${c.startLocation}, ${c.country}`,
    `Durée : ${c.durationDays} jour(s) | ${(c.itinerary || []).reduce((a, d) => a + (d.sites?.length || 0), 0)} sites`,
    ''
  ];
  (c.itinerary || []).forEach(day => {
    lines.push(`Jour ${day.day} — ${day.title}`);
    (day.sites || []).forEach(s => {
      lines.push(`  • ${s.name} (${s.visitDuration || '?'}) — ${s.estimatedCost === 0 ? 'Gratuit' : `~${s.estimatedCost}€`}`);
      if (s.reliability === 'to_check' || s.reliability === 'uncertain') lines.push('    ⚠️ À vérifier');
    });
    lines.push('');
  });
  if (c.costs?.total) lines.push(`Coût total estimé : ~${c.costs.total}€ (~${c.costs.perPerson}€/pers.)`);
  lines.push('⚠️ Informations à vérifier avant le départ — TREKKO');

  navigator.clipboard?.writeText(lines.join('\n'))
    .then(() => showToast('Résumé copié dans le presse-papier.', 'success'))
    .catch(() => showToast('Copie non disponible.', 'warning'));
}

function _onReset() {
  _el('circuit-country').value = '';
  _el('circuit-start').value = '';
  _el('circuit-duration').value = '1day';
  _el('circuit-sites').value = '5';
  _el('circuit-transport').value = 'car_thermal';
  _el('circuit-budget').value = '100';
  _el('circuit-people').value = '2';
  document.querySelectorAll('.circuit-pref-check').forEach(cb => { cb.checked = false; });
  _el('circuit-results')?.classList.add('hidden');
  _currentCircuit = null;
}

/* =========================================================
   BLOC CIRCUIT — PERSISTANCE PARAMÈTRES
   ========================================================= */
function _saveLastParams(params) {
  localStorage.setItem(LS_LAST_PARAMS, JSON.stringify(params));
}

function _restoreLastParams() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_LAST_PARAMS) || 'null');
    if (!p) return;
    if (p.country && _el('circuit-country'))     _el('circuit-country').value = p.country;
    if (p.startLocation && _el('circuit-start')) _el('circuit-start').value = p.startLocation;
    if (p.duration && _el('circuit-duration'))   _el('circuit-duration').value = p.duration;
    if (p.budget && _el('circuit-budget'))       _el('circuit-budget').value = p.budget;
    if (p.people && _el('circuit-people'))       _el('circuit-people').value = p.peopleCount;
  } catch { /* silencieux */ }
}
