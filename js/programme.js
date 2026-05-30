/* =========================================================
   PROGRAMME.JS — Sélection de sites, carte, photos
   ========================================================= */
const LS_KEY = 'trekko_programme_v1';
const ORIGIN = { lat: 43.7169, lon: 4.3789 }; // Nages-et-Solorgues

let _sites = [];
let _liste = [];
let _map   = null;
let _routeLayer = null;
let _markers    = [];

/* =========================================================
   EXPORT PRINCIPAL
   ========================================================= */
export function initProgramme(sites) {
  _sites = sites;
  _loadFromStorage();
  _setupSearch();
  _renderListe();
  setTimeout(() => {
    _initMap();
    _updateMapAndPhotos();
  }, 350);
}

export function invalidateProgMap() {
  if (_map) _map.invalidateSize();
}

/* =========================================================
   RECHERCHE
   ========================================================= */
function _setupSearch() {
  const input   = document.getElementById('prog2-input');
  const results = document.getElementById('prog2-results');
  if (!input || !results) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.classList.add('hidden'); return; }

    const found = _sites
      .filter(s => s.destination.toLowerCase().includes(q) && !_liste.find(l => l.id === s.id))
      .slice(0, 10);

    if (!found.length) { results.classList.add('hidden'); return; }

    results.innerHTML = found.map(s => {
      const dist = s.distance_km != null ? ` · ${Math.round(s.distance_km)} km` : '';
      return `<div class="prog2-result-item" data-id="${s.id}">
        <span class="prog2-result-name">${s.destination}</span>
        <span class="prog2-result-meta">${s.secteur || ''}${dist}</span>
      </div>`;
    }).join('');
    results.classList.remove('hidden');

    results.querySelectorAll('.prog2-result-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const site = _sites.find(s => s.id === el.dataset.id);
        if (!site) return;
        _liste.push(site);
        _saveToStorage();
        _renderListe();
        _updateMapAndPhotos();
        input.value = '';
        results.classList.add('hidden');
      });
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.prog2-search-wrap')) results.classList.add('hidden');
  });
}

/* =========================================================
   RENDU LISTE
   ========================================================= */
