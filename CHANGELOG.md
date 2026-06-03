# Changelog — TREKKO

## v1.7.0-hiking-hud-summary-ci — 2026-06-03

### HUD Randonnée
- Indicateur de précision GPS : vert < 15 m / orange 15-40 m / rouge > 40 m / gris = perdu
- Stats live enrichies : vitesse courante, vitesse moyenne, en grille 4 cellules
- Bouton recentrer carte sur position GPS (btn-hs-center)
- Avertissement "Précision GPS faible" si accuracy > 40 m

### Résumé Randonnée
- `buildHikingSummary(finalStats)` — objet normalisé avec reliabilityLevel et warnings
- `renderHikingSummary(summary)` — séparation calcul / rendu
- `copyHikingSummaryText(summary)` — copie clipboard compatible iOS
- Résumé enrichi : vitesse moy, allure, alt min/max, points GPS, précision moy, hydratation
- Boutons : GPX, Copier résumé, Retour carte, Nouvelle sortie

### Programme Journée
- Sélecteur profil de vitesse visible : ville / montagne / mixte / autoroute
- Persistance du choix dans localStorage
- Recalcul automatique au clic "Régénérer" avec le profil sélectionné
- Avertissement : "Hors trafic réel — vérifier dans Waze"

### Tracker GPS
- `maxSpeedKmh` tracké et exposé dans `getLiveStats()`
- `avgAccuracy` (running average), `lastAccuracy` exposés
- `minAltitude` / `maxAltitude` trackées
- `avgSpeedKmh`, `avgPaceMinKm` calculés en temps réel

### CI GitHub Actions
- `.github/workflows/smoke.yml` : CI sur push/PR vers main et branches feat/refactor/fix
- `scripts/check-files.mjs` : 17 fichiers critiques + node --check 14 modules JS + VERSION
- `package.json` : `npm run smoke` et `npm run serve`

### Cache & Service Worker
- map.js v5, tracker.js v3, hiking-screen.js v5, app.js v65
- Service Worker v13 / trekko-v13
- smoke-tests.html : 35 tests (v1.7 inclus : buildHikingSummary, TRAVEL_SPEEDS, GPS indicator)

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
