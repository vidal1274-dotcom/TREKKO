/* =========================================================
   BLOC 01 — IMPORTS PRINCIPAUX
   ========================================================= */
import { loadSites, cacheSitesLocally, getDataStats, applyManualGpsCorrection, recalcDistances } from './data-loader.js';
import { initMap, fitBoundsToSites, flyToSite, showUserLocationMarker, clearUserLocationMarker, showAddressMarker, clearAddressMarker, renderTrack, clearTrack, addTrackPoint, toggleMapLayer, isSatelliteMode, invalidateMapSize, renderDayPlanRoute, clearDayPlanRoute, toggleHybridLabelsEnhanced, isHybridLabelsEnhanced } from './map.js?v=4';
import { renderSiteMarkers, buildSiteBadges, focusOnSite } from './markers.js?v=4';
import { applyFilter, applyTextFilter, applyDistanceFilter, sortSites, initFilterChips, setProcheThreshold } from './filters.js';
import { requestUserLocation, getStoredOrigin, saveOrigin, clearUserLocation, getStoredMaxKm, saveMaxKm, isUsingGps, ORIGIN_DEFAULT, startWatchingPosition } from './geolocation.js';
import { enrichSitesWithEcoScore, getBestDeals } from './economy-engine.js';
import { loadVehicleProfile } from './vehicle-profile.js';
import { initGlobalSearch, interpretSearchQuery } from './global-search.js?v=11';
import { openSiteDetail, closeSiteDetail, openGpsEditDialog } from './site-detail.js?v=26';
import { generateSurprise, renderSurpriseCard } from './surprise-engine.js?v=26';
import { initNavTabs, renderSitesList, renderEconomyPanel, showLoading, switchToPanel } from './ui.js?v=25';
import { initNetworkManager, getNetworkStatus } from './network-manager.js';
import { initNetworkUI } from './network-ui.js';
import { loadAllPhotos, importPhotos } from './photos.js';
import { renderPhotoMarkers } from './photo-map.js?v=4';
import { syncPendingPhotos, getSyncStatus, setupAutoSync, schedulePhotoForSync } from './photo-sync.js';
import { lsGet, lsSet } from './storage.js';
import { startTracking, stopTracking, isTracking, loadTrackPoints, getAllSessions, updateSessionVisibility, exportAsGPX, getActiveSessionId, getLiveStats, calculateWaterNeeds, getActivityConfig, getActivityModes } from './tracker.js?v=2';
import { showToast } from './utils.js';
import { buildVerificationLinks } from './energy-rules.js';
import { exportAllData, importData } from './import-export.js';
import { addGoogleSearchToHistory } from './google-search.js';
import { initWelcomeScreen, showWelcomeScreen } from './welcome.js?v=4';
import { initAuthScreen, logout, getCurrentUser } from './auth.js';
import { generateDayPlan, renderDayPlan, saveDayPlan, loadSavedDayPlan, deleteSavedDayPlan, exportPlanAsText } from './day-plan.js?v=27';
import { getVisitedIds } from './visited.js?v=25';
import { initHikingScreen, showHikingScreen } from './hiking-screen.js?v=4';
import { initCircuitCreator } from './circuit-creator.js';
import {
  getAiStatus, testConnection
} from './ai-service.js';
import { clearRouteDistanceCache } from './routing-utils.js';
// Imports lazy — chargés à la demande pour ne pas bloquer le démarrage
let _fetchWeather = null;
let _renderCarnet = null;
let _saveJournalToSession = null;
let _initProg = null;
let _invalidateProgMap = null;
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
let _maxDistanceKm = 100;
let _originCoords  = null;
let _currentDayPlan = null;

/* =========================================================
   BLOC 03 — INITIALISATION PRINCIPALE
   ========================================================= */
