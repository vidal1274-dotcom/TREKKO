/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { normalizeSearchText } from './utils.js';
import { detectEconomyIntent } from './economy-engine.js';
import { lsGet, lsSet } from './storage.js';

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 10;

/* =========================================================
   BLOC 02 — SUGGESTIONS PRÉDÉFINIES
   ========================================================= */
const SMART_SUGGESTIONS = [
  { label: 'Sorties gratuites',              icon: '🟢', filter: 'gratuit' },
  { label: 'Sans péage',                     icon: '🔵', filter: 'sans_peage' },
  { label: 'Moins de 30 km',                 icon: '📍', economy: { maxKm: 30 } },
  { label: 'Moins de 10€ de trajet',         icon: '💶', economy: { maxEnergyCost: 10 } },
  { label: 'Sortie pas chère en électrique', icon: '⚡', intent: 'electric_cheap' },
  { label: 'Sortie pas chère en diesel',     icon: '⛽', intent: 'diesel_cheap' },
  { label: 'Pique-nique possible',           icon: '🧺', intent: 'picnic' },
  { label: 'Randonnée gratuite',             icon: '🥾', filter: 'nature', economy: { onlyGratuit: true } },
  { label: 'Village + balade sans visite',   icon: '🏘️', intent: 'village_free' },
  { label: 'Borne de recharge proche',       icon: '⚡', intent: 'charging_station' },
  { label: 'Bons plans du moment',           icon: '💰', sortBy: 'eco_score' },
  { label: 'Me surprendre !',               icon: '🎲', intent: 'surprise' }
];

/* =========================================================
   BLOC 03 — ÉTAT INTERNE
   ========================================================= */
let _getSites = () => [];
let _geocodeTimer = null;

/* =========================================================
   BLOC 04 — GÉOCODAGE NOMINATIM
   ========================================================= */
