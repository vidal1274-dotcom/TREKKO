/* =========================================================
   BLOC 01 — CONFIGURATION RECHERCHE
   ========================================================= */
import { normalizeSearchText, detectEconomyKeywords } from './utils.js';
import { detectEconomyIntent } from './economy-engine.js';
import { lsGet, lsSet } from './storage.js';

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 10;

/* =========================================================
   BLOC 01b — GÉOCODAGE ADRESSES (Nominatim / OpenStreetMap)
   ========================================================= */
let _geocodeTimer = null;

async function geocodeAddress(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=4&countrycodes=fr&accept-language=fr`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(r => ({
      type: 'address',
      label: r.display_name.split(',').slice(0, 3).join(', '),
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon)
    }));
  } catch { return []; }
}

/* =========================================================
   BLOC 02 — SUGGESTIONS PRÉDÉFINIES
   ========================================================= */
const SMART_SUGGESTIONS = [
  { label: 'Sorties gratuites', icon: '🟢', filter: 'gratuit', economy: { onlyGratuit: true } },
  { label: 'Sans péage', icon: '🔵', filter: 'sans_peage', economy: { onlySansPeage: true } },
  { label: 'Moins de 30 km', icon: '📍', economy: { maxKm: 30 } },
  { label: 'Moins de 10€ de trajet', icon: '💶', economy: { maxEnergyCost: 10 } },
  { label: 'Sortie pas chère en électrique', icon: '⚡', intent: 'electric_cheap' },
  { label: 'Sortie pas chère en diesel', icon: '⛽', intent: 'diesel_cheap' },
  { label: 'Pique-nique possible', icon: '🧺', intent: 'picnic' },
  { label: 'Randonnée gratuite', icon: '🥾', filter: 'nature', economy: { onlyGratuit: true } },
  { label: 'Village + balade sans visite payante', icon: '🏘️', intent: 'village_free' },
  { label: 'Borne de recharge proche', icon: '⚡', intent: 'charging_station' },
  { label: 'Bons plans du moment', icon: '💰', sortBy: 'eco_score' },
  { label: 'Me surprendre !', icon: '🎲', intent: 'surprise' }
];

/* =========================================================
   BLOC 03 — INIT BARRE DE RECHERCHE
   ========================================================= */
export function initGlobalSearch({ input, clearBtn, suggestionsEl, onSearch, onSuggestion }) {
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
    if (q.length === 0) {
      showDefaultSuggestions(suggestionsEl, onSuggestion);
    } else if (q.length >= 2) {
      showSearchSuggestions(suggestionsEl, q, onSuggestion);
    } else {
      hideSuggestions(suggestionsEl);
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      hideSuggestions(suggestionsEl);
      const q = input.value.trim();
      if (q) { addToHistory(q); onSearch(q); }
    }
    if (e.key === 'Escape') { hideSuggestions(suggestionsEl); input.blur(); }
  });

  input.addEventListener('focus', () => {
    if (!input.value.trim()) showDefaultSuggestions(suggestionsEl, onSuggestion);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      hideSuggestions(suggestionsEl);
      onSearch('');
    });
  }

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !suggestionsEl?.contains(e.target)) {
      hideSuggestions(suggestionsEl);
    }
  });
}

/* =========================================================
   BLOC 04 — SUGGESTIONS AFFICHAGE
   ========================================================= */
function showDefaultSuggestions(el, onSuggestion) {
  if (!el) return;
  const history = lsGet(HISTORY_KEY) || [];
  const historyItems = history.slice(0, 3).map(q =>
    `<div class="suggestion-item" data-query="${encodeURIComponent(q)}">
      <span class="suggestion-icon">🕐</span>
      <span class="suggestion-label">${q}</span>
    </div>`
  ).join('');

  const smartItems = SMART_SUGGESTIONS.slice(0, 6).map((s, i) =>
    `<div class="suggestion-item" data-index="${i}">
      <span class="suggestion-icon">${s.icon}</span>
      <span class="suggestion-label">${s.label}</span>
    </div>`
  ).join('');

  el.innerHTML = (historyItems ? `<div style="padding:6px 14px;font-size:11px;color:#888">Récent</div>${historyItems}<div style="padding:6px 14px;font-size:11px;color:#888">Suggestions</div>` : '') + smartItems;
  el.classList.remove('hidden');
  bindSuggestionClicks(el, onSuggestion);
}

function showSearchSuggestions(el, query, onSuggestion) {
  if (!el) return;
  const q = normalizeSearchText(query);
  const matching = SMART_SUGGESTIONS.filter(s => normalizeSearchText(s.label).includes(q));

  const renderAll = (addresses = []) => {
    const smartHtml = matching.map(s =>
      `<div class="suggestion-item" data-index="${SMART_SUGGESTIONS.indexOf(s)}">
        <span class="suggestion-icon">${s.icon}</span>
        <span class="suggestion-label">${s.label}</span>
      </div>`
    ).join('');

    const addrHtml = addresses.length
      ? `<div style="padding:6px 14px;font-size:11px;color:#888">📍 Adresses</div>` +
        addresses.map((a, i) =>
          `<div class="suggestion-item" data-addr-index="${i}">
            <span class="suggestion-icon">📍</span>
            <span class="suggestion-label">${a.label}</span>
          </div>`
        ).join('')
      : '';

    const combined = smartHtml + addrHtml;
    if (!combined) { hideSuggestions(el); return; }
    el.innerHTML = combined;
    el.classList.remove('hidden');
    bindSuggestionClicks(el, onSuggestion, addresses);
  };

  // Affichage immédiat avec les suggestions smart
  renderAll();

  // Géocodage en parallèle (debounced 400 ms)
  if (query.length >= 3) {
    clearTimeout(_geocodeTimer);
    _geocodeTimer = setTimeout(async () => {
      const addresses = await geocodeAddress(query);
      if (addresses.length && el.classList.contains('hidden') === false) {
        renderAll(addresses);
      }
    }, 400);
  }
}

function hideSuggestions(el) {
  if (el) el.classList.add('hidden');
}

function bindSuggestionClicks(el, onSuggestion, addresses = []) {
  el.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx      = item.dataset.index;
      const addrIdx  = item.dataset.addrIndex;
      const query    = item.dataset.query ? decodeURIComponent(item.dataset.query) : null;
      if (addrIdx != null) {
        const addr = addresses[parseInt(addrIdx)];
        if (addr) onSuggestion(addr);
      } else if (query) {
        onSuggestion({ label: query, query });
      } else if (idx != null) {
        onSuggestion(SMART_SUGGESTIONS[parseInt(idx)]);
      }
      hideSuggestions(el);
    });
  });
}

/* =========================================================
   BLOC 05 — HISTORIQUE
   ========================================================= */
function addToHistory(query) {
  const history = lsGet(HISTORY_KEY) || [];
  const updated = [query, ...history.filter(q => q !== query)].slice(0, MAX_HISTORY);
  lsSet(HISTORY_KEY, updated);
}

/* =========================================================
   BLOC 06 — INTERPRÉTATION REQUÊTE
   ========================================================= */
export function interpretSearchQuery(query, sites) {
  const intent = detectEconomyIntent(query);
  let results = [...sites];
  let info = [];

  if (intent.wantsGratuit) {
    results = results.filter(s => (s.budget_indicatif||'').toLowerCase().includes('gratu'));
    info.push('Filtré : gratuit');
  }
  if (intent.wantsSansPeage) {
    results = results.filter(s => (s.vigilance||'').toLowerCase().includes('sans péage') || s.sans_peage);
    info.push('Filtré : sans péage');
  }
  if (intent.maxKmMatch) {
    const km = parseInt(intent.maxKmMatch);
    results = results.filter(s => s.distance_km == null || s.distance_km <= km);
    info.push(`Filtré : moins de ${km} km`);
  }
  if (intent.wantsBorne) {
    info.push('💡 Suggestion : chercher borne de recharge sur la carte');
  }
  if (intent.wantsSansRecharge) {
    results = results.filter(s => (s.distance_km || 999) <= 80);
    info.push('Filtré : sites proches (sans recharge probable)');
  }

  // Texte libre sur les sites
  if (!intent.wantsGratuit && !intent.wantsSansPeage && !intent.wantsBorne) {
    const norm = normalizeSearchText(query);
    results = results.filter(site => {
      const txt = [site.destination, site.secteur, site.type_sortie, site.programme_court, site.points_forts, site.vigilance]
        .filter(Boolean).join(' ');
      return normalizeSearchText(txt).includes(norm);
    });
  }

  return { results, intent, info };
}
