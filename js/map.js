/* =========================================================
   BLOC 01 — INITIALISATION CARTE LEAFLET
   ========================================================= */
let _map = null;
let _markersLayer = null;
let _photoMarkersLayer = null;
let _userLocationMarker = null;
let _accuracyCircle = null;
let _radiusCircle = null;
let _trackPolyline = null;
let _trackMarkers = [];
let _streetLayer = null;
let _satelliteLayer = null;
let _satelliteLabelsLayer = null;
let _isSatellite = false;

/** Garde centralisée — toutes les fonctions de carte l'utilisent. */
export function isMapReady() {
  return !!_map && typeof _map.addLayer === 'function';
}

export function initMap(containerId = 'map') {
  if (_map) return _map;
  _map = L.map(containerId, {
    center: [43.7437, 4.4096],
    zoom: 10,
    zoomControl: true,
    attributionControl: true,
    maxZoom: 20
  });
  _streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    maxNativeZoom: 19
  }).addTo(_map);
  const labelsPane = _map.createPane('labelsPane');
  labelsPane.style.zIndex = 450; // au-dessus des tuiles (400) mais sous les marqueurs (600)
  labelsPane.style.pointerEvents = 'none'; // ne bloque pas les clics
  const retina = L.Browser.retina;
  _satelliteLayer = L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    {
      attribution: '© IGN Géoportail',
      maxZoom: 20, maxNativeZoom: 19,
      tileSize: retina ? 512 : 256,
      zoomOffset: retina ? -1 : 0
    }
  );
  // Voyager Only Labels : labels plus grands, halo blanc solide, meilleure hiérarchie visuelle
  _satelliteLabelsLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    { attribution: '© CartoDB', subdomains: 'abcd', maxZoom: 20, maxNativeZoom: 19, detectRetina: true, opacity: 1.0, pane: 'labelsPane' }
  );
  // Restaurer le mode lisibilité renforcée si mémorisé
  try {
    if (localStorage.getItem('trekko_hybrid_labels_enhanced') === '1') labelsPane.classList.add('labels-enhanced');
  } catch { /* silencieux */ }
  _markersLayer = L.layerGroup().addTo(_map);
  _photoMarkersLayer = L.layerGroup().addTo(_map);
  return _map;
}

export function getMap()              { return _map; }
export function getMarkersLayer()     { return _markersLayer; }
export function getPhotoMarkersLayer(){ return _photoMarkersLayer; }
export function invalidateMapSize()   { if (isMapReady()) _map.invalidateSize(); }

/* =========================================================
   BLOC 02 — NAVIGATION CARTE
   ========================================================= */
export function flyToSite(lat, lon, zoom = 14) {
  if (!isMapReady() || !lat || !lon) return;
  _map.flyTo([lat, lon], zoom, { duration: 0.8 });
}

export function fitBoundsToSites(sites) {
  if (!isMapReady()) return;
  const validSites = sites.filter(s => s.has_gps);
  if (validSites.length === 0) return;
  const bounds = validSites.map(s => [s.lat, s.lon]);
  _map.fitBounds(bounds, { padding: [30, 30] });
}

export function toggleMapLayer() {
  if (!isMapReady()) return _isSatellite;
  if (_isSatellite) {
    if (_map.hasLayer(_satelliteLayer))      _map.removeLayer(_satelliteLayer);
    if (_map.hasLayer(_satelliteLabelsLayer)) _map.removeLayer(_satelliteLabelsLayer);
    if (!_map.hasLayer(_streetLayer))        _streetLayer.addTo(_map);
  } else {
    if (_map.hasLayer(_streetLayer))         _map.removeLayer(_streetLayer);
    if (!_map.hasLayer(_satelliteLayer))     _satelliteLayer.addTo(_map);
    if (!_map.hasLayer(_satelliteLabelsLayer)) _satelliteLabelsLayer.addTo(_map);
  }
  _isSatellite = !_isSatellite;
  return _isSatellite;
}
export function isSatelliteMode() { return _isSatellite; }

