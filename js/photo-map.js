/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { getPhotoMarkersLayer, createPhotoIcon } from './map.js?v=2';
import { loadAllPhotos } from './photos.js';

/* =========================================================
   BLOC 02 — AFFICHAGE PHOTOS SUR CARTE
   ========================================================= */
export async function renderPhotoMarkers(onPhotoClick) {
  const layer = getPhotoMarkersLayer();
  if (!layer) return;
  layer.clearLayers();

  const photos = await loadAllPhotos();
  const withGps = photos.filter(p => p.lat && p.lon);

  withGps.forEach(photo => {
    const marker = L.marker([photo.lat, photo.lon], { icon: createPhotoIcon() });
    if (onPhotoClick) marker.on('click', () => onPhotoClick(photo));
    layer.addLayer(marker);
  });

  return withGps.length;
}

/* =========================================================
   BLOC 03 — POPUP PHOTO
   ========================================================= */
function buildPhotoPopupHtml(photo) {
  const thumb = photo.thumbnail
    ? `<img src="${photo.thumbnail}" style="width:100%;border-radius:6px;margin-bottom:6px" />`
    : '';
  const site = photo.site_name ? `<div style="font-size:12px;color:#aaa">📍 ${photo.site_name}</div>` : '';
  const syncBadge = photo.sync_status === 'synced'
    ? '<span style="color:#27ae60;font-size:11px">✅ Synchronisé NAS</span>'
    : '<span style="color:#f39c12;font-size:11px">⏳ En attente sync</span>';
  const date = photo.taken_at ? new Date(photo.taken_at).toLocaleDateString('fr-FR') : '';
  return `<div>${thumb}${site}<div style="font-size:12px;margin:4px 0">${photo.filename}<br>${date}</div>${syncBadge}</div>`;
}

/* =========================================================
   BLOC 04 — CLEAR
   ========================================================= */
export function clearPhotoMarkers() {
  const layer = getPhotoMarkersLayer();
  if (layer) layer.clearLayers();
}
