/* =========================================================
   BLOC 01 — RÈGLES ET RÉFÉRENCES ÉNERGIE
   ========================================================= */
// Valeurs indicatives — toujours afficher "à vérifier"
export const ENERGY_DEFAULTS = {
  ESSENCE_CONSO_L100: 6.5,
  DIESEL_CONSO_L100: 5.8,
  HYBRID_CONSO_L100: 4.8,
  EV_CONSO_KWH100_MIN: 14,
  EV_CONSO_KWH100_MID: 17,
  EV_CONSO_KWH100_MAX: 22,
  CHARGING_LOSS_FACTOR: 1.10,  // 10% de pertes
  SAFETY_MARGIN: 1.10           // 10% de marge
};

// Valeurs de référence (indicatives uniquement — sources publiques à vérifier)
export const ENERGY_REFERENCE_VALUES = {
  essence_price_ref: { value: null, note: 'Prix réel à vérifier sur prix-carburants.gouv.fr', source: 'Officiel', verified: false },
  diesel_price_ref: { value: null, note: 'Prix réel à vérifier sur prix-carburants.gouv.fr', source: 'Officiel', verified: false },
  home_kwh_ref: { value: null, note: 'Tarif réel selon votre contrat EDF ou fournisseur', source: 'Fournisseur', verified: false },
  public_kwh_ref: { value: null, note: 'Varie selon réseau, puissance et abonnement', source: 'Opérateur', verified: false },
  last_verified_at: null
};

/* =========================================================
   BLOC 02 — LIENS DE VÉRIFICATION
   ========================================================= */
export function buildVerificationLinks(profile) {
  const links = [
    { label: '⛽ Prix carburant essence France', url: 'https://www.prix-carburants.gouv.fr/', icon: '⛽' },
    { label: '⛽ Prix carburant diesel France', url: 'https://www.prix-carburants.gouv.fr/', icon: '⛽' },
    { label: '⚡ Prix kWh domicile (comparateur)', url: 'https://www.comparateur-electricite-gaz.fr/', icon: '⚡' },
    { label: '⚡ Prix recharge borne publique', url: 'https://www.chargemap.com/', icon: '⚡' },
    { label: '⚡ Réseau bornes Ionity / Fastned', url: 'https://ionity.eu/fr/charging-network', icon: '⚡' },
    { label: '📊 Consommation VE comparatif', url: 'https://ev-database.org/', icon: '📊' },
    { label: '🔍 Coût trajet voiture électrique', url: `https://www.google.com/search?q=co%C3%BBt+trajet+voiture+%C3%A9lectrique+kWh+calcul`, icon: '🔍' },
    { label: '🔍 Heures creuses recharge', url: `https://www.google.com/search?q=heures+creuses+recharge+voiture+%C3%A9lectrique+prix`, icon: '🔍' },
    { label: '📋 Tarifs péage A9 Nîmes', url: 'https://www.sanef.com/tarifs/', icon: '📋' }
  ];
  return links;
}

/* =========================================================
   BLOC 03 — FORMULES DE BASE
   ========================================================= */
export function calcFuelLiters(distanceKm, consumptionL100) {
  return (distanceKm * consumptionL100) / 100;
}

export function calcEnergyKwh(distanceKm, consumptionKwh100) {
  return (distanceKm * consumptionKwh100) / 100;
}

export function applyChargingLoss(kwh, lossPercent) {
  return kwh * (1 + lossPercent / 100);
}

export function applyMargin(cost, marginPercent) {
  return cost * (1 + marginPercent / 100);
}

/* =========================================================
   BLOC 04 — TEXTES AVERTISSEMENT
   ========================================================= */
export const ENERGY_DISCLAIMERS = {
  general: '⚠️ Valeurs indicatives. Ajustez selon votre véhicule et les prix réels.',
  fuel: '⚠️ Prix carburant à vérifier sur prix-carburants.gouv.fr avant la sortie.',
  kwh_home: '⚠️ Prix kWh domicile selon votre contrat et votre fournisseur.',
  kwh_public: '⚠️ Prix borne variable selon réseau, puissance et abonnement.',
  mixed: '⚠️ Calcul basé sur la répartition domicile/borne renseignée.',
  unknown_price: '⚠️ Prix non renseigné — configurez votre véhicule pour un calcul réaliste.',
  comparison: '⚠️ Comparaison indicative. Vérifiez les prix avant chaque sortie.'
};
