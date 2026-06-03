# TREKKO — Audit Architecture par Blocs Fonctionnels
**Date** : 2026-06-03  
**Branche** : refactor/block-architecture  
**Base** : v1.6.0-ui-code-hardening (fc139f0)

---

## 1. Architecture actuelle — Vue d'ensemble

46 fichiers JS au total. 8405 lignes de code.

### Fichiers par taille (lignes)

| Fichier | Lignes | Imports | Exports | Statut |
|---------|--------|---------|---------|--------|
| app.js | 1541 | 28 | 0 | ⚠️ MONOLITHE |
| hiking-screen.js | 564 | 5 | 2 | ⚠️ Peut être splitté |
| programmation.js | 462 | 0 | 2 | ❓ LEGACY possible |
| programme.js | 431 | 0 | 2 | ❓ LEGACY possible |
| tracker.js | 353 | 1 | 20 | ✅ Bon périmètre |
| global-search.js | 342 | 3 | 2 | ✅ OK |
| map.js | 335 | 0 | 29 | ✅ Bien isolé |
| day-plan.js | 313 | 6 | 9 | ✅ OK |
| auth.js | 312 | 0 | 8 | ✅ OK |
| carnet.js | 260 | 4 | 3 | ✅ OK |
| trip-energy-estimator.js | 242 | 4 | 7 | ✅ OK |
| utils.js | 180 | 0 | 21 | ✅ OK |
| navigation.js | 40 | 2 | 5 | ✅ Bon bloc |
| state.js | 63 | 0 | 9 | ⚠️ Usage incohérent |

---

## 2. Rôle réel de chaque fichier

### BLOC CORE (orchestration)
- **app.js** — orchestrateur principal MAIS contient aussi tout le bloc Running (300 lignes) + showRunSummaryWithJournal + logique carte + logique GPS auto + logique programme + état global. TROP GROS.
- **state.js** — état global centralisé (sites, filteredSites, originCoords…). Existe mais n'est utilisé que partiellement par markers.js. app.js maintient son propre état dupliqué.

### BLOC CONFIGURATION
- **config.js** — constantes propres, pas de DOM. ✅

### BLOC CARTE
- **map.js** — singleton Leaflet, layers, marqueurs, polylines, helpers carte. ✅ Bien isolé.
- **markers.js** — rendu marqueurs sites, tooltips, popups. ✅ OK.
- **photo-map.js** — marqueurs photos. ✅ OK.
- **thematic-search.js** — recherche POI thématique + rendu. ⚠️ Mélange POI + carte.

### BLOC GPS
- **geolocation.js** — getCurrentPosition, watchPosition, saveOrigin, getStoredOrigin. ✅ Bien délimité.
- **photo-geolocation.js** — extraction EXIF GPS des photos. ✅ OK.

### BLOC TRACKING
- **tracker.js** — session GPS, points, stats live, GPX export, IndexedDB. ✅ Bien structuré mais contient `_haversine` dupliquée depuis utils.js.

### BLOC RANDONNÉE
- **hiking-screen.js** — écran setup/live/résumé randonnée. Contient aussi le fetch Overpass des sentiers. ⚠️ Fetch Overpass devrait être dans nearby.js ou un module dédié.

### BLOC RUNNING (⚠️ PROBLÈME MAJEUR)
- Aucun fichier dédié ! Tout le code running est dans **app.js** (lignes ~675-960) : `initRunningScreen`, `showRunningScreen`, `_rsUpdate`, `_rsFormatTimer`… + `showRunSummaryWithJournal` (ligne 1394).
- Couplage fort avec `_loadCarnet`, `_saveJournalToSession` (lazy-loaders dans app.js).

### BLOC PROGRAMME JOURNÉE
- **day-plan.js** — génération + rendu. ✅ Bien structuré.
- **programme.js** — (431 lignes, 0 imports) — implémentation alternative du panneau programme. LEGACY ?
- **programmation.js** — (462 lignes, 0 imports) — autre implémentation. LEGACY ?

