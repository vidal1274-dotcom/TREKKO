'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const aiRoutes = require('./routes/ai.routes');
const circuitRoutes = require('./routes/circuits.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS : autoriser uniquement l'origine frontend Trekko (localhost dev + GitHub Pages)
const ALLOWED_ORIGINS = [
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'https://vidal1274-dotcom.github.io'
];
app.use(cors({ origin: (origin, cb) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
  else cb(new Error('CORS non autorisé'));
}}));
app.use(express.json({ limit: '50kb' }));

app.use('/api/ai', aiRoutes);
app.use('/api/circuits', circuitRoutes);

app.get('/health', (req, res) => res.json({ ok: true, service: 'trekko-backend' }));
app.use(errorHandler);

app.listen(PORT, () => {
  const configured = !!process.env.OPENAI_API_KEY;
  console.log(`✅ Trekko backend démarré sur http://localhost:${PORT}`);
  console.log(`🤖 OpenAI : ${configured ? 'clé configurée' : '⚠️  OPENAI_API_KEY manquante dans .env'}`);
});
