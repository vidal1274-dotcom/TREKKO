/* =========================================================
   PROGRAMMATION.JS — Planificateur de parcours v2
   ========================================================= */

/* --- Constantes --- */
const LS_KEY         = 'trekko_prog_route';
const DEFAULT_ORIGIN = { lat: 43.7169, lon: 4.3789, label: 'Nages-et-Solorgues' };
const AVG_SPEED      = 70;      // km/h fallback si OSRM indisponible
const VISIT_MIN      = 90;      // durée de visite par étape (min)
const DEPART_MIN     = 9 * 60;  // départ à 09h00
const OSRM_BASE      = 'https://router.project-osrm.org/route/v1/driving';

/* --- État --- */
let _sites        = [];
let _waypoints    = [];
let _map          = null;
let _markers      = [];
let _line         = null;
let _origin       = { ...DEFAULT_ORIGIN };
let _activeFilter = 'all';
let _routeToken   = 0; // annule les requêtes OSRM obsolètes

/* =========================================================
   INIT
   ========================================================= */
export function initProgPanel(sites) {
  _sites = sites;
  _loadFromStorage();
  _initMap();
  _setupSearch();
  _setupFilterChips();
  _setupButtons();
  _renderWaypoints();
  _fetchGpsOrigin(); // async — re-rend si GPS disponible
}

export function refreshProgPanel() {
  if (_map) setTimeout(() => _map.invalidateSize(), 80);
}

/* =========================================================
   POSITION GPS DE DÉPART
   ========================================================= */
function _fetchGpsOrigin() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      _origin = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        label: 'Ma position GPS',
        is_gps: true
      };
      _renderWaypoints();
    },
    () => { /* GPS indisponible — on garde DEFAULT_ORIGIN */ },
    { timeout: 6000, maximumAge: 120000, enableHighAccuracy: false }
  );
}

/* =========================================================
   CARTE LEAFLET
   ========================================================= */
function _initMap() {
  if (_map) return;
  const el = document.getElementById('prog-map');
  if (!el) return;
  _map = L.map(el, { zoomControl: true }).setView([DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lon], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 18
  }).addTo(_map);
}

/* =========================================================
   RECHERCHE + FILTRES
   ========================================================= */
function _setupFilterChips() {
  document.querySelectorAll('.prog-chip[data-pfilter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.prog-chip[data-pfilter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _activeFilter = chip.dataset.pfilter;
      const input = document.getElementById('prog-search');
      if (input) _showSuggestions(input.value.trim());
    });
  });
}

function _setupSearch() {
  const input = document.getElementById('prog-search');
  if (!input) return;
  input.addEventListener('focus', () => _showSuggestions(input.value.trim()));
  input.addEventListener('input', () => _showSuggestions(input.value.trim()));
  document.addEventListener('click', e => {
    if (!e.target.closest('.prog-search-wrap')) {
      document.getElementById('prog-suggestions')?.classList.add('hidden');
    }
  });
}

function _showSuggestions(q) {
  const sug = document.getElementById('prog-suggestions');
  if (!sug) return;
  const qLow = q.toLowerCase();

  const results = _sites.filter(s => {
    if (!s.has_gps || !s.lat || !s.lon) return false;
    if (_waypoints.find(w => w.id === s.id)) return false;
    if (qLow.length >= 2 && !s.destination.toLowerCase().includes(qLow)) return false;
    if (_activeFilter !== 'all' && !(s.tags || []).includes(_activeFilter)) return false;
    return true;
  }).slice(0, 8);

  if (!results.length) { sug.classList.add('hidden'); return; }

  sug.innerHTML = results.map(s => {
    const dist = s.distance_km != null ? `${Math.round(s.distance_km)} km` : '';
    const tags = (s.tags || [])
      .filter(t => ['gratuit','sans_peage','nature','famille'].includes(t))
      .map(t => `<span class="prog-sug-tag">${t.replace('_', ' ')}</span>`)
      .join('');
    return `<div class="prog-sug-item" data-id="${s.id}">
      <span class="prog-sug-name">${s.destination}</span>
      <span class="prog-sug-meta">${dist}${tags}</span>
    </div>`;
  }).join('');
  sug.classList.remove('hidden');

  sug.querySelectorAll('.prog-sug-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      const site = _sites.find(s => s.id === el.dataset.id);
      if (!site) return;
      _addWaypoint(site);
      const input = document.getElementById('prog-search');
      if (input) input.value = '';
      sug.classList.add('hidden');
    });
  });
}