### BLOC POI / OVERPASS
- **nearby.js** — fetchNearbyPlaces avec AbortController et cache. ✅ OK.
- **thematic-search.js** — wrapper thématique. ⚠️ Mélange catégories + fetch + rendu HTML.

### BLOC BUDGET / ÉCONOMIE
- **budget-estimator.js** — estimation budget sortie. ✅
- **economy-engine.js** — eco-score. ✅
- **trip-energy-estimator.js** — coût énergie véhicule. ✅
- **energy-rules.js** — règles métier énergie. ✅
- **vehicle-profile.js** — profil véhicule. ✅

### BLOC NAVIGATION EXTERNE
- **navigation.js** — buildWazeUrl, buildGoogleMapsUrl, buildAppleMapsUrl, navigateTo. ✅ PROPRE.
- **google-search.js** — historique recherches Google. ✅ OK.

### BLOC STOCKAGE
- **storage.js** — IndexedDB + localStorage. ✅
- **sync-queue.js** — file d'attente sync. ✅
- **sync-policy.js** — règles sync. ✅

### BLOC PHOTOS
- **photos.js** — gestion photos IndexedDB. ✅
- **photo-sync.js** — sync NAS. ✅
- **photo-map.js** — marqueurs carte. ✅
- **photo-geolocation.js** — EXIF GPS. ✅

### BLOC PWA
- **service-worker.js** — cache, notifications mise à jour. ✅

### BLOC UI
- **ui.js** — tabs, listes, loading, panels. ✅
- **welcome.js** — écran d'accueil. ✅
- **network-ui.js** — bandeau réseau. ✅

### BLOC UTILITAIRES
- **utils.js** — haversineDistance, formatDistance, escapeHTML, isValidLatLon, safeUrl, buildWazeLink, buildGoogleMapsLink, showToast. ✅ Bien rempli.

---

## 3. Problèmes détectés

| # | Problème | Fichier | Bloc concerné | Gravité | Risque | Correction proposée | Appliqué |
|---|---------|---------|--------------|---------|--------|-------------------|---------|
| P1 | Bloc Running (300+ lignes) dans app.js | app.js | Running | 🔴 Haute | Impossible de modifier Running sans toucher app.js | Extraire vers js/running-screen.js | ✅ |
| P2 | _haversine dupliquée dans tracker.js (déjà dans utils.js) | tracker.js | Tracking / Utils | 🟡 Moyenne | Bug si les deux divergent | Importer haversineDistance depuis utils.js | ✅ |
| P3 | showRunSummaryWithJournal défini dans app.js (ligne 1394) partagé entre Running et Carnet | app.js | Running / Carnet | 🟡 Moyenne | Couplage fort | Passer comme callback à running-screen.js | ✅ |
| P4 | programme.js et programmation.js sans imports (legacy ?) | programme.js, programmation.js | Programme | 🟡 Moyenne | Code mort probable | Vérifier usage, documenter | 📝 Doc |
| P5 | state.js existe mais app.js maintient son propre état dupliqué | app.js, state.js | Core | 🟡 Moyenne | Incohérence état | Migration progressive vers state.js | 📋 Plan |
| P6 | Fetch Overpass sentiers dans hiking-screen.js | hiking-screen.js | Randonnée / POI | 🟠 Faible | Difficile à réutiliser le fetch sentiers | Créer nearby.fetchHikingTrails() | 📋 Plan |
| P7 | thematic-search.js mélange catégories + fetch + rendu HTML | thematic-search.js | POI / UI | 🟠 Faible | Difficile à tester unitairement | Séparer fetch et rendu | 📋 Plan |
| P8 | window._showWelcome, window.__openSiteDetail — dépendances implicites window | app.js, markers.js | Core / UI | 🟠 Faible | Dépendance globale non documentée | Documenter, envisager EventBus | 📋 Plan |
| P9 | app.js 0 exports — module non testable directement | app.js | Core | 🟠 Faible | Non testable sans DOM | Exporter les fonctions publiques | 📋 Plan |
| P10 | innerHTML non sécurisé dans markers.js (buildSiteTooltipHtml) | markers.js | Carte / UI | 🟡 Moyenne | XSS si données non fiables | Utiliser escapeHTML sur les champs | 📋 Plan |

