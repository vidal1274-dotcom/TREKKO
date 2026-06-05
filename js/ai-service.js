/* =========================================================
   BLOC IA — SERVICE OPENAI (via backend sécurisé)
   Le frontend ne contacte PLUS api.openai.com directement.
   Tous les appels passent par le backend local (localhost:3001).
   La clé API n'est JAMAIS stockée dans le navigateur.
   ========================================================= */

// URL du backend Trekko — configurable si le port change
const BACKEND_URL = 'http://localhost:3001';

let _cachedStatus = null;

/* =========================================================
   BLOC IA — STATUT (lecture seule depuis le backend)
   ========================================================= */
/**
 * Vérifie si le backend IA est joignable et si la clé est configurée.
 * @returns {Promise<{configured:boolean, model:string|null, reachable:boolean}>}
 */
export async function getAiStatus() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/ai/status`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return { configured: false, model: null, reachable: true };
    _cachedStatus = await resp.json();
    return { ..._cachedStatus, reachable: true };
  } catch {
    return { configured: false, model: null, reachable: false };
  }
}

export function getCachedStatus() { return _cachedStatus; }

/* =========================================================
   BLOC IA — TEST DE CONNEXION
   ========================================================= */
export async function testConnection() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/ai/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const data = await resp.json();
    return data;
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { success: false, message: 'Impossible de contacter le backend IA. Vérifiez que le serveur est démarré.' };
    }
    return { success: false, message: 'Impossible de contacter le backend IA. Est-il démarré sur le port 3001 ?' };
  }
}

/* =========================================================
   BLOC IA — GÉNÉRATION DE CIRCUIT
   ========================================================= */
/**
 * Envoie les paramètres du circuit au backend qui appelle OpenAI.
 * @param {object} params
 * @returns {Promise<object>} circuit JSON
 */
export async function generateCircuit(params) {
  let resp;
  try {
    resp = await fetch(`${BACKEND_URL}/api/circuits/generate-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(60000)  // 60s max pour la génération IA
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('La génération a pris trop de temps. Réessayez ou choisissez un modèle plus rapide.');
    }
    throw new Error('Impossible de contacter le backend IA. Vérifiez que le serveur est démarré (port 3001).');
  }

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = data?.message || data?.errors?.join(', ') || `Erreur backend (${resp.status})`;
    throw new Error(msg);
  }
  if (!data?.circuit) throw new Error('Réponse backend invalide — circuit absent.');
  return data.circuit;
}

/* =========================================================
   BLOC IA — UTILITAIRES (rétrocompat)
   ========================================================= */
// Ces fonctions existaient dans l'ancienne version.
// Elles sont conservées avec des valeurs neutres pour ne pas casser l'existant.
export function hasApiKey() { return false; }
export function getMaskedKey() { return '— clé côté serveur —'; }
export function saveApiKey() { /* no-op : clé gérée côté serveur */ }
export function deleteApiKey() { /* no-op */ }
export function getModel() { return _cachedStatus?.model || 'gpt-4o-mini'; }
export function saveModel() { /* no-op : modèle géré côté serveur */ }
export function getConnectionStatus() { return _cachedStatus || { connected: false, model: null }; }