async function geocodeAddress(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=4&countrycodes=fr&accept-language=fr`;
    const res = await fetch(url);
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
   BLOC 05 — RECHERCHE LOCALE DANS LES SITES
   ========================================================= */
function searchSites(query) {
  const norm = normalizeSearchText(query);
  if (norm.length < 2) return [];
  return _getSites().filter(site => {
    const txt = [
      site.destination, site.secteur, site.type_sortie,
      site.programme_court, site.points_forts, site.vigilance,
      site.niveau_marche, site.statut
    ].filter(Boolean).join(' ');
    return normalizeSearchText(txt).includes(norm);
  }).slice(0, 5);
}

/* =========================================================
   BLOC 06 — INIT BARRE DE RECHERCHE
   ========================================================= */
export function initGlobalSearch({ input, clearBtn, suggestionsEl, onSearch, onSuggestion, getSites }) {
  if (!input) return;
  if (getSites) _getSites = getSites;

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

  const doSearch = () => {
    const q = input.value.trim();
    hideSuggestions(suggestionsEl);
    if (q) { addToHistory(q); onSearch(q); }
  };

  // Enter clavier desktop
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    if (e.key === 'Escape') { hideSuggestions(suggestionsEl); input.blur(); }
  });
  // Bouton "Rechercher" / "Go" clavier mobile iOS/Android
  input.addEventListener('search', doSearch);

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
   BLOC 07 — AFFICHAGE SUGGESTIONS
   ========================================================= */
function header(text) {
  return `<div style="padding:5px 14px 3px;font-size:11px;color:#888;font-weight:600;letter-spacing:.4px">${text}</div>`;
}

function showDefaultSuggestions(el, onSuggestion) {
  if (!el) return;
  const history = lsGet(HISTORY_KEY) || [];
  const histHtml = history.slice(0, 3).map(q =>
    `<div class="suggestion-item" data-query="${encodeURIComponent(q)}">
      <span class="suggestion-icon">🕐</span>
      <span class="suggestion-label">${q}</span>
    </div>`
  ).join('');

  const smartHtml = SMART_SUGGESTIONS.slice(0, 6).map((s, i) =>
    `<div class="suggestion-item" data-index="${i}">
      <span class="suggestion-icon">${s.icon}</span>
      <span class="suggestion-label">${s.label}</span>
    </div>`
  ).join('');

  el.innerHTML = (histHtml ? header('Récent') + histHtml + header('Suggestions') : '') + smartHtml;
  el.classList.remove('hidden');
  bindSuggestionClicks(el, onSuggestion, [], []);
}

function showSearchSuggestions(el, query, onSuggestion) {
  if (!el) return;

  const q             = normalizeSearchText(query);
  const smartMatches  = SMART_SUGGESTIONS.filter(s => normalizeSearchText(s.label).includes(q));
  const siteMatches   = searchSites(query);
  let   lastAddresses = null; // null = loading, [] = no result

  const render = (addresses) => {
    const smartHtml = smartMatches.map(s =>
      `<div class="suggestion-item" data-index="${SMART_SUGGESTIONS.indexOf(s)}">
        <span class="suggestion-icon">${s.icon}</span>
        <span class="suggestion-label">${s.label}</span>
      </div>`
    ).join('');

    const sitesHtml = siteMatches.map(site =>
      `<div class="suggestion-item" data-site-id="${site.id}">
        <span class="suggestion-icon">🗺️</span>
        <span class="suggestion-label">${site.destination}<span style="color:#888;font-size:12px"> — ${site.secteur || ''}</span></span>
      </div>`
    ).join('');

    let addrHtml = '';
    if (query.length >= 3) {
      if (addresses === null) {
        addrHtml = `<div style="padding:6px 14px;font-size:12px;color:#888">📍 Recherche adresses…</div>`;
      } else if (addresses.length > 0) {
        addrHtml = header('📍 Adresses') +
          addresses.map((a, i) =>
            `<div class="suggestion-item" data-addr-index="${i}">
              <span class="suggestion-icon">📍</span>
              <span class="suggestion-label">${a.label}</span>
            </div>`
          ).join('');
      }
    }

    const sections =
      (smartMatches.length ? header('Suggestions') + smartHtml : '') +
      (siteMatches.length  ? header('Sites')       + sitesHtml  : '') +
      addrHtml;

    if (!sections) { hideSuggestions(el); return; }
    el.innerHTML = sections;
    el.classList.remove('hidden');
    bindSuggestionClicks(el, onSuggestion, addresses || [], siteMatches);
  };

  // Affichage immédiat (état "chargement adresses")
  render(null);

  // Géocodage debounced 400 ms
  if (query.length >= 3) {
    clearTimeout(_geocodeTimer);
    _geocodeTimer = setTimeout(async () => {
      const addresses = await geocodeAddress(query);
      lastAddresses = addresses;
      if (!el.classList.contains('hidden')) render(addresses);
    }, 400);
  } else {
    render([]);
  }
}

function hideSuggestions(el) {
  if (el) el.classList.add('hidden');
}

function bindSuggestionClicks(el, onSuggestion, addresses, sites) {
  el.querySelectorAll('.suggestion-item').forEach(item => {
    const handle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const siteId  = item.dataset.siteId;
      const addrIdx = item.dataset.addrIndex;
      const idx     = item.dataset.index;
      const query   = item.dataset.query ? decodeURIComponent(item.dataset.query) : null;

      if (siteId) {
        const site = sites.find(s => s.id === siteId);
        if (site) onSuggestion({ type: 'site', site, label: site.destination });
      } else if (addrIdx != null) {
        const addr = addresses[parseInt(addrIdx)];
        if (addr) onSuggestion(addr);
      } else if (query) {
        onSuggestion({ label: query, query });
      } else if (idx != null) {
        onSuggestion(SMART_SUGGESTIONS[parseInt(idx)]);
      }
      hideSuggestions(el);
    };

    item.addEventListener('touchend', handle, { passive: false });
    item.addEventListener('click', handle);
  });
}

/* =========================================================
   BLOC 08 — HISTORIQUE
   ========================================================= */
function addToHistory(query) {
  const history = lsGet(HISTORY_KEY) || [];
  const updated = [query, ...history.filter(q => q !== query)].slice(0, MAX_HISTORY);
  lsSet(HISTORY_KEY, updated);
}

/* =========================================================
   BLOC 09 — INTERPRÉTATION REQUÊTE (Enter / filtrage)
   ========================================================= */
export function interpretSearchQuery(query, sites) {
  const intent = detectEconomyIntent(query);
  let results = [...sites];

  if (intent.wantsGratuit) {
    results = results.filter(s => (s.budget_indicatif || '').toLowerCase().includes('gratu'));
  }
  if (intent.wantsSansPeage) {
    results = results.filter(s => (s.vigilance || '').toLowerCase().includes('sans péage') || s.sans_peage);
  }
  if (intent.maxKmMatch) {
    const km = parseInt(intent.maxKmMatch);
    results = results.filter(s => s.distance_km == null || s.distance_km <= km);
  }
  if (intent.wantsSansRecharge) {
    results = results.filter(s => (s.distance_km || 999) <= 80);
  }

  // Recherche texte libre — toujours appliquée sauf si uniquement filtre économie
  if (!intent.wantsGratuit && !intent.wantsSansPeage && !intent.wantsBorne) {
    const norm = normalizeSearchText(query);
    results = results.filter(site => {
      const txt = [
        site.destination, site.secteur, site.type_sortie,
        site.programme_court, site.points_forts, site.vigilance,
        site.niveau_marche, site.statut
      ].filter(Boolean).join(' ');
      return normalizeSearchText(txt).includes(norm);
    });
  }

  return { results, intent };
}
