/* =========================================================
   BLOC 01 — IMPORTS PRINCIPAUX
   ========================================================= */
import { loadSites, cacheSitesLocally, getDataStats, applyManualGpsCorrection, recalcDistances } from './data-loader.js';
import { initMap, fitBoundsToSites, flyToSite, showUserLocationMarker, clearUserLocationMarker, renderTrack, clearTrack, addTrackPoint, toggleMapLayer, isSatelliteMode, invalidateMapSize } from './map.js';
import { renderSiteMarkers, buildSiteBadges, focusOnSite } from './markers.js';
import { applyFilter, applyTextFilter, applyDistanceFilter, sortSites, initFilterChips, setProcheThreshold } from './filters.js';
import { requestUserLocation, getStoredOrigin, saveOrigin, clearUserLocation, getStoredMaxKm, saveMaxKm, isUsingGps, ORIGIN_DEFAULT } from './geolocation.js';
import { enrichSitesWithEcoScore, getBestDeals } from './economy-engine.js';
import { loadVehicleProfile, saveVehicleProfile, getVehicleLabel, isVehicleConfigured } from './vehicle-profile.js';
import { initGlobalSearch, interpretSearchQuery } from './global-search.js';
import { openSiteDetail, closeSiteDetail, openGpsEditDialog } from './site-detail.js';
import { generateSurprise, renderSurpriseCard } from './surprise-engine.js';
import { initNavTabs, renderSitesList, renderEconomyPanel, showLoading, switchToPanel } from './ui.js';
import { initNetworkManager, getNetworkStatus } from './network-manager.js';
import { initNetworkUI } from './network-ui.js';
import { loadAllPhotos, importPhotos } from './photos.js';
import { renderPhotoMarkers } from './photo-map.js';
import { syncPendingPhotos, getSyncStatus, setupAutoSync, schedulePhotoForSync } from './photo-sync.js';
import { lsGet, lsSet } from './storage.js';
import { startTracking, stopTracking, isTracking, loadTrackPoints, getAllSessions, updateSessionVisibility, exportAsGPX, getActiveSessionId, getLiveStats, calculateWaterNeeds, getActivityConfig, getActivityModes } from './tracker.js';
import { showToast } from './utils.js';
import { buildVerificationLinks } from './energy-rules.js';
import { exportAllData, importData } from './import-export.js';
import { addGoogleSearchToHistory } from './google-search.js';
import { initWelcomeScreen, showWelcomeScreen } from './welcome.js';
import { initAuthScreen, logout, getCurrentUser } from './auth.js';
// Imports lazy — chargés à la demande pour ne pas bloquer le démarrage
let _fetchWeather = null;
let _renderCarnet = null;
let _saveJournalToSession = null;
async function _loadWeather() {
  if (!_fetchWeather) { try { const m = await import('./weather.js'); _fetchWeather = m.fetchWeather; } catch(e) {} }
  return _fetchWeather;
}
async function _loadCarnet() {
  if (!_renderCarnet) { try { const m = await import('./carnet.js'); _renderCarnet = m.renderCarnet; _saveJournalToSession = m.saveJournalToSession; } catch(e) {} }
}

/* =========================================================
   BLOC 02 — ÉTAT APPLICATIF LOCAL
   ========================================================= */
let _sites = [];
let _filteredSites = [];
let _vehicleProfile = null;
let _currentFilter = 'all';
let _searchQuery = '';
let _maxDistanceKm = 100; // 100 km par défaut
let _originCoords  = null; // {lat, lon} — null = UCHAUD_COORDS

/* =========================================================
   BLOC 03 — INITIALISATION PRINCIPALE
   ========================================================= */
async function init() {
  const _dbg = document.getElementById('dbg');
  if (_dbg) _dbg.textContent = 'HTML✓ CSS✓ JS✓ — init()…';
  initAuthScreen(async (user) => {
  if (_dbg) _dbg.textContent = 'auth OK — startApp()…';
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.classList.remove('hidden');
      logoutBtn.title = `${user.username}`;
      logoutBtn.textContent = `👤 ${user.username}`;
      logoutBtn.addEventListener('click', () => { logout(); location.reload(); });
    }
    try { await startApp(); } catch(err) {
      const d = document.getElementById('critical-error');
      if (d) { d.style.display='block'; d.textContent='Erreur: '+err.message; }
    }
  });
}

