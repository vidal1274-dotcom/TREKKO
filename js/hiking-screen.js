/* =========================================================
   hiking-screen.js — Écran Randonnée / Balade (AllTrails + Komoot + Strava)
   ========================================================= */
import { startTracking, stopTracking, getLiveStats, calculateWaterNeeds, exportAsGPX, loadTrackPoints, getElapsedSec, pauseElapsedTimer, resumeElapsedTimer, getAllSessions } from './tracker.js';
import { invalidateMapSize, hidePoiLayers, showPoiLayers, centerMap, drawHikingTrails, clearHikingTrails, renderOfflineRouteLayer, clearOfflineRouteLayer, renderActivityRouteLayer, clearActivityRouteLayer } from './map.js?v=4';
import { getStoredOrigin } from './geolocation.js';
import { OVERPASS_ENDPOINT } from './config.js';
import { showToast, escapeHTML, safeText } from './utils.js';
import {
  getOfflineHikingRoutes,
  getOfflineHikingRoute,
  deleteOfflineHikingRoute,
  importOfflineRouteFromJson,
  exportOfflineRouteAsJson
} from './offline-routes-store.js';
import {
  getCompletedActivities,
  getCompletedActivity,
  deleteCompletedActivity,
  exportActivityAsGpx,
  normalizeActivity,
  formatDuration,
  formatDistanceKm,
  formatPace,
  formatSpeedKmh,
  formatElevation,
  formatActivityDate,
  formatActivityDateShort,
  formatActivityTime,
  formatGpsQuality,
  buildActivityTitle
} from './activity-store.js';

/* ─── Configuration par mode ───────────────────────────────── */
const MODE_CONFIG = {
  hiking: {
    emoji: '🥾',
    title: 'Randonnée',
    color: '#27ae60',
    waterIntervalMin: 45,
    defaultLabel: () => `🥾 Rando ${_fmtDateShort()}`
  },
  walking: {
    emoji: '🚶',
    title: 'Balade',
    color: '#5dade2',
    waterIntervalMin: 60,
    defaultLabel: () => `🚶 Balade ${_fmtDateShort()}`
  }
};

/* ─── État interne ──────────────────────────────────────────── */
let _mode = 'hiking';            // 'hiking' | 'walking'
let _section = 'nav';            // 'nav' | 'setup' | 'live' | 'summary' | 'rechercher' | 'parcours' | 'bilan' | 'courses' | 'health'
let _weight = 70;
let _temp = 20;
let _difficulty = 'moyen';
let _goalKm = 0;
let _voiceEnabled = true;

// Live — timer basé sur tracker.getElapsedSec() (résistant à la veille iOS)
let _timerInterval = null;
let _statsInterval = null;
let _paused = false;
let _locked = false;
let _lastVoiceKm = 0;
let _lastWaterMin = 0;

// Summary
let _finalStats = null;
let _sessionId = null;
let _bilanSessionId = null;  // id de la session affichée dans le bilan (null = plus récente)
let _screenActive = false;  // garde contre race condition Overpass après fermeture

