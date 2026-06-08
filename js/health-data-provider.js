/* =========================================================
   health-data-provider.js — Détection de capacités santé + agrégation locale
   PWA pure : HealthKit indisponible. Données = activités GPS locales uniquement.
   ========================================================= */

const _APPLE_HEALTH_UNAVAILABLE = [
  { key: 'heart_rate',   label: 'Fréquence cardiaque',     icon: '❤️',  reason: 'Nécessite un accès HealthKit natif iOS' },
  { key: 'steps',        label: 'Pas quotidiens',           icon: '👟',  reason: "Nécessite l'accès capteur du podomètre iOS" },
  { key: 'sleep',        label: 'Sommeil',                  icon: '😴',  reason: 'Données Apple Watch non accessibles en PWA' },
  { key: 'vo2max',       label: 'VO₂ max',                  icon: '🫁',  reason: 'Calculé par Apple Watch uniquement' },
  { key: 'spo2',         label: 'Oxygène sanguin (SpO₂)',   icon: '🩸',  reason: 'Capteur Apple Watch Ultra inaccessible en PWA' },
  { key: 'calories_hk',  label: 'Calories Apple Santé',     icon: '🔥',  reason: 'Nécessite un accès HealthKit' },
  { key: 'workouts_hk',  label: 'Entraînements HealthKit',  icon: '🏋️', reason: 'Synchronisation Apple Watch indisponible en PWA' },
];

const _AVAILABLE_LOCAL_METRICS = [
  { key: 'distance',    label: 'Distance',        icon: '📏', source: 'GPS Trekko' },
  { key: 'duration',    label: 'Durée',            icon: '⏱️', source: 'Chrono Trekko' },
  { key: 'speed',       label: 'Vitesse / Allure', icon: '💨', source: 'Calcul GPS' },
  { key: 'elevation',   label: 'Dénivelé',         icon: '⛰️', source: 'GPS Trekko' },
  { key: 'calories',    label: 'Calories (MET)',   icon: '🔥', source: 'Méthode MET estimée' },
  { key: 'gps_quality', label: 'Qualité GPS',      icon: '📡', source: 'Précision signal' },
];

/* ── Détection de capacités ───────────────────────────────── */
export function detectHealthDataCapabilities() {
  return {
    appType: 'pwa',
    healthKitAvailable: false,
    appleWatchAvailable: false,
    localGpsAvailable: true,
    geolocationSupported: 'geolocation' in navigator,
    offlineCapable: 'serviceWorker' in navigator,
  };
}

export function getHealthSourceStatus() {
  return [
    {
      id: 'trekko_gps',
      label: 'GPS Trekko',
      icon: '🗺️',
      available: true,
      badge: 'Disponible',
      badgeType: 'success',
      desc: 'Activités enregistrées localement sur cet appareil',
    },
    {
      id: 'apple_health',
      label: 'Apple Santé / HealthKit',
      icon: '❤️',
      available: false,
      badge: 'Indisponible',
      badgeType: 'warning',
      desc: 'Accès natif iOS requis — impossible depuis une PWA',
    },
    {
      id: 'apple_watch',
      label: 'Apple Watch',
      icon: '⌚',
      available: false,
      badge: 'Indisponible',
      badgeType: 'warning',
      desc: 'Données synchronisées avec iPhone, inaccessibles en PWA',
    },
  ];
}

export function getUnavailableAppleHealthTypes() {
  return _APPLE_HEALTH_UNAVAILABLE;
}

export function getAvailableLocalHealthMetrics() {
  return _AVAILABLE_LOCAL_METRICS;
}

export function formatHealthUnavailableReason(typeKey) {
  const found = _APPLE_HEALTH_UNAVAILABLE.find(t => t.key === typeKey);
  return found ? found.reason : 'Non disponible en PWA';
}

/* ── Agrégation locale ────────────────────────────────────── */
export function buildLocalHealthSummary(activities) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return {
      count: 0,
      totalDistanceKm: 0,
      totalDurationSec: 0,
      totalCalories: 0,
      totalElevationGainM: 0,
      avgDistanceKm: null,
      avgDurationSec: null,
      longestActivityId: null,
      mostRecentActivity: null,
    };
  }

  let totalDistanceKm   = 0;
  let totalDurationSec  = 0;
  let totalCalories     = 0;
  let totalElevGainM    = 0;
  let longest           = null;
  let mostRecent        = activities[0];

  for (const a of activities) {
    if (typeof a.distanceKm      === 'number') totalDistanceKm  += a.distanceKm;
    if (typeof a.durationSec     === 'number') totalDurationSec += a.durationSec;
    if (typeof a.caloriesEstimate === 'number') totalCalories    += a.caloriesEstimate;
    if (typeof a.elevationGainM  === 'number') totalElevGainM   += a.elevationGainM;
    if (!longest || (a.distanceKm ?? 0) > (longest.distanceKm ?? 0)) longest = a;
    if (a.startedAt && mostRecent.startedAt && a.startedAt > mostRecent.startedAt) mostRecent = a;
  }

  const count = activities.length;
  return {
    count,
    totalDistanceKm:    Math.round(totalDistanceKm  * 100) / 100,
    totalDurationSec:   Math.round(totalDurationSec),
    totalCalories:      Math.round(totalCalories),
    totalElevationGainM: Math.round(totalElevGainM),
    avgDistanceKm:  count > 1 ? Math.round(totalDistanceKm  / count * 100) / 100 : null,
    avgDurationSec: count > 1 ? Math.round(totalDurationSec / count)              : null,
    longestActivityId: longest?.id ?? null,
    mostRecentActivity: mostRecent ?? null,
  };
}

export function buildPeriodHealthSummary(activities, period) {
  if (!Array.isArray(activities)) return buildLocalHealthSummary([]);
  let cutoff = null;
  const now = new Date();
  if (period === 'week')  { cutoff = new Date(now); cutoff.setDate(now.getDate()     -  7); }
  if (period === 'month') { cutoff = new Date(now); cutoff.setMonth(now.getMonth()   -  1); }
  if (period === 'year')  { cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1); }
  const filtered = cutoff
    ? activities.filter(a => a.startedAt && new Date(a.startedAt) >= cutoff)
    : activities;
  return buildLocalHealthSummary(filtered);
}

export function getLatestActivityHealthSummary(activities) {
  if (!Array.isArray(activities) || activities.length === 0) return null;
  return [...activities]
    .filter(a => a.startedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
}

export function mergeLocalActivityHealthData(activity) {
  if (!activity) return null;
  return {
    ...activity,
    heartRate: { available: false, source: 'none', averageBpm: null, maxBpm: null },
    steps:     { available: false, source: 'none' },
    spo2:      { available: false, source: 'none' },
    sleep:     { available: false, source: 'none' },
  };
}