---

## 4. Dépendances entre blocs

```
config.js ← (presque tout)
utils.js  ← (presque tout)
storage.js ← tracker.js, geolocation.js, photos.js, nearby.js
map.js ← markers.js, photo-map.js, hiking-screen.js, thematic-search.js, ui.js
tracker.js ← hiking-screen.js, app.js (running + carnet)
geolocation.js ← hiking-screen.js, day-plan.js, app.js
day-plan.js ← app.js
navigation.js ← utils.js (pas de DOM)
nearby.js ← hiking-screen.js, thematic-search.js
```

### Dépendances circulaires détectées
Aucune circulaire directe dans les imports ES modules.

### Dépendances implicites via window.*
- `window._showWelcome` (app.js → utilisé dans hiking-screen.js)
- `window.__openSiteDetail` (app.js → utilisé dans markers.js, carnet.js)
- `window.__openPhotoForSite` (app.js → utilisé dans carnet.js)
- `window._currentGpsCoords` (app.js → utilisé dans day-plan.js)

Ces dépendances implicites sont à documenter et à remplacer par des callbacks ou un EventBus à terme.

---

## 5. Architecture cible recommandée

### Principes
1. Pas de déplacement massif de fichiers (GitHub Pages reste stable).
2. Chaque bloc expose une API publique claire via ses exports.
3. Réduction progressive de app.js (1541 lignes → objectif < 400 lignes).
4. Les blocs communiquent par imports explicites ou callbacks.
5. Les dépendances window.* sont minimisées et documentées.

### Structure suggérée (progressive)
```
js/
  running-screen.js  ← extrait de app.js (PRIORITÉ 1)
  navigation.js      ← déjà propre ✅
  state.js           ← à utiliser de façon cohérente
  [autres fichiers]  ← en place, bien délimités par blocs via commentaires
```

Ne pas reorganiser en sous-dossiers js/map/, js/gps/ etc. pour l'instant — trop risqué avec GitHub Pages et cache-busting.

---

## 6. Plan de correction progressif

### Phase 1 — Appliquée dans cette version (v1.6.1)
- ✅ Extraire running-screen.js depuis app.js
- ✅ Supprimer _haversine de tracker.js, utiliser haversineDistance de utils.js
- ✅ Ajouter commentaires de blocs structurants dans tous les fichiers principaux
- ✅ Documenter les blocs dans ARCHITECTURE_BLOCKS.md
- ✅ Documenter les dépendances window.* 

### Phase 2 — Prochaine version
- Migrer vers state.js de manière cohérente (supprimer le double état dans app.js)
- Extraire le fetch Overpass sentiers de hiking-screen.js vers nearby.js
- Sécuriser markers.js avec escapeHTML
- Clarifier si programme.js / programmation.js sont du code mort

### Phase 3 — Version future
- EventBus pour remplacer les window.*
- Exports clairs dans app.js pour les tests
- Réduction de app.js < 400 lignes

---

## 7. Critères de validation

- [ ] `node scripts/check-files.mjs` passe
- [ ] Console navigateur : 0 erreur rouge
- [ ] Carte OSM et satellite : OK
- [ ] GPS auto : OK
- [ ] Randonnée start/pause/stop/résumé/GPX : OK
- [ ] Running : OK
- [ ] Programme journée : OK
- [ ] Overpass POI : OK
- [ ] Waze / Google Maps : OK
- [ ] smoke-tests.html : tous ✅