async function init() {
  initAuthScreen(async (user) => {
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
  initNetworkManager();
  initNetworkUI();
  initMap('map');
  setTimeout(() => invalidateMapSize(), 200);
  setTimeout(() => invalidateMapSize(), 600);
  setTimeout(() => invalidateMapSize(), 1500);

  initNavTabs(onPanelChange);
  _vehicleProfile = loadVehicleProfile();
  initSettingsUI();

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
    showToast('Erreur chargement données. Mode hors ligne activé.', 'error');
  }

  initPhotoUI();
  setupAutoSync(getNetworkStatus);

  // Barre recherche globale
  initGlobalSearch({
    input: document.getElementById('global-search-input'),
    clearBtn: document.getElementById('search-clear-btn'),
    suggestionsEl: document.getElementById('search-suggestions'),
    onSearch: onSearch,
    onSuggestion: onSuggestion,
    getSites: () => _sites
  });

  // Filtres rapides
  initFilterChips(onFilterChange);

  // Barre localisation + slider distance
  initLocationBar();

  // GPS automatique — point bleu visible sur toutes les cartes dès le démarrage
  _startAutoGpsWatch();

  // Panneau de fond par défaut (initialise la carte Leaflet en arrière-plan)
  switchToPanel('panel-map');
  onPanelChange('panel-map');
  // Écran de choix d'activité — affiché au démarrage
  initWelcomeScreen(onWelcomeModeSelect);
  initHikingScreen();
  initCircuitCreator();
  initAiSettings();
  window._showWelcome = showWelcomeScreen;
  showWelcomeScreen();

  // Enregistrement de parcours GPS
  initTrackingUI();
  initRunningScreen();
  initScrollElevator();

  // Bascule couche carte
  document.getElementById('btn-map-layer')?.addEventListener('click', () => {
    const isSat = toggleMapLayer();
    const btn = document.getElementById('btn-map-layer');
    if (btn) btn.textContent = isSat ? '🗺️ Carte' : '🛰️ Satellite';
    document.body.classList.toggle('satellite-mode', isSat);
  });

  // Lisibilité renforcée des labels hybrides
  document.getElementById('btn-labels-enhance')?.addEventListener('click', () => {
    const enhanced = toggleHybridLabelsEnhanced();
    const btn = document.getElementById('btn-labels-enhance');
    if (btn) {
      btn.textContent = enhanced ? 'Aa ✓' : 'Aa';
      btn.title = enhanced ? 'Lisibilité renforcée active — cliquer pour désactiver' : 'Activer lisibilité renforcée des noms de rues';
      btn.classList.toggle('active', enhanced);
    }
  });
  // Restaurer l'état du bouton Aa au démarrage
  if (isHybridLabelsEnhanced()) {
    const btn = document.getElementById('btn-labels-enhance');
    if (btn) { btn.textContent = 'Aa ✓'; btn.classList.add('active'); }
  }

  // Bouton surprise
  document.getElementById('btn-surprise')?.addEventListener('click', onSurpriseClick);

  // Bouton programme journée
  document.getElementById('btn-day-plan')?.addEventListener('click', onDayPlanClick);
  document.getElementById('day-plan-close-btn')?.addEventListener('click', () => {
    document.getElementById('day-plan-modal')?.classList.add('hidden');
  });

  // Filtres "Bons plans économiques"
  document.querySelectorAll('.eco-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.eco-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const eco = btn.dataset.eco;
      let filtered = [..._filteredSites];
      if (eco === 'gratuit') {
        filtered = filtered.filter(s => s.gratuit || (s.budget_indicatif || '').toLowerCase().includes('gratu'));
      } else if (eco === 'proche') {
        filtered = filtered.filter(s => s.distance_km != null && s.distance_km <= 30);
      } else if (eco === 'sans_peage') {
        const hasSP = s => s.sans_peage || (s.vigilance || '').toLowerCase().includes('sans p');
        filtered = filtered.filter(hasSP);
      }
      renderEconomyPanel(getBestDeals(filtered, 30));
    });
  });

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
  window.__openSiteDetail = async (siteId) => {
    const site = _sites.find(s => s.id === siteId);
    if (site) await openSiteDetail(site, _vehicleProfile);
  };
  window.__openGpsEdit = (siteId) => {
    openGpsEditDialog(siteId, async (id, lat, lon) => {
      _sites = await applyManualGpsCorrection(id, lat, lon, _sites);
      _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
      renderAll();
      showToast('Coordonnées GPS mises à jour.', 'success');
    });
  };
  window.__addToDayPlan = async (siteId) => {
    const site = _sites.find(s => s.id === siteId);
    if (!site) return;
    if (!site.has_gps) { showToast(`${site.destination} n'a pas de GPS — impossible d'ajouter.`, 'warning'); return; }
    if (!_currentDayPlan) {
      _currentDayPlan = await generateDayPlan(_sites.filter(s => s.has_gps), _vehicleProfile, { maxKm: 80, minStops: 3, maxStops: 5 });
    }
    showToast(`${site.destination} pris en compte dans le programme.`, 'success');
    onDayPlanClick();
  };
  window.__openPhotoForSite = (siteId) => switchToPanel('panel-photos');
  window.__trackGoogleSearch = (label, url) => addGoogleSearchToHistory(decodeURIComponent(label), url);
  window.__exportDayPlan = (format) => {
    if (!_currentDayPlan) { showToast('Aucun programme à exporter.', 'warning'); return; }
    if (format === 'text' && navigator.clipboard) {
      navigator.clipboard.writeText(exportPlanAsText(_currentDayPlan))
        .then(() => showToast('Programme copié.', 'success'))
        .catch(() => showToast('Copie non disponible.', 'warning'));
    }
  };

  // Restaurer programme sauvegardé
  const savedPlan = loadSavedDayPlan();
  if (savedPlan) {
    _currentDayPlan = savedPlan;
    document.getElementById('btn-day-plan')?.classList.add('has-saved-plan');
    showToast(`Programme sauvegardé chargé (${savedPlan.sites.length} étapes).`, 'info', 4000);
  }

  // Fermeture modales
  document.getElementById('modal-close-btn')?.addEventListener('click', closeSiteDetail);
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
  renderPhotoMarkers((photo) => openPhotoFullscreen(photo));
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
  if (!query) clearAddressMarker();
  applyFiltersAndRender();
}

