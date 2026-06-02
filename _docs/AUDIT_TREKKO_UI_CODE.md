# AUDIT TREKKO — UI & Code Hardening
**Date** : 2026-06-01  
**Branche** : refactor/ui-code-hardening  
**Commit de base** : 42d6054

---

## 1. ÉTAT ACTUEL

### Stack
- HTML / CSS / JS vanilla, modules ES natifs, aucun framework
- Leaflet.js pour la carte, IGN Géoportail satellite, CartoDB labels
- IndexedDB (tracks GPS via tracker.js), localStorage (préférences)
- Service Worker v11 (no-fetch handler, clear-all caches)
- Déployé sur GitHub Pages (branche main)

### Versions actuelles des modules
| Module | Version |
|--------|---------|
| app.js | v63 |
| map.js | v3 |
| hiking-screen.js | v3 |
| day-plan.js | v26 (dans app.js) |
| tracker.js | pas de version |
| nearby.js | pas de version |
| visited.js | v25 |
| welcome.js | v4 |
| ui.js | v24 |
| global-search.js | v11 |

### Fonctionnalités confirmées opérationnelles
- Carte OSM + satellite IGN + labels CartoDB + retina
- GPS watchPosition automatique au démarrage
- Écran Randonnée/Balade (setup → HUD → résumé)
- Sentiers OSM via Overpass (plafond 300 ways)
- Programme journée auto-généré (nearest-neighbor)
- Liens Waze / Google Maps dans le programme
- Export GPX (tracker.js gère le Blob et le téléchargement)
- Hydratation vocale (SpeechSynthesis)
- Flag _screenActive pour la race condition Overpass

---

## 2. FICHIERS CRITIQUES ET RISQUES

### map.js — RISQUE MOYEN
- **Pas de `isMapReady()`** : toutes les fonctions vérifient `if (!_map)` individuellement mais sans garde centralisée
- `hidePoiLayers()` / `showPoiLayers()` : OK maintenant, mais pas de test `_map.hasLayer` unifié
- `drawHikingTrails()` : pas de vérification de `_map.hasLayer(_hikingTrailsLayer)` avant remove
- Fonctions `clearHikingTrails()` : `if (_hikingTrailsLayer && _map)` — ordre conditionnel fragile

### tracker.js — RISQUE ÉLEVÉ
- **Timer basé sur setInterval** : dérive si l'écran passe en veille (iOS Safari gèle les intervals)
- **`startTracking()` pas protégé contre double-appel** : `if (_sessionId) return _sessionId;` — OK, mais pas de status machine
- **`recordPoint()` utilise `getCurrentPosition`** : GPS à la demande, pas de watchPosition — consomme battery et slow
- Pas de `HikingSessionStatus` state machine
- `_sessionStartMs` non réinitialisé dans `stopTracking()`
- dbGetAll dans recordPoint à chaque point = O(n) sur IndexedDB — lent si beaucoup de sessions

### hiking-screen.js — RISQUE MOYEN
- `_elapsedSec` basé sur setInterval 1s : dérive en veille
- Reset `_autoGpsFirstFix` dans `_startAutoGpsWatch()` (app.js) : flag module-level, ne se remet pas à zéro si l'utilisateur quitte et revient
- État bien réinitialisé dans `_closeHikingScreen()` depuis le dernier fix

### day-plan.js — RISQUE FAIBLE
- `generateDayPlan()` utilise `UCHAUD_COORDS` en dur comme origine
- `AVG_SPEED_KMH = 70` fixe
- `filterUnvisited` importé de `visited.js` sans suffixe version → cache potentiellement obsolète
- Distances à vol d'oiseau × 1.2 — imprécis en montagne

### geolocation.js — RISQUE FAIBLE
- `startWatchingPosition()` : pas d'appel à `stopWatchingPosition()` si déjà actif avant de relancer
- `_watchId` ne gère pas le cas où `navigator.geolocation` disparaît

### service-worker.js v11 — RISQUE FAIBLE
- Pas de notification en UI quand une nouvelle version est disponible
- Pas de message vers les clients après `clients.claim()`

### utils.js — RISQUE FAIBLE
- Pas de `escapeHTML()` — injection possible si noms de sites contiennent `<>`
- Pas de `isValidLatLon()` — liens Waze/Maps non validés avant génération

