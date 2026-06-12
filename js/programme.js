/* =========================================================
   PROGRAMME.JS — Sélection de sites, carte, photos
   ========================================================= */
import { escapeHTML } from './utils.js';
import { getRouteLegDistances, formatRouteDistance, isValidCoordinate } from './routing-utils.js';

const LS_KEY   = 'trekko_programme_v1';
const LS_SAVES = 'trekko.programme.savedRoutes.v1';
const ORIGIN   = { lat: 43.7169, lon: 4.3789 }; // Nages-et-Solorgues

let _sites        = [];
let _liste        = [];
let _map          = null;
let _routeLayer   = null;
let _markers      = [];
let _streetLayer  = null;
let _satLayer     = null;
let _isSatellite  = false;
let _originMarker = null;
let _routeLegs    = [];   // résultat de getRouteLegDistances()
let _routeStatus  = '';   // '' | 'computing' | 'ok' | 'unavailable'
let _dragSrcIdx   = -1;
let _calcTimer    = null;

/* =========================================================
   EXPORT PRINCIPAL
   ========================================================= */
export function initProgramme(sites) {
  _sites = sites;
  _loadFromStorage();
  _setupSearch();
  _renderListe();
  _initDragDrop();
  _initSaveUI();
  _renderSavesPanel();
  setTimeout(() => {
    _initMap();
    _updateMapAndPhotos();
    if (_liste.length >= 2) _scheduleCalcRoute();
  }, 350);
}

export function invalidateProgMap() {
  if (_map) _map.invalidateSize();
}

/* =========================================================
   RECHERCHE — helpers
   ========================================================= */
function _norm(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const _TYPE_EMOJI = {
  mer:'🏖️', plage:'🏖️', nature:'🌿', rando:'🥾',
  gorge:'🏔️', canyon:'🏔️', grotte:'🪨', cave:'🍷',
  patrimoine:'🏛️', chateau:'🏰', village:'🏘️',
  marche:'🛒', marché:'🛒', balade:'🚶', riviere:'💧', foret:'🌲',
};

function _emoji(site) {
  const raw = _norm((site.type_sortie || '') + ' ' + (site.secteur || ''));
  for (const [k, e] of Object.entries(_TYPE_EMOJI)) { if (raw.includes(k)) return e; }
  return '📍';
}

function _score(site, words) {
  const nameN = _norm(site.destination);
  const allN  = [nameN, _norm(site.secteur), _norm(site.type_sortie),
                 _norm(site.points_forts), _norm(site.programme_court)].join(' ');
  let sc = 0;
  for (const w of words) {
    if (!allN.includes(w)) return -1;
    if (nameN === w)              sc += 10;
    else if (nameN.startsWith(w)) sc += 6;
    else if (nameN.includes(w))   sc += 4;
    else                          sc += 1;
  }
  return sc;
}

function _hl(text, words) {
  let out = escapeHTML(text); // échapper avant d'injecter les balises <b>
  for (const w of words) {
    out = out.replace(
      new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
      '<b>$1</b>'
    );
  }
  return out;
}

/* =========================================================
   RECHERCHE — setup
   ========================================================= */
function _setupSearch() {
  const input   = document.getElementById('prog2-input');
  const results = document.getElementById('prog2-results');
  if (!input || !results) return;

  let _focusIdx = -1;

  function _addSite(id) {
    const site = _sites.find(s => s.id === id);
    if (!site || _liste.find(l => l.id === id)) return;
    _liste.push(site);
    _saveToStorage();
    _renderListe();
    _scheduleCalcRoute();
    _updateMapAndPhotos();
    input.value  = '';
    results.classList.add('hidden');
    _focusIdx    = -1;
  }

  function _renderResults(words) {
    const inList = new Set(_liste.map(l => l.id));
    const scored = _sites
      .filter(s => !inList.has(s.id))
      .map(s => ({ s, sc: _score(s, words) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 12);

    if (!scored.length) { results.classList.add('hidden'); return; }

    results.innerHTML = scored.map(({ s }) => {
      const isFerme   = (s.statut || '').toLowerCase().includes('ferm');
      const budgetTxt = (s.budget_indicatif || '').toLowerCase();
      const isGratuit = s.budget_min === 0 || s.gratuit || budgetTxt.includes('gratuit');
      const isStar    = s.priorite == 1 || s.selection_perso;

      const badges = [
        isFerme   ? `<span class="p2r-badge p2r-red">Fermé</span>`        : '',
        isGratuit ? `<span class="p2r-badge p2r-green">Gratuit</span>`    : '',
        isStar    ? `<span class="p2r-badge p2r-star">⭐</span>`            : '',
        s.sans_peage ? `<span class="p2r-badge p2r-blue">Sans péage</span>` : '',
      ].join('');

      return `<div class="prog2-result-item" data-id="${escapeHTML(String(s.id))}" tabindex="-1">
        <span class="p2r-emoji">${_emoji(s)}</span>
        <div class="p2r-body">
          <div class="p2r-name">${_hl(s.destination, words)}</div>
          <div class="p2r-meta">${escapeHTML(s.secteur || '')}${badges}</div>
        </div>
      </div>`;
    }).join('');
    results.classList.remove('hidden');
    _focusIdx = -1;

    results.querySelectorAll('.prog2-result-item').forEach(el => {
      el.addEventListener('mousedown', e => { e.preventDefault(); _addSite(el.dataset.id); });
    });
  }

  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (raw.length < 1) { results.classList.add('hidden'); return; }
    const words = _norm(raw).split(/\s+/).filter(Boolean);
    _renderResults(words);
  });

  input.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.prog2-result-item')];
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _focusIdx = Math.min(_focusIdx + 1, items.length - 1);
      items[_focusIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _focusIdx = Math.max(_focusIdx - 1, -1);
      if (_focusIdx === -1) input.focus(); else items[_focusIdx]?.focus();
    } else if (e.key === 'Escape') {
      results.classList.add('hidden');
    } else if (e.key === 'Enter' && _focusIdx >= 0) {
      e.preventDefault();
      _addSite(items[_focusIdx]?.dataset.id);
    }
  });

  results.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.prog2-result-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _focusIdx = Math.min(_focusIdx + 1, items.length - 1);
      items[_focusIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _focusIdx = Math.max(_focusIdx - 1, -1);
      if (_focusIdx === -1) input.focus(); else items[_focusIdx]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const focused = results.querySelector('.prog2-result-item:focus');
      if (focused) _addSite(focused.dataset.id);
    } else if (e.key === 'Escape') {
      results.classList.add('hidden'); input.focus();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.prog2-search-wrap')) results.classList.add('hidden');
  });
}

