# Changelog â€” Mes Sorties NÃ®mes (Sortie_WE)

## v1.2.0-builtin-dataset â€” 2026-05-25
- Dataset intÃ©grÃ© : 30 sites rÃ©els autour de NÃ®mes avec GPS complets.
- Aucune dÃ©pendance Ã  un fichier Excel â€” app 100% autonome.
- Sites couvrant : villages/marchÃ©s, nature/randonnÃ©e, mer/plage, patrimoine, grottes, caves.
- Distances de 8 km (Gallargues) Ã  80 km (Cirque de Navacelles).
- Git Graph installÃ© dans VS Code (.vscode/extensions.json).

## v1.0.0-stable-mvp â€” 2026-05-25
- Version MVP stable et complÃ¨te.
- 36 modules JavaScript modulaires (ESM).
- Carte Leaflet interactive (OpenStreetMap).
- Profil vÃ©hicule thermique / Ã©lectrique / hybride.
- Calcul coÃ»t Ã©nergie trajet (carburant ou recharge) avec marge de sÃ©curitÃ©.
- Comparaison thermique / Ã©lectrique tous scÃ©narios.
- Moteur Ã©conomie financiÃ¨re + score Ã©co 0-100.
- Barre de recherche globale intelligente (gratuit, sans pÃ©age, < Xâ‚¬, < X km...).
- Budget estimatif complet (trajet + pÃ©age + parking + visites + repas).
- Retours visiteurs : liens lÃ©gaux vers sources publiques.
- Score de fiabilitÃ© des informations.
- Moteur "Me surprendre" avec critÃ¨res Ã©conomiques.
- Programme de journÃ©e exportable.
- Photos gÃ©olocalisÃ©es EXIF + stockage IndexedDB (aucune perte).
- Sync NAS avec file d'attente persistante + retry.
- Backend Flask NAS (SQLite, upload photos, health check).
- Gestion rÃ©seau adaptative (offline / 2G / 3G / 4G / WiFi-5G).
- PWA offline-first (Service Worker cache-first).
- Convertisseur Excel â†’ JSON (tools/convert_excel_to_json.py).
- Script release PowerShell (scripts/git-release.ps1).
- Support iPhone Safari + PC Chrome/Edge.

## v0.9.0-nas-sync _(Ã  venir)_
- Synchronisation photos vers NAS Flask/SQLite.

## v0.8.0-photo-local-storage _(Ã  venir)_
- Photos gÃ©olocalisÃ©es stockÃ©es localement (IndexedDB).

## v0.7.0-external-insights _(Ã  venir)_
- Retours visiteurs / liens de recherche publics / score fiabilitÃ©.

## v0.6.0-economy-search _(Ã  venir)_
- Recherche orientÃ©e Ã©conomie financiÃ¨re.
- Badges : gratuit, sans pÃ©age, proche, trajet Ã©conomique.

## v0.5.0-vehicle-energy-cost _(Ã  venir)_
- Calcul Ã©nergie vÃ©hicule Ã©lectrique / thermique.
- Comparaison tous scÃ©narios.

## v0.4.0-budget-engine _(Ã  venir)_
- Budget estimatif global.
- CoÃ»t trajet intÃ©grÃ©.

## v0.3.0-global-search _(Ã  venir)_
- Barre de recherche globale.
- Filtres intelligents (sans pÃ©age, gratuit, moins de Xâ‚¬...).

## v0.2.0-dashboard-map _(Ã  venir)_
- Dashboard + carte Leaflet + affichage des sites.

## v0.1.0-mvp â€” 2026-05-25
- Initialisation du projet.
- Structure complÃ¨te des dossiers.
- Architecture modulaire JS (config, state, utils, storage, vehicle-profile, energy-rules, trip-energy-estimator).
- index.html + styles.css (dark theme, responsive iPhone).
- manifest.json (PWA).
- .gitignore.
- PrÃ©paration architecture PWA offline-first.

