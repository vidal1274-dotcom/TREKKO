'use strict';
const express = require('express');
const router = express.Router();
const { openaiChat, getModel } = require('../services/openaiClient');
const { validateCircuitParams, buildCircuitPrompt, validateCircuitResponse } = require('../services/circuitValidationService');

// POST /api/circuits/generate-ai
router.post('/generate-ai', async (req, res, next) => {
  try {
    const params = req.body;
    const errors = validateCircuitParams(params);
    if (errors.length) return res.status(400).json({ success: false, errors });

    const prompt = buildCircuitPrompt(params);
    const messages = [
      { role: 'system', content: 'Tu es un expert en circuits touristiques. Réponds UNIQUEMENT en JSON valide.' },
      { role: 'user', content: prompt }
    ];

    const circuit = await openaiChat(messages);
    const validated = validateCircuitResponse(circuit);
    validated._model = getModel();
    validated._generatedAt = new Date().toISOString();

    res.json({ success: true, circuit: validated });
  } catch (e) { next(e); }
});

module.exports = router;
