/* =========================================================
   BLOC 01 — INITIALISATION CARTE LEAFLET
   ========================================================= */
let _map = null;
let _markersLayer = null;
let _photoMarkersLayer = null;
let _userLocationMarker = null;
let _radiusCircle = null;
let _trackPolyline = null;
let _trackMarkers = [];
let _streetLayer = null;
let _satelliteLayer = null;
let _isSatellite = false;

export function initMap(containerId = 'map') {
  if (_map) return _map;
  _map = L.map(containerId, {
    center: [43.7437, 4.4096],
    zoom: 10,
    zoomControl: true,
    attributionControl: true
  });
  _streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(_map);
  _satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri, USGS, NOAA',
    maxZoom: 18
  });
  _markersLayer = L.layerGroup().addTo(_map);
  _photoMarkersLayer = L.layerGroup().addTo(_map);
  return _map;
}

export function getMap() { return _map; }
export function getMarkersLayer() { return _markersLayer; }
export function getPhotoMarkersLayer() { return _photoMarkersLayer; }
export function invalidateMapSize() { if (_map) _map.invalidateSize(); }

/* =========================================================
   BLOC 02 — NAVIGATION CARTE
   ========================================================= */
export function flyToSite(lat, lon, zoom = 14) {
  if (!_map || !lat || !lon) return;
  _map.flyTo([lat, lon], zoom, { duration: 0.8 });
}

export function fitBoundsToSites(sites) {
  if (!_map) return;
  const validSites = sites.filter(s => s.has_gps);
  if (validSites.length === 0) return;
  const bounds = validSites.map(s => [s.lat, s.lon]);
  _map.fitBounds(bounds, { padding: [30, 30] });
}

export function toggleMapLayer() {
  if (!_map) return _isSatellite;
  if (_isSatellite) {
    _map.removeLayer(_satelliteLayer);
    _streetLayer.addTo(_map);
  } else {
    _map.removeLayer(_streetLayer);
    _satelliteLayer.addTo(_map);
  }
  _isSatellite = !_isSatellite;
  return _isSatellite;
}
export function isSatelliteMode() { return _isSatellite; }

/* =========================================================
   BLOC 03 — LAYER MANAGEMENT
   ========================================================= */
export function clearMarkers() {
  if (_markersLayer) _markersLayer.clearLayers();
}
export function clearPhotoMarkers() {
  if (_photoMarkersLayer) _photoMarkersLayer.clearLayers();
}

/* =========================================================
   BLOC 04 — ICÔNES PERSONNALISÉES
   ========================================================= */
export function getSiteStatusColor(site) {
  const statut = (site.statut || '').toLowerCase();
  const budget = (site.budget_indicatif || '').toLowerCase();
  if (statut === 'fermé' || statut.includes('ferm')) return '#e74c3c';
  if (site.gratuit || budget.includes('gratuit')) return '#27ae60';
  return '#f5a623';
}

export function createSiteIcon(site) {
  const color = getSiteStatusColor(site);
  const emoji = getSiteEmoji(site);
  return L.divIcon({
    html: `<div style="background:${color};border-radius:50% 50% 50% 0;width:32px;height:32px;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:14px;">${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
    className: ''
  });
}

function getSiteEmoji(site) {
  const type = (site.type_sortie || site.secteur || '').toLowerCase();
  if (/mer|plage|rivière|canyon|gorge/.test(type)) return '🏖️';
  if (/montagne|rando|nature/.test(type)) return '🥾';
  if (/musée|château|patrimoine|village/.test(type)) return '🏛️';
  if (/marché/.test(type)) return '🛒';
  if (/grotte|cave/.test(type)) return '🪨';
  if (/balade|promenade/.test(type)) return '🚶';
  return '📍';
}

/* =========================================================
   BLOC 05 — POSITION UTILISATEUR
   ========================================================= */
export function showUserLocationMarker(lat, lon, label = 'Ma position', radiusKm = null) {
  if (!_map) return;
  if (_userLocationMarker) { _map.removeLayer(_userLocationMarker); _userLocationMarker = null; }
  if (_radiusCircle) { _map.removeLayer(_radiusCircle); _radiusCircle = null; }

  const icon = L.divIcon({
    html: `<div style="background:#3498db;border-radius:50%;width:18px;height:18px;border:3px solid #fff;box-shadow:0 0 0 3px rgba(52,152,219,0.4);"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -12], className: ''
  });
  _userLocationMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
    .bindPopup(`<strong>📍 ${label}</strong>`)
    .addTo(_map);

  if (radiusKm && radiusKm < 150) {
    _radiusCircle = L.circle([lat, lon], {
      radius: radiusKm * 1000,
      color: '#3498db', fillColor: '#3498db',
      fillOpacity: 0.06, weight: 2, dashArray: '6 4'
    }).addTo(_map);
  }
}

export function clearUserLocationMarker() {
  if (_userLocationMarker) { _map.removeLayer(_userLocationMarker); _userLocationMarker = null; }
  if (_radiusCircle) { _map.removeLayer(_radiusCircle); _radiusCircle = null; }
}

/* =========================================================
   BLOC 06 — TRACÉ GPS (recording)
   ========================================================= */
export function renderTrack(points) {
  if (!_map) return;
  clearTrack();
  if (!points || points.length === 0) return;

  const sorted = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const latlngs = sorted.map(p => [p.lat, p.lon]);

  _trackPolyline = L.polyline(latlngs, {
    color: '#e94560',
    weight: 4,
    opacity: 0.85,
    dashArray: null,
    lineJoin: 'round'
  }).addTo(_map);

  sorted.forEach((p, i) => {
    const isFirst = i === 0;
    const isLast = i === sorted.length - 1;
    if (!isFirst && !isLast) return;
    const icon = L.divIcon({
      html: `<div style="background:${isFirst ? '#27ae60' : '#e94560'};border-radius:50%;width:14px;height:14px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7], className: ''
    });
    const marker = L.marker([p.lat, p.lon], { icon })
      .bindPopup(`<strong>${isFirst ? '🟢 Départ' : '🔴 Fin'}</strong><br>${new Date(p.recorded_at).toLocaleString('fr-FR')}`)
      .addTo(_map);
    _trackMarkers.push(marker);
  });

  if (latlngs.length > 1) _map.fitBounds(_trackPolyline.getBounds(), { padding: [30, 30] });
}

export function clearTrack() {
  if (_trackPolyline) { _map.removeLayer(_trackPolyline); _trackPolyline = null; }
  _trackMarkers.forEach(m => _map.removeLayer(m));
  _trackMarkers = [];
}

export function addTrackPoint(lat, lon) {
  if (!_trackPolyline) {
    _trackPolyline = L.polyline([[lat, lon]], { color: '#e94560', weight: 4, opacity: 0.85, lineJoin: 'round' }).addTo(_map);
  } else {
    _trackPolyline.addLatLng([lat, lon]);
  }
}

export function createPhotoIcon() {
  return L.divIcon({
    html: `<div style="background:#e94560;border-radius:4px;width:28px;height:28px;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:16px;">📷</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16], className: ''
  });
}