async function startApp() {
  const _d = document.getElementById('dbg');
  const _upd = (t) => { if (_d) _d.textContent = t; };

  _upd('1/6 network…');
  initNetworkManager();
  initNetworkUI();

  _upd('2/6 map init…');
  initMap('map');
  setTimeout(() => {
    const m = document.getElementById('map');
    _upd('map: ' + (m ? m.clientWidth+'x'+m.clientHeight : 'introuvable'));
  }, 600);
  setTimeout(() => invalidateMapSize(), 300);
  setTimeout(() => invalidateMapSize(), 800);

  _upd('3/6 nav+vehicle…');
  initNavTabs(onPanelChange);
  _vehicleProfile = loadVehicleProfile();
  applyVehicleToUI(_vehicleProfile);
  initVehicleSettingsUI();

  _upd('4/6 loadSites…');
  showLoading('sites-list', 'Chargement des sites…');
  try {
    _sites = await loadSites();
    await cacheSitesLocally(_sites);
    _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
    _filteredSites = sortSites([..._sites], 'distance');
    renderAll();
    const stats = getDataStats(_sites);
    if (stats.withoutGps > 0) showToast(`${stats.withoutGps} site(s) sans coordonnées GPS — badge affiché.`, 'warning', 5000);
  } catch(e) {
    _upd('ERREUR sites: ' + e.message);
    showToast('Erreur chargement données. Mode hors ligne activé.', 'error');
  }

  _upd('5/6 photos+search…');
  initPhotoUI();
  setupAutoSync(getNetworkStatus);

  // Barre recherche globale
  initGlobalSearch({
    input: document.getElementById('global-search-input'),
    clearBtn: document.getElementById('search-clear-btn'),
    suggestionsEl: document.getElementById('search-suggestions'),
    onSearch: onSearch,
    onSuggestion: onSuggestion
  });

  // Filtres rapides
  initFilterChips(onFilterChange);

  // Barre localisation + slider distance
  initLocationBar();

  _upd('6/6 welcome+panel…');
  initWelcomeScreen(onWelcomeModeSelect);
  switchToPanel('panel-map');
  setTimeout(() => { invalidateMapSize(); fitBoundsToSites(_filteredSites); }, 200);
  setTimeout(() => { _upd('✅ APP OK — ' + (_sites.length||0) + ' sites'); }, 500);

  // Enregistrement de parcours GPS
  initTrackingUI();

  // Bascule couche carte
  document.getElementById('btn-map-layer')?.addEventListener('click', () => {
    const isSat = toggleMapLayer();
    const btn = document.getElementById('btn-map-layer');
    if (btn) btn.textContent = isSat ? '🗺️ Carte' : '🛰️ Satellite';
  });

  // Bouton surprise
  document.getElementById('btn-surprise')?.addEventListener('click', onSurpriseClick);

  // Bouton véhicule rapide (header)
  document.getElementById('btn-vehicle-quick')?.addEventListener('click', () => switchToPanel('panel-settings'));

  // Import/export
  document.getElementById('btn-export-data')?.addEventListener('click', exportAllData);
  document.getElementById('btn-import-data')?.addEventListener('click', () =>
    document.getElementById('import-data-input')?.click());
  document.getElementById('import-data-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (file) await importData(file);
  });

  // Liens vérification énergie
  renderEnergyVerificationLinks();

  // Reset SW / cache
  document.getElementById('btn-reset-sw')?.addEventListener('click', async () => {
    if (!confirm('Vider le cache et recharger ? Vos données locales sont conservées.')) return;
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    }
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
    location.reload(true);
  });

  // Exposition globale pour popups/modales
  window.__openSiteDetail = (siteId) => {
    const site = _sites.find(s => s.id === siteId);
    if (site) openSiteDetail(site, _vehicleProfile);
  };
  window.__openGpsEdit = (siteId) => {
    openGpsEditDialog(siteId, async (id, lat, lon) => {
      _sites = await applyManualGpsCorrection(id, lat, lon, _sites);
      _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
      renderAll();
      showToast('Coordonnées GPS mises à jour.', 'success');
    });
  };
  window.__addToDayPlan = (siteId) => {
    const site = _sites.find(s => s.id === siteId);
    if (site) showToast(`${site.destination} ajouté au programme.`, 'success');
  };
  window.__openPhotoForSite = (siteId) => switchToPanel('panel-photos');
  window.__trackGoogleSearch = (label, url) => addGoogleSearchToHistory(decodeURIComponent(label), url);
  window.__exportDayPlan = (format) => showToast('Export programme — fonctionnalité complète disponible dans les prochaines versions.', 'info');

  // Fermeture modales
  document.getElementById('modal-close-btn')?.addEventListener('click', closeSiteDetail);
  document.getElementById('day-plan-close-btn')?.addEventListener('click', () => {
    document.getElementById('day-plan-modal')?.classList.add('hidden');
  });
  document.getElementById('journal-modal-close')?.addEventListener('click', () => {
    document.getElementById('journal-modal')?.classList.add('hidden');
  });
  document.getElementById('journal-modal-overlay')?.addEventListener('click', () => {
    document.getElementById('journal-modal')?.classList.add('hidden');
  });
}

/* =========================================================
   BLOC 04 — RENDU GLOBAL
   ========================================================= */
function renderAll() {
  renderSiteMarkers(_filteredSites, (site) => openSiteDetail(site, _vehicleProfile));
  renderSitesList(_filteredSites, _vehicleProfile, (site) => {
    openSiteDetail(site, _vehicleProfile);
    focusOnSite(site);
  });
  const bestDeals = getBestDeals(_filteredSites, 30);
  renderEconomyPanel(bestDeals);
  renderPhotoMarkers((photo) => {
    if (photo.site_id) {
      const site = _sites.find(s => s.id === photo.site_id);
      if (site) openSiteDetail(site, _vehicleProfile);
    }
  });
}

/* =========================================================
   BLOC 05 — FILTRES ET RECHERCHE
   ========================================================= */
function onFilterChange(filterKey) {
  _currentFilter = filterKey;
  applyFiltersAndRender();
}

function onSearch(query) {
  _searchQuery = query;
  applyFiltersAndRender();
}

function onSuggestion(suggestion) {
  const input = document.getElementById('global-search-input');
  if (input) input.value = suggestion.label || '';
  if (suggestion.filter) onFilterChange(suggestion.filter);
  if (suggestion.sortBy === 'eco_score') {
    _filteredSites = sortSites(_filteredSites, 'eco_score');
    renderAll();
  }
  if (suggestion.intent === 'surprise') onSurpriseClick();
  if (suggestion.label) onSearch(suggestion.label);
}

function applyFiltersAndRender() {
  let results = [..._sites];
  results = applyFilter(results, _currentFilter);
  results = applyDistanceFilter(results, _maxDistanceKm);
  if (_searchQuery) {
    const interpreted = interpretSearchQuery(_searchQuery, results);
    results = interpreted.results;
  }
  results = sortSites(results, 'eco_score');
  _filteredSites = results;
  renderAll();
  const info = document.getElementById('list-stats');
  if (info) {
    const distLabel = _maxDistanceKm >= 150 ? 'tous rayons' : `≤ ${_maxDistanceKm} km`;
    info.textContent = `${results.length} site(s) — ${distLabel} — filtre : ${_currentFilter}`;
  }
}

