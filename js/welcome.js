/* =========================================================
   BLOC 01 — ÉCRAN D'ACCUEIL (splash)
   ========================================================= */
const LS_KEY_LAST_MODE = 'trekko_last_mode';

const MODES = [
  {
    id:    'running',
    emoji: '🏃',
    title: 'Running',
    desc:  'Vitesse · Allure · Splits · Calories',
    color: '#e94560',
    panel: 'panel-map',
    trackMode: 'running'
  },
  {
    id:    'hiking',
    emoji: '🥾',
    title: 'Randonnée',
    desc:  'Tracé GPS · Dénivelé · Itinéraires',
    color: '#27ae60',
    panel: 'panel-map',
    trackMode: 'hiking'
  },
  {
    id:    'walking',
    emoji: '🚶',
    title: 'Balade',
    desc:  'Promenade légère · Découverte',
    color: '#5dade2',
    panel: 'panel-map',
    trackMode: 'walking'
  },
  {
    id:    'car',
    emoji: '🚗',
    title: 'Sortie en voiture',
    desc:  'Sites touristiques · Coût trajet · Péage',
    color: '#f5a623',
    panel: 'panel-list',
    trackMode: 'casual'
  },
  {
    id:    'map',
    emoji: '🗺️',
    title: 'Explorer la carte',
    desc:  'Tous les sites · Filtres · Distance',
    color: '#9b59b6',
    panel: 'panel-map',
    trackMode: null
  },
  {
    id:    'deals',
    emoji: '💰',
    title: 'Bons plans',
    desc:  'Gratuit · Sans péage · Éco-score',
    color: '#2ecc71',
    panel: 'panel-economy',
    trackMode: null
  },
  {
    id:    'photos',
    emoji: '📷',
    title: 'Mes photos',
    desc:  'Galerie géolocalisée · Sync NAS',
    color: '#e94560',
    panel: 'panel-photos',
    trackMode: null
  },
];

/* =========================================================
   BLOC 02 — RENDER + AFFICHAGE
   ========================================================= */
export function initWelcomeScreen(onModeSelect) {
  const el = document.getElementById('welcome-screen');
  if (!el) return;

  const grid = el.querySelector('.welcome-grid');
  if (grid) {
    grid.innerHTML = MODES.map(m => `
      <button class="welcome-card" data-mode="${m.id}" style="--wcard-color:${m.color}">
        <span class="wcard-emoji">${m.emoji}</span>
        <span class="wcard-title">${m.title}</span>
        <span class="wcard-desc">${m.desc}</span>
      </button>`).join('');

    grid.querySelectorAll('.welcome-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = MODES.find(m => m.id === btn.dataset.mode);
        if (!mode) return;
        localStorage.setItem(LS_KEY_LAST_MODE, mode.id);
        hideWelcomeScreen();
        if (onModeSelect) onModeSelect(mode);
      });
    });
  }

  // Bouton "Passer"
  document.getElementById('btn-welcome-skip')?.addEventListener('click', () => {
    hideWelcomeScreen();
    if (onModeSelect) onModeSelect(MODES.find(m => m.id === 'map'));
  });

  // Bouton retour accueil (header)
  document.getElementById('btn-welcome-home')?.addEventListener('click', showWelcomeScreen);

  // (showWelcomeScreen est appelé depuis app.js après init)
}

export function showWelcomeScreen() {
  const el = document.getElementById('welcome-screen');
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('welcome-animate-in');
    setTimeout(() => el.classList.remove('welcome-animate-in'), 400);
  }
}

export function hideWelcomeScreen() {
  const el = document.getElementById('welcome-screen');
  if (el) {
    el.classList.add('welcome-animate-out');
    setTimeout(() => {
      el.classList.remove('welcome-animate-out');
      el.classList.add('hidden');
    }, 280);
  }
}

export function getModes() { return MODES; }

export function getLastMode() {
  const id = localStorage.getItem(LS_KEY_LAST_MODE);
  return id ? MODES.find(m => m.id === id) || null : null;
}
