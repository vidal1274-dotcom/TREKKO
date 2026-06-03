# TREKKO — Carte des 15 blocs fonctionnels

**Base** : v1.6 / branche `refactor/block-architecture`  
**JS** : ES modules vanilla, GitHub Pages, Leaflet, IndexedDB  
**Mise à jour** : 2026-06-03

---

## Conventions

| Symbole | Sens |
|---------|------|
| INTERDIT | Ne jamais faire dans ce bloc |
| AUTORISÉ | Dépendances déclarées acceptables |
| API publique | Ce que les autres blocs peuvent appeler |

---

## 01 CORE

**Responsabilité** : Orchestration du démarrage, gestion du cycle de vie de l'application, coordination entre blocs. Point d'entrée unique.

**Fichiers actuels**
- `js/app.js` — orchestrateur principal (init, startApp, handlers événements)
- `js/state.js` — état global centralisé (sites, filteredSites, selectedSite, originCoords…)

**API publique principale**

| Fonction / export | Description |
|-------------------|-------------|
| `getState()` | Snapshot immutable de l'état global |
| `setState(updates)` | Met à jour l'état + émet les events |
| `on(event, fn)` | Abonnement à un changement d'état |
| `off(event, fn)` | Désabonnement |
| `getSites()` | Raccourci → `_state.sites` |
| `getFilteredSites()` | Raccourci → `_state.filteredSites` |
| `getSelectedSite()` | Raccourci → `_state.selectedSite` |

**Interdictions**
- app.js ne doit PAS contenir de logique métier (calcul budget, rendu HTML)
- app.js ne doit PAS manipuler directement Leaflet
- state.js ne doit PAS importer d'autres modules (risque circulaire)

**Dépendances autorisées**
- Tous les blocs peuvent être importés par app.js (c'est l'orchestrateur)
- state.js : zéro import

---

## 02 CONFIGURATION

**Responsabilité** : Constantes globales immuables. Aucun effet de bord à l'import.

**Fichiers actuels**
- `js/config.js`

**API publique principale**

| Export | Description |
|--------|-------------|
| `APP_VERSION`, `APP_NAME` | Identité |
| `MAP_CENTER`, `MAP_ZOOM_DEFAULT` | Carte |
| `UCHAUD_COORDS` | Point de départ (Nages-et-Solorgues) |
| `SITES_JSON_URL`, `CACHE_VERSION` | URLs données |
| `DEFAULT_VEHICLE_SETTINGS` | Profil véhicule par défaut |
| `ENERGY_VERIFICATION_QUERIES` | Requêtes Google vérification énergie |
| `NETWORK_THRESHOLDS` | Seuils réseau |
| `OVERPASS_ENDPOINT` | URL API Overpass |
| `THEMATIC_CATEGORIES` | Catégories POI Overpass |

**Interdictions**
- Aucun `import` dans config.js
- Aucun accès `document`, `window`, `localStorage`
- Aucune logique conditionnelle dynamique

**Dépendances autorisées**
- Aucune

---

## 03 CARTE

**Responsabilité** : Singleton Leaflet, layers, navigation carte, marqueurs sites, marqueurs photos.

**Fichiers actuels**
- `js/map.js` — singleton Leaflet, layers OSM/satellite/sentiers, helpers navigation
- `js/markers.js` — rendu marqueurs sites (tooltips, popups)
- `js/photo-map.js` — marqueurs photos sur carte

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `initMap(containerId)` | map.js | Init singleton Leaflet |
| `isMapReady()` | map.js | Garde — vérifier avant tout appel Leaflet |
| `flyToSite(lat, lon, zoom)` | map.js | Animation vers coordonnées |
| `fitBoundsToSites(sites)` | map.js | Ajuste le zoom à la liste |
| `toggleMapLayer()` | map.js | Bascule OSM ↔ Satellite |
| `drawHikingTrails(ways, nodes)` | map.js | Affiche sentiers OSM |
| `clearHikingTrails()` | map.js | Efface sentiers |
| `hidePoiLayers()` / `showPoiLayers()` | map.js | Masque/affiche layers POI |
| `renderSiteMarkers(sites, onSiteClick)` | markers.js | Génère marqueurs sites |
| `renderPhotoMarkers(onPhotoClick)` | photo-map.js | Génère marqueurs photos |

**Interdictions**
- map.js ne doit PAS importer de fichiers métier (budget, economy…)
- markers.js ne doit PAS faire de calculs métier
- photo-map.js ne doit PAS gérer la logique de sync photos

**Dépendances autorisées**
- `config.js`, `utils.js`, `state.js`
- `photos.js` (lecture seule, pour photo-map.js)

