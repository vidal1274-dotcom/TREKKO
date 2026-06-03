/* =========================================================
   BLOC RUNNING — ÉCRAN COURSE / VÉLO / MARCHE
   Extrait de app.js pour isoler le bloc Running du CORE.
   Dépend de tracker.js pour le GPS track, map.js pour la
   mini-carte, et de callbacks injectés depuis app.js pour
   le résumé et le journal post-sortie.
   ========================================================= */
import { startTracking, stopTracking, isTracking, getLiveStats, calculateWaterNeeds } from './tracker.js?v=2';
import { invalidateMapSize } from './map.js?v=4';
import { ORIGIN_DEFAULT } from './config.js';

/* =========================================================
   BLOC RUNNING — ÉTAT DE SESSION
   ========================================================= */
let _rsInterval    = null;
let _rsStartTime   = null;
let _rsPausedMs    = 0;
let _rsPauseAt     = null;
let _rsState       = 'idle';      // 'idle' | 'countdown' | 'running' | 'paused'
let _rsSplitCount  = 0;
let _rsLockHold    = null;
let _rsActivityType = 'running';  // 'running' | 'cycling' | 'walking'

/** Mini-carte GPS propre au running (ne touche pas la carte principale). */
let _rsMap = null, _rsMapMarker = null, _rsMapLine = null, _rsMapPoints = [];

/** Poids utilisateur depuis localStorage (cohérent avec le reste de l'app). */
const _rsWt = () => parseInt(localStorage.getItem('trekko_weight_kg') || '70', 10);

/* =========================================================
   BLOC RUNNING — CALLBACKS INJECTÉS DEPUIS app.js
   Évite les imports circulaires : app.js injecte ses fonctions
   internes (résumé, carnet) via setupRunningCallbacks().
   ========================================================= */
let _cbOnSummary    = null;  // (stats, mode, tempC, weight, sessionId) => void
let _cbLoadCarnet   = null;  // async () => void
let _cbGetSaveJour  = null;  // () => function | null — retourne _saveJournalToSession

/**
 * Injecte les callbacks de app.js dans le bloc Running.
 * Doit être appelé dans startApp() avant initRunningScreen().
 * @param {{ onSummary, loadCarnet, getSaveJournal }} cbs
 */
export function setupRunningCallbacks({ onSummary, loadCarnet, getSaveJournal }) {
  _cbOnSummary   = onSummary;
  _cbLoadCarnet  = loadCarnet;
  _cbGetSaveJour = getSaveJournal;
}

/* =========================================================
   BLOC RUNNING — INITIALISATION
   ========================================================= */
export function initRunningScreen() {
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
    });
  });
}

/* =========================================================
   BLOC RUNNING — AFFICHER L'ÉCRAN
   ========================================================= */
export function showRunningScreen() {
  // NOTE : switchToPanel vient de ui.js — on l'appelle via l'import app.js
  // Pour éviter l'import circulaire, on dispatche un événement custom.
  window.dispatchEvent(new CustomEvent('trekko:switchPanel', { detail: 'panel-map' }));
  setTimeout(() => invalidateMapSize(), 150);
  _rsCheckGPS();

  // Initialiser la mini-carte GPS (Leaflet séparé de la carte principale)
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
   BLOC RUNNING — COUNTDOWN ET DÉMARRAGE
   ========================================================= */
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

/* =========================================================
   BLOC RUNNING — PAUSE / REPRISE / ARRÊT
   ========================================================= */
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
  if (_cbLoadCarnet) await _cbLoadCarnet();
  const saveJournal = _cbGetSaveJour?.();
  if (sid && stat.calories > 0 && saveJournal) await saveJournal(sid, { final_calories: stat.calories });
  _rsMapClear();
  _rsResetMetrics();
  _rsSetState('idle');
  document.getElementById('running-screen')?.classList.add('hidden');
  if (_cbOnSummary) _cbOnSummary(stat, _rsActivityType, 20, _rsWt(), sid);
  _rsSpeak('Course terminée. Bravo !');
}

async function _rsStopForce() {
  clearInterval(_rsInterval); _rsInterval = null;
  if (isTracking()) await stopTracking();
  _rsResetMetrics();
  _rsSetState('idle');
}

/* =========================================================
   BLOC RUNNING — ÉTATS UI
   ========================================================= */
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

/* =========================================================
   BLOC RUNNING — HUD LIVE (mise à jour chaque seconde)
   ========================================================= */
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
    _rsSpeak(`Kilomètre ${split.km}. Allure ${_rsFormatPace(split.paceMinKm)}.`);
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

/* =========================================================
   BLOC RUNNING — MINI-CARTE GPS
   ========================================================= */
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

function _rsMapClear() {
  _rsMapPoints = [];
  if (_rsMapLine)   { _rsMapLine.remove();   _rsMapLine   = null; }
  if (_rsMapMarker) { _rsMapMarker.remove(); _rsMapMarker = null; }
}

/* =========================================================
   BLOC RUNNING — UTILITAIRES (format, zones, voix, GPS)
   ========================================================= */
function _rsFormatTimer(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h${String(m).padStart(2,'00')}` : `${m}:${String(sec).padStart(2,'0')}`;
}

function _rsFormatPace(p) {
  if (!p || p > 60) return '—';
  return `${Math.floor(p)}'${String(Math.round((p % 1) * 60)).padStart(2,'0')}"`;
}

function _rsZone(pace) {
  if (!pace || pace > 60) return { label: '—', cls: '' };
  if (pace < 4.5) return { label: 'INTENSE',  cls: 'rz-intense' };
  if (pace < 5.5) return { label: 'SOUTENU',  cls: 'rz-hard' };
  if (pace < 7.0) return { label: 'MODÉRÉ',   cls: 'rz-moderate' };
  return               { label: 'FACILE',   cls: 'rz-easy' };
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
  _rsMapClear();
}
