/* =========================================================
   health-tab.js — Tableau de bord santé local Trekko (PWA)
   Données : activités GPS Trekko uniquement. HealthKit indisponible.
   ========================================================= */
import {
  getCompletedActivities,
  formatDuration,
  formatDistanceKm,
  formatActivityDateShort,
} from './activity-store.js';
import {
  getHealthSourceStatus,
  getUnavailableAppleHealthTypes,
  buildPeriodHealthSummary,
  getLatestActivityHealthSummary,
} from './health-data-provider.js';

let _initialized = false;
let _currentPeriod = 'month';
let _activities = [];

/* ── Helper DOM ───────────────────────────────────────────── */
function _mk(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls)  el.className   = cls;
  if (text) el.textContent = text;
  return el;
}

/* ── Init + délégation ────────────────────────────────────── */
export function initHealthTab() {
  if (_initialized) return;
  _initialized = true;

  const root = document.getElementById('health-dashboard-root');
  if (!root) return;

  root.addEventListener('click', e => {
    const periodBtn = e.target.closest('[data-health-period]');
    if (periodBtn) {
      _currentPeriod = periodBtn.dataset.healthPeriod;
      _renderDashboard(_activities);
      return;
    }

    const navBtn = e.target.closest('[data-health-nav]');
    if (navBtn) {
      const section = navBtn.dataset.healthNav;
      document.dispatchEvent(new CustomEvent('trekko:navigate-hiking', { detail: { section } }));
    }
  });
}

export async function refreshHealthTab() {
  _activities = await getCompletedActivities();
  _renderDashboard(_activities);
}

/* ── Rendu principal ───────────────────────────────────────── */
function _renderDashboard(activities) {
  const root = document.getElementById('health-dashboard-root');
  if (!root) return;

  root.innerHTML = '';
  const inner = _mk('div', 'hdash-inner');

  inner.appendChild(_buildSectionStatus());
  inner.appendChild(_buildSectionSummary(activities));
  inner.appendChild(_buildSectionLatest(activities));
  inner.appendChild(_buildSectionNavigation());
  inner.appendChild(_buildSectionAppleHealth());
  inner.appendChild(_buildSectionPrivacy());

  root.appendChild(inner);
}

/* ── Bloc 1 : Statut PWA + sources ───────────────────────── */
function _buildSectionStatus() {
  const wrap = _mk('div', 'hdash-section');
  wrap.appendChild(_mk('div', 'hdash-section-title', 'Tableau de bord santé'));

  const appCard = _mk('div', 'hdash-app-status-card');
  const appIcon = _mk('span', 'hdash-app-status-icon', '📱');
  const appInfo = _mk('div', 'hdash-app-status-info');
  appInfo.appendChild(_mk('div', 'hdash-app-status-name', 'Trekko PWA'));
  appInfo.appendChild(_mk('div', 'hdash-app-status-desc', 'Application web progressive — accès navigateur uniquement, sans pont natif iOS'));
  const appBadge = _mk('span', 'hdash-badge hdash-badge-neutral', 'PWA');
  appCard.appendChild(appIcon);
  appCard.appendChild(appInfo);
  appCard.appendChild(appBadge);
  wrap.appendChild(appCard);

  const sourceTitle = _mk('div', 'hdash-section-subtitle', 'Sources de données');
  wrap.appendChild(sourceTitle);

  const sourceList = _mk('div', 'hdash-source-list');
  for (const src of getHealthSourceStatus()) {
    const card = _mk('div', 'hdash-source-card');
    card.appendChild(_mk('span', 'hdash-src-icon', src.icon));
    const info = _mk('div', 'hdash-src-info');
    info.appendChild(_mk('div', 'hdash-src-name', src.label));
    info.appendChild(_mk('div', 'hdash-src-desc', src.desc));
    card.appendChild(info);
    card.appendChild(_mk('span', `hdash-badge hdash-badge-${src.badgeType}`, src.badge));
    sourceList.appendChild(card);
  }
  wrap.appendChild(sourceList);
  return wrap;
}

/* ── Bloc 2 : Résumé + filtre période ────────────────────── */
function _buildSectionSummary(activities) {
  const wrap = _mk('div', 'hdash-section');
  wrap.appendChild(_mk('div', 'hdash-section-title', 'Résumé de mes activités'));

  const tabs = _mk('div', 'hdash-period-tabs');
  const periods = [
    { key: 'week', label: '7 jours' },
    { key: 'month', label: '30 jours' },
    { key: 'year', label: 'Année' },
    { key: 'all', label: 'Tout' },
  ];
  for (const p of periods) {
    const btn = _mk('button', 'hdash-period-tab', p.label);
    btn.type = 'button';
    btn.dataset.healthPeriod = p.key;
    if (p.key === _currentPeriod) btn.classList.add('active');
    tabs.appendChild(btn);
  }
  wrap.appendChild(tabs);

  const summary = buildPeriodHealthSummary(
    activities,
    _currentPeriod === 'all' ? null : _currentPeriod
  );

  if (summary.count === 0) {
    wrap.appendChild(_mk('div', 'hdash-empty-state', 'Aucune activité enregistrée sur cette période. Lance une randonnée ou une balade pour alimenter ton tableau de bord !'));
    return wrap;
  }

  const grid = _mk('div', 'hdash-summary-grid');
  grid.appendChild(_buildMetricCard('🏃', String(summary.count), 'Activités'));
  grid.appendChild(_buildMetricCard('📏', formatDistanceKm(summary.totalDistanceKm), 'Distance totale'));
  grid.appendChild(_buildMetricCard('⏱️', formatDuration(summary.totalDurationSec), 'Durée totale'));
  grid.appendChild(_buildMetricCard('🔥', summary.totalCalories > 0 ? `${summary.totalCalories} kcal` : '—', 'Calories (MET)'));
  if (summary.avgDistanceKm !== null) {
    grid.appendChild(_buildMetricCard('📈', formatDistanceKm(summary.avgDistanceKm), 'Distance moy.'));
  }
  wrap.appendChild(grid);
  return wrap;
}

