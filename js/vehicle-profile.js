/* =========================================================
   BLOC 01 — CONFIGURATION ET VALEURS PAR DÉFAUT
   ========================================================= */
import { DEFAULT_VEHICLE_SETTINGS } from './config.js';
import { lsGet, lsSet } from './storage.js';

const STORAGE_KEY = 'vehicle_profile';

/* =========================================================
   BLOC 02 — PROFIL PAR DÉFAUT
   ========================================================= */
export function getDefaultVehicleProfile() {
  return {
    ...DEFAULT_VEHICLE_SETTINGS,
    vehicle_type: 'unknown',
    fuel_type: 'essence',
    thermal_consumption_l_100: 6.5,
    electric_consumption_kwh_100: 17,
    charge_mode: 'home',
    home_kwh_price: null,
    public_kwh_price: null,
    home_charge_ratio: 0.7,
    public_charge_ratio: 0.3,
    charging_loss_percent: 10,
    fuel_price_per_liter: null,
    safety_margin_percent: 10,
    avoid_tolls: true,
    updated_at: null
  };
}

/* =========================================================
   BLOC 03 — SAUVEGARDE ET CHARGEMENT
   ========================================================= */
export function saveVehicleProfile(profile) {
  const toSave = { ...profile, updated_at: new Date().toISOString() };
  lsSet(STORAGE_KEY, toSave);
  return toSave;
}

export function loadVehicleProfile() {
  const saved = lsGet(STORAGE_KEY);
  if (!saved) return getDefaultVehicleProfile();
  // Merge avec défauts pour compatibilité future
  return { ...getDefaultVehicleProfile(), ...saved };
}

/* =========================================================
   BLOC 04 — VALIDATION
   ========================================================= */
export function validateVehicleProfile(profile) {
  const errors = [];
  if (!['thermal', 'electric', 'hybrid', 'unknown'].includes(profile.vehicle_type)) {
    errors.push('Type de véhicule invalide');
  }
  if (profile.vehicle_type === 'thermal' || profile.vehicle_type === 'hybrid') {
    if (profile.thermal_consumption_l_100 < 1 || profile.thermal_consumption_l_100 > 30) {
      errors.push('Consommation thermique hors limites (1–30 L/100km)');
    }
    if (profile.fuel_price_per_liter !== null && (profile.fuel_price_per_liter < 0.5 || profile.fuel_price_per_liter > 5)) {
      errors.push('Prix carburant hors limites (0.50–5.00 €/L)');
    }
  }
  if (profile.vehicle_type === 'electric' || profile.vehicle_type === 'hybrid') {
    if (profile.electric_consumption_kwh_100 < 5 || profile.electric_consumption_kwh_100 > 40) {
      errors.push('Consommation électrique hors limites (5–40 kWh/100km)');
    }
    if (profile.home_kwh_price !== null && (profile.home_kwh_price < 0.05 || profile.home_kwh_price > 2)) {
      errors.push('Prix kWh domicile hors limites (0.05–2.00 €)');
    }
    if (profile.public_kwh_price !== null && (profile.public_kwh_price < 0.1 || profile.public_kwh_price > 2)) {
      errors.push('Prix kWh borne hors limites (0.10–2.00 €)');
    }
    const sumRatio = (profile.home_charge_ratio || 0) + (profile.public_charge_ratio || 0);
    if (Math.abs(sumRatio - 1) > 0.01) {
      errors.push('La somme domicile + borne doit être égale à 100%');
    }
  }
  return { valid: errors.length === 0, errors };
}

/* =========================================================
   BLOC 05 — LABEL ET AFFICHAGE
   ========================================================= */
export function getVehicleLabel(profile) {
  if (!profile || profile.vehicle_type === 'unknown') return '🚗 Véhicule non configuré';
  const labels = {
    thermal: { essence: '⛽ Essence', diesel: '⛽ Diesel', hybrid_essence: '⚡⛽ Hybride essence', hybrid_diesel: '⚡⛽ Hybride diesel', gpl: '⛽ GPL' },
    electric: { home: '⚡ Électrique (domicile)', public_charger: '⚡ Électrique (borne)', mixed: '⚡ Électrique (mixte)', free: '⚡ Électrique (gratuit)', unknown: '⚡ Électrique' },
    hybrid: { essence: '⚡⛽ Hybride', diesel: '⚡⛽ Hybride diesel' }
  };
  if (profile.vehicle_type === 'thermal') return labels.thermal[profile.fuel_type] || '⛽ Thermique';
  if (profile.vehicle_type === 'electric') return labels.electric[profile.charge_mode] || '⚡ Électrique';
  if (profile.vehicle_type === 'hybrid') return labels.hybrid[profile.fuel_type] || '⚡⛽ Hybride';
  return '🚗 Véhicule';
}

export function isVehicleConfigured(profile) {
  if (!profile || profile.vehicle_type === 'unknown') return false;
  if (profile.vehicle_type === 'thermal') return profile.fuel_price_per_liter != null;
  if (profile.vehicle_type === 'electric') {
    if (profile.charge_mode === 'home') return profile.home_kwh_price != null;
    if (profile.charge_mode === 'public_charger') return profile.public_kwh_price != null;
    return true;
  }
  return false;
}
