/* =========================================================
   BLOC IA — SERVICE OPENAI
   Gestion de la clé API, test de connexion et appels GPT.

   ARCHITECTURE : appels directs depuis le navigateur avec
   la clé personnelle de l'utilisateur (outil personnel).
   La clé est stockée en base64 dans localStorage et n'est
   jamais envoyée à un tiers autre qu'OpenAI.
   ========================================================= */

const LS_KEY    = 'trekko_oai_key';
const LS_MODEL  = 'trekko_oai_model';
const LS_STATUS = 'trekko_oai_status';
const OPENAI_BASE = 'https://api.openai.com/v1';

/* =========================================================
   BLOC IA — GESTION CLÉ API (localStorage obfusqué)
   ========================================================= */
function _enc(v) { return btoa(unescape(encodeURIComponent(v))); }
function _dec(v) {
  try { return decodeURIComponent(escape(atob(v))); } catch { return null; }
}

export function saveApiKey(key) {
  if (!key || typeof key !== 'string') return;
  localStorage.setItem(LS_KEY, _enc(key.trim()));
}

export function getApiKey() {
  const s = localStorage.getItem(LS_KEY);
  return s ? _dec(s) : null;
}

export function deleteApiKey() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_STATUS);
}

export function hasApiKey() { return !!getApiKey(); }

export function getMaskedKey() {
  const k = getApiKey();
  if (!k || k.length < 10) return '—';
  return `${k.slice(0, 7)}...${k.slice(-4)}`;
}

export function saveModel(model) {
  if (model) localStorage.setItem(LS_MODEL, model);
}
export function getModel() {
  return localStorage.getItem(LS_MODEL) || 'gpt-4o-mini';
}

function _saveStatus(success, model) {
  localStorage.setItem(LS_STATUS, JSON.stringify({
    connected: success, model, checkedAt: new Date().toISOString()
  }));
}

export function getConnectionStatus() {
  const s = localStorage.getItem(LS_STATUS);
  if (!s) return { connected: false, model: null, checkedAt: null };
  try { return JSON.parse(s); } catch { return { connected: false }; }
}

/* =========================================================
   BLOC IA — TEST DE CONNEXION
   ========================================================= */
export async function testConnection() {
  const key = getApiKey();
  if (!key) {
    return { success: false, message: 'La clé API est absente ou invalide.' };
  }
  try {
    const resp = await fetch(`${OPENAI_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (resp.status === 401) {
      _saveStatus(false, null);
      return { success: false, message: 'Clé API invalide. Vérifiez votre clé OpenAI.' };
    }
    if (!resp.ok) {
      _saveStatus(false, null);
      return { success: false, message: `Erreur OpenAI (${resp.status}). Réessayez.` };
    }
    const model = getModel();
    _saveStatus(true, model);
    return { success: true, message: 'Connexion ChatGPT validée avec succès.', model };
  } catch (e) {
    _saveStatus(false, null);
    return { success: false, message: 'Impossible de contacter OpenAI. Vérifiez votre connexion internet.' };
  }
}

/* =========================================================
   BLOC IA — GÉNÉRATION DE CIRCUIT
   ========================================================= */
/**
 * Appelle OpenAI avec le prompt circuit et retourne un objet JSON structuré.
 * @param {string} prompt — prompt complet construit par circuit-creator.js
 * @returns {Promise<object>} circuit JSON
 */
export async function callOpenAI(prompt) {
  const key = getApiKey();
  if (!key) throw new Error('Clé API OpenAI non configurée. Ajoutez votre clé dans Paramètres > IA.');

  const model = getModel();
  const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Tu es un assistant expert en circuits touristiques. Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000
    })
  });

  if (resp.status === 401) throw new Error('Clé API invalide. Vérifiez vos paramètres IA.');
  if (resp.status === 429) throw new Error('Quota OpenAI dépassé. Réessayez dans quelques minutes.');
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur OpenAI (${resp.status})`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Réponse OpenAI vide ou invalide.');

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Le circuit généré n\'est pas dans un format JSON valide.');
  }
}
