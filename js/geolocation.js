/* =========================================================
   BLOC 01 — LOCALISATION GPS UTILISATEUR
   ========================================================= */
import { UCHAUD_COORDS } from './config.js';
import { lsGet, lsSet, lsDel } from './storage.js';

const LS_KEY_ORIGIN   = 'user_origin_coords';
const LS_KEY_LABEL    = 'user_origin_label';
const LS_KEY_MAX_KM   = 'user_max_distance_km';

export const ORIGIN_DEFAULT = { lat: UCHAUD_COORDS[0], lon: UCHAUD_COORDS[1], label: 'Nages' };

export function getStoredOrigin() {
  const saved = lsGet(LS_KEY_ORIGIN);
  if (!saved) return { ...ORIGIN_DEFAULT };
  try {
    const { lat, lon } = JSON.parse(saved);
    const label = lsGet(LS_KEY_LABEL) || 'Ma position';
    return { lat, lon, label };
  } catch (_) {
    return { ...ORIGIN_DEFAULT };
  }
}

export function saveOrigin(lat, lon, label = 'Ma position') {
  lsSet(LS_KEY_ORIGIN, JSON.stringify({ lat, lon }));
  lsSet(LS_KEY_LABEL, label);
}

export function clearUserLocation() {
  lsDel(LS_KEY_ORIGIN);
  lsDel(LS_KEY_LABEL);
}

export function getStoredMaxKm() {
  const v = lsGet(LS_KEY_MAX_KM);
  return v ? parseInt(v, 10) : 100;
}

export function saveMaxKm(km) {
  lsSet(LS_KEY_MAX_KM, String(km));
}

/* =========================================================
   BLOC 02 — DEMANDE DE GÉOLOCALISATION
   ========================================================= */
export function requestUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation non supportée par ce navigateur'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy  // en mètres
      }),
      err => {
        const messages = {
          1: 'Permission refusée — autorisez la localisation dans les réglages.',
          2: 'Position indisponible — vérifiez le GPS.',
          3: 'Délai dépassé — réessayez.'
        };
        reject(new Error(messages[err.code] || 'Erreur géolocalisation'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function isUsingGps() {
  return lsGet(LS_KEY_ORIGIN) !== null;
}

/* =========================================================
   BLOC 03 — SUIVI CONTINU DE POSITION (watchPosition)
   ========================================================= */
let _watchId = null;

export function startWatchingPosition(onUpdate) {
  if (!navigator.geolocation || _watchId !== null) return;
  _watchId = navigator.geolocation.watchPosition(
    pos => onUpdate({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    }),
    () => { /* refus ou indisponible — silencieux */ },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
  );
}

export function stopWatchingPosition() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}
