/* =========================================================
   BLOC 01 — IMPORTS
   ========================================================= */
import { calcFuelLiters, calcEnergyKwh, applyChargingLoss, applyMargin, ENERGY_DISCLAIMERS } from './energy-rules.js';
import { formatCurrency, formatDistance } from './utils.js';
import { UCHAUD_COORDS } from './config.js';
import { haversineDistance } from './utils.js';

/* =========================================================
   BLOC 02 — CALCUL THERMIQUE
   ========================================================= */
export function estimateThermalTripEnergy(distanceKm, profile) {
  if (!distanceKm || distanceKm <= 0) return null;
  const roundTrip = distanceKm * 2;
  const consumption = profile.thermal_consumption_l_100 || 6.5;
  const liters = calcFuelLiters(roundTrip, consumption);
  const pricePerLiter = profile.fuel_price_per_liter;
  const margin = profile.safety_margin_percent || 10;

  const baseCost = pricePerLiter != null ? liters * pricePerLiter : null;
  const costWithMargin = baseCost != null ? applyMargin(baseCost, margin) : null;

  return {
    type: 'thermal',
    fuel_type: profile.fuel_type || 'essence',
    distance_km: distanceKm,
    round_trip_km: roundTrip,
    consumption_l100: consumption,
    liters_consumed: Math.round(liters * 10) / 10,
    price_per_liter: pricePerLiter,
    base_cost: baseCost != null ? Math.round(baseCost * 100) / 100 : null,
    margin_percent: margin,
    total_cost: costWithMargin != null ? Math.round(costWithMargin * 100) / 100 : null,
    cost_per_km: costWithMargin != null ? Math.round((costWithMargin / roundTrip) * 100) / 100 : null,
    price_verified: false,
    disclaimer: pricePerLiter == null ? ENERGY_DISCLAIMERS.unknown_price : ENERGY_DISCLAIMERS.fuel
  };
}

/* =========================================================
   BLOC 03 — CALCUL ÉLECTRIQUE
   ========================================================= */
export function estimateElectricTripEnergy(distanceKm, profile) {
  if (!distanceKm || distanceKm <= 0) return null;
  const roundTrip = distanceKm * 2;
  const consumption = profile.electric_consumption_kwh_100 || 17;
  const rawKwh = calcEnergyKwh(roundTrip, consumption);
  const lossPercent = profile.charging_loss_percent || 10;
  const margin = profile.safety_margin_percent || 10;
  const kwhWithLoss = applyChargingLoss(rawKwh, lossPercent);
  const mode = profile.charge_mode || 'home';

  const homePrice = profile.home_kwh_price;
  const publicPrice = profile.public_kwh_price;
  const homeRatio = profile.home_charge_ratio || 0.7;
  const publicRatio = profile.public_charge_ratio || 0.3;

  // Coût domicile
  const costHome = homePrice != null ? kwhWithLoss * homePrice : null;
  // Coût borne
  const costPublic = publicPrice != null ? kwhWithLoss * publicPrice : null;
  // Coût mixte
  let costMixed = null;
  if (homePrice != null && publicPrice != null) {
    costMixed = kwhWithLoss * (homeRatio * homePrice + publicRatio * publicPrice);
  } else if (homePrice != null) {
    costMixed = kwhWithLoss * homeRatio * homePrice;
  } else if (publicPrice != null) {
    costMixed = kwhWithLoss * publicRatio * publicPrice;
  }

  // Coût selon mode actif
  let activeCost = null;
  let disclaimer = ENERGY_DISCLAIMERS.unknown_price;
  if (mode === 'home') { activeCost = costHome; disclaimer = ENERGY_DISCLAIMERS.kwh_home; }
  else if (mode === 'public_charger') { activeCost = costPublic; disclaimer = ENERGY_DISCLAIMERS.kwh_public; }
  else if (mode === 'mixed') { activeCost = costMixed; disclaimer = ENERGY_DISCLAIMERS.mixed; }
  else if (mode === 'free') { activeCost = 0; disclaimer = '⚠️ Recharge gratuite à confirmer sur place.'; }

  const totalCost = activeCost != null ? applyMargin(activeCost, margin) : null;

  return {
    type: 'electric',
    charge_mode: mode,
    distance_km: distanceKm,
    round_trip_km: roundTrip,
    consumption_kwh100: consumption,
    raw_kwh: Math.round(rawKwh * 10) / 10,
    kwh_with_loss: Math.round(kwhWithLoss * 10) / 10,
    loss_percent: lossPercent,
    home_kwh_price: homePrice,
    public_kwh_price: publicPrice,
    home_ratio: homeRatio,
    public_ratio: publicRatio,
    cost_home: costHome != null ? Math.round(costHome * 100) / 100 : null,
    cost_public: costPublic != null ? Math.round(costPublic * 100) / 100 : null,
    cost_mixed: costMixed != null ? Math.round(costMixed * 100) / 100 : null,
    active_cost: activeCost != null ? Math.round(activeCost * 100) / 100 : null,
    margin_percent: margin,
    total_cost: totalCost != null ? Math.round(totalCost * 100) / 100 : null,
    cost_per_km: totalCost != null ? Math.round((totalCost / roundTrip) * 100) / 100 : null,
    price_verified: false,
    disclaimer
  };
}

