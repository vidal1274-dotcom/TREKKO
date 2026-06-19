/* =========================================================
   BLOC 01 — ÉTAT TRACKING
   ========================================================= */
import { dbPut, dbGetAll, dbGetByIndex, STORES } from './storage.js';

const ACTIVITY_CONFIG = {
  running: { label: 'Course',      emoji: '🏃', interval_ms: 10000,  water_base_ml_h: 900, met: 10 },
  hiking:  { label: 'Randonnée',   emoji: '🥾', interval_ms: 30000,  water_base_ml_h: 650, met: 6  },
  casual:  { label: 'Exploration', emoji: '🗺️', interval_ms: 3600000, water_base_ml_h: 250, met: 3  }
};

// State machine — évite les incohérences entre démarrage/arrêt
export const HikingSessionStatus = {
  IDLE:     'idle',
  STARTING: 'starting',
  RECORDING:'recording',
  PAUSED:   'paused',
  STOPPING: 'stopping',
  FINISHED: 'finished',
  ERROR:    'error'
};

let _status        = HikingSessionStatus.IDLE;
let _sessionId     = null;
let _intervalId    = null;
let _pointCount    = 0;
let _lastPoint     = null;
let _totalDistKm   = 0;
let _totalElevGain = 0;
let _currentSpeed  = 0;
let _activityMode  = 'casual';
let _tempCelsius   = 20;
let _weightKg      = 70;
let _splits        = [];
let _lastSplitDist = 0;
let _autoPaused    = false;

// Timer fiable basé sur Date.now() — résistant à la veille iOS
let _sessionStartMs  = 0;
let _pauseStartMs    = 0;
let _totalPausedMs   = 0;

/* =========================================================
   BLOC 02 — DÉMARRER / ARRÊTER
   ========================================================= */
export async function startTracking(label = 'Parcours', isPublic = false, activityMode = 'casual', tempCelsius = 20, weightKg = 70) {
  // Protège contre double-appel
  if (_status === HikingSessionStatus.RECORDING || _status === HikingSessionStatus.STARTING) {
    return _sessionId;
  }

  _status        = HikingSessionStatus.STARTING;
  _activityMode  = activityMode;
  _tempCelsius   = tempCelsius;
  _weightKg      = weightKg;
  _sessionId     = `track_${Date.now()}`;
  _pointCount    = 0;
  _lastPoint     = null;
  _totalDistKm   = 0;
  _totalElevGain = 0;
  _currentSpeed  = 0;
  _splits        = [];
  _lastSplitDist = 0;
  _autoPaused    = false;
  _sessionStartMs  = Date.now();
  _pauseStartMs    = 0;
  _totalPausedMs   = 0;

  const cfg = ACTIVITY_CONFIG[activityMode] || ACTIVITY_CONFIG.casual;

  const session = {
    id: _sessionId,
    label,
    is_public: isPublic,
    activity_mode: activityMode,
    temp_celsius: tempCelsius,
    weight_kg: weightKg,
    started_at: new Date().toISOString(),
    ended_at: null,
    point_count: 0,
    total_distance_km: 0,
    total_elev_gain_m: 0,
    splits: []
  };
  await dbPut(STORES.TRACK_SESSIONS, session);
  localStorage.setItem('trekko_active_track_session', _sessionId);

  _status = HikingSessionStatus.RECORDING;
  await recordPoint();
  _intervalId = setInterval(recordPoint, cfg.interval_ms);
  document.addEventListener('visibilitychange', _onVisibilityChange);

  return _sessionId;
}

export async function stopTracking() {
  if (!_sessionId || _status === HikingSessionStatus.STOPPING || _status === HikingSessionStatus.IDLE) {
    return null;
  }

  _status = HikingSessionStatus.STOPPING;
  clearInterval(_intervalId);
  _intervalId = null;
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  localStorage.removeItem('trekko_active_track_session');

  // Mise à jour finale de la session dans IndexedDB
  const sessions = await dbGetAll(STORES.TRACK_SESSIONS);
  const session = sessions.find(s => s.id === _sessionId);
  if (session) {
    session.ended_at             = new Date().toISOString();
    session.point_count          = _pointCount;
    session.total_distance_km    = Math.round(_totalDistKm * 100) / 100;
    session.total_elev_gain_m    = Math.round(_totalElevGain);
    session.splits               = _splits;
    session.elapsed_sec          = getElapsedSec();
    await dbPut(STORES.TRACK_SESSIONS, session);
  }

  const finished  = _sessionId;
  _sessionId      = null;
  _pointCount     = 0;
  _lastPoint      = null;
  _totalDistKm    = 0;
  _totalElevGain  = 0;
  _currentSpeed   = 0;
  _sessionStartMs = 0;
  _pauseStartMs   = 0;
  _totalPausedMs  = 0;
  _status         = HikingSessionStatus.FINISHED;
  return finished;
}