/* ─── Helpers ───────────────────────────────────────────────── */
function _fmtDateShort() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function _fmtDateLong() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function _fmtTimer(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function _fmtTimerFull(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function _speak(text) {
  if (!_voiceEnabled) return;
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* pas de synthèse */ }
}

function _calcDifficultyBadge(distKm, elevM) {
  if (distKm >= 15 || elevM >= 800) return { label: 'Difficile', color: '#e74c3c', icon: '🔴' };
  if (distKm >= 8 || elevM >= 300)  return { label: 'Moyen',     color: '#f5a623', icon: '🟡' };
  return { label: 'Facile', color: '#27ae60', icon: '🟢' };
}

function _el(id) { return document.getElementById(id); }

/* ─── Export public ─────────────────────────────────────────── */
export function initHikingScreen() {
  _wireNav();
  _wireSetup();
  _wireLive();
  _wireSummary();
}

export function showHikingScreen(activityMode) {
  _mode = activityMode || 'hiking';
  const cfg = MODE_CONFIG[_mode];

  // Couleur CSS variable
  const screen = _el('hiking-screen');
  if (!screen) return;
  screen.style.setProperty('--hs-color', cfg.color);
  screen.classList.remove('hidden');
  document.body.classList.add('hiking-active');

  // Pre-fill label
  const inp = _el('hs-label-input');
  if (inp) inp.value = cfg.defaultLabel();

  // Update header mode label (setup + nav)
  const modeLabel = _el('hs-mode-label');
  if (modeLabel) modeLabel.textContent = `${cfg.emoji} ${cfg.title}`;
  const navLabel = _el('hs-nav-mode-label');
  if (navLabel) navLabel.textContent = `${cfg.emoji} ${cfg.title}`;

  // Show nav landing screen
  _showSection('nav');
  _screenActive = true;

  // Cacher les marqueurs POI de l'app principale
  hidePoiLayers();

  // Centrer la carte sur la position utilisateur + charger les sentiers
  const origin = getStoredOrigin();
  setTimeout(() => {
    invalidateMapSize();
    if (origin?.lat && origin?.lon) {
      centerMap(origin.lat, origin.lon, 13);
      _loadHikingTrails(origin.lat, origin.lon, activityMode);
    }
  }, 200);
}

/* ─── Navigation entre sections ────────────────────────────── */
const _ALL_SECTIONS = ['nav', 'setup', 'live', 'summary', 'rechercher', 'parcours', 'bilan', 'courses', 'health'];

function _showSection(name) {
  _section = name;
  _ALL_SECTIONS.forEach(s => {
    const el = _el(`hs-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

/* ─── SECTION A : SETUP ─────────────────────────────────────── */
function _wireSetup() {
  // Bouton retour → nav landing (plus vers fermeture)
  _el('hs-back-btn')?.addEventListener('click', () => _showSection('nav'));

  // Sélecteur difficulté
  document.querySelectorAll('.hs-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hs-diff-btn').forEach(b => b.classList.remove('hs-diff-active'));
      btn.classList.add('hs-diff-active');
      _difficulty = btn.dataset.diff;
    });
  });

  // Boutons poids +/−
  _el('hs-weight-minus')?.addEventListener('click', () => {
    _weight = Math.max(30, _weight - 1);
    if (_el('hs-weight-val')) _el('hs-weight-val').textContent = _weight;
  });
  _el('hs-weight-plus')?.addEventListener('click', () => {
    _weight = Math.min(200, _weight + 1);
    if (_el('hs-weight-val')) _el('hs-weight-val').textContent = _weight;
  });

  // Boutons température +/−
  _el('hs-temp-minus')?.addEventListener('click', () => {
    _temp = Math.max(-20, _temp - 1);
    if (_el('hs-temp-val')) _el('hs-temp-val').textContent = _temp;
  });
  _el('hs-temp-plus')?.addEventListener('click', () => {
    _temp = Math.min(50, _temp + 1);
    if (_el('hs-temp-val')) _el('hs-temp-val').textContent = _temp;
  });

  // Objectif distance
  document.querySelectorAll('.hs-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hs-goal-btn').forEach(b => b.classList.remove('hs-goal-active'));
      btn.classList.add('hs-goal-active');
      _goalKm = parseInt(btn.dataset.goal, 10) || 0;
    });
  });

  // Bouton DÉMARRER
  _el('hs-btn-start')?.addEventListener('click', _onStartHike);
}

async function _onStartHike() {
  const cfg = MODE_CONFIG[_mode];
  const label = _el('hs-label-input')?.value?.trim() || cfg.defaultLabel();

  try {
    _el('hs-btn-start').disabled = true;
    _el('hs-btn-start').textContent = 'Démarrage…';

    _sessionId = await startTracking(label, false, _mode, _temp, _weight);

    // Initialiser live
    _paused = false;
    _locked = false;
    _lastVoiceKm = 0;
    _lastWaterMin = 0;

    // Mettre à jour header live
    const liveLabel = _el('hs-live-mode-label');
    if (liveLabel) liveLabel.textContent = `${cfg.emoji} ${cfg.title}`;

    _showSection('live');
    _startTimers();

    // objectif barre de progression
    _updateProgressBar(0);

    invalidateMapSize();
  } catch (e) {
    showToast(`Impossible de démarrer : ${e.message}`, 'error');
    _el('hs-btn-start').disabled = false;
    _el('hs-btn-start').textContent = `▶ DÉMARRER`;
  }
}

/* ─── SECTION B : HUD LIVE ──────────────────────────────────── */
function _wireLive() {
  // Pause / Reprendre
  _el('btn-hs-pause')?.addEventListener('click', _onTogglePause);

  // Verrouillage
  _el('btn-hs-lock')?.addEventListener('click', _onLock);

  // Son on/off
  _el('btn-hs-sound')?.addEventListener('click', () => {
    _voiceEnabled = !_voiceEnabled;
    const btn = _el('btn-hs-sound');
    if (btn) btn.textContent = _voiceEnabled ? '🔊' : '🔇';
  });

  // Bouton ARRÊTER
  _el('btn-hs-stop')?.addEventListener('click', _onStopHike);

  // Déverrouiller : hold 1.5s
  const unlockBtn = _el('btn-hs-unlock');
  if (unlockBtn) {
    let _holdTimer = null;
    const startHold = () => {
      unlockBtn.classList.add('holding');
      _holdTimer = setTimeout(() => {
        unlockBtn.classList.remove('holding');
        _onUnlock();
      }, 1500);
    };
    const cancelHold = () => {
      clearTimeout(_holdTimer);
      unlockBtn.classList.remove('holding');
    };
    unlockBtn.addEventListener('mousedown', startHold);
    unlockBtn.addEventListener('touchstart', startHold, { passive: true });
    unlockBtn.addEventListener('mouseup', cancelHold);
    unlockBtn.addEventListener('mouseleave', cancelHold);
    unlockBtn.addEventListener('touchend', cancelHold);
  }
}

function _onTogglePause() {
  _paused = !_paused;
  if (_paused) pauseElapsedTimer(); else resumeElapsedTimer();
  const btn = _el('btn-hs-pause');
  if (btn) btn.textContent = _paused ? '▶' : '⏸';
  const timerEl = _el('hs-timer');
  if (timerEl) timerEl.classList.toggle('hs-timer-paused', _paused);
}

function _onLock() {
  _locked = true;
  const overlay = _el('hs-lock-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function _onUnlock() {
  _locked = false;
  const overlay = _el('hs-lock-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function _startTimers() {
  // Timer 1s — utilise getElapsedSec() (Date.now based, résistant veille iOS)
  _timerInterval = setInterval(() => {
    const elapsed = getElapsedSec();
    const stats = getLiveStats();
    const autoPauseTxt = stats?.autoPaused ? ' (Auto-pause)' : '';
    const pauseTxt = _paused ? ' ⏸' : '';
    const timerEl = _el('hs-timer');
    if (timerEl) timerEl.textContent = _fmtTimerFull(elapsed) + autoPauseTxt + pauseTxt;

    // Alerte hydratation basée sur le temps réel tracker
    if (!_paused) {
      const cfg = MODE_CONFIG[_mode];
      const elapsedMin = Math.floor(elapsed / 60);
      if (elapsedMin > 0 && elapsedMin - _lastWaterMin >= cfg.waterIntervalMin) {
        _lastWaterMin = elapsedMin;
        _triggerWaterAlert();
      }
    }
  }, 1000);

  // Stats 5s
  _statsInterval = setInterval(_updateLiveStats, 5000);
  _updateLiveStats();

  // Page Visibility : recalcul immédiat au retour d'arrière-plan
  document.addEventListener('visibilitychange', _onHikingVisibility);
}

function _onHikingVisibility() {
  if (document.visibilityState === 'visible' && !_paused) {
    const timerEl = _el('hs-timer');
    if (timerEl) timerEl.textContent = _fmtTimerFull(getElapsedSec());
    _updateLiveStats();
  }
}

function _stopTimers() {
  clearInterval(_timerInterval);
  clearInterval(_statsInterval);
  _timerInterval = null;
  _statsInterval = null;
  document.removeEventListener('visibilitychange', _onHikingVisibility);
}

function _updateLiveStats() {
  const stats = getLiveStats();
  if (!stats) return;

  const dist = (stats.distanceKm || 0).toFixed(2);
  const elev = Math.round(stats.elevGainM || 0);
  const pace = stats.paceMinKm ? _fmtPace(stats.paceMinKm) : '—';
  const cals = Math.round(stats.calories || 0);

  if (_el('hs-stat-dist')) _el('hs-stat-dist').textContent = dist;
  if (_el('hs-stat-elev')) _el('hs-stat-elev').textContent = `+${elev}`;
  if (_el('hs-stat-pace')) _el('hs-stat-pace').textContent = pace;
  if (_el('hs-stat-cals')) _el('hs-stat-cals').textContent = cals;

  // Progression objectif
  _updateProgressBar(stats.distanceKm || 0);

  // Alerte vocale km
  const km = Math.floor(stats.distanceKm || 0);
  if (km > _lastVoiceKm && km > 0) {
    _lastVoiceKm = km;
    _speak(`${km} kilomètre${km > 1 ? 's' : ''}. Allure : ${pace} minutes par kilomètre.`);
  }
}

function _fmtPace(paceMinKm) {
  const min = Math.floor(paceMinKm);
  const sec = Math.round((paceMinKm - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function _updateProgressBar(distKm) {
  const bar = _el('hs-progress-bar');
  const barWrap = _el('hs-progress-wrap');
  if (!barWrap) return;

  if (_goalKm <= 0) {
    barWrap.classList.add('hidden');
    return;
  }
  barWrap.classList.remove('hidden');
  const pct = Math.min(100, (distKm / _goalKm) * 100);
  if (bar) bar.style.width = `${pct.toFixed(1)}%`;
  const label = _el('hs-progress-label');
  if (label) label.textContent = `${distKm.toFixed(1)} / ${_goalKm} km`;
}

function _triggerWaterAlert() {
  const elapsedMin = Math.floor(getElapsedSec() / 60);
  const water = calculateWaterNeeds(_mode, elapsedMin, _temp);
  const totalMl = water?.totalMl ?? 0;
  const intervals = Math.max(1, Math.floor(elapsedMin / MODE_CONFIG[_mode].waterIntervalMin));
  const needed = Math.round(totalMl / intervals);
  const alertEl = _el('hs-water-alert');
  if (alertEl) {
    alertEl.textContent = `💧 Boire ~${Math.min(needed, 350)}ml maintenant`;
    alertEl.classList.remove('hidden', 'hs-water-fade');
    // Flash 8s
    setTimeout(() => alertEl.classList.add('hs-water-fade'), 6500);
    setTimeout(() => alertEl.classList.add('hidden'), 8000);
  }
  _speak('Pensez à boire de l\'eau.');
}

async function _onStopHike() {
  if (!confirm('Terminer la randonnée ?')) return;

  _stopTimers();
  const stats = getLiveStats();
  _finalStats = { ...stats, elapsedSec: getElapsedSec() };

  let stopped = false;
  try {
    const sid = await stopTracking();
    if (sid) _sessionId = sid;  // préserve l'id de startTracking si stopTracking retourne null
    stopped = true;
  } catch (e) {
    showToast('Erreur à l\'arrêt : ' + e.message, 'error');
  }

  if (stopped) _showSummary();
}

/* ─── SECTION C : RÉSUMÉ ────────────────────────────────────── */
function _wireSummary() {
  // Export GPX — exportAsGPX() gère lui-même le Blob + téléchargement
  _el('btn-hs-gpx')?.addEventListener('click', async () => {
    if (!_sessionId) { showToast('Pas de session à exporter.', 'warning'); return; }
    try {
      const points = await loadTrackPoints(_sessionId);
      if (!points || points.length === 0) { showToast('Aucun point GPS enregistré.', 'warning'); return; }
      const cfg = MODE_CONFIG[_mode];
      exportAsGPX(points, `${cfg.title} — ${_fmtDateShort()}`);
      showToast('GPX exporté.', 'success');
    } catch (e) {
      showToast('Erreur export GPX.', 'error');
    }
  });

  // Nouvelle sortie
  _el('btn-hs-new')?.addEventListener('click', () => {
    _closeHikingScreen();
    // Montrer le welcome screen
    if (window._showWelcome) window._showWelcome();
  });
}

function _showSummary() {
  const cfg = MODE_CONFIG[_mode];
  const s = _finalStats || {};
  const distKm = s.distanceKm || 0;
  const elevM = s.elevGainM || 0;
  const cals = Math.round(s.calories || 0);
  const elapsed = s.elapsedSec || 0;

  // Header
  const hdr = _el('hs-summary-header-text');
  if (hdr) hdr.textContent = `${cfg.emoji} ${cfg.title === 'Randonnée' ? 'Randonnée terminée' : 'Balade terminée'}`;
  const dateEl = _el('hs-summary-date');
  if (dateEl) dateEl.textContent = _fmtDateLong();

  // Stats héros
  if (_el('hs-sum-dist')) _el('hs-sum-dist').textContent = distKm.toFixed(2);

  // Stats secondaires
  if (_el('hs-sum-duration')) _el('hs-sum-duration').textContent = _fmtTimerFull(elapsed);
  if (_el('hs-sum-elev'))     _el('hs-sum-elev').textContent = `+${Math.round(elevM)} m`;
  if (_el('hs-sum-cals'))     _el('hs-sum-cals').textContent = `${cals} kcal`;

  // Badge difficulté
  const badge = _calcDifficultyBadge(distKm, elevM);
  const badgeEl = _el('hs-sum-badge');
  if (badgeEl) {
    badgeEl.textContent = `${badge.icon} ${badge.label}`;
    badgeEl.style.color = badge.color;
    badgeEl.style.borderColor = badge.color;
  }

  // Splits
  const splitsEl = _el('hs-sum-splits');
  if (splitsEl) {
    const splits = s.splits || [];
    if (splits.length === 0) {
      splitsEl.innerHTML = '<p class="hs-sum-no-splits">Pas encore de splits.</p>';
    } else {
      splitsEl.innerHTML = splits.map((sp, i) => `
        <div class="hs-split-row">
          <span class="hs-split-km">Km ${i + 1}</span>
          <span class="hs-split-pace">${_fmtPace(sp.paceMinKm)} min/km</span>
          <span class="hs-split-time">${_fmtTimer(sp.durationSec)}</span>
        </div>`).join('');
    }
  }

  // Reset bouton démarrer pour prochaine utilisation
  const startBtn = _el('hs-btn-start');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '▶ DÉMARRER';
  }

  _showSection('summary');
}

/* ─── Sentiers depuis Overpass ──────────────────────────────── */
async function _loadHikingTrails(lat, lon, mode) {
  const radius = mode === 'hiking' ? 10000 : 6000;
  const infoEl = _el('hs-trails-info');
  if (infoEl) infoEl.textContent = '🔍 Recherche des sentiers…';

  const query = `[out:json][timeout:25];
(
  way["highway"~"path|footway|track"]["access"!="private"](around:${radius},${lat},${lon});
  way["route"~"hiking|foot"](around:${radius},${lat},${lon});
);
out body;
>;
out skel qt;`;

  try {
    const resp = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query)
    });
    if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
    const data = await resp.json();
    if (!_screenActive) return;  // fermeture pendant le fetch
    const ways = data.elements.filter(e => e.type === 'way').slice(0, 300);
    const nodes = data.elements.filter(e => e.type === 'node');
    drawHikingTrails(ways, nodes);
    if (infoEl) infoEl.textContent = `🥾 ${ways.length} sentier${ways.length > 1 ? 's' : ''} trouvé${ways.length > 1 ? 's' : ''} dans un rayon de ${radius / 1000} km`;
  } catch (e) {
    if (!_screenActive) return;
    if (infoEl) infoEl.textContent = '⚠️ Sentiers non disponibles';
  }
}

/* ─── SECTION NAV : Accueil navigation ──────────────────────── */
function _wireNav() {
  _el('hs-nav-close')?.addEventListener('click', _closeHikingScreen);

  document.querySelectorAll('[data-hs-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.hsSection;
      if (target === 'bilan')         { _bilanSessionId = null; _loadBilan(); }
      else if (target === 'courses')  _loadCourses();
      else if (target === 'parcours') _loadParcours();
      _showSection(target);
    });
  });

  document.querySelectorAll('[data-hs-back]').forEach(btn => {
    btn.addEventListener('click', () => _showSection('nav'));
  });

  // Délégation permanente — bilan : voir tracé, aller vers courses
  _el('hs-bilan')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-bilan-action]');
    if (!btn) return;
    const action = btn.dataset.bilanAction;
    const sid    = btn.dataset.sessionId;
    if (action === 'map')     _openActivityOnMap(sid || null);
    if (action === 'courses') { _loadCourses(); _showSection('courses'); }
  });

  // Délégation permanente — toutes mes courses : bilan, tracé, suppression
  _el('hs-courses')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-activity-action]');
    if (!btn) return;
    const action = btn.dataset.activityAction;
    const id     = btn.dataset.activityId;
    if (!id) return;
    if (action === 'bilan')  { _bilanSessionId = id; _loadBilan(); _showSection('bilan'); }
    if (action === 'map')    _openActivityOnMap(id);
    if (action === 'delete') _deleteActivity(id, btn);
    if (action === 'gpx')    exportActivityAsGpx(id).catch(() => showToast('Erreur export GPX.', 'error'));
  });

  // Délégation permanente pour les actions sur les cartes de parcours
  _el('hs-parcours')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-route-action]');
    if (!btn) return;
    const action = btn.dataset.routeAction;
    const id     = btn.dataset.routeId;
    if (!id) return;
    if (action === 'open')   _openRouteOnMap(id);
    if (action === 'delete') _deleteRouteOffline(id, btn);
    if (action === 'export') exportOfflineRouteAsJson(id).catch(() => showToast('Erreur export.', 'error'));
  });

  // Import JSON
  _el('hs-import-route-btn')?.addEventListener('click', () => {
    _el('hs-import-route-input')?.click();
  });
  _el('hs-import-route-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      await importOfflineRouteFromJson(file);
      showToast('Parcours importé.', 'success');
      _loadParcours();
    } catch (err) {
      showToast(`Import échoué : ${safeText(err.message, 'Erreur inconnue')}`, 'error');
    }
  });
}

/* ─── SECTION PARCOURS TÉLÉCHARGÉS ──────────────────────────── */
async function _loadParcours() {
  const el = _el('hs-parcours-list');
  if (!el) return;

  el.innerHTML = '<div class="hs-shell-msg">⏳ Chargement…</div>';

  try {
    const routes = await getOfflineHikingRoutes();
    if (!routes || routes.length === 0) {
      el.innerHTML = `
        <p class="hs-shell-msg">Aucun parcours téléchargé pour le moment.</p>
        <p class="hs-shell-msg-sub">Télécharge un parcours pour le retrouver ici hors connexion.</p>`;
      return;
    }
    el.innerHTML = routes.map(r => _renderRouteCard(r)).join('');
  } catch {
    el.innerHTML = '<p class="hs-shell-msg">Impossible de charger les parcours.</p>';
  }
}

function _renderRouteCard(r) {
  const title      = escapeHTML(r.title || 'Parcours sans titre');
  const sourceLbl  = escapeHTML(r.sourceLabel || 'Inconnu');
  const isComplete = r.status === 'complete';
  const statusBadge = isComplete
    ? '<span class="offline-status offline-status-complete">✓ Complet</span>'
    : '<span class="offline-status offline-status-partial">~ Partiel</span>';

  const diffLabel  = { facile: '🟢 Facile', moyen: '🟡 Moyen', difficile: '🔴 Difficile', unknown: '' };
  const diff       = diffLabel[r.difficulty] || '';
  const distTxt    = r.distanceKm != null ? `${Number(r.distanceKm).toFixed(1)} km` : '';
  const meta       = [distTxt, diff].filter(Boolean).join(' · ');

  const date = r.downloadedAt
    ? new Date(r.downloadedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const notesHtml = r.notes ? `
    <details class="secondary-details">
      <summary>Notes</summary>
      <p class="offline-route-notes">${escapeHTML(r.notes)}</p>
    </details>` : '';

  const id = escapeHTML(r.id);

  return `<div class="offline-route-card">
    <div class="offline-route-card-header">
      <span class="offline-route-title">${title}</span>
      ${statusBadge}
    </div>
    ${meta ? `<div class="offline-route-meta">${meta}</div>` : ''}
    <div class="offline-route-source">Source : ${sourceLbl} · Téléchargé le ${date}</div>
    ${notesHtml}
    <div class="offline-route-actions">
      <button class="offline-route-btn offline-route-btn-open" data-route-action="open" data-route-id="${id}">🗺️ Ouvrir</button>
      <button class="offline-route-btn offline-route-btn-export" data-route-action="export" data-route-id="${id}">⬇️ JSON</button>
      <button class="offline-route-btn offline-route-btn-del" data-route-action="delete" data-route-id="${id}">🗑️</button>
    </div>
  </div>`;
}

async function _openRouteOnMap(id) {
  try {
    const route = await getOfflineHikingRoute(id);
    if (!route) { showToast('Parcours introuvable.', 'error'); return; }

    const rendered = renderOfflineRouteLayer(route);
    _closeHikingScreen();

    if (!rendered) {
      showToast('Aucune position disponible pour ce parcours.', 'info');
      return;
    }

    // Naviguer vers le panneau carte
    const mapBtn = document.querySelector('[data-panel="panel-map"]');
    if (mapBtn) mapBtn.click();
  } catch {
    showToast('Impossible d\'ouvrir le parcours.', 'error');
  }
}

async function _deleteRouteOffline(id, btn) {
  if (!confirm('Supprimer ce parcours hors ligne ?')) return;
  try {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    await deleteOfflineHikingRoute(id);
    showToast('Parcours supprimé.', 'success');
    clearOfflineRouteLayer();
    _loadParcours();
  } catch {
    showToast('Erreur lors de la suppression.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️'; }
  }
}

/* ─── SECTION BILAN : dernière sortie (ou spécifique) ───────── */
async function _loadBilan() {
  const el = _el('hs-bilan-content');
  if (!el) return;
  el.innerHTML = '<div class="hs-shell-msg">⏳ Chargement…</div>';

  let activity      = null;
  let sessionIdForMap = null;

  try {
    if (_bilanSessionId) {
      // Session spécifique demandée depuis "Toutes mes courses"
      activity = await getCompletedActivity(_bilanSessionId);
      sessionIdForMap = _bilanSessionId;
    } else if (_finalStats) {
      // Session qui vient de se terminer dans cette instance
      activity = _buildBilanFromFinalStats();
      sessionIdForMap = _sessionId;
    } else {
      // Charger la plus récente depuis la DB
      const list = await getCompletedActivities();
      if (list.length > 0) { activity = list[0]; sessionIdForMap = list[0].id; }
    }
  } catch { /* géré ci-dessous */ }

  if (!activity) {
    el.innerHTML = '<p class="hs-shell-msg">Aucun bilan disponible. Effectuez une sortie pour voir votre bilan.</p>';
    return;
  }

  el.innerHTML = _renderBilanGrid(activity, sessionIdForMap);
}

function _buildBilanFromFinalStats() {
  if (!_finalStats) return null;
  const s    = _finalStats;
  const dist = s.distanceKm || 0;
  const ela  = s.elapsedSec || 0;
  const cfg  = MODE_CONFIG[_mode] || MODE_CONFIG.hiking;
  return {
    title:               'Dernière sortie',
    typeEmoji:           cfg.emoji,
    startedAt:           null,
    endedAt:             null,
    durationSec:         ela,
    distanceKm:          dist > 0 ? dist : null,
    averageSpeedKmh:     dist > 0 && ela > 0 ? Math.round(dist / (ela / 3600) * 10) / 10 : null,
    averagePaceSecPerKm: dist > 0 && ela > 0 ? Math.round(ela / dist) : null,
    maxSpeedKmh:         null,
    elevationGainM:      s.elevGainM || null,
    elevationLossM:      null,
    caloriesEstimate:    s.calories ? Math.round(s.calories) : null,
    heartRate:           { available: false },
    gps:                 { quality: 'inconnu', pointsCount: s.pointCount || null },
    splits:              s.splits || []
  };
}

function _renderBilanGrid(act, sessionIdForMap) {
  const safeUnavail  = 'Non disponible';
  const safeUnavailFC = 'Non disponible en PWA';

  const rows = [
    ['⏱ Temps total',    formatDuration(act.durationSec)],
    ['🥾 Distance',       act.distanceKm    ? formatDistanceKm(act.distanceKm)       : safeUnavail],
    ['⚡ Allure moy.',    act.averagePaceSecPerKm ? formatPace(act.averagePaceSecPerKm) : safeUnavail],
    ['🚶 Vitesse moy.',   act.averageSpeedKmh  ? formatSpeedKmh(act.averageSpeedKmh)  : safeUnavail],
    ['🚀 Vitesse max',    act.maxSpeedKmh      ? formatSpeedKmh(act.maxSpeedKmh)       : safeUnavail],
    ['📈 Dénivelé +',     act.elevationGainM   ? `+${formatElevation(act.elevationGainM)}` : safeUnavail],
    ['📉 Dénivelé −',     act.elevationLossM   ? `−${formatElevation(act.elevationLossM)}` : safeUnavail],
    ['🔥 Calories',       act.caloriesEstimate ? `${act.caloriesEstimate} kcal`        : safeUnavail],
    ['❤️ FC moyenne',     safeUnavail],
    ['🔴 FC max',         safeUnavail],
    ['📡 Source FC',      safeUnavailFC],
    ['📍 Qualité GPS',    formatGpsQuality(act.gps?.quality)],
    ['🕐 Départ',         act.startedAt  ? formatActivityTime(act.startedAt)  : safeUnavail],
    ['🏁 Arrivée',        act.endedAt    ? formatActivityTime(act.endedAt)    : safeUnavail],
  ];

  const rowsHTML = rows.map(([label, value]) => {
    const dim = value === safeUnavail || value === safeUnavailFC;
    return `<div class="hs-bilan-row">
      <span>${escapeHTML(label)}</span>
      <strong${dim ? ' class="hs-unavail"' : ''}>${escapeHTML(value)}</strong>
    </div>`;
  }).join('');

  const sid        = sessionIdForMap ? escapeHTML(sessionIdForMap) : '';
  const titleTxt   = escapeHTML((act.typeEmoji || '') + ' ' + (act.title || ''));
  const dateHTML   = act.startedAt ? `<p class="hs-bilan-date">${escapeHTML(formatActivityDate(act.startedAt))}</p>` : '';
  const mapBtnHTML = sid ? `<button class="hs-bilan-action-btn" data-bilan-action="map" data-session-id="${sid}">🗺️ Voir le parcours</button>` : '';
  const crsBtn     = `<button class="hs-bilan-action-btn hs-bilan-action-btn-sec" data-bilan-action="courses">↩ Toutes mes courses</button>`;

  return `<p class="hs-bilan-title">${titleTxt}</p>
${dateHTML}
<div class="hs-bilan-grid">${rowsHTML}</div>
${mapBtnHTML || crsBtn ? `<div class="hs-bilan-actions">${mapBtnHTML}${crsBtn}</div>` : ''}`;
}

/* ─── SECTION COURSES : historique des sessions ──────────────── */
async function _loadCourses() {
  const el = _el('hs-courses-list');
  if (!el) return;

  el.innerHTML = '<div class="hs-shell-msg">⏳ Chargement…</div>';

  try {
    const activities = await getCompletedActivities();
    if (!activities || activities.length === 0) {
      el.innerHTML = '<p class="hs-shell-msg">Aucune course enregistrée pour le moment.</p>';
      return;
    }
    el.innerHTML = activities.slice(0, 30).map(a => _renderActivityCard(a)).join('');
  } catch {
    el.innerHTML = '<p class="hs-shell-msg">Impossible de charger les courses.</p>';
  }
}

function _renderActivityCard(act) {
  const id    = escapeHTML(act.id);
  const title = escapeHTML(act.title);
  const date  = escapeHTML(formatActivityDateShort(act.startedAt));
  const dist  = act.distanceKm ? escapeHTML(formatDistanceKm(act.distanceKm)) : '—';
  const dur   = escapeHTML(formatDuration(act.durationSec));
  const pace  = act.averagePaceSecPerKm ? escapeHTML(formatPace(act.averagePaceSecPerKm)) : '—';
  const gps   = escapeHTML(formatGpsQuality(act.gps?.quality));

  return `<div class="activity-card">
    <div class="activity-card-header">
      <span class="activity-card-title">${title}</span>
      <span class="activity-card-date">${date}</span>
    </div>
    <div class="activity-card-meta">${dist} · ${dur} · ${pace}</div>
    <div class="activity-card-gps">${gps}</div>
    <div class="activity-card-actions">
      <button class="activity-card-btn" data-activity-action="bilan" data-activity-id="${id}">📊 Bilan</button>
      <button class="activity-card-btn" data-activity-action="map" data-activity-id="${id}">🗺️ Tracé</button>
      <button class="activity-card-btn activity-card-btn-gpx" data-activity-action="gpx" data-activity-id="${id}">⬇ GPX</button>
      <button class="activity-card-btn activity-card-btn-del" data-activity-action="delete" data-activity-id="${id}">🗑️</button>
    </div>
  </div>`;
}

/* ─── Ouvrir une activité sur la carte ───────────────────────── */
async function _openActivityOnMap(id) {
  if (!id) { showToast('Pas de tracé disponible.', 'info'); return; }
  try {
    showToast('Chargement du tracé…', 'info', 1500);
    const points = await loadTrackPoints(String(id));
    if (!points || points.length < 2) {
      showToast('Aucun tracé GPS pour cette sortie.', 'info');
      return;
    }
    const activity = await getCompletedActivity(String(id));
    const title    = activity ? activity.title : 'Activité';
    renderActivityRouteLayer(points, title);
    _closeHikingScreen();
    const mapBtn = document.querySelector('[data-panel="panel-map"]');
    if (mapBtn) mapBtn.click();
  } catch {
    showToast('Impossible d\'ouvrir le tracé.', 'error');
  }
}

/* ─── Supprimer une activité ─────────────────────────────────── */
async function _deleteActivity(id, btn) {
  if (!confirm('Supprimer définitivement cette sortie et son tracé GPS ?')) return;
  try {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    await deleteCompletedActivity(String(id));
    showToast('Activité supprimée.', 'success');
    if (_bilanSessionId === id) _bilanSessionId = null;
    clearActivityRouteLayer();
    _loadCourses();
  } catch {
    showToast('Erreur lors de la suppression.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️'; }
  }
}

/* ─── Fermeture ─────────────────────────────────────────────── */
function _closeHikingScreen() {
  _screenActive = false;
  _stopTimers();

  // Nettoyer la carte (sentiers) et restaurer les POI
  clearHikingTrails();
  showPoiLayers();

  // Réinitialiser l'état interne pour la prochaine session
  _weight = 70;
  _temp = 20;
  _difficulty = 'moyen';
  _goalKm = 0;
  _finalStats = null;
  _sessionId = null;
  _bilanSessionId = null;
  _paused = false;
  _locked = false;
  _lastVoiceKm = 0;
  _lastWaterMin = 0;

  // Remettre le DOM des steppers aux valeurs par défaut
  if (_el('hs-weight-val')) _el('hs-weight-val').textContent = 70;
  if (_el('hs-temp-val')) _el('hs-temp-val').textContent = 20;
  document.querySelectorAll('.hs-diff-btn').forEach(b => b.classList.toggle('hs-diff-active', b.dataset.diff === 'moyen'));
  document.querySelectorAll('.hs-goal-btn').forEach(b => b.classList.toggle('hs-goal-active', b.dataset.goal === '0'));

  document.body.classList.remove('hiking-active');
  const screen = _el('hiking-screen');
  if (screen) screen.classList.add('hidden');
}
