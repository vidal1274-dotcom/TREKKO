'use strict';
const express = require('express');
const router = express.Router();
const { testConnection } = require('../services/openaiConnectionTester');
const { getModel } = require('../services/openaiClient');

// GET /api/ai/status
router.get('/status', (req, res) => {
  const configured = !!process.env.OPENAI_API_KEY;
  res.json({ configured, model: configured ? getModel() : null });
});

// POST /api/ai/test-connection
router.post('/test-connection', async (req, res, next) => {
  try {
    const result = await testConnection();
    res.status(result.success ? 200 : 503).json(result);
  } catch (e) { next(e); }
});

module.exports = router;