/* =========================================================
   BLOC 05b — BARRE LOCALISATION + DISTANCE
   ========================================================= */
function initLocationBar() {
  // Restaurer l'état sauvegardé
  const saved = getStoredOrigin();
  _originCoords = { lat: saved.lat, lon: saved.lon };
  _maxDistanceKm = getStoredMaxKm();

  const btn    = document.getElementById('btn-gps-location');
  const label  = document.getElementById('location-label');
  const slider = document.getElementById('distance-slider');
  const display = document.getElementById('distance-display');
  const chipProche = document.getElementById('chip-proche');

  function updateLocationUI() {
    const usingGps = isUsingGps();
    if (btn) btn.classList.toggle('gps-active', usingGps);
    const origin = getStoredOrigin();
    if (label) label.textContent = origin.label;
  }

  function updateDistanceUI(km) {
    if (display) display.textContent = km >= 150 ? 'Tous' : `${km} km`;
    if (chipProche) chipProche.textContent = km >= 150 ? 'Proche (<30km)' : `Proche (<${km}km)`;
    setProcheThreshold(Math.min(km, 30));
  }

  // Initialiser UI avec valeurs sauvegardées
  if (slider) slider.value = _maxDistanceKm;
  updateDistanceUI(_maxDistanceKm);
  updateLocationUI();

  // Afficher le marqueur si une position GPS est déjà enregistrée
  if (isUsingGps()) {
    const origin = getStoredOrigin();
    showUserLocationMarker(origin.lat, origin.lon, origin.label, _maxDistanceKm < 150 ? _maxDistanceKm : null);
  }

  // Slider distance
  slider?.addEventListener('input', () => {
    const km = parseInt(slider.value, 10);
    _maxDistanceKm = km;
    saveMaxKm(km);
    updateDistanceUI(km);
    // Redessiner le cercle sur la carte
    const origin = getStoredOrigin();
    if (isUsingGps()) {
      showUserLocationMarker(origin.lat, origin.lon, origin.label, km < 150 ? km : null);
    }
    applyFiltersAndRender();
  });

  // Bouton GPS
  btn?.addEventListener('click', async () => {
    if (isUsingGps()) {
      // Basculer vers Uchaud
      clearUserLocation();
      _originCoords = { lat: ORIGIN_DEFAULT.lat, lon: ORIGIN_DEFAULT.lon };
      clearUserLocationMarker();
      _sites = recalcDistances(_sites, ORIGIN_DEFAULT.lat, ORIGIN_DEFAULT.lon);
      _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
      updateLocationUI();
      applyFiltersAndRender();
      showToast('Point de départ : Uchaud', 'info');
      return;
    }
    // Demander la localisation GPS
    btn.classList.add('gps-loading');
    if (label) label.textContent = 'Localisation…';
    try {
      const pos = await requestUserLocation();
      saveOrigin(pos.lat, pos.lon, 'Ma position');
      _originCoords = pos;
      _sites = recalcDistances(_sites, pos.lat, pos.lon);
      _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
      showUserLocationMarker(pos.lat, pos.lon, 'Ma position', _maxDistanceKm < 150 ? _maxDistanceKm : null);
      updateLocationUI();
      applyFiltersAndRender();
      flyToSite(pos.lat, pos.lon, 11);
      showToast('Position GPS détectée — distances recalculées.', 'success');
    } catch(err) {
      showToast(err.message, 'error');
      if (label) label.textContent = getStoredOrigin().label;
    } finally {
      btn.classList.remove('gps-loading');
    }
  });
}

/* =========================================================
   BLOC 06 — PANNEAU CHANGEMENT
   ========================================================= */
async function onPanelChange(panelId) {
  if (panelId === 'panel-map') {
    setTimeout(() => { invalidateMapSize(); fitBoundsToSites(_filteredSites); }, 50);
  }
  if (panelId === 'panel-photos') updatePhotoPanel();
  if (panelId === 'panel-carnet') {
    const container = document.getElementById('carnet-container');
    await _loadCarnet();
    if (container && _renderCarnet) _renderCarnet(container, { onShowOnMap: onCarnetShowOnMap });
  }
}

async function onCarnetShowOnMap(sessionId) {
  const { loadTrackPoints } = await import('./tracker.js');
  const pts = await loadTrackPoints(sessionId);
  if (!pts.length) { showToast('Aucun point GPS enregistré.', 'warning'); return; }
  renderTrack(pts);
  switchToPanel('panel-map');
  setTimeout(() => { invalidateMapSize(); }, 100);
  showToast('Parcours affiché sur la carte.', 'success');
}

/* =========================================================
   BLOC 07 — MOTEUR SURPRISE
   ========================================================= */
function onSurpriseClick() {
  const profile = _vehicleProfile;
  const avoidTolls = profile?.avoid_tolls ?? true;
  const card = generateSurprise(_sites, profile, { maxKm: 80, avoidTolls });
  const html = renderSurpriseCard(card);
  const modal = document.getElementById('site-detail-modal');
  const content = document.getElementById('site-detail-content');
  if (modal && content) {
    content.innerHTML = `<h3 style="margin-bottom:12px;color:#e94560">🎲 Idée surprise !</h3>${html}`;
    modal.classList.remove('hidden');
  }
}

/* =========================================================
   BLOC 08 — PROFIL VÉHICULE UI
   ========================================================= */