/* =========================================================
   RENDU LISTE — liste verticale avec ↑ ↓ et drag handle
   ========================================================= */
function _renderListe() {
  const container = document.getElementById('prog2-list');
  if (!container) return;

  if (_liste.length === 0) {
    container.innerHTML = '<div class="prog2-empty">Aucun lieu — utilisez la recherche ci-dessus</div>';
    return;
  }

  container.innerHTML = _liste.map((s, i) => {
    const isFirst = i === 0;
    const isLast  = i === _liste.length - 1;
    return `<div class="prog2-item" data-idx="${i}" draggable="true">
      <div class="prog2-item-drag" aria-hidden="true">⠿</div>
      <div class="prog2-item-num">${i + 1}</div>
      <div class="prog2-item-info">
        <div class="prog2-item-name">${escapeHTML(s.destination || '')}</div>
        <div class="prog2-item-meta">${escapeHTML(s.secteur || '')}</div>
      </div>
      <div class="prog2-item-actions">
        <button class="prog2-item-up" data-idx="${i}" title="Monter"${isFirst ? ' disabled' : ''} aria-label="Monter">↑</button>
        <button class="prog2-item-dn" data-idx="${i}" title="Descendre"${isLast ? ' disabled' : ''} aria-label="Descendre">↓</button>
        <button class="prog2-item-del" data-idx="${i}" title="Retirer" aria-label="Retirer">✕</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.prog2-item-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx <= 0) return;
      [_liste[idx - 1], _liste[idx]] = [_liste[idx], _liste[idx - 1]];
      _saveToStorage(); _renderListe(); _scheduleCalcRoute(); _updateMapAndPhotos();
    });
  });

  container.querySelectorAll('.prog2-item-dn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx >= _liste.length - 1) return;
      [_liste[idx], _liste[idx + 1]] = [_liste[idx + 1], _liste[idx]];
      _saveToStorage(); _renderListe(); _scheduleCalcRoute(); _updateMapAndPhotos();
    });
  });

  container.querySelectorAll('.prog2-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      _liste.splice(idx, 1);
      _saveToStorage(); _renderListe(); _scheduleCalcRoute(); _updateMapAndPhotos();
    });
  });
}

/* =========================================================
   DRAG AND DROP — desktop (API HTML5 native)
   ========================================================= */
function _initDragDrop() {
  const list = document.getElementById('prog2-list');
  if (!list) return;

  list.addEventListener('dragstart', e => {
    const item = e.target.closest('[draggable="true"]');
    if (!item) return;
    _dragSrcIdx = parseInt(item.dataset.idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(_dragSrcIdx));
    setTimeout(() => item.classList.add('drag-dragging'), 0);
  });

  list.addEventListener('dragover', e => {
    const item = e.target.closest('[draggable="true"]');
    if (!item) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    list.querySelectorAll('[draggable="true"]').forEach(el => el.classList.remove('drag-over'));
    item.classList.add('drag-over');
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget)) {
      list.querySelectorAll('[draggable="true"]').forEach(el => el.classList.remove('drag-over'));
    }
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    const item = e.target.closest('[draggable="true"]');
    list.querySelectorAll('[draggable="true"]').forEach(el => {
      el.classList.remove('drag-over', 'drag-dragging');
    });
    if (!item) return;
    const dropIdx = parseInt(item.dataset.idx);
    if (_dragSrcIdx < 0 || isNaN(dropIdx) || _dragSrcIdx === dropIdx) return;
    const moved = _liste.splice(_dragSrcIdx, 1)[0];
    _liste.splice(dropIdx, 0, moved);
    _saveToStorage();
    _renderListe();
    _scheduleCalcRoute();
    _updateMapAndPhotos();
    _dragSrcIdx = -1;
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('[draggable="true"]').forEach(el => {
      el.classList.remove('drag-over', 'drag-dragging');
    });
    _dragSrcIdx = -1;
  });
}

/* =========================================================
   OSRM MULTI-ÉTAPES — calcul et affichage
   ========================================================= */
function _scheduleCalcRoute() {
  clearTimeout(_calcTimer);
  _calcTimer = setTimeout(_calcRouteAndRender, 600);
}

async function _calcRouteAndRender() {
  const gpsStops  = _liste.filter(s => s.has_gps && isValidCoordinate(s.lat, s.lon));
  const summaryEl = document.getElementById('prog2-route-summary');
  if (!summaryEl) return;

  if (gpsStops.length < 2) {
    summaryEl.classList.add('hidden');
    _routeLegs   = [];
    _routeStatus = '';
    return;
  }

  _routeStatus = 'computing';
  summaryEl.classList.remove('hidden');
  summaryEl.innerHTML = '<div class="prog2-route-computing">⏳ Calcul de l\'itinéraire…</div>';

  const legs = await getRouteLegDistances(gpsStops);
  _routeLegs = legs;

  const lastLeg = legs[legs.length - 1];
  _routeStatus  = (lastLeg && lastLeg.cumulative != null) ? 'ok' : 'unavailable';

  _renderRouteSummary(gpsStops, legs);
}

function _renderRouteSummary(gpsStops, legs) {
  const summaryEl = document.getElementById('prog2-route-summary');
  if (!summaryEl) return;

  const totalKm = legs[legs.length - 1]?.cumulative;
  const distStr = (totalKm != null) ? formatRouteDistance(totalKm) : null;

  if (_routeStatus === 'unavailable' || !distStr) {
    summaryEl.innerHTML = `
      <div class="prog2-route-row">
        <span class="prog2-route-count">📍 ${_liste.length} étape${_liste.length > 1 ? 's' : ''}</span>
      </div>
      <div class="prog2-route-row">
        <span class="prog2-route-unavail">Distance route indisponible</span>
      </div>
      <div class="prog2-route-source">Source : OSRM non disponible</div>`;
    summaryEl.classList.remove('hidden');
    return;
  }

  const durationMin = Math.round((totalKm / 60) * 60); // estimation à 60 km/h
  const durationStr = durationMin < 60
    ? `~${durationMin} min`
    : `~${Math.floor(durationMin / 60)}h${String(durationMin % 60).padStart(2, '0')}`;

  const legDetails = gpsStops.slice(1).map((stop, i) => {
    const leg  = legs[i + 1];
    const d    = (leg && leg.distFromPrev != null) ? formatRouteDistance(leg.distFromPrev) : '—';
    const from = escapeHTML(gpsStops[i].destination || '');
    const to   = escapeHTML(stop.destination || '');
    return `<div class="prog2-leg-detail">${from} → ${to} : <strong>${d}</strong></div>`;
  }).join('');

  summaryEl.innerHTML = `
    <div class="prog2-route-row">
      <span class="prog2-route-count">📍 ${_liste.length} étape${_liste.length > 1 ? 's' : ''}</span>
      <span class="prog2-route-dist">${distStr}</span>
      <span class="prog2-route-dur">⏱ ${durationStr}</span>
    </div>
    ${legDetails ? `<details class="prog2-legs-details secondary-details">
      <summary>Détails des tronçons</summary>
      <div class="prog2-legs-body">${legDetails}</div>
    </details>` : ''}
    <div class="prog2-route-source">Source : OSRM</div>`;
  summaryEl.classList.remove('hidden');
}

/* =========================================================
   SAUVEGARDE LOCALE — schemaVersion 1
   ========================================================= */
function _parseSaves() {
  try {
    const raw  = localStorage.getItem(LS_SAVES);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(p => p && p.schemaVersion === 1 && p.id && p.title && Array.isArray(p.stops));
  } catch { return []; }
}

function _writeSaves(saves) {
  try {
    localStorage.setItem(LS_SAVES, JSON.stringify(saves));
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      alert('Stockage plein — impossible de sauvegarder. Supprimez un programme existant.');
    }
  }
}

function _saveCurrentProg(title) {
  const saves   = _parseSaves();
  const now     = new Date().toISOString();
  const totalKm = (_routeLegs.length && _routeStatus === 'ok')
    ? (_routeLegs[_routeLegs.length - 1]?.cumulative ?? null)
    : null;

  const prog = {
    schemaVersion: 1,
    id:        `prog-${Date.now()}`,
    title:     title.trim(),
    createdAt: now,
    updatedAt: now,
    stops: _liste.map(s => ({
      id:          s.id,
      destination: s.destination || '',
      secteur:     s.secteur     || '',
      lat:         s.lat         ?? null,
      lon:         s.lon         ?? null,
      has_gps:     !!s.has_gps,
    })),
    routeSummary: totalKm != null ? {
      provider:        'osrm',
      status:          'ok',
      totalDistanceKm: Math.round(totalKm * 10) / 10,
    } : null,
  };

  saves.push(prog);
  if (saves.length > 20) saves.splice(0, saves.length - 20);
  _writeSaves(saves);
}

function _loadSavedProg(id) {
  const saves = _parseSaves();
  const prog  = saves.find(p => p.id === id);
  if (!prog) return;
  _liste = prog.stops.map(stop => {
    const full = _sites.find(s => s.id === stop.id);
    if (full) return full;
    return {
      id:          stop.id,
      destination: stop.destination || '',
      secteur:     stop.secteur     || '',
      lat:         stop.lat,
      lon:         stop.lon,
      has_gps:     !!(stop.has_gps && stop.lat != null && stop.lon != null),
    };
  });
  _saveToStorage();
  _renderListe();
  _scheduleCalcRoute();
  _updateMapAndPhotos();
}

function _deleteSavedProg(id) {
  _writeSaves(_parseSaves().filter(p => p.id !== id));
  _renderSavesPanel();
}

function _renameSavedProg(id, newTitle) {
  const saves = _parseSaves();
  const prog  = saves.find(p => p.id === id);
  if (!prog || !newTitle.trim()) return;
  prog.title     = newTitle.trim();
  prog.updatedAt = new Date().toISOString();
  _writeSaves(saves);
  _renderSavesPanel();
}

function _renderSavesPanel() {
  const container = document.getElementById('prog2-saves-list');
  if (!container) return;
  const saves = _parseSaves();
  if (!saves.length) {
    container.innerHTML = '<div class="prog2-saves-empty">Aucun programme sauvegardé</div>';
    return;
  }
  container.innerHTML = saves.map(p => {
    const date  = new Date(p.updatedAt || p.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    const stops = p.stops.length;
    const dist  = p.routeSummary?.totalDistanceKm
      ? `🚗 ${Math.round(p.routeSummary.totalDistanceKm)} km`
      : '';
    return `<div class="prog2-save-item" data-id="${escapeHTML(p.id)}">
      <div class="prog2-save-info">
        <div class="prog2-save-title-text">${escapeHTML(p.title)}</div>
        <div class="prog2-save-meta">${stops} étape${stops > 1 ? 's' : ''} · ${date}${dist ? ' · ' + dist : ''}</div>
      </div>
      <div class="prog2-save-btns">
        <button class="prog2-save-btn prog2-save-load" data-id="${escapeHTML(p.id)}" title="Charger">📂</button>
        <button class="prog2-save-btn prog2-save-rename" data-id="${escapeHTML(p.id)}" title="Renommer">✏️</button>
        <button class="prog2-save-btn prog2-save-del" data-id="${escapeHTML(p.id)}" title="Supprimer">🗑️</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.prog2-save-load').forEach(btn => {
    btn.addEventListener('click', () => _loadSavedProg(btn.dataset.id));
  });
  container.querySelectorAll('.prog2-save-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Supprimer ce programme ?')) return;
      _deleteSavedProg(btn.dataset.id);
    });
  });
  container.querySelectorAll('.prog2-save-rename').forEach(btn => {
    btn.addEventListener('click', () => {
      const saves = _parseSaves();
      const prog  = saves.find(p => p.id === btn.dataset.id);
      if (!prog) return;
      const newTitle = prompt('Nouveau nom :', prog.title);
      if (newTitle && newTitle.trim()) _renameSavedProg(btn.dataset.id, newTitle.trim());
    });
  });
}

