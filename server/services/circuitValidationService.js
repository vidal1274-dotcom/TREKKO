'use strict';

function validateCircuitParams(params) {
  const errors = [];
  if (!params.country?.trim()) errors.push('Pays requis.');
  if (!params.startLocation?.trim()) errors.push('Ville de départ requise.');
  if (!params.durationDays || params.durationDays < 1 || params.durationDays > 30) errors.push('Durée invalide (1-30 jours).');
  if (!params.requestedSites || params.requestedSites < 1 || params.requestedSites > 20) errors.push('Nombre de sites invalide (1-20).');
  if (!params.budget || params.budget < 0) errors.push('Budget invalide.');
  return errors;
}

function buildCircuitPrompt(params) {
  const prefs = Object.entries(params.preferences || {})
    .filter(([, v]) => v).map(([k]) => k).join(', ') || 'aucune';
  return `Tu es un expert en circuits touristiques économiques et réalistes.
Propose un circuit optimisé selon :
- Pays : ${params.country}
- Départ : ${params.startLocation}
- Durée : ${params.durationDays} jour(s)
- Sites : ${params.requestedSites}
- Transport : ${params.transportMode || 'voiture'}
- Budget : ${params.budget}€ pour ${params.peopleCount || 2} personne(s)
- Préférences : ${prefs}
${params.preferences?.avoidTolls ? '- Éviter les péages' : ''}
${params.preferences?.freeParking ? '- Parking gratuit' : ''}
${params.preferences?.lowCost ? '- Lieux gratuits ou peu coûteux' : ''}

RÈGLES :
- Exactement ${params.requestedSites} sites réalistes
- Journées équilibrées et faisables
- Indiquer "à vérifier" si incertain
- Éviter les informations inventées

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "country": "", "startLocation": "", "durationDays": 0, "requestedSites": 0,
  "peopleCount": 0, "transportMode": "", "budget": 0,
  "summary": "Résumé en 2-3 phrases",
  "itinerary": [{
    "day": 1, "title": "", "estimatedDistanceKm": 0,
    "estimatedTravelTime": "", "estimatedCost": 0,
    "sites": [{
      "name": "", "type": "", "description": "", "reason": "",
      "visitDuration": "", "estimatedCost": 0,
      "parkingInfo": "", "parkingCost": 0,
      "coordinates": { "lat": null, "lng": null },
      "positivePoints": [], "negativePoints": [], "tips": [], "sources": [],
      "reliability": "verified|probable|uncertain|to_check", "score": 0
    }]
  }],
  "costs": { "fuelOrElectricity": 0, "tolls": 0, "parking": 0, "entries": 0, "food": 0, "accommodation": 0, "total": 0, "perPerson": 0 },
  "warnings": [], "alternatives": [],
  "offlineSummary": "Résumé compact"
}`;
}

function validateCircuitResponse(circuit) {
  if (!circuit || typeof circuit !== 'object') throw new Error('Réponse IA invalide.');
  if (!circuit.itinerary?.length) throw new Error('Le circuit généré ne contient aucune journée.');
  if (!circuit.startLocation) circuit.startLocation = '?';
  if (!circuit.country) circuit.country = '?';
  return circuit;
}

module.exports = { validateCircuitParams, buildCircuitPrompt, validateCircuitResponse };