function onSuggestion(suggestion) {
  const input = document.getElementById('global-search-input');
  hideSuggestionsPanel();

  // Site trouvé directement → ouvrir la fiche
  if (suggestion.type === 'site') {
    if (input) input.value = suggestion.site.destination;
    onSearch(suggestion.site.destination);
    openSiteDetail(suggestion.site, _vehicleProfile);
    return;
  }

  // Adresse géocodée → voler vers les coords + afficher le point sur la carte
  if (suggestion.type === 'address') {
    if (input) input.value = suggestion.label;
    switchToPanel('panel-map');
    onPanelChange('panel-map');
    setTimeout(() => {
      flyToSite(suggestion.lat, suggestion.lon, 15);
      showAddressMarker(suggestion.lat, suggestion.lon, suggestion.label);
    }, 120);
    return;
  }

  // Filtre rapide (gratuit, sans_peage…) — pas de recherche texte
  if (suggestion.filter) {
    if (input) input.value = '';
    onSearch('');
    onFilterChange(suggestion.filter);
    return;
  }

  // Tri eco
  if (suggestion.sortBy === 'eco_score') {
    if (input) input.value = '';
    _filteredSites = sortSites(_filteredSites, 'eco_score');
    renderAll();
    return;
  }

  // Surprenez-moi
  if (suggestion.intent === 'surprise') {
    if (input) input.value = '';
    onSurpriseClick();
    return;
  }

  // Historique / texte libre
  if (suggestion.label) {
    if (input) input.value = suggestion.label;
    onSearch(suggestion.label);
  }
}

function hideSuggestionsPanel() {
  const el = document.getElementById('search-suggestions');
  if (el) el.classList.add('hidden');
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
      // Basculer vers Nages
      clearUserLocation();
      _originCoords = { lat: ORIGIN_DEFAULT.lat, lon: ORIGIN_DEFAULT.lon };
      clearUserLocationMarker();
      clearRouteDistanceCache();
      _sites = recalcDistances(_sites, ORIGIN_DEFAULT.lat, ORIGIN_DEFAULT.lon);
      _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
      updateLocationUI();
      applyFiltersAndRender();
      showToast('Point de départ : Nages', 'info');
      return;
    }
    // Demander la localisation GPS
    btn.classList.add('gps-loading');
    if (label) label.textContent = 'Localisation…';
    try {
      const pos = await requestUserLocation();
      saveOrigin(pos.lat, pos.lon, 'Ma position');
      _originCoords = pos;
      clearRouteDistanceCache();
      _sites = recalcDistances(_sites, pos.lat, pos.lon);
      _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
      showUserLocationMarker(pos.lat, pos.lon, 'Ma position', _maxDistanceKm < 150 ? _maxDistanceKm : null, pos.accuracy);
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
   BLOC 05c — SUIVI GPS AUTOMATIQUE
   ========================================================= */
let _autoGpsFirstFix = true;

function _startAutoGpsWatch() {
  // Ré-arme le premier fix si la permission GPS change (révoquée → ré-accordée)
  if ('permissions' in navigator) {
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      status.addEventListener('change', () => {
        if (status.state === 'granted') _autoGpsFirstFix = true;
      });
    }).catch(() => {});
  }

  startWatchingPosition(pos => {
    // Toujours mettre à jour le marqueur bleu sur la carte
    showUserLocationMarker(
      pos.lat, pos.lon, 'Ma position',
      _maxDistanceKm < 150 ? _maxDistanceKm : null,
      pos.accuracy
    );

    // Toujours exposer la position GPS temps réel pour day-plan.getBestOriginCoords()
    window._currentGpsCoords = { lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy };

    if (_autoGpsFirstFix) {
      _autoGpsFirstFix = false;
      saveOrigin(pos.lat, pos.lon, 'Ma position');
      _originCoords = { lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy };
      if (_sites?.length) {
        _sites = recalcDistances(_sites, pos.lat, pos.lon);
        _sites = enrichSitesWithEcoScore(_sites, _vehicleProfile);
        applyFiltersAndRender();
      }
      const gpsBtnEl = document.getElementById('btn-gps-location');
      const locLabelEl = document.getElementById('location-label');
      if (gpsBtnEl) gpsBtnEl.classList.add('gps-active');
      if (locLabelEl) locLabelEl.textContent = 'Ma position';
      flyToSite(pos.lat, pos.lon, 13);
    } else {
      _originCoords = { lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy };
    }
  });
}

