/* =========================================================
   BLOC NAVIGATION — IMPORTS
   Délègue la construction des URLs à utils.js (buildWazeLink,
   buildGoogleMapsLink, buildAppleMapsLink).
   ========================================================= */
import { buildWazeLink, buildGoogleMapsLink, buildAppleMapsLink } from './utils.js';

/* =========================================================
   BLOC NAVIGATION — OUVRIR APPLICATION GPS
   Wrappers openWaze / openGoogleMaps / openAppleMaps :
   construisent l'URL et l'ouvrent dans un nouvel onglet.
   ========================================================= */
export function openWaze(lat, lon, name) {
  const url = buildWazeLink(lat, lon, name);
  if (url) window.open(url, '_blank');
}
export function openGoogleMaps(lat, lon, name) {
  const url = buildGoogleMapsLink(lat, lon, name);
  if (url) window.open(url, '_blank');
}
export function openAppleMaps(lat, lon, name) {
  const url = buildAppleMapsLink(lat, lon, name);
  if (url) window.open(url, '_blank');
}

/* =========================================================
   BLOC NAVIGATION — NAVIGATION VERS DESTINATION (navigateTo)
   Dispatch automatique selon la plateforme : Apple Maps sur iOS,
   Google Maps sur Android/desktop. Nécessite site.has_gps.
   ========================================================= */
export function navigateTo(site) {
  if (!site?.has_gps) return;
  // Détecte iOS pour Apple Maps
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) openAppleMaps(site.lat, site.lon, site.destination);
  else openGoogleMaps(site.lat, site.lon, site.destination);
}

/* =========================================================
   BLOC NAVIGATION — RECHERCHE BORNE RECHARGE
   Ouvre une recherche Google Maps centrée sur la position
   courante pour localiser les bornes de recharge électrique.
   ========================================================= */
export function searchChargingStations(lat, lon) {
  const url = `https://www.google.com/maps/search/borne+recharge+electrique/@${lat},${lon},13z`;
  window.open(url, '_blank');
}
