/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { onNetworkChange, getNetworkStatus } from './network-manager.js';
import { getNetworkLabel, getNetworkColor } from './sync-policy.js';

/* =========================================================
   BLOC 02 — INIT
   ========================================================= */
export function initNetworkUI() {
  onNetworkChange(status => updateNetworkBanner(status));
  updateNetworkBanner(getNetworkStatus());

  const btn = document.getElementById('btn-network-status');
  if (btn) btn.addEventListener('click', () => {
    const banner = document.getElementById('network-banner');
    if (banner) banner.classList.toggle('hidden');
  });
}

function updateNetworkBanner(status) {
  const banner = document.getElementById('network-banner');
  const btn    = document.getElementById('btn-network-status');
  if (!banner) return;

  if (status === 'offline') {
    banner.textContent = getNetworkLabel(status);
    banner.className   = `network-banner ${getNetworkColor(status)}`;
    if (btn) btn.style.color = '#e74c3c';
  } else if (['weak_2g', 'medium_3g'].includes(status)) {
    banner.textContent = getNetworkLabel(status);
    banner.className   = `network-banner ${getNetworkColor(status)}`;
    if (btn) btn.style.color = '#f39c12';
    setTimeout(() => banner.classList.add('hidden'), 4000);
  } else {
    // Bonne connexion — bannière invisible, juste l'icône header
    banner.classList.add('hidden');
    if (btn) btn.style.color = '';
  }
}