/* =========================================================
   BOUTONS
   ========================================================= */
function _setupButtons() {
  document.getElementById('btn-prog-generate')?.addEventListener('click', _generateDayRoute);
  document.getElementById('btn-prog-clear')?.addEventListener('click', () => {
    _waypoints = [];
    _saveToStorage();
    _renderWaypoints();
  });
  document.getElementById('btn-prog-save')?.addEventListener('click', () => {
    _saveToStorage();
    _toast('Programme sauvegardé !');
  });
}

/* =========================================================
   GÉNÉRATION AUTOMATIQUE (nearest-neighbor)
   ========================================================= */
function _generateDayRoute() {
  const maxKm = 80, maxStops = 5;

  const candidates = _sites.filter(s => {
    if (!s.has_gps || !s.lat || !s.lon) return false;
    if (s.distance_km != null && s.distance_km > maxKm) return false;
    if (_activeFilter !== 'all' && !(s.tags || []).includes(_activeFilter)) return false;
    return true;
  });

  const pool = [...candidates]
    .sort((a, b) => (b.eco_score || 0) - (a.eco_score || 0))
    .slice(0, 20);

  if (!pool.length) { _toast('Aucun site disponible pour ce filtre.'); return; }

  const selected = [], remaining = [...pool];
  let curLat = _origin.lat, curLon = _origin.lon;

  for (let i = 0; i < Math.min(maxStops, remaining.length); i++) {
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((s, idx) => {
      const d = _hav(curLat, curLon, s.lat, s.lon);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    curLat = picked.lat; curLon = picked.lon;
  }

  _waypoints = selected;
  _saveToStorage();
  _renderWaypoints();
  _toast(`${selected.length} étapes générées — modifiez à votre guise !`);
}

/* =========================================================
   GESTION WAYPOINTS
   ========================================================= */
function _addWaypoint(site) {
  if (!site.lat || !site.lon) return;
  _waypoints.push(site);
  _saveToStorage();
  _renderWaypoints();
}

function _removeWaypoint(idx) {
  _waypoints.splice(idx, 1);
  _saveToStorage();
  _renderWaypoints();
}

function _moveWaypoint(idx, dir) {
  const n = idx + dir;
  if (n < 0 || n >= _waypoints.length) return;
  [_waypoints[idx], _waypoints[n]] = [_waypoints[n], _waypoints[idx]];
  _saveToStorage();
  _renderWaypoints();
}

/* =========================================================
   RENDU LISTE DE WAYPOINTS
   ========================================================= */
function _renderWaypoints() {
  const container = document.getElementById('prog-waypoints');
  if (!container) return;

  if (_waypoints.length === 0) {
    container.innerHTML = '<div class="prog-empty">Aucune étape — recherchez un site ou générez un programme</div>';
    document.getElementById('prog-stats')?.classList.add('hidden');
    _clearMap();
    return;
  }

  // Estimation provisoire via Haversine (sera mis à jour par OSRM)
  let cur = DEPART_MIN, prevLat = _origin.lat, prevLon = _origin.lon;
  let mealInserted = false, totalKm = 0;

  const sched = _waypoints.map((wp, i) => {
    const distKm = _hav(prevLat, prevLon, wp.lat, wp.lon) * 1.2;
    const drivMin = Math.round((distKm / AVG_SPEED) * 60);
    totalKm += distKm;
    cur += drivMin;
    const arrival = cur;
    cur += VISIT_MIN;
    let hasMeal = false;
    if (!mealInserted && cur >= 12 * 60 && cur < 14 * 60 && i < _waypoints.length - 1) {
      cur += 60; mealInserted = true; hasMeal = true;
    }
    prevLat = wp.lat; prevLon = wp.lon;
    return { wp, arrival, drivMin, distKm, hasMeal };
  });

  const retKm = _hav(prevLat, prevLon, _origin.lat, _origin.lon) * 1.2;
  const retMin = Math.round((retKm / AVG_SPEED) * 60);
  totalKm += retKm;
  const retArrival = cur + retMin;

  // Construire HTML
  const originName = _origin.is_gps
    ? '&#x1F4CD; Ma position GPS'
    : 'Nages-et-Solorgues';

  let html = `
    <div class="prog-wp prog-wp-origin">
      <div class="prog-wp-num">&#x1F3E0;</div>
      <div class="prog-wp-info">
        <div class="prog-wp-name">${originName}</div>
        <div class="prog-wp-dist">Départ à 09h00</div>
      </div>
    </div>`;

  sched.forEach((s, i) => {
    const driveLabel = `${Math.round(s.distKm)} km · ${s.drivMin} min de route`;
    html += `
      <div class="prog-wp">
        <div class="prog-wp-num">${i + 1}</div>
        <div class="prog-wp-info">
          <div class="prog-wp-name">${s.wp.destination}</div>
          <div class="prog-wp-dist" data-seg="${i}">Arrivée ~${_fmt(s.arrival)} · ${driveLabel}</div>
          ${s.hasMeal ? '<div class="prog-wp-meal">&#x1F37D;&#xFE0F; Pause repas incluse (+1h)</div>' : ''}
        </div>
        <div class="prog-wp-actions">
          <button class="prog-wp-btn" data-action="up"   data-idx="${i}" ${i === 0 ? 'disabled' : ''}>&#x2B06;</button>
          <button class="prog-wp-btn" data-action="down" data-idx="${i}" ${i === _waypoints.length - 1 ? 'disabled' : ''}>&#x2B07;</button>
          <button class="prog-wp-btn" data-action="del"  data-idx="${i}">&#x2715;</button>
        </div>
      </div>`;
  });

  html += `
    <div class="prog-wp prog-wp-return">
      <div class="prog-wp-num">&#x1F3E0;</div>
      <div class="prog-wp-info">
        <div class="prog-wp-name">Retour — ${_origin.label}</div>
        <div class="prog-wp-dist" data-seg="return">Arrivée ~${_fmt(retArrival)} · ${Math.round(retKm)} km</div>
      </div>
    </div>`;

  container.innerHTML = html;

  container.querySelectorAll('.prog-wp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if      (btn.dataset.action === 'del')  _removeWaypoint(idx);
      else if (btn.dataset.action === 'up')   _moveWaypoint(idx, -1);
      else if (btn.dataset.action === 'down') _moveWaypoint(idx, 1);
    });
  });

  _updateStats(_waypoints.length, totalKm, retArrival - DEPART_MIN);
  _updateMapWithRoute(); // async — routage OSRM
}