/* =========================================================
   BLOC 06 — PANNEAU CHANGEMENT
   ========================================================= */
async function onPanelChange(panelId) {
  // Masquer filtres/rayon sur la carte pour un affichage plein écran
  const filtersBar  = document.getElementById('filters-bar');
  const locationBar = document.getElementById('location-bar');
  const appMain     = document.getElementById('app-main');
  const isMap  = panelId === 'panel-map';
  const isProg = panelId === 'panel-prog';
  const hideChrome = isMap || isProg;
  if (filtersBar)  filtersBar.classList.toggle('hidden-for-map', hideChrome);
  if (locationBar) locationBar.classList.toggle('hidden-for-map', hideChrome);
  if (appMain)     appMain.classList.toggle('map-fullscreen', hideChrome);

  if (isMap) {
    setTimeout(() => { invalidateMapSize(); fitBoundsToSites(_filteredSites); }, 80);
  }
  if (panelId === 'panel-photos') updatePhotoPanel();
  if (panelId === 'panel-prog') {
    if (!_initProg) {
      const m = await import('./programme.js?v=4');
      _initProg = m.initProgramme;
      _invalidateProgMap = m.invalidateProgMap;
      _initProg(_sites);
    } else if (_invalidateProgMap) {
      setTimeout(_invalidateProgMap, 150);
    }
  }
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
async function onSurpriseClick() {
  const profile = _vehicleProfile;
  const avoidTolls = profile?.avoid_tolls ?? true;
  const card = generateSurprise(_sites, profile, { maxKm: 80, avoidTolls });
  const html = await renderSurpriseCard(card);
  const modal = document.getElementById('site-detail-modal');
  const content = document.getElementById('site-detail-content');
  if (modal && content) {
    content.innerHTML = `<h3 style="margin-bottom:12px;color:#e94560">🎲 Idée surprise !</h3>${html}`;
    modal.classList.remove('hidden');
  }
}

/* =========================================================
   BLOC 08 — SETTINGS UI (NAS)
   ========================================================= */
function initSettingsUI() {
  // Test NAS
  document.getElementById('btn-test-nas')?.addEventListener('click', async () => {
    const url = document.getElementById('nas-url')?.value?.trim();
    const key = document.getElementById('nas-api-key')?.value?.trim();
    if (!url) { showToast('Saisissez l\'URL du NAS', 'warning'); return; }
    if (!/^https?:\/\//i.test(url)) {
      const status = document.getElementById('nas-test-status');
      if (status) { status.textContent = '❌ L\'URL doit commencer par http:// ou https://'; status.style.color = '#e74c3c'; }
      return;
    }
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

  const nasUrl = lsGet('nas_url');
  if (nasUrl) { const el = document.getElementById('nas-url'); if (el) el.value = nasUrl; }
}

/* =========================================================
   BLOC 09 — ASCENSEUR (scroll to top + barre progression)
   ========================================================= */
function initScrollElevator() {
  const list     = document.getElementById('sites-list');
  const btnTop   = document.getElementById('btn-scroll-top');
  const progress = document.getElementById('scroll-progress-bar');
  if (!list) return;

  list.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = list;
    const pct = scrollHeight > clientHeight
      ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
    if (progress) progress.style.width = pct + '%';
    if (btnTop) btnTop.classList.toggle('visible', scrollTop > 220);
  }, { passive: true });

  btnTop?.addEventListener('click', () => {
    list.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* =========================================================
   BLOC 10 — PHOTOS UI
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
   BLOC 10 — PARAMÈTRES IA / OPENAI
   ========================================================= */
let _cachedAiStatus = null;

function initAiSettings() {
  // Vérifier le statut au chargement
  _refreshAiStatusUI();
  getAiStatus().then(_updateAiStatusFromResponse);

  document.getElementById('ai-test-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ai-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Test en cours…'; }
    const result = await testConnection();
    showToast(result.message, result.success ? 'success' : 'error');
    if (result.success) {
      _cachedAiStatus = { connected: true, model: result.model, checkedAt: new Date().toISOString() };
    }
    _refreshAiStatusUI();
    if (btn) { btn.disabled = false; btn.textContent = '🔌 Tester la connexion'; }
  });

  document.getElementById('ai-refresh-btn')?.addEventListener('click', async () => {
    const status = await getAiStatus();
    _updateAiStatusFromResponse(status);
    _refreshAiStatusUI();
  });
}

function _updateAiStatusFromResponse(status) {
  if (!status) return;
  _cachedAiStatus = {
    connected: status.configured && status.reachable,
    model: status.model,
    checkedAt: new Date().toISOString(),
    reachable: status.reachable,
    configured: status.configured
  };
  _refreshAiStatusUI();
}

function _refreshAiStatusUI() {
  const iconEl = document.getElementById('ai-status-icon');
  const msgEl  = document.getElementById('ai-status-msg');
  const lastEl = document.getElementById('ai-last-check');
  const barEl  = document.getElementById('circuit-ai-status-bar');

  const st = _cachedAiStatus;

  if (!st) {
    if (iconEl) iconEl.textContent = '⚪';
    if (msgEl)  msgEl.textContent  = 'Vérification du backend…';
    if (lastEl) lastEl.classList.add('hidden');
    if (barEl)  barEl.innerHTML    = '⚪ IA non vérifiée — allez dans <strong>Paramètres → IA</strong>';
    return;
  }

  if (!st.reachable) {
    if (iconEl) iconEl.textContent = '🔴';
    if (msgEl)  msgEl.textContent  = 'Backend IA inaccessible. Vérifiez que le serveur est démarré sur le port 3001.';
    if (barEl)  barEl.innerHTML    = '🔴 Backend IA non démarré — <strong>Paramètres → IA</strong>';
  } else if (!st.configured) {
    if (iconEl) iconEl.textContent = '🟡';
    if (msgEl)  msgEl.textContent  = 'Backend joignable mais clé API absente. Ajoutez OPENAI_API_KEY dans .env.';
    if (barEl)  barEl.innerHTML    = '🟡 Clé API manquante — allez dans <strong>Paramètres → IA</strong>';
  } else {
    if (iconEl) iconEl.textContent = '🟢';
    if (msgEl)  msgEl.textContent  = `Backend IA prêt — modèle : ${st.model || 'gpt-4o-mini'}`;
    if (barEl)  barEl.innerHTML    = `🟢 IA prête — ${st.model || 'gpt-4o-mini'}`;
  }

  if (st.checkedAt && lastEl) {
    lastEl.textContent = `Dernier test : ${new Date(st.checkedAt).toLocaleString('fr-FR')}`;
    lastEl.classList.remove('hidden');
  }
}

/* =========================================================
   BLOC 10b — LIENS VÉRIFICATION ÉNERGIE
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
   BLOC 10a — RUNNING SCREEN (Adidas-style)
   ========================================================= */
let _rsInterval = null, _rsStartTime = null, _rsPausedMs = 0, _rsPauseAt = null;
let _rsState = 'idle', _rsSplitCount = 0, _rsLockHold = null;
let _rsActivityType = 'running';
let _rsMap = null, _rsMapMarker = null, _rsMapLine = null, _rsMapPoints = [];
const _rsWt = () => parseInt(localStorage.getItem('trekko_weight_kg') || '70', 10);

function initRunningScreen() {
  document.getElementById('btn-rs-back')?.addEventListener('click', () => {
    if (_rsState !== 'idle') {
      if (!confirm('Abandonner l\'activité en cours ?')) return;
      _rsStopForce();
    }
    document.getElementById('running-screen')?.classList.add('hidden');
  });

  document.getElementById('btn-rs-start')?.addEventListener('click', () => _rsStartCountdown());
  document.getElementById('btn-rs-pause')?.addEventListener('click', () => _rsPause());
  document.getElementById('btn-rs-resume')?.addEventListener('click', () => _rsResume());
  document.getElementById('btn-rs-stop')?.addEventListener('click', () => _rsStop());
  document.getElementById('btn-rs-stop2')?.addEventListener('click', () => _rsStop());

  document.getElementById('btn-rs-lock')?.addEventListener('click', () => {
    document.getElementById('rs-lock-overlay')?.classList.remove('hidden');
  });

  const unlockBtn = document.getElementById('btn-rs-unlock');
  unlockBtn?.addEventListener('pointerdown', () => {
    _rsLockHold = setTimeout(() => {
      document.getElementById('rs-lock-overlay')?.classList.add('hidden');
      _rsLockHold = null;
    }, 2000);
  });
  unlockBtn?.addEventListener('pointerup',     () => { clearTimeout(_rsLockHold); _rsLockHold = null; });
  unlockBtn?.addEventListener('pointercancel', () => { clearTimeout(_rsLockHold); _rsLockHold = null; });

  // Sélecteur type d'activité
  const typeLabels = { running: 'COURSE À PIED', cycling: 'VÉLO', walking: 'MARCHE' };
  document.querySelectorAll('.rs-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rs-type-btn').forEach(b => b.classList.remove('rs-type-active'));
      btn.classList.add('rs-type-active');
      _rsActivityType = btn.dataset.rtype;
      const label = typeLabels[_rsActivityType] || 'COURSE À PIED';
      const titleEl = document.getElementById('rs-activity-title');
      if (titleEl) titleEl.textContent = label;
      const startBtn = document.getElementById('btn-rs-start');
      if (startBtn) startBtn.textContent = `DÉMARRER  →`;
    });
  });
}

