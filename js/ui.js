/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { buildSiteBadges, getSiteStatusColor } from './markers.js';
import { formatDistance, formatCurrency, createElement } from './utils.js';

/* =========================================================
   BLOC 02 — NAVIGATION ONGLETS
   ========================================================= */
export function initNavTabs(onPanelChange) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = tab.dataset.panel;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
      if (onPanelChange) onPanelChange(panelId);
    });
  });
}

export function switchToPanel(panelId) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panelId));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === panelId));
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
  const badges = buildSiteBadges(site);
  const meta   = getSiteTypeMeta(site);
  const statusColor = getSiteStatusColor(site);
  const isFerme  = (site.statut || '').toLowerCase().includes('ferm');
  const isGratuit = site.gratuit || (site.budget_indicatif || '').toLowerCase().includes('gratuit');
  const distStr = site.distance_km != null ? `${site.distance_km} km` : '—';
  let budgetStr = '';
  if (site.budget_min != null) {
    budgetStr = site.budget_min === 0
      ? '<span style="color:#2ecc71;font-weight:800">Gratuit</span>'
      : `Dès ${site.budget_min} €`;
  } else if (site.budget_indicatif) {
    budgetStr = site.budget_indicatif.substring(0, 50);
  }

  const energyStr = site._energy_cost != null
    ? `<span class="site-energy-tag">⚡ ~${site._energy_cost.toFixed(1)} €</span>` : '';

  const ecoStr = site.eco_score != null
    ? `<span class="site-eco-pill">🌿 ${site.eco_score}</span>` : '';

  const fermeBadge = isFerme ? '<span class="badge badge-danger">🔴 Fermé</span>' : '';
  const tarifVerifBadge = site.tarif_verifie ? '<span class="badge badge-info" title="Prix vérifié sur source officielle">✓ Prix vérifié</span>' : '';

  const card = createElement('div', 'site-card', `
    <div class="site-card-icon" style="background:${statusColor}18;border:1.5px solid ${statusColor}40">${meta.emoji}</div>
    <div class="site-card-body">
      <div class="site-card-header">
        <span class="site-name" style="${isFerme ? 'opacity:0.5;text-decoration:line-through' : ''}">${site.destination || site.nom || 'Site'}</span>
        <span class="site-dist-pill">${distStr}</span>
      </div>
      <div class="site-sector">${meta.label}</div>
      <div class="site-badges">${fermeBadge}${badges}${tarifVerifBadge}</div>
      ${site.programme_court ? `<div class="site-summary">${site.programme_court.substring(0, 95)}…</div>` : ''}
      <div class="site-card-footer">
        <span class="site-budget-tag" style="color:${statusColor}">${budgetStr}</span>
        ${energyStr}
        ${ecoStr}
      </div>
    </div>`);
  card.dataset.type = meta.type;
  card.style.setProperty('--card-accent', statusColor);
  if (isFerme) card.style.opacity = '0.65';
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
      <div class="site-sector">${site.secteur || ''} · ${site.distance_km ? site.distance_km + ' km' : '—'}</div>
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