function initVehicleSettingsUI() {
  // Sélection type véhicule
  document.querySelectorAll('.vtype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vtype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const vtype = btn.dataset.vtype;
      document.getElementById('thermal-params')?.classList.toggle('hidden', vtype === 'electric');
      document.getElementById('electric-params')?.classList.toggle('hidden', vtype === 'thermal');
    });
  });

  // Range recharge domicile
  const rangeEl = document.getElementById('home-charge-ratio');
  const displayEl = document.getElementById('home-charge-ratio-display');
  rangeEl?.addEventListener('input', () => {
    if (displayEl) displayEl.textContent = `${rangeEl.value}%`;
  });

  // Mode recharge
  document.getElementById('charge-mode')?.addEventListener('change', e => {
    const mixed = document.getElementById('mixed-charge-params');
    if (mixed) mixed.style.display = e.target.value === 'mixed' ? 'block' : 'none';
  });

  // Enregistrer véhicule
  document.getElementById('btn-save-vehicle')?.addEventListener('click', () => {
    const vtype = document.querySelector('.vtype-btn.active')?.dataset.vtype || 'unknown';
    const profile = {
      vehicle_type: vtype,
      fuel_type: document.getElementById('fuel-type')?.value || 'essence',
      thermal_consumption_l_100: parseFloat(document.getElementById('thermal-consumption')?.value) || 6.5,
      electric_consumption_kwh_100: parseFloat(document.getElementById('ev-consumption')?.value) || 17,
      fuel_price_per_liter: parseFloat(document.getElementById('fuel-price')?.value) || null,
      home_kwh_price: parseFloat(document.getElementById('home-kwh-price')?.value) || null,
      public_kwh_price: parseFloat(document.getElementById('public-kwh-price')?.value) || null,
      charge_mode: document.getElementById('charge-mode')?.value || 'home',
      home_charge_ratio: (parseInt(document.getElementById('home-charge-ratio')?.value) || 70) / 100,
      public_charge_ratio: 1 - ((parseInt(document.getElementById('home-charge-ratio')?.value) || 70) / 100),
      charging_loss_percent: parseFloat(document.getElementById('charging-loss')?.value) || 10,
      safety_margin_percent: parseFloat(document.getElementById('safety-margin')?.value) || 10,
      avoid_tolls: document.getElementById('avoid-tolls')?.checked ?? true
    };
    _vehicleProfile = saveVehicleProfile(profile);
    _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
    renderAll();
    const status = document.getElementById('vehicle-save-status');
    if (status) { status.textContent = `✅ Profil enregistré : ${getVehicleLabel(_vehicleProfile)}`; status.style.color = '#27ae60'; }
    showToast('Véhicule enregistré — coûts recalculés.', 'success');
  });

  // Test NAS
  document.getElementById('btn-test-nas')?.addEventListener('click', async () => {
    const url = document.getElementById('nas-url')?.value?.trim();
    const key = document.getElementById('nas-api-key')?.value?.trim();
    if (!url) { showToast('Saisissez l\'URL du NAS', 'warning'); return; }
    lsSet('nas_url', url);
    lsSet('nas_api_key', key || '');
    const { checkNasHealth } = await import('./nas-api-client.js');
    const result = await checkNasHealth();
    const status = document.getElementById('nas-test-status');
    if (status) {
      status.textContent = result.ok ? '✅ NAS accessible' : `❌ ${result.reason}`;
      status.style.color = result.ok ? '#27ae60' : '#e74c3c';
    }
  });

  // Enregistrer NAS
  document.getElementById('btn-save-nas')?.addEventListener('click', () => {
    lsSet('nas_url', document.getElementById('nas-url')?.value?.trim() || '');
    lsSet('nas_api_key', document.getElementById('nas-api-key')?.value?.trim() || '');
    showToast('Configuration NAS enregistrée.', 'success');
  });

  // Pré-remplir avec profil existant
  applyVehicleToUI(_vehicleProfile);
}

function applyVehicleToUI(profile) {
  if (!profile || profile.vehicle_type === 'unknown') return;
  const vtypeBtn = document.querySelector(`[data-vtype="${profile.vehicle_type}"]`);
  if (vtypeBtn) {
    document.querySelectorAll('.vtype-btn').forEach(b => b.classList.remove('active'));
    vtypeBtn.classList.add('active');
  }
  const thermalEl = document.getElementById('thermal-params');
  const electricEl = document.getElementById('electric-params');
  if (thermalEl) thermalEl.classList.toggle('hidden', profile.vehicle_type === 'electric');
  if (electricEl) electricEl.classList.toggle('hidden', profile.vehicle_type === 'thermal');
  const setCond = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  setCond('fuel-type', profile.fuel_type);
  setCond('thermal-consumption', profile.thermal_consumption_l_100);
  setCond('fuel-price', profile.fuel_price_per_liter);
  setCond('ev-consumption', profile.electric_consumption_kwh_100);
  setCond('home-kwh-price', profile.home_kwh_price);
  setCond('public-kwh-price', profile.public_kwh_price);
  setCond('charge-mode', profile.charge_mode);
  setCond('charging-loss', profile.charging_loss_percent);
  setCond('safety-margin', profile.safety_margin_percent);
  const avoidEl = document.getElementById('avoid-tolls');
  if (avoidEl) avoidEl.checked = profile.avoid_tolls !== false;
  const nasUrl = lsGet('nas_url');
  if (nasUrl) { const el = document.getElementById('nas-url'); if (el) el.value = nasUrl; }
}

/* =========================================================
   BLOC 09 — PHOTOS UI
   ========================================================= */