/* =========================================================
   BLOC 04 — ESTIMATEUR PRINCIPAL
   ========================================================= */
export function estimateTripEnergyCost(site, distanceKm, profile) {
  if (!profile || profile.vehicle_type === 'unknown') {
    return { type: 'unknown', disclaimer: '⚠️ Configurez votre véhicule pour estimer le coût trajet.' };
  }
  if (profile.vehicle_type === 'electric') return estimateElectricTripEnergy(distanceKm, profile);
  return estimateThermalTripEnergy(distanceKm, profile);
}

/* =========================================================
   BLOC 05 — COMPARAISON MULTI-VÉHICULES
   ========================================================= */
export function compareVehicleEnergyCosts(distanceKm, vehicleProfiles) {
  if (!distanceKm || distanceKm <= 0) return [];
  return vehicleProfiles
    .map(p => estimateTripEnergyCost(null, distanceKm, p))
    .filter(r => r && r.total_cost != null)
    .sort((a, b) => a.total_cost - b.total_cost);
}

export function compareAllScenarios(distanceKm, profile) {
  const scenarios = [];

  // Scénario essence 6.5L/100
  const essenceProfile = { ...profile, vehicle_type: 'thermal', fuel_type: 'essence', thermal_consumption_l_100: 6.5 };
  const essence = estimateThermalTripEnergy(distanceKm, essenceProfile);
  if (essence) scenarios.push({ label: 'Essence (6.5L/100)', ...essence });

  // Scénario diesel 5.8L/100
  const dieselProfile = { ...profile, vehicle_type: 'thermal', fuel_type: 'diesel', thermal_consumption_l_100: 5.8 };
  const diesel = estimateThermalTripEnergy(distanceKm, dieselProfile);
  if (diesel) scenarios.push({ label: 'Diesel (5.8L/100)', ...diesel });

  // Scénario électrique domicile
  if (profile.home_kwh_price != null) {
    const evHome = { ...profile, vehicle_type: 'electric', charge_mode: 'home' };
    const elec = estimateElectricTripEnergy(distanceKm, evHome);
    if (elec) scenarios.push({ label: '⚡ Électrique domicile', ...elec });
  }

  // Scénario électrique borne
  if (profile.public_kwh_price != null) {
    const evPublic = { ...profile, vehicle_type: 'electric', charge_mode: 'public_charger' };
    const elecP = estimateElectricTripEnergy(distanceKm, evPublic);
    if (elecP) scenarios.push({ label: '⚡ Électrique borne', ...elecP });
  }

  // Scénario électrique mixte
  if (profile.home_kwh_price != null && profile.public_kwh_price != null) {
    const evMixed = { ...profile, vehicle_type: 'electric', charge_mode: 'mixed' };
    const elecM = estimateElectricTripEnergy(distanceKm, evMixed);
    if (elecM) scenarios.push({ label: '⚡ Électrique mixte', ...elecM });
  }

  const withCost = scenarios.filter(s => s.total_cost != null).sort((a,b) => a.total_cost - b.total_cost);
  return {
    scenarios,
    cheapest: withCost[0] || null,
    disclaimer: ENERGY_DISCLAIMERS.comparison
  };
}

/* =========================================================
   BLOC 06 — RENDU HTML BLOC ÉNERGIE
   ========================================================= */