function _initSaveUI() {
  const btn = document.getElementById('prog2-btn-save');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (_liste.length === 0) {
      alert('Ajoutez au moins un lieu avant de sauvegarder.');
      return;
    }
    const titleInput = document.getElementById('prog2-save-title');
    const title = (titleInput?.value || '').trim();
    if (!title) {
      if (titleInput) titleInput.placeholder = 'Donnez un nom à ce programme…';
      titleInput?.focus();
      return;
    }
    _saveCurrentProg(title);
    if (titleInput) titleInput.value = '';
    _renderSavesPanel();
  });
}

/* =========================================================
   CARTE LEAFLET
   ========================================================= */
function _initMap() {
  if (_map) return;
  const container = document.getElementById('prog-map');
  if (!container || !window.L) return;

  _map = window.L.map(container, { zoomControl: true, attributionControl: false });

  _streetLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_map);
  _satLayer    = window.L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 18 }
  );

  _map.setView([ORIGIN.lat, ORIGIN.lon], 11);

  const homeIcon = window.L.divIcon({
    html: `<div class="prog-origin-pin">🏠</div>`,
    className: '', iconSize: [32, 32], iconAnchor: [16, 32]
  });
  _originMarker = window.L.marker([ORIGIN.lat, ORIGIN.lon], { icon: homeIcon, zIndexOffset: -100 })
    .bindPopup('<b>🏠 Départ — Nages-et-Solorgues</b>')
    .addTo(_map);

  document.getElementById('btn-prog-satellite')?.addEventListener('click', _toggleSatellite);
}

