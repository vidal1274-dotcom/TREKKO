'use strict';
const { openaiGet, getModel } = require('./openaiClient');

async function testConnection() {
  if (!process.env.OPENAI_API_KEY) {
    return { success: false, message: 'Clé API absente côté serveur. Ajoutez OPENAI_API_KEY dans le fichier .env.' };
  }
  try {
    const resp = await openaiGet('/models');
    if (resp.status === 401) return { success: false, message: 'Clé API OpenAI invalide. Vérifiez OPENAI_API_KEY dans .env.' };
    if (!resp.ok) return { success: false, message: `Connexion impossible (HTTP ${resp.status}).` };
    return { success: true, message: 'Connexion ChatGPT / OpenAI validée avec succès.', model: getModel() };
  } catch (e) {
    return { success: false, message: 'Impossible de contacter OpenAI. Vérifiez votre connexion internet.' };
  }
}

module.exports = { testConnection };