function _updateStats(count, driveKm, totalMin) {
  const el = document.getElementById('prog-stats');
  if (!el) return;
  if (count === 0) { el.classList.add('hidden'); return; }
  const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
  document.getElementById('prog-stat-stops').textContent = `${count} étape${count > 1 ? 's' : ''}`;
  document.getElementById('prog-stat-dist').textContent  = `~${Math.round(driveKm)} km`;
  document.getElementById('prog-stat-time').textContent  = `journée ~${h}h${String(m).padStart(2, '0')}`;
  el.classList.remove('hidden');
}

/* =========================================================
   CARTE + ROUTAGE OSRM
   ========================================================= */
function _clearMap() {
  if (!_map) return;
  _markers.forEach(mk => mk.remove()); _markers = [];
  if (_line) { _line.remove(); _line = null; }
}

async function _updateMapWithRoute() {
  if (!_map) return;
  const token = ++_routeToken;

  _clearMap();
  const all = [{ ..._origin, is_origin: true }, ..._waypoints];

  // 1. Marqueurs immédiats
  all.forEach((wp, i) => {
    const color = i === 0 ? '#4a90e2' : '#e94560';
    const lbl   = i === 0 ? '&#x1F3E0;' : String(i);
    const icon  = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)">${lbl}</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14]
    });
    _markers.push(
      L.marker([wp.lat, wp.lon], { icon }).addTo(_map)
        .bindPopup(`<strong>${wp.destination || wp.label}</strong>`)
    );
  });

  if (_waypoints.length < 1) return;

  // 2. Tracé provisoire (droit) pendant la requête OSRM
  const fallbackCoords = [...all.map(wp => [wp.lat, wp.lon]), [_origin.lat, _origin.lon]];
  _line = L.polyline(fallbackCoords, { color: '#e94560', weight: 3, opacity: 0.4, dashArray: '8 6' }).addTo(_map);
  _map.fitBounds(L.latLngBounds(all.map(wp => [wp.lat, wp.lon])), { padding: [24, 24] });
  setTimeout(() => _map.invalidateSize(), 50);

  // 3. Requête OSRM (aller + retour au départ)
  const routePoints = [...all, { lat: _origin.lat, lon: _origin.lon }];
  const route = await _fetchOsrmRoute(routePoints);
  if (token !== _routeToken) return; // réponse périmée

  if (!route) return; // garde le tracé provisoire

  // 4. Tracé routier réel
  if (_line) { _line.remove(); _line = null; }
  const latLngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  _line = L.polyline(latLngs, { color: '#e94560', weight: 4, opacity: 0.9 }).addTo(_map);

  // 5. Mise à jour des temps et distances réels
  _applyOsrmTimes(route.legs);
}