function initPhotoUI() {
  const photoInput = document.getElementById('photo-file-input');
  document.getElementById('btn-take-photo')?.addEventListener('click', () => {
    if (photoInput) { photoInput.accept = 'image/*'; photoInput.capture = 'environment'; photoInput.click(); }
  });
  document.getElementById('btn-import-photo')?.addEventListener('click', () => {
    if (photoInput) { photoInput.removeAttribute('capture'); photoInput.click(); }
  });
  photoInput?.addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    showToast(`Import de ${files.length} photo(s)…`, 'info');
    const imported = await importPhotos(files, _sites, (cur, tot) => {
      const status = document.getElementById('photo-sync-status');
      if (status) status.textContent = `Import photo ${cur}/${tot}…`;
    });
    for (const photo of imported) await schedulePhotoForSync(photo);
    updatePhotoPanel();
    showToast(`${imported.length} photo(s) importée(s) et sauvegardée(s).`, 'success');
    photoInput.value = '';
  });

  document.getElementById('btn-sync-photos')?.addEventListener('click', async () => {
    const status = document.getElementById('photo-sync-status');
    if (status) status.textContent = '☁️ Synchronisation en cours…';
    const result = await syncPendingPhotos((p) => {
      if (status) status.textContent = `☁️ Photo ${p.current}/${p.total} : ${p.filename}`;
    });
    const msg = result.ok
      ? `✅ ${result.synced} photo(s) synchronisée(s)${result.errors > 0 ? ` — ${result.errors} erreur(s)` : ''}`
      : `❌ ${result.reason}`;
    if (status) { status.textContent = msg; status.style.color = result.ok ? '#27ae60' : '#e74c3c'; }
    showToast(msg, result.ok ? 'success' : 'error');
  });
}

async function updatePhotoPanel() {
  const grid = document.getElementById('photos-grid');
  if (!grid) return;
  const photos = await loadAllPhotos();
  const status = document.getElementById('photo-sync-status');
  const syncStats = await getSyncStatus();
  if (status) status.textContent = `${syncStats.total_photos} photo(s) — ${syncStats.synced_photos} synchronisée(s) — ${syncStats.pending} en attente`;

  if (!photos.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📷</div><div class="empty-state-text">Aucune photo</div><div class="empty-state-sub">Prenez une photo ou importez depuis votre galerie</div></div>';
    return;
  }
  grid.innerHTML = photos.map(photo => `
    <div class="photo-thumb ${photo.sync_status === 'synced' ? 'photo-synced' : 'photo-pending'}"
         onclick="window.__viewPhoto('${photo.id}')">
      ${photo.thumbnail ? `<img src="${photo.thumbnail}" alt="${photo.filename}" loading="lazy" />` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:30px">📷</div>'}
      <div class="photo-thumb-badge">${photo.sync_status === 'synced' ? '✅' : '⏳'}</div>
    </div>`).join('');

  window.__viewPhoto = (id) => {
    const photo = photos.find(p => p.id === id);
    if (photo?.site_id) window.__openSiteDetail(photo.site_id);
  };
}

/* =========================================================
   BLOC 10 — LIENS VÉRIFICATION ÉNERGIE
   ========================================================= */
function renderEnergyVerificationLinks() {
  const container = document.getElementById('energy-verification-links');
  if (!container) return;
  const links = buildVerificationLinks(_vehicleProfile);
  container.innerHTML = links.map(l =>
    `<a href="${l.url}" target="_blank" rel="noopener noreferrer" class="verification-link-btn">${l.icon} ${l.label}</a>`
  ).join('');
}

/* =========================================================
   BLOC 10b — SÉLECTION MODE ACCUEIL
   ========================================================= */
function onWelcomeModeSelect(mode) {
  if (!mode) return;
  switchToPanel(mode.panel);

  if (mode.trackMode) {
    document.querySelectorAll('.activity-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode.trackMode);
    });
  }

  // Laisser le DOM se mettre à jour avant d'agir sur la carte
  setTimeout(() => {
    if (mode.id === 'car') {
      _filteredSites = sortSites([..._sites], 'distance');
      renderAll();
    } else if (mode.id === 'map' || mode.trackMode) {
      invalidateMapSize();
      fitBoundsToSites(_filteredSites);
    } else if (mode.id === 'deals') {
      renderEconomyPanel(getBestDeals(_filteredSites, 30));
    }
  }, 100);
}

/* =========================================================
   BLOC 11 — SUIVI GPS (tracé parcours)
   ========================================================= */
