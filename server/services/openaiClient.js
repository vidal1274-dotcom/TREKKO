'use strict';
const fetch = require('node-fetch');

const OPENAI_BASE = 'https://api.openai.com/v1';

function getKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('OPENAI_API_KEY manquante dans .env'), { status: 503 });
  return key;
}

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

async function openaiGet(path) {
  const key = getKey();
  const resp = await fetch(`${OPENAI_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  return resp;
}

async function openaiChat(messages, opts = {}) {
  const key = getKey();
  const model = opts.model || getModel();
  const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: opts.temperature || 0.7,
      max_tokens: opts.maxTokens || 4000
    })
  });
  if (resp.status === 401) throw Object.assign(new Error('Clé API OpenAI invalide.'), { status: 401 });
  if (resp.status === 429) throw Object.assign(new Error('Quota OpenAI dépassé.'), { status: 429 });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || `Erreur OpenAI (${resp.status})`), { status: 502 });
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Réponse OpenAI vide.');
  return JSON.parse(content);
}

module.exports = { openaiGet, openaiChat, getModel };