export function isTracking()        { return _status === HikingSessionStatus.RECORDING || _status === HikingSessionStatus.PAUSED; }
export function getActiveSessionId(){ return _sessionId; }
export function getSessionStatus()  { return _status; }

/* =========================================================
   BLOC 03 — TIMER FIABLE (Date.now — résistant veille iOS)
   ========================================================= */
/** Temps écoulé en secondes, net des pauses. */
export function getElapsedSec() {
  if (!_sessionStartMs) return 0;
  const rawMs = Date.now() - _sessionStartMs - _totalPausedMs;
  return Math.max(0, Math.floor(rawMs / 1000));
}

/** Appelé par hiking-screen pour mettre en pause le chrono. */
export function pauseElapsedTimer() {
  if (_status !== HikingSessionStatus.RECORDING) return;
  _status       = HikingSessionStatus.PAUSED;
  _pauseStartMs = Date.now();
}

/** Appelé par hiking-screen pour reprendre le chrono. */
export function resumeElapsedTimer() {
  if (_status !== HikingSessionStatus.PAUSED) return;
  if (_pauseStartMs > 0) _totalPausedMs += Date.now() - _pauseStartMs;
  _pauseStartMs = 0;
  _status       = HikingSessionStatus.RECORDING;
}

/* =========================================================
   BLOC 04 — ENREGISTRER UN POINT GPS
   ========================================================= */
