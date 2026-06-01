/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { getMarkersLayer, createSiteIcon, getSiteStatusColor, flyToSite } from './map.js?v=2';
import { formatCurrency, formatDistance, buildWazeLink, buildGoogleMapsLink } from './utils.js';
import { setState } from './state.js';

/* =========================================================
   BLOC 02 — RENDU MARQUEURS SITES
   ========================================================= */
export function renderSiteMarkers(sites, onSiteClick) {
  const layer = getMarkersLayer();
  if (!layer) return;
  layer.clearLayers();

  const withGps = sites.filter(s => s.has_gps);
  withGps.forEach(site => {
    const marker = L.marker([site.lat, site.lon], { icon: createSiteIcon(site) });

    // Tooltip survol — légende rapide
    marker.bindTooltip(buildSiteTooltipHtml(site), {
      direction: 'top',
      offset: [0, -36],
      opacity: 1,
      className: 'site-tooltip'
    });

    // Popup clic — fiche détaillée compacte
    marker.bindPopup(buildSitePopupHtml(site), { maxWidth: 290, className: 'site-popup' });
    marker.on('click', () => {
      setState({ selectedSite: site });
      if (onSiteClick) onSiteClick(site);
    });
    layer.addLayer(marker);
  });

  return withGps.length;
}

/* =========================================================
   BLOC 03 — TOOLTIP SURVOL (légende rapide)
   ========================================================= */
function buildSiteTooltipHtml(site) {
  const dist = site.distance_km != null ? `${site.distance_km} km` : '';
  const color = getSiteStatusColor(site);
  const isFerme  = (site.statut || '').toLowerCase().includes('ferm');
  const isGratuit = site.gratuit || (site.budget_indicatif || '').toLowerCase().includes('gratuit');
  const sansPeage = site.sans_peage || (site.vigilance || '').toLowerCase().includes('sans p');

  const statusLabel = isFerme
    ? '<span style="color:#e74c3c;font-weight:800">🔴 Fermé</span>'
    : isGratuit
      ? '<span style="color:#2ecc71;font-weight:800">🟢 Gratuit</span>'
      : '<span style="color:#f5a623;font-weight:800">🟠 Payant</span>';

  const tags = [
    statusLabel,
    sansPeage ? '<span style="color:#5dade2">Sans péage</span>' : null,
    site.eco_score != null ? `<span style="color:#2ecc71">🌿 ${site.eco_score}/100</span>` : null,
    site.tarif_verifie ? '<span style="color:#7fb3d3">✓ Prix vérifié</span>' : null,
  ].filter(Boolean).join(' · ');

  return `<div style="font-weight:800;font-size:14px;margin-bottom:3px;color:${color}">${site.destination || 'Site'}</div>
    <div style="font-size:12px;color:#a0a0b0;margin-bottom:5px">${site.secteur || ''} ${dist ? '· ' + dist : ''}</div>
    <div style="font-size:12px;line-height:1.6">${tags}</div>
    ${site.budget_indicatif ? `<div style="font-size:11px;color:#888;margin-top:4px;max-width:220px;white-space:normal">${site.budget_indicatif.substring(0,80)}…</div>` : ''}`;
}

/* =========================================================
   BLOC 04 — POPUP HTML (clic)
   ========================================================= */
function buildSitePopupHtml(site) {
  const badges = buildSiteBadges(site);
  const wazeUrl = buildWazeLink(site.lat, site.lon, site.destination);
  const gmapsUrl = buildGoogleMapsLink(site.lat, site.lon, site.destination);

  return `
    <div class="popup-title">${site.destination || site.nom || 'Site'}</div>
    <div style="font-size:12px;color:#aaa;margin:2px 0">${site.secteur || ''} ${site.distance_km ? '· ' + site.distance_km + ' km' : ''}</div>
    <div class="popup-badges">${badges}</div>
    ${site.programme_court ? `<div style="font-size:13px;margin:4px 0;line-height:1.4">${site.programme_court.substring(0,120)}${site.programme_court.length>120?'…':''}</div>` : ''}
    <div class="popup-actions">
      <button class="popup-btn" onclick="window.__openSiteDetail('${site.id}')">📋 Fiche</button>
      ${wazeUrl ? `<a class="popup-btn secondary" href="${wazeUrl}" target="_blank">🚗 Waze</a>` : ''}
      ${gmapsUrl ? `<a class="popup-btn secondary" href="${gmapsUrl}" target="_blank">🗺️ Maps</a>` : ''}
    </div>`;
}

/* =========================================================
   BLOC 05 — BADGES SITE
   ========================================================= */
export function buildSiteBadges(site) {
  const tags = [];
  const budget = (site.budget_indicatif || '').toLowerCase();
  const vigilance = (site.vigilance || '').toLowerCase();

  if (budget.includes('gratu') || site.gratuit) tags.push('<span class="badge badge-gratuit">Gratuit</span>');
  if (budget.includes('faible') || budget.includes('peu')) tags.push('<span class="badge badge-eco">Petit budget</span>');
  if (site.distance_km && site.distance_km < 25) tags.push('<span class="badge badge-proche">Proche</span>');
  if (vigilance.includes('sans péage') || vigilance.includes('sans peage') || site.sans_peage) {
    tags.push('<span class="badge badge-sans-peage">Sans péage</span>');
  }
  if (vigilance.includes('péage') && !vigilance.includes('sans')) {
    tags.push('<span class="badge badge-warning">⚠️ Péage possible</span>');
  }
  if (site.has_gps === false || !site.has_gps) {
    tags.push('<span class="badge badge-gps-missing">📍 GPS à compléter</span>');
  }
  if (site.priorite === 1 || site.priorite === '1' || site.priorite === 'haute') {
    tags.push('<span class="badge badge-priority">⭐ Priorité</span>');
  }
  return tags.join('') || '';
}

/* =========================================================
   BLOC 06 — FOCUS SUR UN SITE
   ========================================================= */
export function focusOnSite(site) {
  if (!site?.has_gps) return;
  flyToSite(site.lat, site.lon, 14);
}
