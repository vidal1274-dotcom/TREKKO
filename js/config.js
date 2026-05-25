/* =========================================================
   BLOC 01 — CONFIGURATION GÉNÉRALE
   ========================================================= */
// Fichier de configuration global — pas de clés API en dur
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'Mes Sorties Nîmes';

export const MAP_CENTER = [43.8367, 4.3601]; // Uchaud / Nîmes
export const MAP_ZOOM_DEFAULT = 10;
export const MAP_ZOOM_MIN = 6;
export const MAP_ZOOM_MAX = 18;

export const UCHAUD_COORDS = [43.7437, 4.4096]; // Point de départ (Uchaud)

export const SITES_JSON_URL = 'sites.json';
export const CACHE_VERSION = 'sorties-nimes-v1';

/* =========================================================
   BLOC 02 — PROFIL VÉHICULE PAR DÉFAUT
   ========================================================= */
export const DEFAULT_VEHICLE_SETTINGS = {
  vehicle_type: 'unknown', // thermal | electric | hybrid | unknown
  fuel_type: 'essence',    // essence | diesel | hybrid_essence | hybrid_diesel | gpl
  thermal_consumption_l_100: 6.5,
  electric_consumption_kwh_100: 17,
  fuel_price_per_liter: null,       // null = à vérifier
  home_kwh_price: null,             // null = à vérifier
  public_kwh_price: null,           // null = à vérifier
  charge_mode: 'home',              // home | public_charger | mixed | free | unknown
  home_charge_ratio: 0.7,
  public_charge_ratio: 0.3,
  charging_loss_percent: 10,
  safety_margin_percent: 10,
  avoid_tolls: true,
  updated_at: null
};

/* =========================================================
   BLOC 03 — REQUÊTES DE VÉRIFICATION ÉNERGIE
   ========================================================= */
export const ENERGY_VERIFICATION_QUERIES = {
  fuel_price_essence: "prix carburant essence France aujourd'hui",
  fuel_price_diesel: "prix carburant diesel France aujourd'hui",
  home_kwh_price: "prix kWh électricité domicile France tarif réglementé",
  public_charging_price: "prix recharge borne voiture électrique France 2024",
  ev_consumption: "consommation moyenne voiture électrique kWh 100 km",
  thermal_consumption_essence: "consommation moyenne voiture essence L 100 km",
  thermal_consumption_diesel: "consommation moyenne voiture diesel L 100 km",
  fast_charging_cost: "coût recharge rapide voiture électrique prix kWh",
  toll_prices: "tarif péage autoroute France A9 Nîmes",
  heures_creuses: "tarif heures creuses électricité recharge voiture"
};

/* =========================================================
   BLOC 04 — SEUILS RÉSEAU
   ========================================================= */
export const NETWORK_THRESHOLDS = {
  WIFI_5G: 'wifi_5g',
  GOOD_4G: 'good_4g',
  MEDIUM_3G: 'medium_3g',
  WEAK_2G: 'weak_2g',
  OFFLINE: 'offline'
};

/* =========================================================
   BLOC 05 — POIDS ÉCONOMIE
   ========================================================= */
export const ECONOMY_WEIGHTS = {
  gratuit: 40,
  parking_gratuit: 10,
  sans_peage: 15,
  distance_courte: 15,
  retours_positifs: 10,
  cout_visite_bas: 10
};

/* =========================================================
   BLOC 06 — PARAMÈTRES NAS
   ========================================================= */
export const NAS_DEFAULTS = {
  url: '',
  api_key: '',
  timeout_ms: 8000,
  retry_attempts: 3
};

/* =========================================================
   BLOC 07 — OVERPASS / OSM
   ========================================================= */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/* =========================================================
   BLOC 08 — CATÉGORIES THÉMATIQUES
   ========================================================= */
export const THEMATIC_CATEGORIES = [
  { id: 'restaurants', label: 'Restaurants', icon: '🍽️', tags: 'amenity=restaurant' },
  { id: 'musees', label: 'Musées', icon: '🏛️', tags: 'tourism=museum' },
  { id: 'marches', label: 'Marchés', icon: '🛒', tags: 'amenity=marketplace' },
  { id: 'parkings', label: 'Parkings gratuits', icon: '🅿️', tags: 'amenity=parking[fee=no]' },
  { id: 'recharge', label: 'Bornes recharge', icon: '⚡', tags: 'amenity=charging_station' },
  { id: 'randonnees', label: 'Randonnées', icon: '🥾', tags: 'route=hiking' },
  { id: 'pique_nique', label: 'Pique-nique', icon: '🧺', tags: 'leisure=picnic_table' },
  { id: 'camping', label: 'Camping', icon: '⛺', tags: 'tourism=camp_site' }
];