export function toggleHybridLabelsEnhanced() {
  if (!isMapReady()) return false;
  const pane = _map.getPane('labelsPane');
  if (!pane) return false;
  const enhanced = pane.classList.toggle('labels-enhanced');
  try { localStorage.setItem('trekko_hybrid_labels_enhanced', enhanced ? '1' : '0'); } catch { /* silencieux */ }
  return enhanced;
}

export function isHybridLabelsEnhanced() {
  if (!isMapReady()) return localStorage.getItem('trekko_hybrid_labels_enhanced') === '1';
  return !!_map.getPane('labelsPane')?.classList.contains('labels-enhanced');
}

/* =========================================================
   BLOC 03 — LAYER MANAGEMENT
   ========================================================= */
export function clearMarkers() {
  if (_markersLayer) _markersLayer.clearLayers();
}
export function clearPhotoMarkers() {
  if (_photoMarkersLayer) _photoMarkersLayer.clearLayers();
}

export function hidePoiLayers() {
  if (!isMapReady()) return;
  if (_markersLayer      && _map.hasLayer(_markersLayer))      _map.removeLayer(_markersLayer);
  if (_photoMarkersLayer && _map.hasLayer(_photoMarkersLayer)) _map.removeLayer(_photoMarkersLayer);
}

export function showPoiLayers() {
  if (!isMapReady()) return;
  if (_markersLayer      && !_map.hasLayer(_markersLayer))      _markersLayer.addTo(_map);
  if (_photoMarkersLayer && !_map.hasLayer(_photoMarkersLayer)) _photoMarkersLayer.addTo(_map);
}

export function centerMap(lat, lon, zoom = 13) {
  if (!isMapReady()) return;
  _map.setView([lat, lon], zoom, { animate: false });
}

let _hikingTrailsLayer = null;

export function clearHikingTrails() {
  if (_hikingTrailsLayer) {
    if (isMapReady() && _map.hasLayer(_hikingTrailsLayer)) _map.removeLayer(_hikingTrailsLayer);
    _hikingTrailsLayer = null;
  }
}

export function drawHikingTrails(ways, nodes) {
  if (!isMapReady()) return;
  clearHikingTrails();
  _hikingTrailsLayer = L.layerGroup();
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = [n.lat, n.lon]; });
  ways.forEach(way => {
    const coords = (way.nodes || []).map(nid => nodeMap[nid]).filter(Boolean);
    if (coords.length < 2) return;
    const hw = way.tags?.highway || '';
    L.polyline(coords, {
      color: '#27ae60',
      weight: hw === 'path' ? 2.5 : 3.5,
      opacity: 0.85,
      dashArray: hw === 'path' ? '6 4' : null
    }).bindPopup(way.tags?.name ? `<b>🥾 ${way.tags.name}</b>` : '🥾 Sentier').addTo(_hikingTrailsLayer);
  });
  _hikingTrailsLayer.addTo(_map);
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
export function showUserLocationMarker(lat, lon, label = 'Ma position', radiusKm = null, accuracyMeters = null) {
  if (!isMapReady()) return;
  if (_userLocationMarker) { _map.removeLayer(_userLocationMarker); _userLocationMarker = null; }
  if (_accuracyCircle)     { _map.removeLayer(_accuracyCircle);     _accuracyCircle = null; }
  if (_radiusCircle)       { _map.removeLayer(_radiusCircle);       _radiusCircle = null; }

  if (accuracyMeters && accuracyMeters > 0 && accuracyMeters < 5000) {
    _accuracyCircle = L.circle([lat, lon], {
      radius: accuracyMeters,
      color: '#4285F4', fillColor: '#4285F4',
      fillOpacity: 0.15, weight: 1.5, opacity: 0.5
    }).addTo(_map);
  }

  const icon = L.divIcon({
    html: `<div style="background:#4285F4;border-radius:50%;width:18px;height:18px;border:3px solid #fff;box-shadow:0 0 0 4px rgba(66,133,244,0.35);"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -12], className: ''
  });
  const accuracyLabel = accuracyMeters ? ` <span style="color:#888;font-size:11px">(±${Math.round(accuracyMeters)} m)</span>` : '';
  _userLocationMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
    .bindPopup(`<strong>📍 ${label}</strong>${accuracyLabel}`)
    .addTo(_map);

  if (radiusKm && radiusKm < 150) {
    _radiusCircle = L.circle([lat, lon], {
      radius: radiusKm * 1000,
      color: '#4285F4', fillColor: '#4285F4',
      fillOpacity: 0.05, weight: 2, dashArray: '6 4'
    }).addTo(_map);
  }
}

export function clearUserLocationMarker() {
  if (!isMapReady()) return;
  if (_userLocationMarker) { _map.removeLayer(_userLocationMarker); _userLocationMarker = null; }
  if (_accuracyCircle)     { _map.removeLayer(_accuracyCircle);     _accuracyCircle = null; }
  if (_radiusCircle)       { _map.removeLayer(_radiusCircle);       _radiusCircle = null; }
}

let _addressMarker = null;
export function showAddressMarker(lat, lon, label) {
  if (!isMapReady()) return;
  if (_addressMarker) { _map.removeLayer(_addressMarker); _addressMarker = null; }
  const icon = L.divIcon({
    html: `<div style="background:#e94560;border-radius:50% 50% 50% 0;width:28px;height:28px;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(233,69,96,0.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>`,
    iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -32], className: ''
  });
  _addressMarker = L.marker([lat, lon], { icon, zIndexOffset: 2000 })
    .bindPopup(`<strong>📍 ${label}</strong>`)
    .addTo(_map)
    .openPopup();
}
export function clearAddressMarker() {
  if (!isMapReady()) return;
  if (_addressMarker) { _map.removeLayer(_addressMarker); _addressMarker = null; }
}

