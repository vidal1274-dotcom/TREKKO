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
let _getSites    = () => [];
let _searchTimer = null;
let _inputEl     = null;

/* =========================================================
   BLOC 04 — GÉOCODAGE (XHR — compatibilité maximale)
   ========================================================= */
function xhrGet(url, timeoutMs) {
  return new Promise(function(resolve) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs || 8000;
    xhr.onload  = function() {
      if (xhr.status === 200) { resolve(xhr.responseText); }
      else { resolve(null); }
    };
    xhr.onerror   = function() { resolve(null); };
    xhr.ontimeout = function() { resolve(null); };
    xhr.send();
  });
}

function geocodeAddress(query) {
  // API Adresse (gouv.fr) — officielle France, CORS OK, rapide
  var url = 'https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(query) + '&limit=5';
  return xhrGet(url, 8000).then(function(text) {
    if (!text) return geocodeNominatim(query);
    try {
      var data = JSON.parse(text);
      var results = (data.features || []).map(function(f) {
        return {
          type:  'address',
          label: f.properties.label,
          lat:   f.geometry.coordinates[1],
          lon:   f.geometry.coordinates[0]
        };
      });
      if (results.length > 0) return results;
    } catch(e) {}
    return geocodeNominatim(query);
  });
}

function geocodeNominatim(query) {
  var url = 'https://nominatim.openstreetmap.org/search?format=json&q=' +
            encodeURIComponent(query) + '&limit=4&countrycodes=fr&accept-language=fr';
  return xhrGet(url, 8000).then(function(text) {
    if (!text) return [];
    try {
      var data = JSON.parse(text);
      return data.map(function(r) {
        return {
          type:  'address',
          label: r.display_name.split(',').slice(0, 3).join(', '),
          lat:   parseFloat(r.lat),
          lon:   parseFloat(r.lon)
        };
      });
    } catch(e) { return []; }
  });
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
  _inputEl = input;
  if (getSites) _getSites = getSites;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

    if (q.length === 0) {
      showDefaultSuggestions(suggestionsEl, onSuggestion);
      onSearch(''); // effacer filtre texte
    } else if (q.length >= 2) {
      showSearchSuggestions(suggestionsEl, q, onSuggestion);
      // Filtrage en temps réel (debounce 300 ms)
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => onSearch(q), 300);
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
  bindSuggestionClicks(el, onSuggestion, []);
}

function showSearchSuggestions(el, query, onSuggestion) {
  if (!el) return;

  const q            = normalizeSearchText(query);
  const smartMatches = SMART_SUGGESTIONS.filter(s => normalizeSearchText(s.label).includes(q));
  const siteMatches  = searchSites(query);

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

  // Bouton explicite de géocodage (query >= 3 chars) — pas d'async auto
  const locateBtn = query.length >= 3
    ? `<div class="suggestion-item" data-locate="${encodeURIComponent(query)}"
          style="border-top:1px solid var(--color-border2);color:var(--color-accent)">
        <span class="suggestion-icon">📍</span>
        <span class="suggestion-label">Localiser <strong>"${query}"</strong> sur la carte</span>
      </div>`
    : '';

  const sections =
    (smartMatches.length ? header('Suggestions') + smartHtml : '') +
    (siteMatches.length  ? header('Sites')       + sitesHtml  : '') +
    locateBtn;

  if (!sections) { hideSuggestions(el); return; }
  el.innerHTML = sections;
  el.classList.remove('hidden');
  bindSuggestionClicks(el, onSuggestion, siteMatches);
}

function hideSuggestions(el) {
  if (el) el.classList.add('hidden');
}

function bindSuggestionClicks(el, onSuggestion, sites) {
  el.querySelectorAll('.suggestion-item').forEach(item => {
    const handle = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const siteId   = item.dataset.siteId;
      const idx      = item.dataset.index;
      const histQ    = item.dataset.query ? decodeURIComponent(item.dataset.query) : null;
      const locateQ  = item.dataset.locate ? decodeURIComponent(item.dataset.locate) : null;

      if (locateQ) {
        // Géocodage explicite au tap — feedback immédiat dans le bouton
        item.innerHTML = '<span class="suggestion-icon">⏳</span><span class="suggestion-label">Recherche en cours…</span>';
        geocodeAddress(locateQ).then(results => {
          if (results.length > 0) {
            hideSuggestions(el);
            onSuggestion(results[0]);
          } else {
            item.innerHTML = '<span class="suggestion-icon">❌</span><span class="suggestion-label">Adresse non trouvée</span>';
            setTimeout(() => hideSuggestions(el), 2000);
          }
        });
        return; // ne pas fermer le panel avant la réponse
      }

      if (siteId) {
        const site = sites.find(s => s.id === siteId);
        if (site) onSuggestion({ type: 'site', site, label: site.destination });
      } else if (histQ) {
        onSuggestion({ label: histQ, query: histQ });
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