async function _rsStartCountdown() {
  _rsSetState('countdown');
  const countEl = document.getElementById('rs-count-num');
  const cdEl    = document.getElementById('rs-countdown');
  if (cdEl) cdEl.classList.remove('hidden');
  for (let n = 3; n >= 1; n--) {
    if (countEl) countEl.textContent = n;
    _rsSpeak(String(n));
    await new Promise(r => setTimeout(r, 900));
  }
  if (countEl) countEl.textContent = 'GO !';
  _rsSpeak('Go !');
  await new Promise(r => setTimeout(r, 600));
  if (cdEl) cdEl.classList.add('hidden');

  const typeNames = { running: 'Course', cycling: 'Vélo', walking: 'Marche' };
  const label = `🏃 ${typeNames[_rsActivityType] || 'Course'} — ${new Date().toLocaleDateString('fr-FR')}`;
  await startTracking(label, false, _rsActivityType, 20, _rsWt());
  _rsStartTime  = Date.now();
  _rsPausedMs   = 0;
  _rsPauseAt    = null;
  _rsSplitCount = 0;
  _rsSetState('running');
  _rsCheckGPS();
  _rsInterval = setInterval(_rsUpdate, 1000);
  _rsSpeak('Activité démarrée. Bonne chance !');
}

function _rsPause() {
  if (_rsState !== 'running') return;
  _rsPauseAt = Date.now();
  clearInterval(_rsInterval); _rsInterval = null;
  _rsSetState('paused');
  _rsSpeak('Pause');
}