---

## 04 GPS

**Responsabilité** : Accès à la géolocalisation navigateur, persistence de l'origine, extraction EXIF GPS des photos.

**Fichiers actuels**
- `js/geolocation.js` — getCurrentPosition, watchPosition, saveOrigin, getStoredOrigin
- `js/photo-geolocation.js` — lecture EXIF GPS + fallback navigateur

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `requestUserLocation()` | geolocation.js | Promise → `{lat, lon, accuracy}` |
| `startWatchingPosition(cb)` | geolocation.js | Watch continu, callback à chaque fix |
| `getStoredOrigin()` | geolocation.js | Retourne l'origine sauvegardée ou ORIGIN_DEFAULT |
| `saveOrigin(lat, lon, label)` | geolocation.js | Persiste l'origine (localStorage) |
| `clearUserLocation()` | geolocation.js | Efface l'origine sauvegardée |
| `getStoredMaxKm()` / `saveMaxKm(km)` | geolocation.js | Rayon de filtrage distance |
| `ORIGIN_DEFAULT` | geolocation.js | Constante fallback (Nages) |
| `readPhotoGps(file)` | photo-geolocation.js | Promise → `{lat, lon, source}` ou null |
| `findNearestSite(lat, lon, sites)` | photo-geolocation.js | Site le plus proche |

**Interdictions**
- Ne pas manipuler le DOM
- Ne pas appeler Leaflet directement
- Ne pas faire de calculs métier (budget, énergie…)

**Dépendances autorisées**
- `config.js` (UCHAUD_COORDS)
- `storage.js` (lsGet/lsSet)

---

## 05 TRACKING

**Responsabilité** : Session GPS (start/pause/stop), accumulation de points, stats live (distance, dénivelé, vitesse, calories, eau), export GPX, persistance IndexedDB.

**Fichiers actuels**
- `js/tracker.js`

**API publique principale**

| Fonction | Description |
|----------|-------------|
| `startTracking(label, isPublic, activityMode, tempCelsius, weightKg)` | Démarre session |
| `stopTracking()` | Arrête + finalise session |
| `pauseTracking()` / `resumeTracking()` | Pause/reprise |
| `addTrackPoint(lat, lon, alt)` | Ajoute un point GPS |
| `getLiveStats()` | Stats temps réel (dist, durée, vitesse, D+) |
| `calculateWaterNeeds(elapsedMin)` | Besoins eau en mL |
| `exportAsGPX(sessionId)` | Export GPX string |
| `loadTrackPoints(sessionId)` | Charge points depuis IndexedDB |
| `getAllSessions()` | Toutes les sessions |
| `getElapsedSec()` | Durée réelle (résistant veille iOS) |
| `HikingSessionStatus` | Enum états machine (IDLE, RECORDING, PAUSED…) |

**Interdictions**
- Ne pas accéder au DOM
- Ne pas importer de modules Carte ou UI
- Ne pas dupliquer `haversineDistance` (utiliser utils.js)

**Dépendances autorisées**
- `storage.js` (dbPut, dbGetAll, STORES)
- `utils.js` (haversineDistance, generateId)

---

## 06 RANDONNÉE

**Responsabilité** : Écran complet Randonnée/Balade (setup → live → résumé). Modes hiking et walking. Intégration AllTrails/Komoot/Strava (liens). Fetch sentiers OSM Overpass.

**Fichiers actuels**
- `js/hiking-screen.js`

**API publique principale**

| Fonction | Description |
|----------|-------------|
| `initHikingScreen(onClose)` | Crée le DOM de l'écran, attache les handlers |
| `showHikingScreen(mode)` | Affiche l'écran (`'hiking'` ou `'walking'`) |

**Interdictions**
- Ne pas accéder à Leaflet directement (passer par map.js)
- Ne pas calculer le budget/énergie
- Ne pas lire/écrire localStorage directement (passer par storage.js)

**Dépendances autorisées**
- `tracker.js`, `map.js`, `geolocation.js`, `config.js`, `utils.js`

---

## 07 RUNNING

**Responsabilité** : Écran Running complet (setup → live → résumé avec journal). Calculs allure, splits, calories, zones cardio.

**Fichiers actuels**
- `js/running-screen.js` — à créer (extrait depuis app.js lors du refactor)

**API publique principale** (cible)

| Fonction | Description |
|----------|-------------|
| `initRunningScreen(onClose, onSummary)` | Crée le DOM, attache les handlers |
| `showRunningScreen()` | Affiche l'écran |

**Interdictions**
- Ne pas contenir de code Randonnée (blocs séparés)
- Ne pas accéder au DOM en dehors de son propre container

