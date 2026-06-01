/* =========================================================
   hiking-screen.js — Écran Randonnée / Balade (AllTrails + Komoot + Strava)
   ========================================================= */
import { startTracking, stopTracking, getLiveStats, calculateWaterNeeds, exportAsGPX, loadTrackPoints } from './tracker.js';
import { invalidateMapSize } from './map.js?v=2';
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

// Live
let _timerInterval = null;
let _statsInterval = null;
let _waterInterval = null;
let _elapsedSec = 0;
let _paused = false;
let _locked = false;
let _lastVoiceKm = 0;
let _lastWaterMin = 0;

// Summary
let _finalStats = null;
let _sessionId = null;

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

  // Map already active behind — give it a moment
  setTimeout(() => invalidateMapSize(), 150);
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
    _elapsedSec = 0;
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
  // Timer 1s
  _timerInterval = setInterval(() => {
    if (!_paused) {
      _elapsedSec++;
    }
    // Mise à jour timer (toujours, même en pause)
    const stats = getLiveStats();
    const autoPauseTxt = stats.autoPaused ? ' (Auto-pause)' : '';
    const pauseTxt = _paused ? ' ⏸' : '';
    const timerEl = _el('hs-timer');
    if (timerEl) timerEl.textContent = _fmtTimerFull(_elapsedSec) + autoPauseTxt + pauseTxt;

    // Alerte hydratation
    const cfg = MODE_CONFIG[_mode];
    const elapsedMin = Math.floor(_elapsedSec / 60);
    if (elapsedMin > 0 && elapsedMin - _lastWaterMin >= cfg.waterIntervalMin) {
      _lastWaterMin = elapsedMin;
      _triggerWaterAlert();
    }
  }, 1000);

  // Stats 5s
  _statsInterval = setInterval(_updateLiveStats, 5000);
  _updateLiveStats(); // première update immédiate
}

function _stopTimers() {
  clearInterval(_timerInterval);
  clearInterval(_statsInterval);
  clearInterval(_waterInterval);
  _timerInterval = null;
  _statsInterval = null;
  _waterInterval = null;
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
  const elapsedMin = Math.floor(_elapsedSec / 60);
  const ml = calculateWaterNeeds(_mode, elapsedMin, _temp);
  const needed = Math.round(ml / Math.max(1, Math.floor(elapsedMin / (MODE_CONFIG[_mode].waterIntervalMin))));
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
  _finalStats = { ...stats, elapsedSec: _elapsedSec };

  try {
    _sessionId = await stopTracking();
  } catch (e) {
    showToast('Erreur à l\'arrêt : ' + e.message, 'error');
  }

  _showSummary();
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
      const gpx = exportAsGPX(points, `${cfg.title} — ${_fmtDateShort()}`);
      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trekko_${_mode}_${Date.now()}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
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

/* ─── Fermeture ─────────────────────────────────────────────── */
function _closeHikingScreen() {
  // Arrêter les timers si encore actifs
  _stopTimers();

  document.body.classList.remove('hiking-active');
  const screen = _el('hiking-screen');
  if (screen) screen.classList.add('hidden');
}
