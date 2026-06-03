# Changelog — TREKKO

## v1.6.1-block-architecture — 2026-06-03

### Architecture par blocs
- Audit complet : 46 fichiers JS, 10 problèmes détectés et documentés
- `_docs/ARCHITECTURE_BLOCKS_AUDIT.md` : rapport détaillé avec tableau problèmes/risques/corrections
- `_docs/BLOCKS_MAP.md` : carte des 15 blocs fonctionnels avec API publique et interdictions
- `_docs/ARCHITECTURE_BLOCKS.md` : règles d'or + guide modification et test par bloc

### Extraction Bloc Running
- `js/running-screen.js` — nouveau module : tout le code Running extrait de app.js (265 lignes)
- Pattern de callbacks injectés (`setupRunningCallbacks`) pour éviter les imports circulaires
- `window.dispatchEvent('trekko:switchPanel')` remplace la dépendance directe à `switchToPanel`
- app.js réduit de ~265 lignes (de 1541 à ~1280)

### Corrections architecture
- `tracker.js` : suppression de `_haversine` (dupliquée) → import de `haversineDistance` depuis utils.js
- `app.js` : suppression du doublon d'import `data-loader.js` (ligne 5 en double)
- `app.js` : `setupRunningCallbacks` câblé dans `startApp()` avec pattern événement custom

### Commentaires de blocs structurants
- `tracker.js` : BLOC TRACKING × 9 sections (session, timer, GPS, stats, résumé…)
- `map.js` : BLOC CARTE × 7 sections
- `geolocation.js` : BLOC GPS × 3 sections
- `day-plan.js` : BLOC PROGRAMME × 6 sections
- `nearby.js` : BLOC POI × 2 sections
- `navigation.js` : BLOC NAVIGATION × 3 sections

### Tests smoke architecture
- Tests de présence des blocs Running, Navigation, Carte
- Tests des fonctions publiques exportées par bloc

---

## v1.6.0-ui-code-hardening — 2026-06-01

### Stabilité carte
- `map.js` : ajout de `isMapReady()` — garde centralisée sur toutes les fonctions Leaflet
- Sécurisation de `clearHikingTrails`, `clearTrack`, `clearDayPlanRoute` contre `_map null`
- `toggleMapLayer` sécurisé avec `hasLayer` avant add/remove

### Tracking GPS & Randonnée
- `tracker.js` : `HikingSessionStatus` state machine (IDLE / STARTING / RECORDING / PAUSED / STOPPING / FINISHED)
- `tracker.js` : timer basé sur `Date.now()` via `getElapsedSec()` — résistant à la veille iOS
- `tracker.js` : `pauseElapsedTimer()` / `resumeElapsedTimer()` pour chronométrage précis
- `tracker.js` : `stopTracking()` protégé contre double-appel
- `tracker.js` : `_sessionStartMs` correctement réinitialisé
- `hiking-screen.js` : Page Visibility API — recalcul timer au retour d'arrière-plan
- `hiking-screen.js` : reset complet de l'état entre sessions

### Export GPX
- Nom de fichier propre : `trekko-{slug}-YYYY-MM-DD-HHMM.gpx`
- `URL.revokeObjectURL` après 5s (compatible Safari iOS)
- Aucun double téléchargement possible

### Programme de journée
- `getBestOriginCoords()` : GPS temps réel → localStorage → Nages (fallback)
- `TRAVEL_SPEEDS` : profils city / road / mixed / highway / mountain
- `_nearestNeighbor()` isolé en fonction pure
- Badges GPS vert / orange selon source de position
- Avertissement distances à vol d'oiseau
- `visited.js` importé avec suffixe version

### Sécurité HTML
- `utils.js` : `escapeHTML()`, `isValidLatLon()`, `safeUrl()`

### Overpass
- `nearby.js` : AbortController par catégorie — annule les requêtes obsolètes
- `hiking-screen.js` : flag `_screenActive` + guard avant `drawHikingTrails` (race condition)

### Cache & Service Worker
- map.js v4, tracker.js v2, hiking-screen.js v4, day-plan.js v27, app.js v64
- Service Worker v12 : notifie les clients après activation (bannière "mise à jour")
- GPS auto : `window._currentGpsCoords` exposé pour day-plan

### Tests & Documentation
- `tests/smoke-tests.html` : 22 tests automatiques (utils, tracker, map, day-plan)
- `_docs/AUDIT_TREKKO_UI_CODE.md` : rapport complet
- `_docs/TEST_PLAN.md` : checklist manuelle 13 sections

---

## v1.3.0-gps-location — 2026-05-25
- Bouton localisation GPS téléphone (navigator.geolocation).
- Slider rayon de recherche 10–150 km avec cercle sur la carte.
- Distances recalculées depuis la position GPS ou Uchaud (défaut).
- Marqueur bleu animé sur la position utilisateur.
- Chip "Proche" se met à jour dynamiquement avec le rayon choisi.
- État position + rayon persistant (localStorage).

## v1.2.0-builtin-dataset — 2026-05-25
- Dataset intégré : 30 sites réels autour de Nîmes avec GPS complets.
- Aucune dépendance à un fichier Excel — app 100% autonome.
- Sites couvrant : villages/marchés, nature/randonnée, mer/plage, patrimoine, grottes, caves.
- Distances de 8 km (Gallargues) à 80 km (Cirque de Navacelles).
- Git Graph installé dans VS Code (.vscode/extensions.json).

## v1.0.0-stable-mvp — 2026-05-25
- Version MVP stable et complète.
- 36 modules JavaScript modulaires (ESM).
- Carte Leaflet interactive (OpenStreetMap).
- Profil véhicule thermique / électrique / hybride.
- Calcul coût énergie trajet (carburant ou recharge) avec marge de sécurité.
- Comparaison thermique / électrique tous scénarios.
- Moteur économie financière + score éco 0-100.
- Barre de recherche globale intelligente (gratuit, sans péage, < X€, < X km...).
- Budget estimatif complet (trajet + péage + parking + visites + repas).
- Retours visiteurs : liens légaux vers sources publiques.
- Score de fiabilité des informations.
- Moteur "Me surprendre" avec critères économiques.
- Programme de journée exportable.
- Photos géolocalisées EXIF + stockage IndexedDB (aucune perte).
- Sync NAS avec file d'attente persistante + retry.
- Backend Flask NAS (SQLite, upload photos, health check).
- Gestion réseau adaptative (offline / 2G / 3G / 4G / WiFi-5G).
- PWA offline-first (Service Worker cache-first).
- Convertisseur Excel → JSON (tools/convert_excel_to_json.py).
- Script release PowerShell (scripts/git-release.ps1).
- Support iPhone Safari + PC Chrome/Edge.

## v0.1.0-mvp — 2026-05-25
- Initialisation du projet.
- Structure complète des dossiers.
- Architecture modulaire JS (config, state, utils, storage, vehicle-profile, energy-rules, trip-energy-estimator).
- index.html + styles.css (dark theme, responsive iPhone).
- manifest.json (PWA).
- .gitignore.
- Préparation architecture PWA offline-first.
