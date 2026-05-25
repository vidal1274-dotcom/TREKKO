# Changelog — Mes Sorties Nîmes (Sortie_WE)

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

## v0.9.0-nas-sync _(à venir)_
- Synchronisation photos vers NAS Flask/SQLite.

## v0.8.0-photo-local-storage _(à venir)_
- Photos géolocalisées stockées localement (IndexedDB).

## v0.7.0-external-insights _(à venir)_
- Retours visiteurs / liens de recherche publics / score fiabilité.

## v0.6.0-economy-search _(à venir)_
- Recherche orientée économie financière.
- Badges : gratuit, sans péage, proche, trajet économique.

## v0.5.0-vehicle-energy-cost _(à venir)_
- Calcul énergie véhicule électrique / thermique.
- Comparaison tous scénarios.

## v0.4.0-budget-engine _(à venir)_
- Budget estimatif global.
- Coût trajet intégré.

## v0.3.0-global-search _(à venir)_
- Barre de recherche globale.
- Filtres intelligents (sans péage, gratuit, moins de X€...).

## v0.2.0-dashboard-map _(à venir)_
- Dashboard + carte Leaflet + affichage des sites.

## v0.1.0-mvp — 2026-05-25
- Initialisation du projet.
- Structure complète des dossiers.
- Architecture modulaire JS (config, state, utils, storage, vehicle-profile, energy-rules, trip-energy-estimator).
- index.html + styles.css (dark theme, responsive iPhone).
- manifest.json (PWA).
- .gitignore.
- Préparation architecture PWA offline-first.
