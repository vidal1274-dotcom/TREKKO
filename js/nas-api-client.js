/* =========================================================
   BLOC 01 — CONFIGURATION
   ========================================================= */
import { lsGet } from './storage.js';

function getNasConfig() {
  return { url: lsGet('nas_url') || '', apiKey: lsGet('nas_api_key') || '', timeout: 8000 };
}

function nasHeaders(apiKey) {
  return { 'X-API-Key': apiKey, 'Accept': 'application/json' };
}

/* =========================================================
   BLOC 02 — FETCH AVEC TIMEOUT
   ========================================================= */
async function fetchWithTimeout(url, options, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   BLOC 03 — HEALTH CHECK
   ========================================================= */
export async function checkNasHealth() {
  const { url, apiKey, timeout } = getNasConfig();
  if (!url) return { ok: false, reason: 'NAS URL non configurée' };
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'URL invalide — doit commencer par http:// ou https://' };
  try {
    const resp = await fetchWithTimeout(`${url}/api/health`, { headers: nasHeaders(apiKey) }, timeout);
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, version: data.version, storage: data.storage };
    }
    return { ok: false, reason: `HTTP ${resp.status}` };
  } catch(e) {
    if (e.name === 'AbortError') return { ok: false, reason: 'Timeout — NAS non joignable' };
    return { ok: false, reason: e.message };
  }
}

/* =========================================================
   BLOC 04 — UPLOAD PHOTO
   ========================================================= */
export async function uploadPhotoToNas(photo) {
  const { url, apiKey, timeout } = getNasConfig();
  if (!url) return { ok: false, reason: 'NAS URL non configurée' };

  try {
    const formData = new FormData();
    const blob = new Blob([photo.data], { type: photo.mime_type });
    formData.append('file', blob, photo.filename);
    formData.append('photo_id', photo.id);
    formData.append('lat', photo.lat ?? '');
    formData.append('lon', photo.lon ?? '');
    formData.append('site_id', photo.site_id ?? '');
    formData.append('taken_at', photo.taken_at ?? '');
    formData.append('thumbnail', photo.thumbnail ?? '');

    const resp = await fetchWithTimeout(`${url}/api/photos/upload`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: formData
    }, timeout * 2); // upload = timeout x2

    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, nas_path: data.path };
    }
    return { ok: false, reason: `HTTP ${resp.status}` };
  } catch(e) {
    if (e.name === 'AbortError') return { ok: false, reason: 'Timeout upload' };
    return { ok: false, reason: e.message };
  }
}

/* =========================================================
   BLOC 05 — LISTE PHOTOS NAS
   ========================================================= */
export async function fetchNasPhotoList() {
  const { url, apiKey, timeout } = getNasConfig();
  if (!url) return [];
  try {
    const resp = await fetchWithTimeout(`${url}/api/photos`, { headers: nasHeaders(apiKey) }, timeout);
    if (resp.ok) return await resp.json();
  } catch(e) {}
  return [];
}
