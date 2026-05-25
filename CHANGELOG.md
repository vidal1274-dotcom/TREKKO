# Changelog — Mes Sorties Nîmes (Sortie_WE)

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