function initTrackingUI() {
  const btnToggle  = document.getElementById('btn-track-toggle');
  const btnExport  = document.getElementById('btn-track-export');
  const btnVis     = document.getElementById('btn-track-visibility');
  const trackInfo  = document.getElementById('track-info');
  const trackLabel = document.getElementById('track-label');
  const trackIcon  = btnToggle?.querySelector('.track-icon');
  const timerEl    = document.getElementById('track-timer');
  const metricsEl  = document.getElementById('sport-metrics');
  const tempSlider = document.getElementById('temp-slider');
  const tempDisplay = document.getElementById('temp-display');
  const weightInput = document.getElementById('weight-input');
  const btnVoice    = document.getElementById('btn-voice-coach');
  let _weightKg     = parseInt(localStorage.getItem('trekko_weight_kg') || '70', 10);
  let _voiceEnabled = false;
  let _lastVoiceKm  = 0;
  let _lastWaterReminderMin = 0;
  if (weightInput) weightInput.value = _weightKg;

  let _timerInterval = null;
  let _startTime     = null;
  let _isPublic      = false;
  let _activityMode  = 'running';
  let _tempCelsius   = 20;

  // Sélecteur activité
  document.querySelectorAll('.activity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isTracking()) return;
      document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activityMode = btn.dataset.mode;
    });
  });

  // Slider température
  tempSlider?.addEventListener('input', () => {
    _tempCelsius = parseInt(tempSlider.value, 10);
    if (tempDisplay) {
      const color = _tempCelsius >= 30 ? '#e74c3c' : _tempCelsius >= 25 ? '#f5a623' : '#5dade2';
      tempDisplay.textContent = `${_tempCelsius}°C`;
      tempDisplay.style.color = color;
    }
  });

  // Poids
  weightInput?.addEventListener('change', () => {
    _weightKg = parseInt(weightInput.value, 10) || 70;
    localStorage.setItem('trekko_weight_kg', String(_weightKg));
  });

  // Coaching vocal
  btnVoice?.addEventListener('click', () => {
    _voiceEnabled = !_voiceEnabled;
    if (btnVoice) btnVoice.textContent = _voiceEnabled ? '🔊 Son' : '🔇 Son';
    if (_voiceEnabled && 'speechSynthesis' in window) {
      speak('Coaching vocal activé');
    }
  });

  function speak(text) {
    if (!_voiceEnabled || !('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'fr-FR';
    utter.rate = 1.0;
    utter.volume = 0.9;
    window.speechSynthesis.speak(utter);
  }

  function formatTimer(startTime) {
    const s = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}h${String(m).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`;
  }

  function formatPace(paceMinKm) {
    if (!paceMinKm || paceMinKm > 60) return '—';
    const min = Math.floor(paceMinKm);
    const sec = Math.round((paceMinKm - min) * 60);
    return `${min}'${String(sec).padStart(2,'0')}"`;
  }

  function getPaceZoneClass(paceMinKm) {
    if (!paceMinKm) return '';
    if (paceMinKm < 4.5)  return 'pace-intense';
    if (paceMinKm < 5.5)  return 'pace-hard';
    if (paceMinKm < 7.0)  return 'pace-moderate';
    return 'pace-easy';
  }

  function updateMetrics() {
    if (!_startTime) return;
    const stats = getLiveStats();
    const durationMin = (Date.now() - _startTime) / 60000;
    const water = calculateWaterNeeds(_activityMode, durationMin, _tempCelsius);

    if (timerEl) timerEl.textContent = formatTimer(_startTime);

    const distEl  = document.getElementById('metric-distance');
    const speedEl = document.getElementById('metric-speed');
    const paceEl  = document.getElementById('metric-pace');
    const elevEl  = document.getElementById('metric-elev');
    const waterEl = document.getElementById('water-advice');

    if (distEl)  distEl.textContent  = stats.distanceKm.toFixed(2);
    if (speedEl) speedEl.textContent = stats.speedKmh.toFixed(1);
    if (paceEl)  paceEl.textContent  = formatPace(stats.paceMinKm);
    if (elevEl)  elevEl.textContent  = `+${stats.elevGainM}`;

    // Zone d'allure (couleur)
    if (paceEl) {
      paceEl.className = 'metric-value ' + getPaceZoneClass(stats.paceMinKm);
    }

    // Calories
    const calEl = document.getElementById('metric-calories');
    if (calEl) calEl.textContent = stats.calories || 0;

    // Auto-pause badge
    if (distEl) distEl.style.opacity = stats.autoPaused ? '0.5' : '1';

    // Alertes vocales — split km
    if (stats.splits && stats.splits.length > _lastVoiceKm) {
      const split = stats.splits[stats.splits.length - 1];
      const paceStr = split.paceMinKm ? formatPace(split.paceMinKm) : '';
      speak(`Kilomètre ${split.km} — allure ${paceStr}`);
      _lastVoiceKm = stats.splits.length;
    }

    // Rappel eau toutes les 20 min
    if (durationMin - _lastWaterReminderMin >= 20 && _lastWaterReminderMin >= 0) {
      const water2 = calculateWaterNeeds(_activityMode, durationMin, _tempCelsius);
      speak(`N'oublie pas de boire. Objectif ${water2.mlPerHour} millilitres par heure.`);
      _lastWaterReminderMin = durationMin;
    }

    if (waterEl) {
      const totalL = (water.totalMl / 1000).toFixed(2);
      waterEl.textContent = `Boire ${water.mlPerHour} mL/h · total recommandé ${totalL} L`;
    }
  }

  function setActiveUI(active) {
    if (btnToggle) {
      btnToggle.classList.toggle('track-recording', active);
      if (trackIcon) trackIcon.textContent = active ? '⏹' : '⏺';
      if (trackLabel) trackLabel.textContent = active ? 'Stop' : 'Enregistrer';
    }
    trackInfo?.classList.toggle('hidden', !active);
    btnExport?.classList.toggle('hidden', !active);
    btnVis?.classList.toggle('hidden', !active);
    metricsEl?.classList.toggle('hidden', !active);
    // Bloquer le changement d'activité pendant l'enregistrement
    document.querySelectorAll('.activity-btn').forEach(b => {
      b.style.pointerEvents = active ? 'none' : '';
      b.style.opacity = active ? '0.5' : '';
    });
    const tempCtrl = document.querySelector('.temp-control');
    if (tempCtrl) tempCtrl.style.opacity = active ? '0.5' : '';
    if (tempSlider) tempSlider.disabled = active;
  }

  function updateVisibilityBtn() {
    if (btnVis) {
      btnVis.textContent = _isPublic ? '🌍 Public' : '🔒 Privé';
      btnVis.title = _isPublic ? 'Cliquer pour rendre privé' : 'Cliquer pour rendre public';
    }
  }

  btnToggle?.addEventListener('click', async () => {
    if (isTracking()) {
      clearInterval(_timerInterval);
      _timerInterval = null;
      const stat = getLiveStats();
      _startTime = null;
      const finishedSid = await stopTracking();
      // Sauvegarder les calories finales dans la session
      await _loadCarnet();
      if (finishedSid && stat.calories > 0 && _saveJournalToSession) {
        await _saveJournalToSession(finishedSid, { final_calories: stat.calories });
      }
      setActiveUI(false);
      clearTrack();
      // Afficher le résumé enrichi + journal (style Polarsteps)
      showRunSummaryWithJournal(stat, _activityMode, _tempCelsius, _weightKg, finishedSid);
      showToast('Parcours arrêté et sauvegardé.', 'success');
    } else {
      const cfg = getActivityConfig(_activityMode);
      const defaultLabel = `${cfg.emoji} ${cfg.label} — ${new Date().toLocaleDateString('fr-FR')}`;
      const label = prompt('Nom du parcours :', defaultLabel) || defaultLabel;
      const newSid = await startTracking(label, _isPublic, _activityMode, _tempCelsius, _weightKg);
      _lastVoiceKm = 0;
      _lastWaterReminderMin = 0;
      _startTime = Date.now();
      setActiveUI(true);
      updateVisibilityBtn();
      updateMetrics();
      _timerInterval = setInterval(async () => {
        updateMetrics();
        const sid = getActiveSessionId();
        if (sid) {
          const pts = await loadTrackPoints(sid);
          renderTrack(pts);
        }
      }, 5000);
      showToast(`${cfg.emoji} ${cfg.label} démarré — GPS toutes les ${cfg.interval_ms >= 3600000 ? '60 min' : cfg.interval_ms >= 60000 ? Math.round(cfg.interval_ms/60000) + ' min' : Math.round(cfg.interval_ms/1000) + ' sec'}.`, 'info', 4000);
      // Météo automatique au démarrage (style Polarsteps)
      _fetchWeatherForSession(newSid);
    }
  });

  btnExport?.addEventListener('click', async () => {
    const sid = getActiveSessionId();
    if (!sid) return;
    const pts = await loadTrackPoints(sid);
    if (!pts.length) { showToast('Aucun point enregistré.', 'warning'); return; }
    const sessions = await getAllSessions();
    const session  = sessions.find(s => s.id === sid);
    exportAsGPX(pts, session?.label || 'Parcours');
    showToast('Fichier GPX téléchargé.', 'success');
  });

  btnVis?.addEventListener('click', async () => {
    _isPublic = !_isPublic;
    updateVisibilityBtn();
    const sid = getActiveSessionId();
    if (sid) await updateSessionVisibility(sid, _isPublic);
    showToast(_isPublic ? '🌍 Parcours public.' : '🔒 Parcours privé.', 'info');
  });

  // Historique des parcours
  const btnHistory = document.getElementById('btn-track-history');
  const historyPanel = document.getElementById('track-history-panel');
  const historyList = document.getElementById('track-history-list');
  const btnHistoryClose = document.getElementById('btn-track-history-close');

  async function renderTrackHistory() {
    const sessions = await getAllSessions();
    if (!sessions.length) {
      if (historyList) historyList.innerHTML = '<div style="padding:16px;text-align:center;color:#7a7d99;font-size:13px">Aucun parcours enregistré</div>';
      return;
    }
    if (!historyList) return;
    historyList.innerHTML = sessions
      .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
      .map(s => {
        const date = s.started_at ? new Date(s.started_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
        const modeEmoji = { running:'🏃', hiking:'🥾', walking:'🚶', casual:'🗺️' }[s.activity_mode] || '📍';
        return `<div class="track-history-item" data-sid="${s.id}">
          <span style="font-size:20px">${modeEmoji}</span>
          <div class="track-history-item-info">
            <div class="track-history-item-label">${s.label || 'Parcours'}</div>
            <div class="track-history-item-meta">${date} · ${s.is_public ? '🌍 Public' : '🔒 Privé'}</div>
          </div>
          <div class="track-history-item-actions">
            <button class="track-history-btn" data-action="show" data-sid="${s.id}" title="Afficher sur la carte">🗺️</button>
            <button class="track-history-btn" data-action="gpx"  data-sid="${s.id}" title="Exporter GPX">⬇️</button>
          </div>
        </div>`;
      }).join('');

    historyList.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sid = btn.dataset.sid;
        const pts = await loadTrackPoints(sid);
        const sessions2 = await getAllSessions();
        const sess = sessions2.find(s => s.id === sid);
        if (btn.dataset.action === 'show') {
          renderTrack(pts);
          historyPanel?.classList.add('hidden');
        } else if (btn.dataset.action === 'gpx') {
          exportAsGPX(pts, sess?.label || 'Parcours');
        }
      });
    });
  }

  btnHistory?.addEventListener('click', async () => {
    const isHidden = historyPanel?.classList.contains('hidden');
    if (isHidden) {
      historyPanel?.classList.remove('hidden');
      await renderTrackHistory();
    } else {
      historyPanel?.classList.add('hidden');
    }
  });
  btnHistoryClose?.addEventListener('click', () => historyPanel?.classList.add('hidden'));
}