/* =========================================================
   BLOC 06 — TRACÉ GPS (recording)
   ========================================================= */
export function renderTrack(points) {
  if (!isMapReady()) return;
  clearTrack();
  if (!points || points.length === 0) return;

  const sorted = [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const latlngs = sorted.map(p => [p.lat, p.lon]);

  _trackPolyline = L.polyline(latlngs, {
    color: '#e94560', weight: 4, opacity: 0.85, lineJoin: 'round'
  }).addTo(_map);

  sorted.forEach((p, i) => {
    if (i !== 0 && i !== sorted.length - 1) return;
    const isFirst = i === 0;
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
  if (!isMapReady()) return;
  if (_trackPolyline) { _map.removeLayer(_trackPolyline); _trackPolyline = null; }
  _trackMarkers.forEach(m => _map.removeLayer(m));
  _trackMarkers = [];
}

export function addTrackPoint(lat, lon) {
  if (!isMapReady()) return;
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

/* =========================================================
   BLOC 07 — TRACÉ PROGRAMME JOURNÉE
   ========================================================= */
let _dayPlanPolyline = null;
let _dayPlanMarkers  = [];

export function renderDayPlanRoute(orderedSites) {
  clearDayPlanRoute();
  if (!isMapReady() || !orderedSites || !orderedSites.length) return;

  const latlngs = orderedSites.filter(s => s.has_gps && s.lat && s.lon).map(s => [s.lat, s.lon]);
  if (latlngs.length < 2) return;

  _dayPlanPolyline = L.polyline(latlngs, {
    color: '#f5a623', weight: 4, opacity: 0.85, dashArray: '10 6', lineJoin: 'round'
  }).addTo(_map);

  orderedSites.filter(s => s.has_gps && s.lat && s.lon).forEach((site, i) => {
    const color = i === 0 ? '#27ae60' : i === orderedSites.length - 1 ? '#e94560' : '#f5a623';
    const icon = L.divIcon({
      html: `<div style="background:${color};color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)">${i + 1}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13], className: ''
    });
    const m = L.marker([site.lat, site.lon], { icon })
      .bindPopup(`<strong>${i + 1}. ${site.destination}</strong>`)
      .addTo(_map);
    _dayPlanMarkers.push(m);
  });

  _map.fitBounds(_dayPlanPolyline.getBounds(), { padding: [40, 40] });
}

export function clearDayPlanRoute() {
  if (!isMapReady()) return;
  if (_dayPlanPolyline) { _map.removeLayer(_dayPlanPolyline); _dayPlanPolyline = null; }
  _dayPlanMarkers.forEach(m => _map.removeLayer(m));
  _dayPlanMarkers = [];
}
