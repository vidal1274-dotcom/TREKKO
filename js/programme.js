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
   RECHERCHE — helpers
   ========================================================= */

// Normalise une chaîne : minuscules + suppression accents
function _norm(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Emoji selon le type de site
const _TYPE_EMOJI = {
  mer:'🏖️', plage:'🏖️', nature:'🌿', rando:'🥾',
  gorge:'🏔️', canyon:'🏔️', grotte:'🪨', cave:'🍷',
  patrimoine:'🏛️', chateau:'🏰', village:'🏘️',
  marche:'🛒', marché:'🛒', balade:'🚶', riviere:'💧', foret:'🌲',
};
function _emoji(site) {
  const raw = _norm((site.type_sortie || '') + ' ' + (site.secteur || ''));
  for (const [k, e] of Object.entries(_TYPE_EMOJI)) { if (raw.includes(k)) return e; }
  return '📍';
}

// Score de pertinence : -1 = hors résultat, >0 = meilleur = plus haut
function _score(site, words) {
  const nameN = _norm(site.destination);
  const allN  = [nameN, _norm(site.secteur), _norm(site.type_sortie),
                 _norm(site.points_forts), _norm(site.programme_court)].join(' ');
  let sc = 0;
  for (const w of words) {
    if (!allN.includes(w)) return -1;        // mot absent → écarté
    if (nameN === w)              sc += 10;  // nom exact
    else if (nameN.startsWith(w)) sc += 6;  // début du nom
    else if (nameN.includes(w))   sc += 4;  // dans le nom
    else                          sc += 1;  // dans un autre champ
  }
  return sc;
}

// Met en gras les mots trouvés dans le texte d'origine
function _hl(text, words) {
  let out = text;
  for (const w of words) {
    out = out.replace(
      new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
      '<b>$1</b>'
    );
  }
  return out;
}

/* =========================================================
   RECHERCHE — setup
   ========================================================= */
function _setupSearch() {
  const input   = document.getElementById('prog2-input');
  const results = document.getElementById('prog2-results');
  if (!input || !results) return;

  let _focusIdx = -1;

  function _addSite(id) {
    const site = _sites.find(s => s.id === id);
    if (!site || _liste.find(l => l.id === id)) return;
    _liste.push(site);
    _saveToStorage();
    _renderListe();
    _updateMapAndPhotos();
    input.value = '';
    results.classList.add('hidden');
    _focusIdx = -1;
  }

  function _renderResults(words) {
    const inList = new Set(_liste.map(l => l.id));
    const scored = _sites
      .filter(s => !inList.has(s.id))
      .map(s => ({ s, sc: _score(s, words) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 12);

    if (!scored.length) { results.classList.add('hidden'); return; }

    results.innerHTML = scored.map(({ s }) => {
      const isFerme  = (s.statut || '').toLowerCase().includes('ferm');
      const budgetTxt = (s.budget_indicatif || '').toLowerCase();
      const isGratuit = s.budget_min === 0 || s.gratuit || budgetTxt.includes('gratuit');
      const isStar    = s.priorite == 1 || s.selection_perso;

      const badges = [
        isFerme  ? `<span class="p2r-badge p2r-red">Fermé</span>` : '',
        isGratuit ? `<span class="p2r-badge p2r-green">Gratuit</span>` : '',
        isStar    ? `<span class="p2r-badge p2r-star">⭐</span>` : '',
        s.sans_peage ? `<span class="p2r-badge p2r-blue">Sans péage</span>` : '',
      ].join('');

      const dist  = s.distance_km != null ? `${Math.round(s.distance_km)} km` : '';
      const meta  = [s.secteur, dist].filter(Boolean).join(' · ');

      return `<div class="prog2-result-item" data-id="${s.id}" tabindex="-1">
        <span class="p2r-emoji">${_emoji(s)}</span>
        <div class="p2r-body">
          <div class="p2r-name">${_hl(s.destination, words)}</div>
          <div class="p2r-meta">${meta}${badges}</div>
        </div>
      </div>`;
    }).join('');
    results.classList.remove('hidden');
    _focusIdx = -1;

    results.querySelectorAll('.prog2-result-item').forEach(el => {
      el.addEventListener('mousedown', e => { e.preventDefault(); _addSite(el.dataset.id); });
    });
  }

  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (raw.length < 1) { results.classList.add('hidden'); return; }
    const words = _norm(raw).split(/\s+/).filter(Boolean);
    _renderResults(words);
  });

  // Navigation clavier ↑ ↓ Entrée Échap
  input.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.prog2-result-item')];
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _focusIdx = Math.min(_focusIdx + 1, items.length - 1);
      items[_focusIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _focusIdx = Math.max(_focusIdx - 1, -1);
      if (_focusIdx === -1) input.focus(); else items[_focusIdx]?.focus();
    } else if (e.key === 'Escape') {
      results.classList.add('hidden');
    } else if (e.key === 'Enter' && _focusIdx >= 0) {
      e.preventDefault();
      _addSite(items[_focusIdx]?.dataset.id);
    }
  });

  results.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.prog2-result-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _focusIdx = Math.min(_focusIdx + 1, items.length - 1);
      items[_focusIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _focusIdx = Math.max(_focusIdx - 1, -1);
      if (_focusIdx === -1) input.focus(); else items[_focusIdx]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const focused = results.querySelector('.prog2-result-item:focus');
      if (focused) _addSite(focused.dataset.id);
    } else if (e.key === 'Escape') {
      results.classList.add('hidden'); input.focus();
    }
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

  // Marqueurs avec miniature photo
  withGps.forEach((site, i) => {
    const mid  = `pmk-${site.id}`;
    const icon = window.L.divIcon({
      html: `<div class="prog-pm" id="${mid}">
               <div class="prog-pm-num">${i + 1}</div>
             </div>`,
      className: '',
      iconSize:  [46, 46],
      iconAnchor:[23, 23]
    });
    const m = window.L.marker([site.lat, site.lon], { icon })
      .bindPopup(`<b>${i + 1}. ${site.destination}</b>`)
      .addTo(_map);
    _markers.push(m);
    bounds.push([site.lat, site.lon]);

    // Charge la photo et l'injecte dans le marqueur
    _fetchSitePhoto(site).then(url => {
      const el = document.getElementById(mid);
      if (!el || !url) return;
      el.style.backgroundImage = `url('${url}')`;
      el.classList.add('prog-pm-photo');
    });
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