function _renderListe() {
  const container = document.getElementById('prog2-list');
  if (!container) return;

  if (_liste.length === 0) {
    container.innerHTML = '<div class="prog2-empty">Aucun lieu — utilisez la recherche ci-dessus</div>';
    return;
  }

  container.innerHTML = _liste.map((s, i) => {
    const dur = s.temps_route_min ? ` · ⏱ ${s.temps_route_min} min` : '';
    return `
    <div class="prog2-item">
      <div class="prog2-item-num">${i + 1}</div>
      <div class="prog2-item-info">
        <div class="prog2-item-name">${s.destination}</div>
        <div class="prog2-item-meta">${s.secteur || ''}${s.distance_km != null ? ' · ' + Math.round(s.distance_km) + ' km' : ''}${dur}</div>
      </div>
      <button class="prog2-item-del" data-idx="${i}" title="Retirer">✕</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.prog2-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _liste.splice(parseInt(btn.dataset.idx), 1);
      _saveToStorage();
      _renderListe();
      _updateMapAndPhotos();
    });
  });
}

/* =========================================================
   CARTE LEAFLET
   ========================================================= */
function _initMap() {
  if (_map) return;
  const container = document.getElementById('prog-map');
  if (!container || !window.L) return;

  _map = window.L.map(container, { zoomControl: true, attributionControl: false });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_map);
  _map.setView([ORIGIN.lat, ORIGIN.lon], 11);
}

async function _updateMapAndPhotos() {
  if (!_map) { _initMap(); if (!_map) return; }

  // Nettoyage
  _markers.forEach(m => m.remove());
  _markers = [];
  if (_routeLayer) { _routeLayer.remove(); _routeLayer = null; }

  if (_liste.length === 0) {
    _map.setView([ORIGIN.lat, ORIGIN.lon], 11);
    _renderPhotos();
    return;
  }

  const withGps = _liste.filter(s => s.has_gps && s.lat && s.lon);
  const bounds  = [];

  withGps.forEach((site, i) => {
    const icon = window.L.divIcon({
      html: `<div class="prog-marker-dot">${i + 1}</div>`,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const m = window.L.marker([site.lat, site.lon], { icon })
      .bindPopup(`<b>${i + 1}. ${site.destination}</b>`)
      .addTo(_map);
    _markers.push(m);
    bounds.push([site.lat, site.lon]);
  });

  // Tracé OSRM si ≥ 2 points
  if (withGps.length >= 2) {
    const coords = withGps.map(s => `${s.lon},${s.lat}`).join(';');
    try {
      const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data.routes?.[0]?.geometry) {
        _routeLayer = window.L.geoJSON(data.routes[0].geometry, {
          style: { color: '#e94560', weight: 4, opacity: 0.85 }
        }).addTo(_map);
      }
    } catch {}
  }

  if (bounds.length === 1) {
    _map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    _map.fitBounds(bounds, { padding: [30, 30] });
  }

  setTimeout(() => _map?.invalidateSize(), 80);
  _renderPhotos();
}

/* =========================================================
   PHOTOS
   ========================================================= */
function _renderPhotos() {
  const bar = document.getElementById('prog-photos-bar');
  if (!bar) return;

  if (_liste.length === 0) {
    bar.innerHTML = '<div class="prog-photos-empty">Ajoutez des lieux pour voir leurs photos</div>';
    return;
  }

  bar.innerHTML = _liste.map(s => `
    <div class="prog-photo-card" id="ppc-${s.id}">
      <div class="prog-photo-spin">⏳</div>
      <div class="prog-photo-label">${s.destination}</div>
    </div>`).join('');

  _liste.forEach(site => {
    _fetchSitePhoto(site).then(url => {
      const card = document.getElementById(`ppc-${site.id}`);
      if (!card) return;
      if (url) {
        card.innerHTML = `
          <img src="${url}" alt="${site.destination}" class="prog-photo-img" loading="lazy" />
          <div class="prog-photo-label">${site.destination}</div>`;
      } else {
        card.innerHTML = `
          <div class="prog-photo-placeholder">📷</div>
          <div class="prog-photo-label">${site.destination}</div>`;
      }
    });
  });
}

async function _fetchSitePhoto(site) {
  // 1) Article Wikipédia français — image principale
  try {
    const name = encodeURIComponent(site.destination);
    const res  = await fetch(
      `https://fr.wikipedia.org/w/api.php?action=query&titles=${name}&prop=pageimages&pithumbsize=320&format=json&origin=*`
    );
    const data  = await res.json();
    const pages = Object.values(data.query?.pages || {});
    if (pages[0]?.thumbnail?.source) return pages[0].thumbnail.source;
  } catch {}

  // 2) Géosearch Wikimedia Commons si GPS disponible
  if (site.has_gps && site.lat && site.lon) {
    try {
      const res  = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${site.lat}|${site.lon}&gsradius=800&gslimit=5&format=json&origin=*`
      );
      const data = await res.json();
      for (const hit of (data.query?.geosearch || [])) {
        const res2  = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&pageids=${hit.pageid}&prop=imageinfo&iiprop=url&iiurlwidth=320&format=json&origin=*`
        );
        const data2 = await res2.json();
        const page  = Object.values(data2.query?.pages || {})[0];
        const url   = page?.imageinfo?.[0]?.thumburl;
        if (url) return url;
      }
    } catch {}
  }

  return null;
}

/* =========================================================
   PERSISTANCE
   ========================================================= */
function _saveToStorage() {
  localStorage.setItem(LS_KEY, JSON.stringify(_liste.map(s => s.id)));
}

function _loadFromStorage() {
  try {
    const ids = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    _liste = ids.map(id => _sites.find(s => s.id === id)).filter(Boolean);
  } catch { _liste = []; }
}
