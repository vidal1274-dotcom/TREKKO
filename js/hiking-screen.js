/* =========================================================
   hiking-screen.js — Écran Randonnée / Balade (AllTrails + Komoot + Strava)
   ========================================================= */
import { startTracking, stopTracking, getLiveStats, calculateWaterNeeds, exportAsGPX, loadTrackPoints, getElapsedSec, pauseElapsedTimer, resumeElapsedTimer, buildHikingSummary } from './tracker.js?v=3';
import { invalidateMapSize, hidePoiLayers, showPoiLayers, centerMap, drawHikingTrails, clearHikingTrails, flyToSite } from './map.js?v=5';
import { getStoredOrigin } from './geolocation.js';
import { OVERPASS_ENDPOINT } from './config.js';
import { showToast } from './utils.js';

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
let _section = 'setup';          // 'setup' | 'live' | 'summary'
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

  // Update header mode label
  const modeLabel = _el('hs-mode-label');
  if (modeLabel) modeLabel.textContent = `${cfg.emoji} ${cfg.title}`;

  // Reset to setup section
  _showSection('setup');
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
function _showSection(name) {
  _section = name;
  ['setup', 'live', 'summary'].forEach(s => {
    const el = _el(`hs-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

/* ─── SECTION A : SETUP ─────────────────────────────────────── */
function _wireSetup() {
  // Bouton retour
  _el('hs-back-btn')?.addEventListener('click', _closeHikingScreen);

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

  // Bouton recentrer carte sur position GPS
  _el('btn-hs-center')?.addEventListener('click', () => {
    const origin = getStoredOrigin();
    if (origin?.lat && origin?.lon) {
      invalidateMapSize();
      centerMap(origin.lat, origin.lon, 15);
    }
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

function _gpsState(accuracy) {
  if (accuracy === null || accuracy === undefined) return { dot: 'gray',   label: 'GPS perdu',      cls: 'hs-gps-gray' };
  if (accuracy < 15)  return { dot: 'green',  label: 'GPS excellent',  cls: 'hs-gps-green' };
  if (accuracy < 40)  return { dot: 'orange', label: 'GPS moyen',      cls: 'hs-gps-orange' };
  return                     { dot: 'red',    label: 'GPS faible',     cls: 'hs-gps-red' };
}

function _updateLiveStats() {
  const stats = getLiveStats();
  if (!stats) return;

  const dist    = (stats.distanceKm || 0).toFixed(2);
  const elev    = Math.round(stats.elevGainM || 0);
  const pace    = stats.paceMinKm ? _fmtPace(stats.paceMinKm) : '—';
  const cals    = Math.round(stats.calories || 0);
  const speed   = (stats.speedKmh || 0).toFixed(1);
  const avgSpd  = (stats.avgSpeedKmh || 0).toFixed(1);
  const pts     = stats.pointCount || 0;

  if (_el('hs-stat-dist'))   _el('hs-stat-dist').textContent   = dist;
  if (_el('hs-stat-elev'))   _el('hs-stat-elev').textContent   = `+${elev}`;
  if (_el('hs-stat-pace'))   _el('hs-stat-pace').textContent   = pace;
  if (_el('hs-stat-cals'))   _el('hs-stat-cals').textContent   = cals;
  if (_el('hs-stat-speed'))  _el('hs-stat-speed').textContent  = speed;
  if (_el('hs-stat-avgspd')) _el('hs-stat-avgspd').textContent = avgSpd;
  if (_el('hs-stat-pts'))    _el('hs-stat-pts').textContent    = pts;

  // Indicateur GPS
  const gps = _gpsState(stats.lastAccuracy);
  const gpsEl = _el('hs-gps-indicator');
  if (gpsEl) {
    gpsEl.className = `hs-gps-indicator ${gps.cls}`;
    const dotEl   = gpsEl.querySelector('.hs-gps-dot');
    const lblEl   = gpsEl.querySelector('.hs-gps-label');
    const accEl   = gpsEl.querySelector('.hs-gps-acc');
    if (dotEl)  dotEl.className  = `hs-gps-dot hs-gps-dot-${gps.dot}`;
    if (lblEl)  lblEl.textContent = gps.label;
    if (accEl)  accEl.textContent = stats.lastAccuracy != null ? `±${Math.round(stats.lastAccuracy)} m` : '';
  }

  // Avertissement précision faible
  const warnEl = _el('hs-gps-warn');
  if (warnEl) {
    const poor = stats.lastAccuracy != null && stats.lastAccuracy > 40;
    warnEl.classList.toggle('hidden', !poor);
  }

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
  // Export GPX
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

  // Copier résumé texte
  _el('btn-hs-copy')?.addEventListener('click', () => {
    if (!_finalStats) { showToast('Pas de résumé disponible.', 'warning'); return; }
    const summary = buildHikingSummary(_finalStats);
    copyHikingSummaryText(summary);
  });

  // Retour carte
  _el('btn-hs-back-map')?.addEventListener('click', _closeHikingScreen);

  // Nouvelle sortie
  _el('btn-hs-new')?.addEventListener('click', () => {
    _closeHikingScreen();
    if (window._showWelcome) window._showWelcome();
  });
}

function _showSummary() {
  const summary = buildHikingSummary(_finalStats);
  renderHikingSummary(summary);

  const startBtn = _el('hs-btn-start');
  if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶ DÉMARRER'; }
  _showSection('summary');
}

export function renderHikingSummary(summary) {
  const cfg  = MODE_CONFIG[_mode];
  const s    = summary || {};

  // Header
  const hdr = _el('hs-summary-header-text');
  if (hdr) hdr.textContent = `${cfg.emoji} ${cfg.title === 'Randonnée' ? 'Randonnée terminée' : 'Balade terminée'}`;
  const dateEl = _el('hs-summary-date');
  if (dateEl) dateEl.textContent = _fmtDateLong();

  // Héro distance
  if (_el('hs-sum-dist')) _el('hs-sum-dist').textContent = (s.distanceKm || 0).toFixed(2);

  // Grille principale
  if (_el('hs-sum-duration')) _el('hs-sum-duration').textContent = _fmtTimerFull(s.durationSec || 0);
  if (_el('hs-sum-elev'))     _el('hs-sum-elev').textContent     = `+${s.elevationGain || 0} m`;
  if (_el('hs-sum-cals'))     _el('hs-sum-cals').textContent     = `${s.calories || 0} kcal`;
  if (_el('hs-sum-avgspd'))   _el('hs-sum-avgspd').textContent   = `${s.avgSpeedKmh || 0} km/h`;
  if (_el('hs-sum-maxspd'))   _el('hs-sum-maxspd').textContent   = s.maxSpeedKmh > 0 ? `${s.maxSpeedKmh} km/h` : '—';
  if (_el('hs-sum-pace'))     _el('hs-sum-pace').textContent     = s.avgPaceMinKm ? _fmtPace(s.avgPaceMinKm) : '—';
  if (_el('hs-sum-pts'))      _el('hs-sum-pts').textContent      = s.gpsPointCount || 0;
  if (_el('hs-sum-acc'))      _el('hs-sum-acc').textContent      = s.avgAccuracy != null ? `±${s.avgAccuracy} m` : '—';
  if (_el('hs-sum-water'))    _el('hs-sum-water').textContent    = s.waterEstimateMl > 0 ? `~${s.waterEstimateMl} ml` : '—';

  // Altitude min / max
  const altEl = _el('hs-sum-alt');
  if (altEl) {
    if (s.minAltitude != null && s.maxAltitude != null) {
      altEl.textContent = `${s.minAltitude} → ${s.maxAltitude} m`;
    } else {
      altEl.textContent = '—';
    }
  }

  // Badge difficulté
  const badge = _calcDifficultyBadge(s.distanceKm || 0, s.elevationGain || 0);
  const badgeEl = _el('hs-sum-badge');
  if (badgeEl) {
    badgeEl.textContent = `${badge.icon} ${badge.label}`;
    badgeEl.style.color = badge.color;
    badgeEl.style.borderColor = badge.color;
  }

  // Fiabilité
  const relEl = _el('hs-sum-reliability');
  if (relEl) {
    const icons = { good: '🟢', medium: '🟡', poor: '🔴' };
    relEl.textContent = `${icons[s.reliabilityLevel] || '🟡'} Fiabilité ${s.reliabilityLevel === 'good' ? 'bonne' : s.reliabilityLevel === 'medium' ? 'moyenne' : 'faible'}`;
  }

  // Avertissements
  const warnEl = _el('hs-sum-warnings');
  if (warnEl) {
    if (s.warnings?.length) {
      warnEl.innerHTML = s.warnings.map(w => `<div class="hs-sum-warn">⚠️ ${w}</div>`).join('');
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
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
}

export function copyHikingSummaryText(summary) {
  const s = summary || {};
  const lines = [
    'TREKKO — Résumé randonnée',
    `Date : ${_fmtDateLong()}`,
    `Distance : ${(s.distanceKm || 0).toFixed(2)} km`,
    `Durée : ${_fmtTimerFull(s.durationSec || 0)}`,
    `Vitesse moyenne : ${s.avgSpeedKmh || 0} km/h`,
    s.avgPaceMinKm ? `Allure : ${_fmtPace(s.avgPaceMinKm)} min/km` : null,
    `Dénivelé+ : ${s.elevationGain || 0} m`,
    s.minAltitude != null ? `Altitude : ${s.minAltitude} → ${s.maxAltitude} m` : null,
    `Calories : ${s.calories || 0} kcal`,
    `Points GPS : ${s.gpsPointCount || 0}`,
    s.avgAccuracy != null ? `Précision moyenne : ±${s.avgAccuracy} m` : null,
    s.warnings?.length ? `⚠️ ${s.warnings.join(' | ')}` : null
  ].filter(Boolean).join('\n');

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(lines)
      .then(() => showToast('Résumé copié.', 'success'))
      .catch(() => showToast('Copie non disponible.', 'warning'));
  } else {
    showToast('Copie non supportée sur ce navigateur.', 'warning');
  }
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
