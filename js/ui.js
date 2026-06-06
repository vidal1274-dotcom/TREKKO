/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { getSiteStatusColor } from './map.js?v=4';
import { formatDistance, formatCurrency, createElement } from './utils.js';

/* =========================================================
   BLOC 02 — NAVIGATION ONGLETS
   ========================================================= */
function _applyPanel(panelId) {
  document.querySelectorAll('.nav-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.panel === panelId)
  );
  document.querySelectorAll('.panel').forEach(p => {
    const on = p.id === panelId;
    p.classList.toggle('active', on);
    p.style.display = on ? 'flex' : 'none'; // force inline — court-circuite tout CSS
    p.style.flexDirection = on ? 'column' : '';
  });
}

export function initNavTabs(onPanelChange) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _applyPanel(tab.dataset.panel);
      if (onPanelChange) onPanelChange(tab.dataset.panel);
    });
  });
}

export function switchToPanel(panelId) {
  _applyPanel(panelId);
}

/* =========================================================
   BLOC 03 — RENDU LISTE SITES
   ========================================================= */
export function renderSitesList(sites, vehicleProfile, onSiteClick) {
  const container = document.getElementById('sites-list');
  const stats = document.getElementById('list-stats');
  if (!container) return;

  if (stats) stats.textContent = `${sites.length} site${sites.length > 1 ? 's' : ''} affiché${sites.length > 1 ? 's' : ''}`;

  if (sites.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗺️</div><div class="empty-state-text">Aucun site trouvé</div><div class="empty-state-sub">Modifiez les filtres ou la recherche</div></div>`;
    return;
  }

  container.innerHTML = '';
  sites.forEach(site => {
    const card = buildSiteCard(site, vehicleProfile);
    card.addEventListener('click', () => { if (onSiteClick) onSiteClick(site); });
    container.appendChild(card);
  });
}

const TYPE_META = {
  mer:         { emoji: '🏖️', type: 'mer',        label: 'Mer / Plage'   },
  plage:       { emoji: '🏖️', type: 'mer',        label: 'Mer / Plage'   },
  nature:      { emoji: '🌿', type: 'nature',     label: 'Nature'        },
  rando:       { emoji: '🥾', type: 'nature',     label: 'Randonnée'     },
  gorge:       { emoji: '🏔️', type: 'nature',     label: 'Nature'        },
  canyon:      { emoji: '🏔️', type: 'nature',     label: 'Nature'        },
  grotte:      { emoji: '🪨', type: 'grotte',     label: 'Grotte / Cave' },
  cave:        { emoji: '🍷', type: 'grotte',     label: 'Cave à vin'    },
  patrimoine:  { emoji: '🏛️', type: 'patrimoine', label: 'Patrimoine'    },
  château:     { emoji: '🏰', type: 'patrimoine', label: 'Château'       },
  village:     { emoji: '🏘️', type: 'patrimoine', label: 'Village'       },
  marché:      { emoji: '🛒', type: 'marche',     label: 'Marché'        },
  balade:      { emoji: '🚶', type: 'balade',     label: 'Balade'        },
  rivière:     { emoji: '💧', type: 'balade',     label: 'Rivière'       },
  forêt:       { emoji: '🌲', type: 'nature',     label: 'Forêt'         },
};

function getSiteTypeMeta(site) {
  const raw = ((site.type_sortie || '') + ' ' + (site.secteur || '')).toLowerCase();
  for (const [key, meta] of Object.entries(TYPE_META)) {
    if (raw.includes(key)) return meta;
  }
  return { emoji: '📍', type: 'default', label: site.secteur || '' };
}

function buildSiteCard(site, vehicleProfile) {
  const meta        = getSiteTypeMeta(site);
  const statusColor = getSiteStatusColor(site);
  const isFerme     = (site.statut || '').toLowerCase().includes('ferm');
  const vigil       = (site.vigilance || '').toLowerCase();
  const budgetTxt   = (site.budget_indicatif || '').toLowerCase();

  // Badge budget
  let budgetBadge = '';
  if (site.budget_min === 0 || site.gratuit || budgetTxt.includes('gratuit')) {
    budgetBadge = '<span class="sc-badge sc-green">Gratuit</span>';
  } else if (site.budget_min != null && site.budget_min > 0) {
    budgetBadge = `<span class="sc-badge sc-orange">Dès ${site.budget_min}€</span>`;
  } else if (site.budget_indicatif) {
    budgetBadge = `<span class="sc-badge sc-dim">${site.budget_indicatif.substring(0, 28)}</span>`;
  }

  // Badges info
  const info = [];
  if (isFerme) info.push('<span class="sc-badge sc-red">Fermé</span>');
  if (vigil.includes('sans p') || site.sans_peage)
    info.push('<span class="sc-badge sc-blue">Sans péage</span>');
  if (site.distance_km != null && site.distance_km < 25)
    info.push('<span class="sc-badge sc-dim">Proche</span>');
  if (site.priorite == 1 || site.selection_perso)
    info.push('<span class="sc-badge sc-yellow">⭐</span>');

  const summary = site.programme_court
    ? `<div class="sc-summary">${site.programme_court.substring(0, 88)}…</div>`
    : '';

  const card = createElement('div', 'site-card', `
    <div class="sc-body">
      <div class="sc-top">
        <span class="sc-name${isFerme ? ' sc-closed' : ''}">${site.destination || site.nom || 'Site'}</span>
      </div>
      <div class="sc-meta">
        <span class="sc-type">${meta.emoji}&nbsp;${meta.label || site.secteur || ''}</span>
        ${budgetBadge}${info.join('')}
      </div>
      ${summary}
    </div>`);

  card.dataset.type = meta.type;
  card.style.setProperty('--card-accent', statusColor);
  if (isFerme) card.classList.add('sc-card-closed');
  return card;
}

/* =========================================================
   BLOC 04 — RENDU PANNEAU ÉCONOMIE
   ========================================================= */
export function renderEconomyPanel(sites) {
  const container = document.getElementById('economy-list');
  if (!container) return;
  if (!sites.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">Aucun bon plan trouvé</div></div>';
    return;
  }
  container.innerHTML = '';
  sites.slice(0, 30).forEach(site => {
    const notes = (site.eco_notes || []).slice(0, 3).map(n => `<span class="badge badge-eco">${n}</span>`).join('');
    const card = createElement('div', 'site-card', `
      <div class="site-card-header">
        <span class="site-name">${site.destination || site.nom}</span>
        <span class="eco-score">🟢 ${site.eco_score || 0}/100</span>
      </div>
      <div class="site-sector">${site.secteur || ''}</div>
      <div class="site-badges">${notes}</div>
      ${site.budget_indicatif ? `<div class="site-summary">${site.budget_indicatif.substring(0,80)}</div>` : ''}
    `);
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => { if (window.__openSiteDetail) window.__openSiteDetail(site.id); });
    container.appendChild(card);
  });
}

/* =========================================================
   BLOC 05 — LOADING STATE
   ========================================================= */
export function showLoading(containerId, message = 'Chargement…') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="loading-spinner"><div class="spinner"></div>${message}</div>`;
}