export function renderTripEnergyCost(energyResult, profile) {
  if (!energyResult) return '<p class="info-disclaimer">Données énergie non disponibles.</p>';

  if (energyResult.type === 'unknown') {
    return `
      <div class="energy-block">
        <h5>⚡ Coût énergie du trajet</h5>
        <p class="info-disclaimer">${energyResult.disclaimer}</p>
        <button class="btn-secondary" onclick="document.querySelector('[data-panel=panel-settings]').click()">
          ⚙️ Configurer mon véhicule
        </button>
      </div>`;
  }

  if (energyResult.type === 'thermal') {
    const costStr = energyResult.total_cost != null ? formatCurrency(energyResult.total_cost) : '<span class="verify-tag">à calculer</span>';
    const priceStr = energyResult.price_per_liter != null ? `${energyResult.price_per_liter.toFixed(2)} €/L` : '<span class="verify-tag">à vérifier</span>';
    return `
      <div class="energy-block">
        <h5>⛽ Coût trajet — ${energyResult.fuel_type}</h5>
        <div class="energy-row"><span>Distance aller-retour</span><span>${energyResult.round_trip_km} km</span></div>
        <div class="energy-row"><span>Consommation</span><span>${energyResult.consumption_l100} L/100km</span></div>
        <div class="energy-row"><span>Litres estimés</span><span>${energyResult.liters_consumed} L</span></div>
        <div class="energy-row"><span>Prix carburant</span><span>${priceStr}</span></div>
        <div class="energy-row"><span>Marge sécurité</span><span>+${energyResult.margin_percent}%</span></div>
        <div class="energy-row" style="font-weight:700;border-top:1px solid rgba(255,255,255,0.1);margin-top:6px;padding-top:6px">
          <span>Coût trajet estimé</span><span>${costStr}</span>
        </div>
        <p class="info-disclaimer" style="margin-top:8px">${energyResult.disclaimer}</p>
      </div>`;
  }

  if (energyResult.type === 'electric') {
    const costStr = energyResult.total_cost != null ? formatCurrency(energyResult.total_cost) : '<span class="verify-tag">à calculer</span>';
    const modeLabel = { home:'Domicile', public_charger:'Borne extérieure', mixed:'Mixte', free:'Gratuite', unknown:'À vérifier' }[energyResult.charge_mode] || '—';
    return `
      <div class="energy-block">
        <h5>⚡ Coût trajet — Électrique (${modeLabel})</h5>
        <div class="energy-row"><span>Distance aller-retour</span><span>${energyResult.round_trip_km} km</span></div>
        <div class="energy-row"><span>Consommation</span><span>${energyResult.consumption_kwh100} kWh/100km</span></div>
        <div class="energy-row"><span>Énergie nécessaire</span><span>${energyResult.kwh_with_loss} kWh (pertes incluses)</span></div>
        ${energyResult.home_kwh_price != null ? `<div class="energy-row"><span>Prix kWh domicile</span><span>${energyResult.home_kwh_price.toFixed(3)} €</span></div>` : ''}
        ${energyResult.public_kwh_price != null ? `<div class="energy-row"><span>Prix kWh borne</span><span>${energyResult.public_kwh_price.toFixed(3)} €</span></div>` : ''}
        <div class="energy-row"><span>Pertes recharge</span><span>+${energyResult.loss_percent}%</span></div>
        <div class="energy-row"><span>Marge sécurité</span><span>+${energyResult.margin_percent}%</span></div>
        <div class="energy-row" style="font-weight:700;border-top:1px solid rgba(255,255,255,0.1);margin-top:6px;padding-top:6px">
          <span>Coût trajet estimé</span><span>${costStr}</span>
        </div>
        <p class="info-disclaimer" style="margin-top:8px">${energyResult.disclaimer}</p>
      </div>`;
  }

  return '';
}

/* =========================================================
   BLOC 07 — LIENS DE VÉRIFICATION ÉNERGIE
   ========================================================= */
export function buildEnergyVerificationLinks(profile, site) {
  const siteName = encodeURIComponent(site?.destination || site?.nom || '');
  return [
    { label: '⛽ Prix carburant France', url: 'https://www.prix-carburants.gouv.fr/' },
    { label: '⚡ Prix kWh domicile', url: 'https://www.google.com/search?q=prix+kWh+%C3%A9lectricit%C3%A9+domicile+France' },
    { label: '⚡ Prix recharge borne publique', url: 'https://www.chargemap.com/' },
    { label: `🔍 Borne recharge près de ${site?.destination || 'la destination'}`, url: `https://www.google.com/maps/search/borne+de+recharge+%C3%A9lectrique+${siteName}` },
    { label: '📊 Comparateur coût thermique/électrique', url: 'https://www.google.com/search?q=comparateur+co%C3%BBt+voiture+%C3%A9lectrique+vs+thermique' }
  ];
}