async function _fetchOsrmRoute(points) {
  try {
    const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(`${OSRM_BASE}/${coords}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.code === 'Ok' && data.routes?.[0]) ? data.routes[0] : null;
  } catch (_) { return null; }
}

function _applyOsrmTimes(legs) {
  const container = document.getElementById('prog-waypoints');
  if (!container || !legs || legs.length < _waypoints.length + 1) return;

  let cur = DEPART_MIN, mealInserted = false, totalKm = 0;

  _waypoints.forEach((_, i) => {
    const leg = legs[i];
    const drivMin = Math.round(leg.duration / 60);
    const distKm  = leg.distance / 1000;
    totalKm += distKm;
    cur += drivMin;
    const arrival = cur;
    cur += VISIT_MIN;
    if (!mealInserted && cur >= 12 * 60 && cur < 14 * 60 && i < _waypoints.length - 1) {
      cur += 60; mealInserted = true;
    }
    const el = container.querySelector(`.prog-wp-dist[data-seg="${i}"]`);
    if (el) el.textContent = `Arrivée ~${_fmt(arrival)} · ${distKm.toFixed(1)} km · ${drivMin} min de route`;
  });

  const retLeg = legs[_waypoints.length];
  if (retLeg) {
    const retMin = Math.round(retLeg.duration / 60);
    const retKm  = retLeg.distance / 1000;
    totalKm += retKm;
    const retEl = container.querySelector('.prog-wp-dist[data-seg="return"]');
    if (retEl) retEl.textContent = `Arrivée ~${_fmt(cur + retMin)} · ${retKm.toFixed(1)} km`;
    _updateStats(_waypoints.length, totalKm, (cur + retMin) - DEPART_MIN);
  }
}

/* =========================================================
   PERSISTANCE
   ========================================================= */
function _saveToStorage() {
  localStorage.setItem(LS_KEY, JSON.stringify(_waypoints.map(w => w.id)));
}

function _loadFromStorage() {
  try {
    const ids = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    _waypoints = ids.map(id => _sites.find(s => s.id === id)).filter(Boolean);
  } catch (_) { _waypoints = []; }
}

/* =========================================================
   UTILITAIRES
   ========================================================= */
function _hav(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dG/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _fmt(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}h${String(min % 60).padStart(2, '0')}`;
}

function _toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast toast-info';
  t.textContent = msg;
  document.getElementById('toast-container')?.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