/* ── Météo automatique (style Polarsteps : récupère la météo au démarrage) ── */
async function _fetchWeatherForSession(sessionId) {
  if (!sessionId) return;
  try {
    const origin = getStoredOrigin();
    if (!origin || !origin.lat) return;
    const fetchWeather = await _loadWeather();
    if (!fetchWeather) return;
    const weather = await fetchWeather(origin.lat, origin.lon);
    if (weather) {
      await _loadCarnet();
      if (_saveJournalToSession) await _saveJournalToSession(sessionId, {
        weather_emoji: weather.emoji,
        weather_temp: weather.temp
      });
      showToast(`Météo : ${weather.emoji} ${weather.temp}°C — enregistrée pour cette sortie.`, 'info', 3000);
    }
  } catch(e) { /* météo optionnelle */ }
}

/* ── Résumé enrichi + journal post-sortie (style Polarsteps) ── */
function showRunSummaryWithJournal(stats, activityMode, tempC, weightKg, sessionId) {
  const cfg = getActivityConfig ? getActivityConfig(activityMode) : { emoji: '🏃', label: activityMode };
  const formatP = (p) => {
    if (!p || p > 60) return '—';
    const m = Math.floor(p); const s = Math.round((p - m) * 60);
    return `${m}'${String(s).padStart(2,'0')}"`;
  };
  const splitsHtml = (stats.splits || []).map(sp =>
    `<div class="split-row"><span class="split-km">Km ${sp.km}</span><span class="split-pace">${formatP(sp.paceMinKm)}</span></div>`
  ).join('') || '<div style="color:#7a7d99;font-size:12px">Pas assez de points pour les splits</div>';

  const MOODS = ['😊','💪','😌','🥵','😴','🌟','😰'];
  const moodHtml = MOODS.map(m =>
    `<button class="mood-btn post-mood-btn" data-mood="${m}" data-sid="${sessionId || ''}">${m}</button>`
  ).join('');

  const modal   = document.getElementById('journal-modal');
  const content = document.getElementById('journal-modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="run-summary">
      <h3>${cfg.emoji} Bilan — ${cfg.label}</h3>
      <div class="summary-grid">
        <div class="summary-stat">
          <span class="summary-stat-value">${stats.distanceKm.toFixed(2)}</span>
          <span class="summary-stat-label">km</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${stats.speedKmh.toFixed(1)}</span>
          <span class="summary-stat-label">km/h moy</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${formatP(stats.paceMinKm)}</span>
          <span class="summary-stat-label">allure moy</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">+${stats.elevGainM} m</span>
          <span class="summary-stat-label">dénivelé +</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${stats.calories}</span>
          <span class="summary-stat-label">kcal</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${tempC}°C</span>
          <span class="summary-stat-label">température</span>
        </div>
      </div>
      <div class="summary-splits">
        <h4>⏱ Splits par kilomètre</h4>
        ${splitsHtml}
      </div>

      <!-- Journal post-sortie style Polarsteps -->
      <div class="post-journal">
        <h4>📔 Mon journal de sortie</h4>
        <div class="journal-block">
          <div class="journal-block-label">Comment tu te sens ?</div>
          <div class="mood-picker post-mood-picker" data-sid="${sessionId || ''}">${moodHtml}</div>
        </div>
        <div class="journal-block">
          <div class="journal-block-label">Notes & souvenirs ✍️</div>
          <textarea id="post-journal-notes" class="carnet-notes-input"
            placeholder="Raconte ta sortie… lieux traversés, sensations, personnes croisées, anecdotes…" rows="4"></textarea>
        </div>
        <button class="btn-primary post-journal-save" id="btn-save-post-journal">💾 Enregistrer dans le carnet</button>
        <div id="post-journal-status" style="margin-top:8px;font-size:13px;color:#2ecc71"></div>
      </div>
    </div>`;

  modal.classList.remove('hidden');

  // Bindings journal post-sortie
  content.querySelectorAll('.post-mood-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      content.querySelectorAll('.post-mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (sessionId && _saveJournalToSession) await _saveJournalToSession(sessionId, { journal_mood: btn.dataset.mood });
    });
  });

  document.getElementById('btn-save-post-journal')?.addEventListener('click', async () => {
    const notes = document.getElementById('post-journal-notes')?.value || '';
    if (sessionId && notes && _saveJournalToSession) await _saveJournalToSession(sessionId, { journal_notes: notes });
    const status = document.getElementById('post-journal-status');
    if (status) status.textContent = '✅ Journal enregistré dans votre carnet !';
    showToast('Journal sauvegardé dans votre carnet.', 'success');
  });
}

function showRunSummary(stats, activityMode, tempC, weightKg) {
  const cfg = getActivityConfig ? getActivityConfig(activityMode) : { emoji: '🏃', label: activityMode };
  const formatP = (p) => {
    if (!p || p > 60) return '—';
    const m = Math.floor(p); const s = Math.round((p - m) * 60);
    return `${m}'${String(s).padStart(2,'0')}"`;
  };
  const splitsHtml = (stats.splits || []).map(sp =>
    `<div class="split-row"><span class="split-km">Km ${sp.km}</span><span class="split-pace">${formatP(sp.paceMinKm)}</span></div>`
  ).join('') || '<div style="color:#7a7d99;font-size:12px">Pas assez de points pour les splits</div>';

  const modal   = document.getElementById('site-detail-modal');
  const content = document.getElementById('site-detail-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="run-summary">
      <h3>${cfg.emoji} Résumé — ${cfg.label}</h3>
      <div class="summary-grid">
        <div class="summary-stat">
          <span class="summary-stat-value">${stats.distanceKm.toFixed(2)}</span>
          <span class="summary-stat-label">km</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${stats.speedKmh.toFixed(1)}</span>
          <span class="summary-stat-label">km/h moy</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${formatP(stats.paceMinKm)}</span>
          <span class="summary-stat-label">allure moy</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">+${stats.elevGainM} m</span>
          <span class="summary-stat-label">dénivelé +</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${stats.calories}</span>
          <span class="summary-stat-label">kcal</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">${tempC}°C</span>
          <span class="summary-stat-label">température</span>
        </div>
      </div>
      <div class="summary-splits">
        <h4>⏱ Splits par kilomètre</h4>
        ${splitsHtml}
      </div>
    </div>`;
  modal.classList.remove('hidden');
}

/* =========================================================
   BLOC 12 — DÉMARRAGE
   ========================================================= */
document.addEventListener('DOMContentLoaded', init);