function _toggleSatellite() {
  if (!_map) return;
  if (_isSatellite) {
    _map.removeLayer(_satLayer);
    _streetLayer.addTo(_map);
  } else {
    _map.removeLayer(_streetLayer);
    _satLayer.addTo(_map);
  }
  _isSatellite = !_isSatellite;
  const btn = document.getElementById('btn-prog-satellite');
  if (btn) btn.textContent = _isSatellite ? '🗺️ Carte' : '🛰️ Satellite';
}

async function _updateMapAndPhotos() {
  if (!_map) { _initMap(); if (!_map) return; }

  _markers.forEach(m => m.remove());
  _markers = [];
  if (_routeLayer) { _routeLayer.remove(); _routeLayer = null; }

  if (_liste.length === 0) {
    _map.setView([ORIGIN.lat, ORIGIN.lon], 11);
    _renderPhotos();
    return;
  }

  const withGps = _liste.filter(s => s.has_gps && s.lat && s.lon);
  const bounds  = [];

  withGps.forEach((site, i) => {
    const mid  = `pmk-${site.id}`;
    const icon = window.L.divIcon({
      html: `<div class="prog-pm" id="${mid}">
               <div class="prog-pm-num">${i + 1}</div>
             </div>`,
      className: '',
      iconSize:  [46, 46],
      iconAnchor:[23, 23],
    });
    const m = window.L.marker([site.lat, site.lon], { icon })
      .bindPopup(`<b>${i + 1}. ${escapeHTML(site.destination || '')}</b>`)
      .addTo(_map);
    _markers.push(m);
    bounds.push([site.lat, site.lon]);

    _fetchSitePhoto(site).then(url => {
      const el = document.getElementById(mid);
      if (!el || !url) return;
      el.style.backgroundImage = `url('${escapeHTML(url)}')`;
      el.classList.add('prog-pm-photo');
    }).catch(() => {});
  });

  if (withGps.length >= 2) {
    const coords = withGps.map(s => `${s.lon},${s.lat}`).join(';');
    try {
      const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data.routes?.[0]?.geometry) {
        _routeLayer = window.L.geoJSON(data.routes[0].geometry, {
          style: { color: '#e94560', weight: 4, opacity: 0.85 }
        }).addTo(_map);
      }
    } catch {}
  }

  if (bounds.length === 1) {
    _map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    _map.fitBounds(bounds, { padding: [30, 30] });
  }

  setTimeout(() => _map?.invalidateSize(), 80);
  _renderPhotos();
}