function _rsResume() {
  if (_rsState !== 'paused') return;
  if (_rsPauseAt) { _rsPausedMs += Date.now() - _rsPauseAt; _rsPauseAt = null; }
  _rsSetState('running');
  _rsInterval = setInterval(_rsUpdate, 1000);
  _rsSpeak('Reprise');
}

async function _rsStop() {
  if (_rsState === 'idle') return;
  clearInterval(_rsInterval); _rsInterval = null;
  document.getElementById('rs-countdown')?.classList.add('hidden');
  const stat = getLiveStats();
  const sid  = await stopTracking();
  await _loadCarnet();
  if (sid && stat.calories > 0 && _saveJournalToSession)
    await _saveJournalToSession(sid, { final_calories: stat.calories });
  clearTrack();
  _rsResetMetrics();
  _rsSetState('idle');
  document.getElementById('running-screen')?.classList.add('hidden');
  showRunSummaryWithJournal(stat, 'running', 20, _rsWt(), sid);
  _rsSpeak('Course terminée. Bravo !');
}

async function _rsStopForce() {
  clearInterval(_rsInterval); _rsInterval = null;
  if (isTracking()) await stopTracking();
  _rsResetMetrics();
  _rsSetState('idle');
}

function _rsSetState(s) {
  _rsState = s;
  const idleCtrl  = document.getElementById('rs-idle-ctrl');
  const runCtrl   = document.getElementById('rs-run-ctrl');
  const pauseCtrl = document.getElementById('rs-pause-ctrl');
  const apBanner  = document.getElementById('rs-autopause-banner');
  if (idleCtrl)  idleCtrl.classList.toggle('hidden',  s !== 'idle');
  if (runCtrl)   runCtrl.classList.toggle('hidden',   s !== 'running');
  if (pauseCtrl) pauseCtrl.classList.toggle('hidden', s !== 'paused');
  if (apBanner)  apBanner.classList.add('hidden');
}

