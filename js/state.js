/* =========================================================
   BLOC 01 — ÉTAT GLOBAL
   ========================================================= */
const _state = {
  sites: [],                  // tableau de tous les sites chargés
  filteredSites: [],          // sites après filtres
  selectedSite: null,         // site actuellement sélectionné
  currentFilter: 'all',       // filtre actif
  currentPanel: 'panel-map',  // panneau affiché
  searchQuery: '',            // texte de recherche actif
  vehicleProfile: null,       // profil véhicule chargé
  networkStatus: 'unknown',   // statut réseau
  nasStatus: 'unknown',       // statut NAS
  photos: [],                 // photos locales
  pendingSyncCount: 0,        // photos en attente de sync
  isLoading: false,
  lastSyncAt: null,
  economyFilter: 'all'
};

const _listeners = {};

/* =========================================================
   BLOC 02 — FONCTIONS STATE
   ========================================================= */
export function getState() { return { ..._state }; }

export function setState(updates) {
  const changed = [];
  for (const key of Object.keys(updates)) {
    if (_state[key] !== updates[key]) {
      _state[key] = updates[key];
      changed.push(key);
    }
  }
  changed.forEach(key => emit(key, _state[key]));
}

export function on(event, fn) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  if (_listeners[event]) {
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  }
}

function emit(event, data) {
  (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) { console.error('[state] listener error', e); } });
}

export function getSites() { return _state.sites; }
export function getFilteredSites() { return _state.filteredSites; }
export function getSelectedSite() { return _state.selectedSite; }
export function getVehicleProfile() { return _state.vehicleProfile; }
export function getNetworkStatus() { return _state.networkStatus; }