**Dépendances autorisées**
- `tracker.js`, `map.js`, `utils.js`, `config.js`

---

## 08 PROGRAMME JOURNÉE

**Responsabilité** : Génération automatique (nearest-neighbor), édition manuelle, rendu, sauvegarde/chargement, export texte d'un programme de sortie multi-sites.

**Fichiers actuels**
- `js/day-plan.js`

**API publique principale**

| Fonction | Description |
|----------|-------------|
| `generateDayPlan(sites, origin, options)` | Génère un programme optimisé |
| `renderDayPlan(plan, container)` | Rendu HTML du programme |
| `saveDayPlan(plan)` | Persiste en localStorage |
| `loadSavedDayPlan()` | Charge le plan sauvegardé |
| `deleteSavedDayPlan()` | Supprime le plan |
| `exportPlanAsText(plan)` | Export texte partage |
| `getBestOriginCoords()` | Origine GPS intelligente (GPS > stored > fallback) |
| `TRAVEL_SPEEDS` | Profils de vitesse par type de route |

**Interdictions**
- Ne pas manipuler directement Leaflet
- Ne pas calculer le coût énergie (déléguer à trip-energy-estimator.js)

**Dépendances autorisées**
- `utils.js`, `trip-energy-estimator.js`, `storage.js`, `config.js`, `geolocation.js`, `visited.js`

---

## 09 POI OVERPASS

**Responsabilité** : Requêtes Overpass API pour POI à proximité (fontaines, parkings, restaurants…), cache TTL, recherche thématique par catégorie, rendu boutons catégories.

**Fichiers actuels**
- `js/nearby.js` — fetch Overpass avec AbortController et cache IndexedDB
- `js/thematic-search.js` — wrapper catégories + affichage marqueurs sur carte

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `fetchNearbyPlaces(lat, lon, categoryId, radiusM)` | nearby.js | Promise → array POI |
| `renderNearbyResults(places, container)` | nearby.js | Rendu HTML résultats |
| `searchThematic(lat, lon, categoryId, radiusM)` | thematic-search.js | Wrapper fetch thématique |
| `addThematicMarkersToMap(places)` | thematic-search.js | Ajout marqueurs Leaflet |
| `getThematicCategories()` | thematic-search.js | Liste des catégories disponibles |
| `renderCategoryButtons(container, onSelect)` | thematic-search.js | Rendu boutons catégories |

**Interdictions**
- Ne pas faire de rendu HTML dans nearby.js (logique uniquement)
- Ne pas stocker de state global entre requêtes (sauf cache)

**Dépendances autorisées**
- `config.js` (OVERPASS_ENDPOINT, THEMATIC_CATEGORIES)
- `storage.js` (cacheSet, cacheGet)
- `map.js` (thematic-search uniquement, pour getMap())

---

## 10 BUDGET / ÉCONOMIE

**Responsabilité** : Calcul du coût énergie trajet (thermique/électrique), eco-score, budget sortie complet (péage, parking, entrée), règles métier énergie, profil véhicule.

**Fichiers actuels**
- `js/budget-estimator.js` — budget complet d'une sortie (énergie + péage + parking + entrée)
- `js/economy-engine.js` — eco-score (0-100) et classement "bons plans"
- `js/trip-energy-estimator.js` — calcul thermique/électrique AR
- `js/energy-rules.js` — règles, constantes, liens de vérification
- `js/vehicle-profile.js` — sauvegarde/chargement profil véhicule

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `buildBudget(site, distKm, profile)` | budget-estimator.js | Budget complet → `{items, total_low, total_mid, total_high}` |
| `computeEcoScore(site, profile)` | economy-engine.js | Score économique 0-100 |
| `enrichSitesWithEcoScore(sites, profile)` | economy-engine.js | Enrichit la liste de sites |
| `getBestDeals(sites, n)` | economy-engine.js | Top N sites économiques |
| `estimateTripEnergyCost(site, distKm, profile)` | trip-energy-estimator.js | Coût énergie AR |
| `saveVehicleProfile(profile)` | vehicle-profile.js | Persiste en localStorage |
| `loadVehicleProfile()` | vehicle-profile.js | Charge depuis localStorage |
| `buildVerificationLinks(profile)` | energy-rules.js | Liens vérification prix réels |
| `ENERGY_DEFAULTS`, `ENERGY_REFERENCE_VALUES` | energy-rules.js | Constantes indicatives |