export async function recordPoint() {
  if (!_sessionId) return;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const now = new Date().toISOString();
        const point = {
          session_id: _sessionId,
          lat:        pos.coords.latitude,
          lon:        pos.coords.longitude,
          accuracy:   pos.coords.accuracy,
          altitude:   pos.coords.altitude,
          recorded_at: now
        };

        if (_lastPoint) {
          const distKm   = _haversine(_lastPoint.lat, _lastPoint.lon, point.lat, point.lon);
          const elapsedH = (Date.parse(now) - Date.parse(_lastPoint.recorded_at)) / 3600000;
          _totalDistKm  += distKm;
          _currentSpeed  = elapsedH > 0 ? distKm / elapsedH : 0;

          if (_activityMode !== 'casual') {
            _autoPaused = _currentSpeed < 1.0 && _currentSpeed > 0;
          }

          // Splits km
          const newKm = Math.floor(_totalDistKm);
          if (newKm > _lastSplitDist && newKm > 0) {
            const elapsed = getElapsedSec();
            const pace = elapsed > 0 ? (elapsed / 60) / _totalDistKm : 0;
            _splits.push({ km: newKm, durationSec: elapsed, paceMinKm: Math.round(pace * 100) / 100 });
            _lastSplitDist = newKm;
          }

          // Dénivelé positif
          if (point.altitude != null && _lastPoint.altitude != null) {
            const diff = point.altitude - _lastPoint.altitude;
            if (diff > 0) _totalElevGain += diff;
          }
        }

        _lastPoint = point;
        await dbPut(STORES.TRACK_POINTS, point);
        _pointCount++;

        // Mise à jour session — utilise dbGetByIndex si dispo, sinon dbGetAll
        try {
          const sessions = await dbGetAll(STORES.TRACK_SESSIONS);
          const session  = sessions.find(s => s.id === _sessionId);
          if (session) {
            session.point_count       = _pointCount;
            session.total_distance_km = Math.round(_totalDistKm * 100) / 100;
            session.total_elev_gain_m = Math.round(_totalElevGain);
            await dbPut(STORES.TRACK_SESSIONS, session);
          }
        } catch (_) { /* non bloquant */ }

        resolve(point);
      },
      err => { console.warn('[tracker] GPS point failed', err.code); resolve(null); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function _onVisibilityChange() {
  if (document.visibilityState === 'visible' && _sessionId) {
    // Recalcul immédiat à la reprise — remet les stats à jour
    recordPoint();
  }
}

/* =========================================================
   BLOC 05 — MÉTRIQUES TEMPS RÉEL
   ========================================================= */
export function getLiveStats() {
  return {
    distanceKm:   Math.round(_totalDistKm * 100) / 100,
    speedKmh:     Math.round(_currentSpeed * 10) / 10,
    paceMinKm:    _currentSpeed > 0.5 ? 60 / _currentSpeed : null,
    elevGainM:    Math.round(_totalElevGain),
    activityMode: _activityMode,
    pointCount:   _pointCount,
    calories:     _sessionStartMs > 0 ? _calcCalories() : 0,
    splits:       [..._splits],
    autoPaused:   _autoPaused,
    elapsedSec:   getElapsedSec(),
    status:       _status
  };
}

export function calculateWaterNeeds(activityMode, durationMin, tempCelsius) {
  const cfg = ACTIVITY_CONFIG[activityMode] || ACTIVITY_CONFIG.casual;
  let tempMultiplier = 1.0;
  if (tempCelsius < 15)      tempMultiplier = 0.7;
  else if (tempCelsius < 20) tempMultiplier = 0.85;
  else if (tempCelsius < 25) tempMultiplier = 1.0;
  else if (tempCelsius < 30) tempMultiplier = 1.25;
  else if (tempCelsius < 35) tempMultiplier = 1.5;
  else                       tempMultiplier = 1.8;

  const mlPerHour = Math.round(cfg.water_base_ml_h * tempMultiplier);
  const totalMl   = Math.round(mlPerHour * (durationMin / 60));
  return { mlPerHour, totalMl };
}

export function getActivityConfig(mode) { return ACTIVITY_CONFIG[mode] || ACTIVITY_CONFIG.hiking; }
export function getActivityModes()      { return ACTIVITY_CONFIG; }
export function isAutoPaused()          { return _autoPaused; }
export function getCurrentSplits()      { return [..._splits]; }

/* =========================================================
   BLOC 06 — CHARGEMENT DONNÉES
   ========================================================= */
export async function loadTrackPoints(sessionId) {
  return dbGetByIndex(STORES.TRACK_POINTS, 'session_id', sessionId);
}

export async function getAllSessions() {
  const sessions = await dbGetAll(STORES.TRACK_SESSIONS);
  return sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export async function updateSessionVisibility(sessionId, isPublic) {
  const sessions = await dbGetAll(STORES.TRACK_SESSIONS);
  const session  = sessions.find(s => s.id === sessionId);
  if (!session) return;
  session.is_public = isPublic;
  await dbPut(STORES.TRACK_SESSIONS, session);
}

/* =========================================================
   BLOC 07 — EXPORT GPX
   ========================================================= */
export function exportAsGPX(points, sessionLabel = 'Parcours') {
  const trkpts = points
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map(p => {
      const alt = p.altitude != null ? `\n        <ele>${p.altitude.toFixed(1)}</ele>` : '';
      return `    <trkpt lat="${p.lat}" lon="${p.lon}"><time>${p.recorded_at}</time>${alt}</trkpt>`;
    }).join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TREKKO" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${sessionLabel}</name><time>${new Date().toISOString()}</time></metadata>
  <trk>
    <name>${sessionLabel}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

  // Nom de fichier propre : trekko-rando-YYYY-MM-DD-HHMM.gpx
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const ts   = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const slug = sessionLabel.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase().slice(0, 30);
  const filename = `trekko-${slug}-${ts}.gpx`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Délai Safari iOS — revokeObjectURL doit attendre que le navigateur récupère le Blob
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* =========================================================
   BLOC 08 — UTILITAIRES INTERNES
   ========================================================= */
function _calcCalories() {
  const cfg   = ACTIVITY_CONFIG[_activityMode] || ACTIVITY_CONFIG.casual;
  const hours = getElapsedSec() / 3600;
  return Math.round(cfg.met * _weightKg * hours);
}

function _haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