function _rsUpdate() {
  if (_rsState !== 'running' || !_rsStartTime) return;
  const stats  = getLiveStats();
  const now    = Date.now();
  const active = (now - _rsStartTime) - _rsPausedMs;
  const durMin = active / 60000;
  const water  = calculateWaterNeeds(_rsActivityType, durMin, 20);
  const zone   = _rsZone(stats.paceMinKm);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rs-timer',    _rsFormatTimer(active));
  set('rs-distance', stats.distanceKm.toFixed(2).replace('.', ','));
  set('rs-pace',     _rsFormatPace(stats.paceMinKm));
  set('rs-speed',    stats.speedKmh.toFixed(1).replace('.', ','));
  set('rs-elev',     `+${stats.elevGainM}`);
  set('rs-calories', stats.calories || 0);
  set('rs-water',    `💧 ${water.mlPerHour} mL/h`);

  const zoneBadge = document.getElementById('rs-zone-badge');
  if (zoneBadge) {
    zoneBadge.textContent = zone.label;
    zoneBadge.className   = `rs-zone-badge ${zone.cls}`;
    zoneBadge.classList.remove('hidden');
  }

  const apBanner = document.getElementById('rs-autopause-banner');
  if (apBanner) apBanner.classList.toggle('hidden', !stats.autoPaused);

  if (stats.splits && stats.splits.length > _rsSplitCount) {
    const split = stats.splits[stats.splits.length - 1];
    const pStr  = _rsFormatPace(split.paceMinKm);
    _rsSpeak(`Kilomètre ${split.km}. Allure ${pStr}.`);
    _rsSplitCount = stats.splits.length;
  }

  if (durMin > 0 && Math.floor(durMin) % 20 === 0 && Math.floor(durMin) !== 0) {
    const prevMin = (active - 1000) / 60000;
    if (Math.floor(prevMin) % 20 !== 0) {
      _rsSpeak(`N'oublie pas de boire. Objectif ${water.mlPerHour} millilitres par heure.`);
    }
  }

  _rsUpdateMap();
}

function _rsUpdateMap() {
  if (!_rsMap) return;
  navigator.geolocation?.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    _rsMapPoints.push([lat, lon]);
    if (_rsMapMarker) {
      _rsMapMarker.setLatLng([lat, lon]);
    } else {
      _rsMapMarker = L.circleMarker([lat, lon], {
        radius: 9, fillColor: '#e94560', color: '#fff', weight: 2.5, fillOpacity: 1
      }).addTo(_rsMap);
    }
    if (_rsMapPoints.length > 1) {
      if (_rsMapLine) _rsMapLine.setLatLngs(_rsMapPoints);
      else _rsMapLine = L.polyline(_rsMapPoints, { color: '#e94560', weight: 4, opacity: 0.9 }).addTo(_rsMap);
    }
    _rsMap.panTo([lat, lon]);
  }, null, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
}

function _rsFormatTimer(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}

function _rsFormatPace(p) {
  if (!p || p > 60) return '—';
  return `${Math.floor(p)}'${String(Math.round((p % 1) * 60)).padStart(2,'0')}"`;
}

function _rsZone(pace) {
  if (!pace || pace > 60) return { label: '—', cls: '' };
  if (pace < 4.5) return { label: 'INTENSE', cls: 'rz-intense' };
  if (pace < 5.5) return { label: 'SOUTENU', cls: 'rz-hard' };
  if (pace < 7.0) return { label: 'MODÉRÉ', cls: 'rz-moderate' };
  return { label: 'FACILE', cls: 'rz-easy' };
}

function _rsSpeak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR'; u.rate = 1.0; u.volume = 0.9;
  window.speechSynthesis.speak(u);
}