**Interdictions**
- Aucun accès DOM
- Aucun fetch réseau (les valeurs sont saisies par l'utilisateur ou indicatives)
- Ne jamais afficher de prix sans disclaimer "à vérifier"

**Dépendances autorisées**
- `utils.js` (haversineDistance, formatCurrency)
- `config.js` (UCHAUD_COORDS, DEFAULT_VEHICLE_SETTINGS)
- `storage.js` (lsGet/lsSet)
- `energy-rules.js` ← trip-energy-estimator.js uniquement

---

## 11 NAVIGATION EXTERNE

**Responsabilité** : Construction d'URLs vers Waze, Google Maps, Apple Maps. Ouverture dans le navigateur. Historique des recherches Google. Liens borne recharge.

**Fichiers actuels**
- `js/navigation.js` — openWaze, openGoogleMaps, openAppleMaps, navigateTo
- `js/google-search.js` — buildGoogleSearchLinks, ENERGY_SEARCH_LINKS, historique

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `navigateTo(site)` | navigation.js | Ouvre GPS natif (iOS → Apple Maps, autres → Google) |
| `openWaze(lat, lon, name)` | navigation.js | Ouvre Waze |
| `openGoogleMaps(lat, lon, name)` | navigation.js | Ouvre Google Maps |
| `searchChargingStations(lat, lon)` | navigation.js | Recherche bornes recharge |
| `buildGoogleSearchLinks(site)` | google-search.js | Tableau de liens Google pour un site |
| `addGoogleSearchToHistory(query, url)` | google-search.js | Ajoute à l'historique |
| `ENERGY_SEARCH_LINKS` | google-search.js | Liens vérification prix énergie |

**Interdictions**
- Ne pas scraper Google (génération de liens uniquement)
- navigation.js ne doit PAS importer de modules métier

**Dépendances autorisées**
- `utils.js` (buildWazeLink, buildGoogleMapsLink, buildAppleMapsLink)
- `storage.js` (google-search.js uniquement, pour l'historique)

---

## 12 STOCKAGE

**Responsabilité** : Abstraction IndexedDB (9 stores), localStorage (clés préfixées `trekko_`), cache JSON avec TTL, file d'attente sync photos, politiques sync par niveau réseau.

**Fichiers actuels**
- `js/storage.js` — openDB, CRUD générique (dbPut/dbGet/dbGetAll/dbDelete/dbGetByIndex), lsGet/lsSet/lsDel, cacheSet/cacheGet
- `js/sync-queue.js` — enqueuePhotoSync, getPendingQueue, updateQueueItem
- `js/sync-policy.js` — SYNC_POLICIES, getPolicyForNetwork, canSyncPhotos, getNetworkLabel

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `dbPut(store, record)` | storage.js | Upsert IndexedDB |
| `dbGet(store, key)` | storage.js | Lecture par clé |
| `dbGetAll(store)` | storage.js | Lecture complète |
| `dbDelete(store, key)` | storage.js | Suppression |
| `dbGetByIndex(store, index, value)` | storage.js | Lecture par index |
| `lsGet(key)` / `lsSet(key, val)` / `lsDel(key)` | storage.js | localStorage préfixé |
| `cacheSet(key, data, ttlMs)` | storage.js | Cache JSON horodaté |
| `cacheGet(key)` | storage.js | Cache avec expiration auto |
| `STORES` | storage.js | Enum des stores IndexedDB |
| `enqueuePhotoSync(photo)` | sync-queue.js | Ajoute à la file |
| `getPendingQueue()` | sync-queue.js | Items en attente |
| `getPolicyForNetwork(status)` | sync-policy.js | Politique sync selon réseau |

**Interdictions**
- Aucun accès DOM
- Aucun import de modules métier ou UI dans storage.js

**Dépendances autorisées**
- `utils.js` (generateId, pour sync-queue.js)

---

## 13 PWA

**Responsabilité** : Service Worker — mise en cache des assets statiques, stratégie cache-first pour les données, notification de mise à jour disponible.

**Fichiers actuels**
- `js/service-worker.js` (à la racine du projet)

**API publique principale**

| Mécanisme | Description |
|-----------|-------------|
| `install` event | Pré-cache des assets statiques |
| `fetch` event | Stratégie cache-first avec fallback réseau |
| `activate` event | Purge des anciens caches |
| `message` event | Communication avec le client (skipWaiting) |

**Interdictions**
- Pas d'import de modules applicatifs dans le SW
- Ne pas cacher les données dynamiques sans TTL

**Dépendances autorisées**
- Aucune (contexte isolé Service Worker)

---

## 14 UI / COMPOSANTS

**Responsabilité** : Navigation par onglets, rendu liste sites, rendu panneau économie, écran de bienvenue (sélection mode), bannière réseau.

**Fichiers actuels**
- `js/ui.js` — initNavTabs, switchToPanel, renderSitesList, renderEconomyPanel, showLoading
- `js/welcome.js` — initWelcomeScreen, showWelcomeScreen
- `js/network-ui.js` — initNetworkUI, mise à jour bannière réseau

**API publique principale**

| Fonction | Fichier | Description |
|----------|---------|-------------|
| `initNavTabs(onPanelChange)` | ui.js | Attache les handlers onglets |
| `switchToPanel(panelId)` | ui.js | Change le panneau actif |
| `renderSitesList(sites, profile, onSiteClick)` | ui.js | Rendu liste des sites |
| `renderEconomyPanel(sites, profile)` | ui.js | Rendu panneau économie |
| `showLoading(bool)` | ui.js | Affiche/masque spinner |
| `initWelcomeScreen(onModeSelect)` | welcome.js | Écran d'accueil modes |
| `showWelcomeScreen()` | welcome.js | Affiche l'écran de bienvenue |
| `initNetworkUI()` | network-ui.js | Abonnement changements réseau + bannière |

**Interdictions**
- Aucun calcul métier dans ui.js (pas de budget, pas de distance)
- Ne pas appeler Leaflet directement
- ne pas accéder à IndexedDB directement

**Dépendances autorisées**
- `utils.js` (formatDistance, formatCurrency, createElement)
- `map.js` (getSiteStatusColor uniquement, pour ui.js)
- `sync-policy.js` (getNetworkLabel, getNetworkColor, pour network-ui.js)
- `network-manager.js` (pour network-ui.js)

---

## 15 UTILITAIRES

**Responsabilité** : Fonctions pures réutilisables — géométrie, formatage, DOM helpers, construction URLs, toast.

**Fichiers actuels**
- `js/utils.js`

**API publique principale**

| Fonction | Description |
|----------|-------------|
| `haversineDistance(lat1, lon1, lat2, lon2)` | Distance orthodromique en km |
| `formatDistance(km)` | `"45 km"` ou `"300 m"` |
| `formatCurrency(val)` | `"12.50 €"` |
| `formatMinutes(min)` | `"1h30"` |
| `parseMinutes(str)` | Inverse de formatMinutes |
| `slugify(str)` | Slug URL-safe |
| `escapeHTML(str)` | Protection XSS |
| `isValidLatLon(lat, lon)` | Validation coordonnées |
| `safeUrl(url)` | Validation URL avant ouverture |
| `showToast(msg, duration)` | Notification temporaire |
| `createElement(tag, attrs, children)` | Helper création DOM |
| `generateId(prefix)` | ID unique préfixé |
| `buildWazeLink(lat, lon, name)` | URL Waze |
| `buildGoogleMapsLink(lat, lon, name)` | URL Google Maps |
| `buildAppleMapsLink(lat, lon, name)` | URL Apple Maps |

**Interdictions**
- Zéro import dans utils.js
- Aucun accès DOM dans les fonctions non-DOM (haversine, formatters…)
- Aucun state global

**Dépendances autorisées**
- Aucune

---

## Matrice de dépendances inter-blocs

```
              01  02  03  04  05  06  07  08  09  10  11  12  13  14  15
01 CORE        —   R   R   R   R   R   R   R   R   R   R   R   —   R   R
02 CONFIG      —   —   —   —   —   —   —   —   —   —   —   —   —   —   —
03 CARTE       —   R   —   —   —   —   —   —   —   —   —   —   —   —   R
04 GPS         —   R   —   —   —   —   —   —   —   —   —   R   —   —   —
05 TRACKING    —   —   —   —   —   —   —   —   —   —   —   R   —   —   R
06 RANDONNÉE   —   R   R   R   R   —   —   —   —   —   —   —   —   —   R
07 RUNNING     —   R   R   —   R   —   —   —   —   —   —   —   —   —   R
08 PROG.JEE    —   R   —   R   —   —   —   —   —   R   —   R   —   —   R
09 POI         —   R   R   —   —   —   —   —   —   —   —   R   —   —   —
10 BUDGET      —   R   —   —   —   —   —   —   —   —   —   R   —   —   R
11 NAV.EXT.    —   —   —   —   —   —   —   —   —   —   —   R   —   —   R
12 STOCKAGE    —   —   —   —   —   —   —   —   —   —   —   —   —   —   R
13 PWA         —   —   —   —   —   —   —   —   —   —   —   —   —   —   —
14 UI          —   —   R   —   —   —   —   —   —   —   —   —   —   —   R
15 UTILS       —   —   —   —   —   —   —   —   —   —   —   —   —   —   —

R = importe de ce bloc
```
