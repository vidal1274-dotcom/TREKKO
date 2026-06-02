/* =========================================================
   BLOC 01 — GÉOMÉTRIE / DISTANCES
   ========================================================= */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function formatDistance(km) {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
}

/* =========================================================
   BLOC 02 — FORMATAGE MONÉTAIRE / TEMPS
   ========================================================= */
export function formatCurrency(val, suffix = '€') {
  if (val == null || isNaN(val)) return '—';
  return `${val.toFixed(2)} ${suffix}`;
}

export function formatMinutes(minutes) {
  if (!minutes || isNaN(minutes)) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2,'0')}`;
}

export function parseMinutes(str) {
  if (!str) return null;
  if (typeof str === 'number') return str;
  const hMatch = str.match(/(\d+)\s*h/i);
  const mMatch = str.match(/(\d+)\s*m/i);
  let total = 0;
  if (hMatch) total += parseInt(hMatch[1]) * 60;
  if (mMatch) total += parseInt(mMatch[1]);
  if (!hMatch && !mMatch) {
    const num = parseInt(str);
    if (!isNaN(num)) total = num;
  }
  return total || null;
}

/* =========================================================
   BLOC 03 — TEXTE ET SLUGS
   ========================================================= */
export function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeSearchText(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function generateId(prefix = 'site') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}

/* =========================================================
   BLOC 04 — DÉTECTION MOTS-CLÉS ÉCONOMIE
   ========================================================= */
export function detectEconomyKeywords(text) {
  if (!text) return {};
  const t = normalizeSearchText(text);
  return {
    isGratuit: /gratu/i.test(t),
    isSansPeage: /sans.?peage|peage|eviter.?peage/i.test(t),
    isProche: /proche|court|moins.?\d+.?km|pres/i.test(t),
    isBonPlan: /bon.?plan|eco|pas.?cher|econom|budget|moins.?cher/i.test(t),
    isParkingGratuit: /parking.?gratu|stationn.?gratu/i.test(t),
    isPicNic: /pique.?nique|pique nique|picnic/i.test(t),
    isElectrique: /electrique|elec|ev|kwh|recharge/i.test(t),
    isThermique: /essence|diesel|carburant|thermique/i.test(t),
    isBorne: /borne|charging/i.test(t),
    maxEuroMatch: t.match(/moins.?de.?(\d+).?euro/)?.[1],
    maxKmMatch: t.match(/moins.?de.?(\d+).?km/)?.[1]
  };
}

/* =========================================================
   BLOC 05 — DOM HELPERS
   ========================================================= */
export function el(selector) { return document.querySelector(selector); }
export function els(selector) { return [...document.querySelectorAll(selector)]; }

export function createElement(tag, className, html) {
  const elem = document.createElement(tag);
  if (className) elem.className = className;
  if (html) elem.innerHTML = html;
  return elem;
}

export function showToast(message, type = 'info', duration = 3000) {
  const container = el('#toast-container');
  if (!container) return;
  const toast = createElement('div', `toast ${type}`, message);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/* =========================================================
   BLOC 06 — LIENS GPS
   ========================================================= */
export function buildWazeLink(lat, lon, name) {
  if (!lat || !lon) return null;
  return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes&zoom=17`;
}
export function buildGoogleMapsLink(lat, lon, name) {
  if (!lat || !lon) return null;
  const q = name ? encodeURIComponent(name) : `${lat},${lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${lat},${lon}`;
}
export function buildAppleMapsLink(lat, lon, name) {
  if (!lat || !lon) return null;
  return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
}

/* =========================================================
   BLOC 07 — VALIDATION
   ========================================================= */
export function isValidCoord(lat, lon) {
  return (
    lat != null && lon != null &&
    !isNaN(lat) && !isNaN(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/* =========================================================
   BLOC 08 — SÉCURITÉ HTML
   ========================================================= */
/** Échappe les caractères HTML pour éviter l'injection via innerHTML. */
export function escapeHTML(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Valide lat/lon avant génération de liens maps. */
export function isValidLatLon(lat, lon) {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    isFinite(lat) && isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

/** Autorise uniquement les URLs https ou les schémas connus. */
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') return url;
    return null;
  } catch (_) {
    return null;
  }
}