function _rsCheckGPS() {
  const el = document.getElementById('rs-gps-ind');
  if (!el || !navigator.geolocation) return;
  el.textContent = '🟡 GPS…';
  navigator.geolocation.getCurrentPosition(
    pos => { el.textContent = pos.coords.accuracy < 20 ? '🟢 GPS OK' : pos.coords.accuracy < 50 ? '🟡 GPS moyen' : '🟠 GPS faible'; },
    ()  => { el.textContent = '🔴 GPS absent'; },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function _rsResetMetrics() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rs-timer', '0:00'); set('rs-distance', '0,00');
  set('rs-pace', '—'); set('rs-speed', '0,0');
  set('rs-elev', '+0'); set('rs-calories', '0');
  set('rs-water', '💧 —');
  const badge = document.getElementById('rs-zone-badge');
  if (badge) { badge.textContent = '—'; badge.classList.add('hidden'); }
  const gps = document.getElementById('rs-gps-ind');
  if (gps) gps.textContent = '⚫';
  // Réinitialiser la mini-carte
  _rsMapPoints = [];
  if (_rsMapLine)   { _rsMapLine.remove();   _rsMapLine   = null; }
  if (_rsMapMarker) { _rsMapMarker.remove(); _rsMapMarker = null; }
}

function showRunningScreen() {
  switchToPanel('panel-map');
  setTimeout(() => invalidateMapSize(), 150);
  _rsCheckGPS();

  // Initialiser la mini-carte GPS
  const mapEl = document.getElementById('rs-map');
  if (mapEl && !_rsMap) {
    _rsMap = L.map('rs-map', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(_rsMap);
    _rsMap.setView([ORIGIN_DEFAULT.lat, ORIGIN_DEFAULT.lon], 15);
  }
  _rsMapPoints = [];
  if (_rsMapLine)   { _rsMapLine.remove();   _rsMapLine   = null; }
  if (_rsMapMarker) { _rsMapMarker.remove(); _rsMapMarker = null; }
  if (_rsMap) setTimeout(() => _rsMap.invalidateSize(), 250);

  document.getElementById('running-screen')?.classList.remove('hidden');
}

/* =========================================================
   BLOC 10b — PROGRAMME JOURNÉE
   ========================================================= */
async function onDayPlanClick() {
  const modal   = document.getElementById('day-plan-modal');
  const content = document.getElementById('day-plan-content');
  if (!modal || !content) return;

  if (!_currentDayPlan) {
    const km = Math.min(_maxDistanceKm > 0 ? _maxDistanceKm : 80, 80);
    _currentDayPlan = await generateDayPlan(_sites, _vehicleProfile, {
      maxKm: km, minStops: 3, maxStops: 5,
      avoidTolls: _vehicleProfile?.avoid_tolls ?? true
    });
    if (!_currentDayPlan) {
      showToast('Pas assez de sites avec GPS dans ce rayon. Augmentez la distance.', 'warning');
      return;
    }
  }

  content.innerHTML = renderDayPlan(_currentDayPlan);
  modal.classList.remove('hidden');
  _bindDayPlanActions();
}

function _bindDayPlanActions() {
  const plan = _currentDayPlan;

  document.getElementById('btn-dp-map')?.addEventListener('click', () => {
    document.getElementById('day-plan-modal')?.classList.add('hidden');
    switchToPanel('panel-map');
    setTimeout(() => { invalidateMapSize(); renderDayPlanRoute(plan.sites); }, 200);
    showToast('Itinéraire affiché sur la carte.', 'success');
  });

  document.getElementById('btn-dp-save')?.addEventListener('click', () => {
    saveDayPlan(plan);
    document.getElementById('btn-day-plan')?.classList.add('has-saved-plan');
    showToast('Programme sauvegardé — rechargé au prochain démarrage.', 'success');
  });

  document.getElementById('btn-dp-regen')?.addEventListener('click', () => {
    _currentDayPlan = null;
    clearDayPlanRoute();
    const km = Math.min(_maxDistanceKm > 0 ? _maxDistanceKm : 80, 80);
    _currentDayPlan = generateDayPlan(_sites, _vehicleProfile, {
      maxKm: km, minStops: 3, maxStops: 5,
      avoidTolls: _vehicleProfile?.avoid_tolls ?? true
    });
    const content = document.getElementById('day-plan-content');
    if (content && _currentDayPlan) {
      content.innerHTML = renderDayPlan(_currentDayPlan);
      _bindDayPlanActions();
    }
  });

  document.getElementById('btn-dp-copy')?.addEventListener('click', () => {
    const text = exportPlanAsText(plan);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Programme copié dans le presse-papier.', 'success'))
        .catch(() => showToast('Copie non disponible.', 'warning'));
    }
  });

  document.getElementById('btn-dp-delete')?.addEventListener('click', () => {
    if (!confirm('Supprimer le programme sauvegardé ?')) return;
    deleteSavedDayPlan();
    _currentDayPlan = null;
    clearDayPlanRoute();
    document.getElementById('btn-day-plan')?.classList.remove('has-saved-plan');
    document.getElementById('day-plan-modal')?.classList.add('hidden');
    showToast('Programme supprimé.', 'info');
  });
}

/* =========================================================
   BLOC 10c — VISIONNEUSE PHOTO PLEIN ÉCRAN
   ========================================================= */
function openPhotoFullscreen(photo) {
  const src = photo.thumbnail;
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;touch-action:pinch-zoom';
  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:12px 16px;background:linear-gradient(transparent,rgba(0,0,0,0.75));color:#fff;font-size:13px;font-family:sans-serif;pointer-events:none';
  const date = photo.taken_at ? new Date(photo.taken_at).toLocaleDateString('fr-FR') : '';
  info.textContent = (photo.filename || '') + (date ? ' — ' + date : '');
  overlay.appendChild(img);
  overlay.appendChild(info);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

/* =========================================================
   BLOC 10c — SÉLECTION MODE ACCUEIL
   ========================================================= */
function onWelcomeModeSelect(mode) {
  if (!mode) return;
  if (mode.id === 'running') { showRunningScreen(); return; }
  if (mode.id === 'hiking' || mode.id === 'walking') {
    switchToPanel('panel-map');
    onPanelChange('panel-map');
    setTimeout(() => showHikingScreen(mode.id), 100);
    return;
  }
  switchToPanel(mode.panel);
  onPanelChange(mode.panel);

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
