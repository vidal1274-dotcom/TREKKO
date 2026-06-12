/* =========================================================
   activity-store.js — Normalisation et accès aux activités GPS
   Wrapper autour de TRACK_SESSIONS sans modifier storage.js.
   ========================================================= */
import { getAllSessions, loadTrackPoints, exportAsGPX } from './tracker.js';
import { dbGet, dbDelete, dbGetByIndex, STORES } from './storage.js';
import { safeText, isValidLatLon } from './utils.js';

const SCHEMA_VERSION = 1;

const ACTIVITY_META = {
  running: { label: 'Course',      emoji: '🏃' },
  hiking:  { label: 'Randonnée',   emoji: '🥾' },
  walking: { label: 'Balade',      emoji: '🚶' },
  casual:  { label: 'Exploration', emoji: '🗺️' }
};

const MET_VALUES = { running: 10, hiking: 6, walking: 4, casual: 3 };

/* ── Formatters ───────────────────────────────────────────── */
export function formatDuration(sec) {
  const n = Number(sec);
  if (!isFinite(n) || n < 0) return 'Non disponible';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m}min${String(Math.floor(n % 60)).padStart(2, '0')}`;
  return `${Math.floor(n)}s`;
}

export function formatDurationFull(sec) {
  const n = Number(sec);
  if (!isFinite(n) || n < 0) return 'Non disponible';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function formatDistanceKm(km) {
  const n = Number(km);
  if (!isFinite(n) || n < 0) return 'Non disponible';
  return `${n.toFixed(2)} km`;
}

export function formatPace(secPerKm) {
  const n = Number(secPerKm);
  if (!isFinite(n) || n <= 0) return 'Non disponible';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function formatSpeedKmh(kmh) {
  const n = Number(kmh);
  if (!isFinite(n) || n < 0) return 'Non disponible';
  return `${n.toFixed(1)} km/h`;
}

export function formatElevation(m) {
  const n = Number(m);
  if (!isFinite(n)) return 'Non disponible';
  return `${Math.round(n)} m`;
}

export function formatActivityDate(iso) {
  if (!iso) return 'Non disponible';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return 'Non disponible'; }
}

export function formatActivityDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

export function formatActivityTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export function formatGpsQuality(quality) {
  const map = { bon: 'Bon', moyen: 'Moyen', faible: 'Faible', inconnu: 'Inconnu' };
  return map[quality] ? `📡 ${map[quality]}` : 'Non disponible';
}

/* ── Titre activité ───────────────────────────────────────── */
export function buildActivityTitle(session) {
  if (!session) return 'Activité';
  const rawLabel = session.label || '';
  if (rawLabel.trim() && !rawLabel.startsWith('track_')) return rawLabel.trim();
  const meta = ACTIVITY_META[session.activity_mode] || ACTIVITY_META.casual;
  const dateStr = session.started_at
    ? new Date(session.started_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  return `${meta.label}${dateStr ? ` du ${dateStr}` : ''}`;
}

/* ── Helpers de calcul internes ───────────────────────────── */
function _num(v) { const n = Number(v); return isFinite(n) ? n : null; }

function _haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function _calcGpsQuality(points) {
  if (!points || points.length < 3) return 'inconnu';
  const accs = points.map(p => _num(p.accuracy)).filter(v => v !== null && v > 0);
  if (accs.length === 0) return 'inconnu';
  const avg = accs.reduce((a, b) => a + b, 0) / accs.length;
  if (avg <= 8)  return 'bon';
  if (avg <= 20) return 'moyen';
  return 'faible';
}

function _calcElevLoss(points) {
  if (!points || points.length < 2) return null;
  let loss = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = _num(points[i-1].altitude);
    const curr = _num(points[i].altitude);
    if (prev !== null && curr !== null && prev - curr > 0) loss += prev - curr;
  }
  return loss > 0 ? Math.round(loss) : 0;
}

function _calcMaxSpeed(points) {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  let maxKmh = 0;
  for (let i = 1; i < sorted.length; i++) {
    const p1 = sorted[i-1], p2 = sorted[i];
    const dtH = (Date.parse(p2.recorded_at) - Date.parse(p1.recorded_at)) / 3600000;
    if (dtH <= 0 || dtH > 0.5) continue; // ignore gaps > 30min
    const la1 = _num(p1.lat), lo1 = _num(p1.lon);
    const la2 = _num(p2.lat), lo2 = _num(p2.lon);
    if (la1 === null || la2 === null || !isValidLatLon(la1, lo1) || !isValidLatLon(la2, lo2)) continue;
    const spd = _haversine(la1, lo1, la2, lo2) / dtH;
    if (spd > maxKmh && spd < 50) maxKmh = spd; // filtre aberrant > 50 km/h
  }
  return maxKmh > 0 ? Math.round(maxKmh * 10) / 10 : null;
}

function _calcCalories(session) {
  const met     = MET_VALUES[session.activity_mode] || 3;
  const weight  = _num(session.weight_kg) || 70;
  const elapsed = _num(session.elapsed_sec) || 0;
  return elapsed > 0 ? Math.round(met * weight * elapsed / 3600) : null;
}

/* ── Normalisation ────────────────────────────────────────── */
export function normalizeActivity(session, points = null) {
  if (!session || typeof session !== 'object') return null;

  const dist    = _num(session.total_distance_km) || 0;
  const elapsed = _num(session.elapsed_sec) || 0;

  const avgSpeedKmh     = dist > 0 && elapsed > 0 ? Math.round((dist / (elapsed / 3600)) * 10) / 10 : null;
  const avgPaceSecPerKm = dist > 0 && elapsed > 0 ? Math.round(elapsed / dist) : null;

  const elevGainM = _num(session.total_elev_gain_m);
  const elevLossM = points ? _calcElevLoss(points) : null;
  const maxSpeed  = points ? _calcMaxSpeed(points) : null;
  const gpsQual   = points ? _calcGpsQuality(points) : 'inconnu';
  const calories  = _calcCalories(session);

  const meta = ACTIVITY_META[session.activity_mode] || ACTIVITY_META.casual;

  // GeoJSON LineString depuis les points (GeoJSON = [lon, lat])
  let route = null;
  if (points && points.length >= 2) {
    const sorted = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const coords = sorted
      .filter(p => isValidLatLon(_num(p.lat), _num(p.lon)))
      .map(p => [_num(p.lon), _num(p.lat)]);
    if (coords.length >= 2) route = { type: 'LineString', coordinates: coords };
  }

  return {
    id:                  session.id,
    schemaVersion:       SCHEMA_VERSION,
    title:               buildActivityTitle(session),
    type:                session.activity_mode || 'casual',
    typeLabel:           meta.label,
    typeEmoji:           meta.emoji,
    status:              session.ended_at ? 'completed' : 'in_progress',
    startedAt:           session.started_at  || null,
    endedAt:             session.ended_at    || null,
    durationSec:         elapsed,
    distanceKm:          dist > 0 ? dist : null,
    averageSpeedKmh:     avgSpeedKmh,
    averagePaceSecPerKm: avgPaceSecPerKm,
    maxSpeedKmh:         maxSpeed,
    elevationGainM:      elevGainM,
    elevationLossM:      elevLossM,
    caloriesEstimate:    calories,
    heartRate:           { available: false, source: 'none', averageBpm: null, maxBpm: null },
    gps: {
      pointsCount: _num(session.point_count) ?? (points ? points.length : null),
      quality:     gpsQual,
      hasPoints:   !!points && points.length > 0
    },
    splits: Array.isArray(session.splits) ? session.splits : [],
    route,
    notes:    safeText(session.notes, ''),
    source:   'trekko-gps',
    weightKg: _num(session.weight_kg),
    tempC:    _num(session.temp_celsius)
  };
}

/* ── CRUD activités ───────────────────────────────────────── */

/** Liste toutes les activités terminées (sans points GPS — rapide). */
export async function getCompletedActivities() {
  try {
    const sessions = await getAllSessions();
    return sessions
      .filter(s => s.ended_at)
      .map(s => normalizeActivity(s))
      .filter(Boolean);
  } catch { return []; }
}

/** Charge une activité complète avec ses points GPS. */
export async function getCompletedActivity(id) {
  try {
    const session = await dbGet(STORES.TRACK_SESSIONS, String(id));
    if (!session) return null;
    const points = await loadTrackPoints(String(id));
    return normalizeActivity(session, points);
  } catch { return null; }
}

/** Supprime une activité et tous ses points GPS. */
export async function deleteCompletedActivity(id) {
  const sid = String(id);
  await dbDelete(STORES.TRACK_SESSIONS, sid);
  try {
    const points = await dbGetByIndex(STORES.TRACK_POINTS, 'session_id', sid);
    for (const pt of points) {
      if (pt.id != null) await dbDelete(STORES.TRACK_POINTS, pt.id);
    }
  } catch { /* suppression points non bloquante */ }
  return true;
}

/** Exporte une activité en fichier GPX. */
export async function exportActivityAsGpx(id) {
  const session = await dbGet(STORES.TRACK_SESSIONS, String(id));
  if (!session) throw new Error('Activité introuvable');
  const points  = await loadTrackPoints(String(id));
  if (!points || points.length === 0) throw new Error('Aucun point GPS pour cette activité');
  exportAsGPX(points, buildActivityTitle(session));
}