/* =========================================================
   PHOTOS — Wikipedia + Wikimedia Commons
   ========================================================= */
function _renderPhotos() {
  const bar = document.getElementById('prog-photos-bar');
  if (!bar) return;

  if (_liste.length === 0) {
    bar.innerHTML = '<div class="prog-photos-empty">Ajoutez des lieux pour voir leurs photos</div>';
    return;
  }

  bar.innerHTML = _liste.map(s => `
    <div class="prog-photo-card" id="ppc-${escapeHTML(String(s.id))}">
      <div class="prog-photo-spin">⏳</div>
      <div class="prog-photo-label">${escapeHTML(s.destination || '')}</div>
    </div>`).join('');

  _liste.forEach(site => {
    _fetchSitePhoto(site).then(url => {
      const card = document.getElementById(`ppc-${site.id}`);
      if (!card) return;
      if (url) {
        card.innerHTML = `
          <img src="${escapeHTML(url)}" alt="${escapeHTML(site.destination || '')}" class="prog-photo-img" loading="lazy" />
          <div class="prog-photo-label">${escapeHTML(site.destination || '')}</div>`;
      } else {
        card.innerHTML = `
          <div class="prog-photo-placeholder">📷</div>
          <div class="prog-photo-label">${escapeHTML(site.destination || '')}</div>`;
      }
    }).catch(() => {});
  });
}