### nearby.js — RISQUE FAIBLE
- resp.ok déjà vérifié ✓
- Cache 1h déjà implémenté ✓
- Mais pas d'AbortController si nouvelle requête lance avant la fin de l'ancienne

---

## 3. BUGS POTENTIELS

| # | Fichier | Description | Sévérité |
|---|---------|-------------|----------|
| B1 | tracker.js | Timer `setInterval` dérive sous iOS en veille — temps affiché incorrect | Haute |
| B2 | tracker.js | `dbGetAll(TRACK_SESSIONS)` dans `recordPoint()` toutes les 30s — O(n) sessions | Moyenne |
| B3 | day-plan.js | Origine toujours `UCHAUD_COORDS`, ignorant la position GPS réelle | Moyenne |
| B4 | app.js | `_autoGpsFirstFix = true` jamais remis à true si watchPosition s'arrête et redémarre | Faible |
| B5 | tracker.js | `_sessionStartMs` non réinitialisé dans `stopTracking()` — valeur résiduelle | Faible |
| B6 | map.js | `clearHikingTrails()` : condition `_hikingTrailsLayer && _map` — si `_map` est null, le layer reste orphelin | Faible |
| B7 | utils.js | Pas de `escapeHTML()` — noms de sites injectés directement dans innerHTML | Faible |
| B8 | nearby.js | Pas d'AbortController — requêtes Overpass en doublon si déclenchées rapidement | Faible |

---

## 4. PLAN DE CORRECTION — ORDRE DE PRIORITÉ

### Lot 1 — Sécuriser la carte (PRIORITÉ 1)
- Ajouter `isMapReady()` dans map.js
- Sécuriser toutes les fonctions exposées avec ce garde
- Commit : `fix: harden Leaflet map lifecycle and layer guards`

### Lot 2 — Fiabiliser le tracking (PRIORITÉ 1)
- Remplacer le timer `setInterval` par `Date.now() - startTime`
- Ajouter `HikingSessionStatus` state machine
- Protéger `startTracking()` contre double-appel (déjà OK) + double `stopTracking()`
- Corriger `_sessionStartMs` reset dans `stopTracking()`
- Page Visibility API : recalculer stats à la reprise
- Commit : `fix: stabilize hiking tracking session lifecycle`

### Lot 3 — GPX + cache-busting (PRIORITÉ 2)
- Nommage fichier GPX : `trekko-rando-YYYY-MM-DD-HHMM.gpx`
- Versions cohérentes tous modules
- Service Worker v12
- Commit : `fix: improve GPX export and module cache busting`

### Lot 4 — Programme journée (PRIORITÉ 2)
- `getBestOriginCoords()` : GPS > localStorage > défaut
- Sélecteur vitesse (city/road/mixed/mountain)
- Commit : `feat: improve day plan origin and route estimation`

### Lot 5 — HUD amélioré (PRIORITÉ 3)
- Indicateur précision GPS (vert/orange/rouge/gris)
- Vitesse actuelle + moyenne dans le HUD
- Bouton recentrer carte
- Commit : `feat: improve hiking HUD and summary`

### Lot 6 — Sécurité HTML (PRIORITÉ 3)
- `escapeHTML()`, `isValidLatLon()`, `safeUrl()` dans utils.js
- Commit : `fix: add HTML safety utilities`

### Lot 7 — Overpass amélioré (PRIORITÉ 3)
- AbortController dans nearby.js et hiking-screen.js
- Messages clairs loader/erreur
- Commit : `feat: improve Overpass robustness`

### Lot 8 — Tests + doc (PRIORITÉ 4)
- `tests/smoke-tests.html`
- `_docs/TEST_PLAN.md`
- Commit : `test: add smoke tests and manual validation plan`

### Lot 9 — VERSION + CHANGELOG + tag (PRIORITÉ 4)
- `VERSION` → 1.6.0-ui-code-hardening
- `CHANGELOG.md`
- Tag `v1.6.0-ui-code-hardening`

---

## 5. STRATÉGIE DE ROLLBACK

- **Branche** : tous les changements sur `refactor/ui-code-hardening`, pas sur `main`
- **Rollback partiel** : `git revert <commit>` sur le commit fautif
- **Rollback complet** : `git checkout main` — main est intact jusqu'au merge
- **GitHub Pages** : ne sert que `main` — la branche de travail n'impacte pas la prod
- **Test avant merge** : validation manuelle sur mobile via GitHub Pages (merge → test → revert si nécessaire)