/* ── Bloc 3 : Dernière activité ──────────────────────────── */
function _buildSectionLatest(activities) {
  const wrap = _mk('div', 'hdash-section');
  wrap.appendChild(_mk('div', 'hdash-section-title', 'Dernière activité'));

  const latest = getLatestActivityHealthSummary(activities);

  if (!latest) {
    wrap.appendChild(_mk('div', 'hdash-empty-state', 'Aucune activité enregistrée pour le moment.'));
    return wrap;
  }

  const card = _mk('div', 'hdash-latest-card');

  const header = _mk('div', 'hdash-latest-header');
  header.appendChild(_mk('span', 'hdash-latest-emoji', latest.typeEmoji || '🗺️'));
  header.appendChild(_mk('span', 'hdash-latest-title', latest.title));
  header.appendChild(_mk('span', 'hdash-latest-date', formatActivityDateShort(latest.startedAt)));
  card.appendChild(header);

  const metrics = _mk('div', 'hdash-latest-metrics');
  const pairs = [
    ['📏', latest.distanceKm != null  ? formatDistanceKm(latest.distanceKm)  : '—'],
    ['⏱️', formatDuration(latest.durationSec)],
    ['🔥', latest.caloriesEstimate != null ? `${latest.caloriesEstimate} kcal` : '—'],
    ['⛰️', latest.elevationGainM != null ? `+${Math.round(latest.elevationGainM)} m` : '—'],
  ];
  for (const [icon, val] of pairs) {
    const item = _mk('span', 'hdash-latest-metric');
    item.appendChild(_mk('span', 'hdash-latest-metric-icon', icon));
    item.appendChild(_mk('span', 'hdash-latest-metric-val', val));
    metrics.appendChild(item);
  }
  card.appendChild(metrics);

  const btn = _mk('button', 'hdash-action-btn', '📋 Voir le bilan complet');
  btn.type = 'button';
  btn.dataset.healthNav = 'bilan';
  card.appendChild(btn);

  wrap.appendChild(card);
  return wrap;
}

/* ── Bloc 4 : Navigation rapide vers sections randonnée ───── */
function _buildSectionNavigation() {
  const wrap = _mk('div', 'hdash-section');
  wrap.appendChild(_mk('div', 'hdash-section-title', 'Accéder à'));

  const grid = _mk('div', 'hdash-nav-grid');
  const navItems = [
    { section: 'bilan',    icon: '📊', label: 'Dernier bilan' },
    { section: 'courses',  icon: '🏃', label: 'Mes courses' },
    { section: 'parcours', icon: '🗂️', label: 'Parcours hors-ligne' },
  ];
  for (const item of navItems) {
    const btn = _mk('button', 'hdash-nav-card');
    btn.type = 'button';
    btn.dataset.healthNav = item.section;
    btn.appendChild(_mk('span', 'hdash-nav-card-icon', item.icon));
    btn.appendChild(_mk('span', 'hdash-nav-card-label', item.label));
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);
  return wrap;
}

/* ── Bloc 5 : Apple Health — indisponible ────────────────── */
function _buildSectionAppleHealth() {
  const wrap = _mk('div', 'hdash-section');
  wrap.appendChild(_mk('div', 'hdash-section-title', 'Apple Santé — Non disponible en PWA'));

  const card = _mk('div', 'hdash-unavail-card');
  card.appendChild(_mk('p', 'hdash-unavail-desc',
    "Les données suivantes nécessitent un accès natif iOS. Elles sont inaccessibles depuis une PWA. Une version native de Trekko pourrait les débloquer."
  ));

  const list = _mk('ul', 'hdash-unavail-list');
  for (const t of getUnavailableAppleHealthTypes()) {
    const li = _mk('li', 'hdash-unavail-item');
    li.appendChild(_mk('span', 'hdash-unavail-icon', t.icon));
    li.appendChild(_mk('span', 'hdash-unavail-label', t.label));
    li.appendChild(_mk('span', 'hdash-unavail-reason', ` — ${t.reason}`));
    list.appendChild(li);
  }
  card.appendChild(list);
  wrap.appendChild(card);
  return wrap;
}

/* ── Bloc 6 : Confidentialité ────────────────────────────── */
function _buildSectionPrivacy() {
  const wrap = _mk('div', 'hdash-section');
  const card = _mk('div', 'hdash-privacy-card');

  const lock = _mk('span', 'hdash-privacy-icon', '🔒');
  const text = _mk('p', 'hdash-privacy-text',
    'Les parcours, bilans et données de santé restent stockés localement sur cet appareil. Aucune synchronisation automatique vers un serveur ou un NAS n\'est effectuée.'
  );
  card.appendChild(lock);
  card.appendChild(text);
  wrap.appendChild(card);
  return wrap;
}

/* ── Helper : carte métrique ─────────────────────────────── */
function _buildMetricCard(icon, value, label) {
  const card = _mk('div', 'hdash-metric-card');
  card.appendChild(_mk('div', 'hdash-metric-icon', icon));
  card.appendChild(_mk('div', 'hdash-metric-value', value));
  card.appendChild(_mk('div', 'hdash-metric-label', label));
  return card;
}