async function _fetchSitePhoto(site) {
  try {
    const name = encodeURIComponent(site.destination || '');
    const res  = await fetch(
      `https://fr.wikipedia.org/w/api.php?action=query&titles=${name}&prop=pageimages&pithumbsize=320&format=json&origin=*`
    );
    const data  = await res.json();
    const pages = Object.values(data.query?.pages || {});
    if (pages[0]?.thumbnail?.source) return pages[0].thumbnail.source;
  } catch {}

  if (site.has_gps && site.lat && site.lon) {
    try {
      const res  = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${site.lat}|${site.lon}&gsradius=800&gslimit=5&format=json&origin=*`
      );
      const data = await res.json();
      for (const hit of (data.query?.geosearch || [])) {
        const res2  = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&pageids=${hit.pageid}&prop=imageinfo&iiprop=url&iiurlwidth=320&format=json&origin=*`
        );
        const data2 = await res2.json();
        const page  = Object.values(data2.query?.pages || {})[0];
        const url   = page?.imageinfo?.[0]?.thumburl;
        if (url) return url;
      }
    } catch {}
  }

  return null;
}

/* =========================================================
   PERSISTANCE SESSION
   ========================================================= */
function _saveToStorage() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_liste.map(s => s.id)));
  } catch {}
}

function _loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { _liste = []; return; }
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) { _liste = []; return; }
    _liste = ids.map(id => _sites.find(s => s.id === id)).filter(Boolean);
  } catch { _liste = []; }
}
