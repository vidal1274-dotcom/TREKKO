# TREKKO — Architecture par blocs fonctionnels

**Version** : v1.6 / branche `refactor/block-architecture`  
**Stack** : JS vanilla ES modules, GitHub Pages, Leaflet, IndexedDB, PWA  
**46 fichiers JS**, pas de framework, cache-busting via `?v=N`

---

## Sommaire

1. [Règle d'or TREKKO](#règle-dor-trekko)
2. [Blocs fonctionnels](#blocs-fonctionnels)
3. [Dépendances window.* documentées](#dépendances-window-documentées)
4. [Plan de migration progressive](#plan-de-migration-progressive)
5. [Checklist avant commit](#checklist-avant-commit)

---

## Règle d'or TREKKO

Ces 10 règles s'appliquent à TOUT commit sur ce projet.

1. **Un bloc ne modifie pas directement l'état interne d'un autre bloc.**  
   On ne lit pas `_state` ou des variables privées d'un autre fichier. On passe par son API publique.

2. **Un bloc passe par une API publique.**  
   Si tu as besoin d'une fonctionnalité d'un autre bloc, elle doit être `export`ée. Si elle ne l'est pas, soit tu l'exporte, soit tu repenses l'architecture.

3. **Un bloc métier ne manipule pas directement la carte sauf via le bloc Carte.**  
   `day-plan.js`, `budget-estimator.js`, `tracker.js` n'ont aucun accès à `L.` (Leaflet). Tout passe par `map.js`.

4. **Un bloc UI ne fait pas de calcul métier.**  
   `ui.js`, `welcome.js`, `network-ui.js` formatent et affichent. Ils ne calculent pas de distance, de coût ou de score.

5. **Un bloc de calcul ne manipule pas le DOM.**  
   `economy-engine.js`, `trip-energy-estimator.js`, `energy-rules.js` sont purement fonctionnels. Zéro `document.getElementById`.

6. **Un import ne doit pas déclencher une action lourde.**  
   Un fichier importé ne doit déclencher ni fetch réseau, ni accès IndexedDB, ni modification DOM à l'import. Tout ça se fait dans des fonctions appelées explicitement.

7. **Aucun bloc ne doit dépendre d'un état global non documenté.**  
   Les `window.*` utilisés sont listés dans la section [Dépendances window.* documentées](#dépendances-window-documentées). Si tu en ajoutes un, documente-le ici.

8. **Chaque nouvelle fonctionnalité doit dire dans quel bloc elle vit.**  
   Avant de coder, réponds à : "Dans quel bloc va cette fonction ?" Si la réponse n'est pas évidente, c'est que le découpage doit évoluer.

9. **Chaque nouveau bloc doit avoir un fichier ou une section dédiée.**  
   Pas de bloc "fourre-tout" qui grandit sans limite. Si un fichier dépasse 400 lignes, interroge-toi sur le découpage.

10. **Toute modification doit être testée avec la checklist.**  
    Voir section [Checklist avant commit](#checklist-avant-commit).

---

## Blocs fonctionnels

---

### 01 — CORE

**Rôle** : Point d'entrée unique de l'application. Orchestre l'initialisation, coordonne les blocs, gère le cycle de vie. Contient également l'état global centralisé.

**Fichiers**
- `js/app.js` — orchestrateur (init → startApp → handlers)
- `js/state.js` — état global (pattern pub/sub minimal)

**Fonctions publiques (state.js)**

```js
getState()            // snapshot {sites, filteredSites, selectedSite, ...}
setState(updates)     // merge + émet events
on(event, fn)         // abonnement → retourne la fonction de désinscription
off(event, fn)        // désinscription
getSites()            // raccourci
getFilteredSites()    // raccourci
getSelectedSite()     // raccourci
getVehicleProfile()   // raccourci
getNetworkStatus()    // raccourci
```

**Droits de app.js**
- Peut importer n'importe quel bloc (c'est l'orchestrateur)
- Peut exposer des callbacks via `window.*` si nécessaire (voir section dédiée)

**Interdictions**
- `state.js` : zéro import (sinon risque de dépendance circulaire)
- `app.js` : pas de logique métier inline (calcul budget, rendu HTML de cartes)
- `app.js` : pas d'accès direct à Leaflet (passer par map.js)

**Comment modifier**
- Pour ajouter un nouveau bloc : l'importer dans app.js, l'initialiser dans `startApp()`
- Pour ajouter un état global : ajouter la clé dans `_state` de state.js + raccourci si fréquent

**Comment tester**
- Console navigateur : 0 erreur rouge au démarrage
- L'app charge, la carte s'affiche, les sites apparaissent

---

### 02 — CONFIGURATION

**Rôle** : Constantes globales. Aucun effet de bord. Importé par presque tous les modules.

**Fichiers**
- `js/config.js`

**Exports principaux**

```js
APP_VERSION, APP_NAME
MAP_CENTER, MAP_ZOOM_DEFAULT, MAP_ZOOM_MIN, MAP_ZOOM_MAX
UCHAUD_COORDS                // [43.7169, 4.3789] — Nages-et-Solorgues
SITES_JSON_URL, CACHE_VERSION
DEFAULT_VEHICLE_SETTINGS     // profil véhicule par défaut
ENERGY_VERIFICATION_QUERIES  // requêtes Google pour vérifier prix
NETWORK_THRESHOLDS           // seuils réseau (wifi_5g, good_4g…)
OVERPASS_ENDPOINT            // URL API Overpass
THEMATIC_CATEGORIES          // catégories POI [{id, label, tags, icon}]
```

**Droits** : lecture seule par tous les blocs

**Interdictions**
- Zéro `import`
- Zéro accès `window`, `document`, `localStorage`
- Pas de valeur dynamique (pas de `Date.now()`, pas de fetch)

**Comment modifier**
- Ajouter une constante : directement dans le bloc thématique approprié
- Modifier `UCHAUD_COORDS` : impact sur geolocation.js, day-plan.js, trip-energy-estimator.js — vérifier les trois

**Comment tester**
- `import { APP_VERSION } from './config.js'` doit fonctionner sans effet de bord

---

### 03 — CARTE

**Rôle** : Singleton Leaflet. Gestion des layers (OSM, satellite, sentiers, POI, photos). Navigation. Création d'icônes. Toute interaction avec la carte passe par ce bloc.

**Fichiers**
- `js/map.js` — singleton Leaflet, layers, navigation, sentiers Overpass
- `js/markers.js` — marqueurs sites (tooltip survol, popup clic)
- `js/photo-map.js` — marqueurs photos géolocalisées

**Fonctions publiques**

```js
// map.js
isMapReady()                        // garde — toujours vérifier avant appel Leaflet
initMap(containerId)                // init singleton
getMap()                            // instance Leaflet brute (usage exceptionnel)
getMarkersLayer()                   // LayerGroup sites
getPhotoMarkersLayer()              // LayerGroup photos
flyToSite(lat, lon, zoom)
fitBoundsToSites(sites)
toggleMapLayer()                    // OSM ↔ Satellite → retourne isSatellite
isSatelliteMode()
clearMarkers() / clearPhotoMarkers()
hidePoiLayers() / showPoiLayers()
centerMap(lat, lon, zoom)
drawHikingTrails(ways, nodes)
clearHikingTrails()
invalidateMapSize()
renderTrack(points) / clearTrack()
addTrackPoint(lat, lon, alt)
renderDayPlanRoute(sites) / clearDayPlanRoute()
showUserLocationMarker(lat, lon, acc) / clearUserLocationMarker()
showAddressMarker(lat, lon, label) / clearAddressMarker()
createSiteIcon(site)                // icône Leaflet colorée
createPhotoIcon()
getSiteStatusColor(site)

// markers.js
renderSiteMarkers(sites, onSiteClick)   // → nombre de marqueurs rendus
buildSiteBadges(site)
focusOnSite(site)

// photo-map.js
renderPhotoMarkers(onPhotoClick)        // → nombre de marqueurs
```

**Interdictions**
- `map.js` n'importe aucun module métier (budget, economy, tracker)
- `markers.js` ne fait pas de calculs (distance, score…)
- `photo-map.js` ne gère pas la sync

**Comment modifier**
- Ajouter un nouveau layer : ajouter la variable `_xxxLayer` + fonctions `drawXxx`/`clearXxx`
- Modifier l'icône d'un site : `createSiteIcon()` dans map.js

**Comment tester**
- Carte OSM : visible et navigable
- Basculer satellite : aller-retour sans erreur
- Marqueurs sites : apparaissent, tooltip au survol, popup au clic
- Marqueurs photos : apparaissent sur les photos géolocalisées

---

### 04 — GPS

**Rôle** : Accès géolocalisation navigateur. Persistence de l'origine utilisateur. Extraction EXIF GPS des photos importées.

**Fichiers**
- `js/geolocation.js`
- `js/photo-geolocation.js`

**Fonctions publiques**

```js
// geolocation.js
ORIGIN_DEFAULT                          // {lat, lon, label: 'Nages'}
requestUserLocation()                   // Promise → {lat, lon, accuracy}
startWatchingPosition(onUpdate, onErr)  // watchPosition continu
getStoredOrigin()                       // {lat, lon, label} ou ORIGIN_DEFAULT
saveOrigin(lat, lon, label)
clearUserLocation()
getStoredMaxKm()
saveMaxKm(km)
isUsingGps()                            // bool — position GPS active

// photo-geolocation.js
readPhotoGps(file)                      // Promise → {lat, lon, source, accuracy} | null
findNearestSite(lat, lon, sites)        // site le plus proche
```

**Interdictions**
- Pas de DOM
- Pas d'appel Leaflet
- Pas de calculs métier

**Comment modifier**
- Changer le timeout GPS : constante `GPS_TIMEOUT_MS` dans geolocation.js
- Ajouter un fallback IP : implémenter dans `getBrowserGps()` de photo-geolocation.js

**Comment tester**
- Clic "Utiliser ma position" → spinner → coordonnées affichées
- Refus GPS → message d'erreur clair
- Import photo avec EXIF GPS → coordonnées extraites

---

### 05 — TRACKING

**Rôle** : Session GPS (state machine : IDLE → STARTING → RECORDING → PAUSED → STOPPING → FINISHED). Accumulation de points. Stats live. Export GPX. Persistance IndexedDB.

**Fichiers**
- `js/tracker.js`

**Fonctions publiques**

```js
HikingSessionStatus                // enum : IDLE | STARTING | RECORDING | PAUSED | STOPPING | FINISHED | ERROR
ACTIVITY_CONFIG                    // {running, hiking, walking, casual} — intervalles, eau, MET
startTracking(label, isPublic, activityMode, tempCelsius, weightKg)
stopTracking()                     // → {sessionId, stats}
pauseTracking() / resumeTracking()
addTrackPoint(lat, lon, alt)
getLiveStats()                     // {distKm, elevGain, speedKmh, splits, ...}
calculateWaterNeeds(elapsedMin)    // → mL
exportAsGPX(sessionId)             // → string GPX
loadTrackPoints(sessionId)         // → array points
getAllSessions()                   // → array sessions
updateSessionVisibility(id, bool)
getActiveSessionId()
getElapsedSec()                   // durée réelle résistante à la veille iOS
pauseElapsedTimer() / resumeElapsedTimer()
getActivityConfig(mode)           // config de l'activité
getActivityModes()                // liste des modes
```

**Interdictions**
- Pas de DOM
- Pas d'import de modules Carte ou UI
- Ne pas redéfinir `haversine` — utiliser `haversineDistance` depuis utils.js

**Comment modifier**
- Changer l'intervalle d'un mode : modifier `ACTIVITY_CONFIG` en tête de fichier
- Ajouter un mode d'activité : ajouter une entrée dans `ACTIVITY_CONFIG`

**Comment tester**
- start → stats à 0 → addTrackPoint x3 → getLiveStats → distKm > 0
- pause/resume : chrono s'arrête et reprend
- stop → exportAsGPX → fichier valide (balises `<trkpt>`)

---

### 06 — RANDONNÉE

**Rôle** : Écran complet Randonnée/Balade. 3 sections : setup (poids, temp, objectif), live (timer, stats, verrouillage, alertes eau, voix), résumé (stats finales, GPX, partage). Fetch sentiers OSM Overpass. Liens AllTrails/Komoot/Strava.

**Fichiers**
- `js/hiking-screen.js`

**Fonctions publiques**

```js
initHikingScreen(onClose)       // crée le DOM, attache tous les handlers
showHikingScreen(mode)          // mode: 'hiking' | 'walking'
```

**Interdictions**
- Pas d'accès direct à Leaflet — passer par `map.js`
- Pas de calcul budget/énergie
- Pas de localStorage direct — passer par `storage.js`

**Dépendances**
- `tracker.js`, `map.js`, `geolocation.js`, `config.js`, `utils.js`

**Comment modifier**
- Ajouter un mode (ex: vélo) : ajouter une entrée dans `MODE_CONFIG` en tête de fichier
- Modifier les alertes eau : modifier `waterIntervalMin` dans `MODE_CONFIG`
- Déplacer le fetch Overpass sentiers vers `nearby.js` est prévu en Phase 2

**Comment tester**
- Ouvrir écran Randonnée → setup s'affiche
- Démarrer → section live → timer actif
- Pause → timer stop, bouton reprise visible
- Stop → section résumé → bouton GPX → téléchargement

---

### 07 — RUNNING

**Rôle** : Écran Running (vitesse, allure, splits, calories, zones cardio). Résumé post-run avec journal. Mode distinct de la Randonnée.

**Fichiers**
- `js/running-screen.js` — à créer (code actuellement dans `app.js` lignes ~675-960)

**Fonctions publiques cibles**

```js
initRunningScreen(onClose, onSummary)   // crée le DOM
showRunningScreen()                      // affiche l'écran
```

**Statut** : bloc identifié, extraction en cours (`refactor/block-architecture`). Voir Problème P1 dans l'audit.

**Interdictions**
- Pas de code Randonnée/Balade dans ce fichier
- Pas d'accès direct à Leaflet

**Comment tester** (après création)
- Clic "Running" sur l'écran de bienvenue → écran running s'affiche
- Démarrer → timer actif → splits se créent au km
- Arrêter → résumé → journal proposé

---

### 08 — PROGRAMME JOURNÉE

**Rôle** : Génération automatique d'une journée multi-sites (algorithme nearest-neighbor). Édition manuelle (drag, suppression). Calcul horaire. Sauvegarde. Export texte.

**Fichiers**
- `js/day-plan.js`

**Fonctions publiques**

```js
TRAVEL_SPEEDS                           // profils de vitesse
getBestOriginCoords()                   // GPS > stored > fallback Nages
generateDayPlan(sites, origin, opts)    // → plan {sites, totalKm, totalMin, ...}
renderDayPlan(plan, container)          // rendu HTML dans le container
saveDayPlan(plan)                       // localStorage
loadSavedDayPlan()                      // → plan | null
deleteSavedDayPlan()
exportPlanAsText(plan)                  // → string partage
renderDayPlanRoute(plan)                // affiche route sur carte (via map.js)
clearDayPlanRoute()
```

**Interdictions**
- Ne pas appeler Leaflet directement
- Ne pas calculer le coût énergie (déléguer à `trip-energy-estimator.js`)

**Comment modifier**
- Changer le nb max de stops : paramètre `maxStops` de `generateDayPlan()`
- Changer l'heure de départ minimum : constante `DEPART_HOUR_MIN` en tête de fichier

**Comment tester**
- Générer un plan avec 5 sites → ordre cohérent géographiquement
- Sauvegarder → recharger la page → plan restauré
- Exporter → texte lisible

---

### 09 — POI OVERPASS

**Rôle** : Requêtes Overpass API pour POI à proximité. Cache TTL (1h). AbortController pour annuler les requêtes obsolètes. Recherche thématique par catégorie.

**Fichiers**
- `js/nearby.js` — fetch + cache
- `js/thematic-search.js` — wrapper catégories + rendu carte + boutons

**Fonctions publiques**

```js
// nearby.js
fetchNearbyPlaces(lat, lon, categoryId, radiusM)  // → Promise<POI[]>
renderNearbyResults(places, container)             // rendu HTML

// thematic-search.js
searchThematic(lat, lon, categoryId, radiusM)     // → {results, category}
addThematicMarkersToMap(places)                   // ajoute sur carte Leaflet
getThematicCategories()                           // liste catégories
renderCategoryButtons(container, onSelect)        // boutons UI
```

**Interdictions**
- `nearby.js` ne doit pas faire de rendu HTML (séparation logique/vue)
- Ne pas conserver de cache en mémoire en dehors d'IndexedDB

**Comment modifier**
- Ajouter une catégorie POI : ajouter une entrée dans `THEMATIC_CATEGORIES` de `config.js`
- Changer le TTL cache : modifier le 3e paramètre de `cacheSet()` dans `nearby.js`

**Comment tester**
- Clic catégorie → spinner → marqueurs apparaissent sur carte
- Même requête immédiate → pas de fetch réseau (cache)
- Fermer et rouvrir : marqueurs réapparaissent sans fetch

---

### 10 — BUDGET / ÉCONOMIE

**Rôle** : Calcul du coût d'une sortie (énergie, péage, parking, entrée). Eco-score (0-100). Classement "bons plans". Profil véhicule. Règles métier énergie avec liens de vérification.

**Fichiers**
- `js/budget-estimator.js` — budget complet d'un site
- `js/economy-engine.js` — eco-score + enrichissement liste sites
- `js/trip-energy-estimator.js` — calcul thermique / électrique AR
- `js/energy-rules.js` — constantes, formules, liens vérification prix
- `js/vehicle-profile.js` — sauvegarde/chargement profil

**Fonctions publiques**

```js
// budget-estimator.js
buildBudget(site, distanceKm, vehicleProfile, options)
// → {items, total_low, total_mid, total_high, has_uncertain, energy}

// economy-engine.js
computeEcoScore(site, vehicleProfile)              // → {score, notes}
enrichSitesWithEcoScore(sites, vehicleProfile)     // → sites enrichis
getBestDeals(sites, n)                             // → top N sites

// trip-energy-estimator.js
estimateTripEnergyCost(site, distKm, profile)      // → {type, total_cost, liters|kwh, ...}
estimateThermalTripEnergy(distKm, profile)
estimateElectricTripEnergy(distKm, profile)
renderTripEnergyCost(energy, container)            // rendu HTML (uniquement ici)

// energy-rules.js
ENERGY_DEFAULTS                                    // valeurs indicatives
ENERGY_REFERENCE_VALUES                            // refs avec note "à vérifier"
buildVerificationLinks(profile)                    // → [{label, url}]
calcFuelLiters(distKm, conso)
calcEnergyKwh(distKm, conso)
applyMargin(cost, marginPct)
ENERGY_DISCLAIMERS                                 // textes avertissement

// vehicle-profile.js
getDefaultVehicleProfile()
saveVehicleProfile(profile)
loadVehicleProfile()
```

**Interdictions**
- Zéro `document.getElementById` dans ces fichiers
- Zéro fetch réseau (les prix sont saisis par l'utilisateur)
- Ne jamais afficher un prix sans disclaimer "indicatif — à vérifier"

**Comment modifier**
- Ajouter un type de coût au budget : ajouter un bloc dans `buildBudget()`
- Modifier les poids de l'eco-score : modifier `ECO_WEIGHTS` dans `economy-engine.js`
- Ajouter un champ véhicule : ajouter dans `DEFAULT_VEHICLE_SETTINGS` (config.js) ET `getDefaultVehicleProfile()`

**Comment tester**
- Site gratuit + véhicule configuré → budget avec 0€ entrée + coût énergie
- Site avec péage dans `vigilance` → ligne péage dans le budget
- Eco-score : site gratuit proche → score élevé

---

### 11 — NAVIGATION EXTERNE

**Rôle** : Construction d'URLs vers applications GPS externes. Ouverture navigateur. Détection iOS pour Apple Maps. Historique recherches Google. Liens bornes recharge.

**Fichiers**
- `js/navigation.js`
- `js/google-search.js`

**Fonctions publiques**

```js
// navigation.js
navigateTo(site)                          // iOS → Apple Maps, autres → Google
openWaze(lat, lon, name)
openGoogleMaps(lat, lon, name)
openAppleMaps(lat, lon, name)
searchChargingStations(lat, lon)          // recherche bornes sur Google Maps

// google-search.js
buildGoogleSearchLinks(site)              // → [{label, url}] (avis, parking, tarif…)
ENERGY_SEARCH_LINKS                       // liens fixes vérification prix énergie
addGoogleSearchToHistory(query, url)
getGoogleSearchHistory()
clearGoogleSearchHistory()
```

**Interdictions**
- Pas de scraping Google
- `navigation.js` n'importe pas de modules métier

**Comment modifier**
- Ajouter un lien de recherche pour un site : ajouter une entrée dans `buildGoogleSearchLinks()`
- Ajouter un lien énergie : ajouter une entrée dans `ENERGY_SEARCH_LINKS`

**Comment tester**
- Clic "Waze" sur un site avec GPS → Waze s'ouvre avec les coordonnées
- Sur iOS simulé → Apple Maps
- Liens Google → s'ouvrent dans un onglet

---

### 12 — STOCKAGE

**Rôle** : Abstraction complète de la persistance. IndexedDB pour les données structurées (9 stores). localStorage pour les préférences légères (préfixe `trekko_`). Cache JSON avec TTL. File d'attente sync photos. Politiques sync adaptatives par niveau réseau.

**Fichiers**
- `js/storage.js` — IndexedDB + localStorage + cache
- `js/sync-queue.js` — file d'attente sync photos
- `js/sync-policy.js` — politiques par niveau réseau

**Stores IndexedDB**

| Store | Contenu |
|-------|---------|
| `sites` | Sites touristiques cachés |
| `photos` | Photos importées (métadonnées + miniature) |
| `vehicle` | Profil véhicule |
| `nas_config` | Configuration NAS |
| `sync_queue` | File d'attente sync photos |
| `cache` | Cache JSON générique avec TTL |
| `gps_corrections` | Corrections GPS manuelles par site |
| `track_sessions` | Sessions de tracking |
| `track_points` | Points GPS des sessions |

**Fonctions publiques**

```js
// storage.js
STORES                                        // enum des stores
openDB()                                      // Promise<IDBDatabase>
dbPut(storeName, record)
dbGet(storeName, key)
dbGetAll(storeName)
dbDelete(storeName, key)
dbGetByIndex(storeName, indexName, value)
lsSet(key, value) / lsGet(key, default) / lsDel(key)
cacheSet(key, data, ttlMs) / cacheGet(key)

// sync-queue.js
enqueuePhotoSync(photo)         // → item {id, status: 'pending', ...}
getPendingQueue()               // → items pending ou error < max_attempts
updateQueueItem(id, updates)
clearCompletedQueue()

// sync-policy.js
SYNC_POLICIES                               // par niveau réseau
getPolicyForNetwork(status)                 // → {syncPhotos, fetchMeta, ...}
canSyncPhotos(status) / canFetchMeta(status)
getNetworkLabel(status)                     // texte lisible
getNetworkColor(status)                     // 'offline' | 'weak' | 'good'
```

**Interdictions**
- `storage.js` n'importe aucun module métier ou UI
- Ne pas stocker de données sensibles sans chiffrement (clés API, mots de passe)

**Comment modifier**
- Ajouter un store : incrémenter `DB_VERSION`, ajouter le store dans `onupgradeneeded`
- Modifier une politique sync : modifier l'entrée dans `SYNC_POLICIES`

**Comment tester**
- `dbPut` → `dbGet` même clé → même objet
- `cacheSet(key, data, 100)` → attendre 200ms → `cacheGet` → null
- `lsSet` → reload page → `lsGet` → valeur restaurée

---

### 13 — PWA

**Rôle** : Service Worker — cache des assets statiques pour mode hors-ligne, stratégie cache-first, notification de mise à jour, gestion des versions de cache.

**Fichiers**
- `service-worker.js` (à la racine du projet, pas dans `js/`)

**Mécanismes**

| Event | Comportement |
|-------|-------------|
| `install` | Pré-cache des assets HTML/CSS/JS/images |
| `fetch` | Cache-first → réseau si absent |
| `activate` | Purge des anciens caches (version changée) |
| `message: skipWaiting` | Force l'activation immédiate |

**Interdictions**
- Pas d'import de modules applicatifs
- Ne pas cacher `sites.json` sans stratégie d'invalidation

**Comment modifier**
- Incrémenter la version de cache : modifier la constante `CACHE_NAME` en tête de SW
- Ajouter des assets au pre-cache : ajouter dans le tableau `STATIC_ASSETS`

**Comment tester**
- Ouvrir DevTools → Application → Service Workers → status "activated"
- Passer hors-ligne → recharger → app fonctionne
- Déployer nouvelle version → bandeau "mise à jour disponible" apparaît

---

### 14 — UI / COMPOSANTS

**Rôle** : Navigation par onglets. Rendu liste sites. Rendu panneau économie. Écran de bienvenue (sélection mode). Bannière réseau adaptative.

**Fichiers**
- `js/ui.js` — tabs, listes, economy panel, loading
- `js/welcome.js` — écran d'accueil (running / hiking / walking / car)
- `js/network-ui.js` — bannière réseau

**Fonctions publiques**

```js
// ui.js
initNavTabs(onPanelChange)               // attache les handlers onglets
switchToPanel(panelId)                   // change le panneau actif
renderSitesList(sites, profile, onSiteClick)
renderEconomyPanel(sites, profile)
showLoading(bool)

// welcome.js
initWelcomeScreen(onModeSelect)          // callback → {mode, trackMode}
showWelcomeScreen()
// Expose window._showWelcome = showWelcomeScreen (voir section window.*)

// network-ui.js
initNetworkUI()                          // abonnement + rendu initial
```

**Interdictions**
- Pas de calcul métier (distance, score, budget)
- Pas d'appel Leaflet direct
- Pas d'accès IndexedDB direct

**Comment modifier**
- Ajouter un mode sur l'écran de bienvenue : ajouter une entrée dans `MODES` de `welcome.js`
- Changer l'affichage d'un onglet : modifier `_applyPanel()` dans `ui.js`

**Comment tester**
- Clic onglets → panneaux basculent
- Liste sites vide → état vide affiché
- Hors-ligne → bannière rouge visible

---

### 15 — UTILITAIRES

**Rôle** : Fonctions pures réutilisables. Zéro import. Zéro state global. Utilisé par tous les blocs.

**Fichiers**
- `js/utils.js`

**Fonctions publiques**

```js
// Géométrie
haversineDistance(lat1, lon1, lat2, lon2)   // → km
isValidLatLon(lat, lon)                     // → bool

// Formatage
formatDistance(km)        // → "45 km" ou "300 m"
formatCurrency(val)       // → "12.50 €"
formatMinutes(min)        // → "1h30"
parseMinutes(str)         // → number | null

// Texte
slugify(str)              // → slug URL-safe
escapeHTML(str)           // → string sans XSS

// URLs
safeUrl(url)              // → URL validée ou null
buildWazeLink(lat, lon, name)
buildGoogleMapsLink(lat, lon, name)
buildAppleMapsLink(lat, lon, name)

// DOM
showToast(msg, duration)
createElement(tag, attrs, children)

// Divers
generateId(prefix)        // → "prefix_1748900000000_xyz"
```

**Interdictions**
- Zéro import
- Pas d'état global
- Pas d'effet de bord dans les fonctions pures (haversine, format…)

**Comment modifier**
- Ajouter une fonction utilitaire : ajouter dans le bloc thématique approprié + `export`
- Ne pas importer quoi que ce soit dans ce fichier

**Comment tester**
- `haversineDistance(43.7, 4.4, 43.8, 4.5)` → ~13 km environ
- `escapeHTML('<script>')` → `'&lt;script&gt;'`
- `showToast('test')` → toast visible 2s

---

## Dépendances window.* documentées

Ces expositions globales sont des ponts nécessaires entre modules qui ne peuvent pas se référencer directement (risque circulaire ou complexité d'initialisation).

**Règle** : minimiser. Chaque `window.*` doit être documenté ici. Ne pas en ajouter sans discussion.

| Variable | Définie dans | Utilisée dans | Rôle |
|----------|-------------|---------------|------|
| `window._showWelcome` | `welcome.js` → `app.js` expose | `hiking-screen.js` | Réaffiche l'écran de bienvenue depuis l'écran Randonnée (bouton retour) |
| `window.__openSiteDetail` | `app.js` | `markers.js`, `carnet.js` | Ouvre la fiche détail d'un site — évite l'import circulaire app.js ↔ markers.js |
| `window.__openPhotoForSite` | `app.js` | `carnet.js` | Ouvre le viewer photo d'un site depuis le carnet |
| `window._currentGpsCoords` | `app.js` (mis à jour par le watch GPS) | `day-plan.js` | Coordonnées GPS temps réel pour `getBestOriginCoords()` |

**Plan de remplacement** (Phase 3) : EventBus minimal (`emit`/`on`) dans `state.js` pour supprimer ces couplages implicites.

---

## Plan de migration progressive

### Phase 1 — Appliquée (v1.6.1, branche refactor/block-architecture)

- Extraire `running-screen.js` depuis `app.js` (P1)
- Supprimer `_haversine` de `tracker.js`, utiliser `utils.js` (P2)
- Extraire `showRunSummaryWithJournal` en callback (P3)
- Ajouter commentaires de blocs structurants dans tous les fichiers principaux
- Documenter les blocs (BLOCKS_MAP.md, ARCHITECTURE_BLOCKS.md)
- Documenter les dépendances `window.*`

### Phase 2 — Prochaine version

- Migrer vers `state.js` de manière cohérente : supprimer le double état dans `app.js`
- Extraire le fetch Overpass sentiers de `hiking-screen.js` → `nearby.fetchHikingTrails()`
- Sécuriser `markers.js` avec `escapeHTML` sur tous les champs texte (P10)
- Clarifier si `programme.js` / `programmation.js` sont du code mort (P4)
- Séparer rendu HTML et logique dans `thematic-search.js` (P7)

### Phase 3 — Version future

- EventBus dans `state.js` → supprimer les `window.*` de navigation inter-blocs
- Exports clairs dans `app.js` pour les tests unitaires (P9)
- Réduction de `app.js` : objectif < 400 lignes (actuellement ~1541 lignes)
- Tests automatiques sur les blocs purs (budget, economy, utils)

### Principe directeur

Pas de réorganisation en sous-dossiers (`js/map/`, `js/gps/`…). GitHub Pages + cache-busting `?v=N` rendent ça risqué. On reste dans `js/` plat.

---

## Checklist avant commit

Cocher chaque point avant de pousser un commit sur `main` ou une PR.

### Fonctionnel de base

- [ ] Console navigateur : **0 erreur rouge** au chargement
- [ ] Carte OSM s'affiche et est navigable
- [ ] Basculer satellite ↔ OSM : OK
- [ ] Les sites apparaissent sur la carte et dans la liste

### GPS et tracking

- [ ] "Utiliser ma position" → coordonnées mises à jour
- [ ] Randonnée : start → live → pause → reprise → stop → résumé → GPX téléchargeable
- [ ] Running : start → timer → stop → résumé

### Données et budget

- [ ] Budget s'affiche pour un site (avec disclaimer "à vérifier")
- [ ] Eco-score visible dans la liste
- [ ] Programme journée : générer → sauvegarder → recharger → restauré

### Navigation externe

- [ ] Waze s'ouvre avec les coordonnées du site
- [ ] Google Maps s'ouvre
- [ ] Overpass POI : résultats affichés avec cache (pas de double fetch)

### PWA et réseau

- [ ] Service Worker actif (DevTools → Application → Service Workers)
- [ ] Hors-ligne : l'app se charge depuis le cache
- [ ] Bannière réseau apparaît en mode hors-ligne ou réseau faible

### Architecture

- [ ] Aucun nouveau `window.*` non documenté dans cette section
- [ ] Tout nouveau code appartient à un bloc identifié
- [ ] Pas de logique métier dans un fichier UI et vice versa
- [ ] `utils.js` ne contient aucun `import`
- [ ] `config.js` ne contient aucun `import` ni accès `document`/`window`
