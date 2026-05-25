# Mes Sorties Nîmes — Sortie_WE

**Application PWA de préparation de sorties week-end autour de Nîmes**

> Offline-first · Calcul coût énergie · Économie financière · Photos NAS · Carte interactive

---

## Objectif du projet

Mes Sorties Nîmes est une application web progressive (PWA) conçue pour explorer, comparer et préparer des sorties week-end au départ de Nîmes / Uchaud. Elle fonctionne entièrement hors ligne sur mobile (iPhone), calcule le coût énergétique réel du trajet selon votre véhicule (thermique ou électrique), compare les deux scénarios, et permet de stocker des photos géolocalisées sur un NAS personnel via un backend Flask.

---

## Structure des dossiers

```
Sortie_WE/
├── index.html              # Application principale (SPA)
├── manifest.json           # Manifest PWA
├── service-worker.js       # Cache offline
├── styles.css              # Thème dark, responsive iPhone
├── sites.json              # Base des sites (générée depuis Excel)
├── VERSION                 # Version courante
├── CHANGELOG.md            # Historique des versions
│
├── js/                     # Modules JavaScript
│   ├── config.js           # Configuration globale
│   ├── state.js            # Gestion d'état central
│   ├── utils.js            # Utilitaires
│   ├── storage.js          # IndexedDB / localStorage
│   ├── vehicle-profile.js  # Profil véhicule thermique/électrique
│   ├── energy-rules.js     # Règles de calcul énergie
│   └── trip-energy-estimator.js  # Estimateur coût trajet
│
├── assets/                 # Icônes, images statiques
│
├── backend/                # Backend Flask (NAS)
│   ├── app.py              # Point d'entrée Flask
│   ├── config.py           # Configuration (variables d'env)
│   ├── database.py         # SQLite init et connexion
│   ├── models.py           # Modèle Photo
│   ├── health_routes.py    # GET /api/health
│   ├── photo_routes.py     # POST /api/photos/upload, GET /api/photos
│   ├── sync_routes.py      # GET /api/sync/status
│   ├── requirements.txt    # Dépendances Python
│   ├── .env.example        # Variables d'environnement (modèle)
│   ├── uploads/            # Photos stockées (créé automatiquement)
│   └── thumbnails/         # Miniatures (créé automatiquement)
│
├── tools/                  # Outils de conversion
│   └── convert_excel_to_json.py  # Excel → sites.json
│
├── data/                   # Données source (Excel, CSV GPS)
│   └── 100_idees_sorties_weekends_depuis_Uchaud.xlsx
│
└── scripts/                # Scripts utilitaires (déploiement, etc.)
```

---

## Lancer le frontend

```bash
cd C:\WORK\Sortie_WE
python -m http.server 8000
```

Puis ouvrir : http://localhost:8000

Sur iPhone (même réseau Wi-Fi) : http://192.168.x.x:8000

---

## Lancer le backend Flask

```bash
cd C:\WORK\Sortie_WE\backend
pip install -r requirements.txt
cp .env.example .env
# Éditer .env : renseigner SORTIES_API_KEY
python app.py
```

Le backend démarre sur http://0.0.0.0:5000

### Endpoints disponibles

| Méthode | URL | Description |
|---------|-----|-------------|
| GET | / | Info API |
| GET | /api/health | Statut + espace disque |
| POST | /api/photos/upload | Upload photo + métadonnées |
| GET | /api/photos | Liste des photos (sans chemins NAS) |
| GET | /api/sync/status | Statut synchronisation |

---

## Profil véhicule thermique / électrique

L'application gère deux profils de véhicule configurables :

**Véhicule thermique**
- Consommation en L/100 km (ex : 6.5 L)
- Prix du carburant au litre (ex : 1.85 €)
- Calcul automatique : distance × consommation × prix

**Véhicule électrique**
- Consommation en kWh/100 km (ex : 18 kWh)
- Prix du kWh (recharge domicile ou borne)
- Prise en compte du profil de conduite (autoroute, mixte, ville)

Le profil est sauvegardé localement (localStorage) et persiste entre les sessions.

---

## Calcul carburant / recharge

Pour chaque sortie, l'estimateur calcule :

```
Coût thermique  = distance_aller_retour × (consommation / 100) × prix_litre
Coût électrique = distance_aller_retour × (conso_kwh / 100) × prix_kwh
```

La distance est calculée à vol d'oiseau depuis les coordonnées GPS du site, avec un coefficient de route appliqué (×1.25 par défaut pour tenir compte du tracé réel).

---

## Comparaison thermique / électrique

L'application affiche côte à côte :

- Coût du trajet en thermique (€)
- Coût du trajet en électrique (€)
- Économie réalisée en électrique (€ et %)
- CO2 évité estimé (kg)

Les prix sont indicatifs et basés sur les valeurs saisies dans le profil véhicule. Ils varient selon le marché.

---

## Pourquoi les prix sont "à vérifier"

Les prix des entrées, hébergements et activités affichés proviennent du fichier Excel source (saisi manuellement). Ils sont susceptibles d'évoluer. L'application affiche systématiquement la mention "prix à vérifier" et invite l'utilisateur à consulter le site officiel du lieu avant de partir.

---

## Mode offline / réseau adaptatif

L'application est offline-first :

- Le Service Worker met en cache les ressources statiques (HTML, CSS, JS, sites.json)
- La carte et les données de sites sont disponibles sans connexion
- Les photos prises sur place sont stockées en IndexedDB en attente de synchronisation
- Quand le réseau est détecté, la synchronisation vers le NAS se déclenche automatiquement
- Un indicateur de statut réseau est affiché dans l'interface

---

## Photos géolocalisées / sync NAS

Le flux de synchronisation des photos :

1. L'utilisateur prend une photo depuis l'app (ou sélectionne depuis la galerie)
2. La photo est compressée côté client et stockée en IndexedDB avec ses métadonnées GPS
3. Lors de la connexion réseau, l'app envoie la photo au backend Flask via `POST /api/photos/upload`
4. Le backend stocke la photo dans `backend/uploads/` et la miniature dans `backend/thumbnails/`
5. Les métadonnées (GPS, site, date) sont enregistrées en SQLite (`sorties.db`)
6. L'app reçoit confirmation (`sync_status: received`) et marque la photo comme synchronisée

La clé API (`X-API-Key`) protège les uploads sur le réseau local.

---

## Moteur surprise / économie

Le mode "Surprise" sélectionne aléatoirement une sortie parmi les sites marqués `selection_perso: true`, en appliquant les filtres actifs (budget max, distance max, sans péage, gratuit). Il permet de découvrir des destinations sans avoir à chercher.

Le moteur d'économie trie les sites par coût total estimé (trajet + entrées) du moins cher au plus cher, et met en avant les sites gratuits, sans péage, et à moins de 45 min de route.

---

## Convertir le fichier Excel en sites.json

```bash
# Avec le fichier Excel par défaut dans data/
python tools/convert_excel_to_json.py

# Avec un fichier personnalisé
python tools/convert_excel_to_json.py --input data/mon_fichier.xlsx --output sites.json

# Dépendance requise
pip install openpyxl
```

Le script génère :
- `sites.json` : liste complète des sites au format JSON
- `data/coordonnees_a_completer.csv` : sites sans coordonnées GPS à compléter

---

## Installer la PWA sur iPhone

1. Ouvrir Safari sur l'URL de l'app (réseau local ou domaine)
2. Appuyer sur l'icône Partager (carré avec flèche)
3. Choisir "Sur l'écran d'accueil"
4. Valider — l'app apparaît comme une application native
5. L'app fonctionne ensuite hors ligne

---

## Variables d'environnement backend

| Variable | Défaut | Description |
|----------|--------|-------------|
| `SORTIES_API_KEY` | _(vide)_ | Clé API (vide = accès libre) |
| `PORT` | `5000` | Port d'écoute Flask |
| `DEBUG` | `false` | Mode debug Flask |
| `MAX_PHOTO_MB` | `20` | Taille max upload photo (Mo) |

---

## Tags git disponibles

| Tag | Description |
|-----|-------------|
| `v0.1.0-mvp` | Initialisation — structure complète, architecture JS modulaire |
| `v0.2.0-dashboard-map` | Dashboard + carte Leaflet |
| `v0.3.0-global-search` | Recherche globale et filtres intelligents |
| `v0.4.0-budget-engine` | Budget estimatif et coût trajet |
| `v0.5.0-vehicle-energy-cost` | Calcul énergie thermique / électrique |
| `v0.6.0-economy-search` | Recherche orientée économie, badges |
| `v0.7.0-external-insights` | Retours visiteurs, score fiabilité |
| `v0.8.0-photo-local-storage` | Photos géolocalisées IndexedDB |
| `v0.9.0-nas-sync` | Synchronisation NAS Flask/SQLite |
| `v1.0.0-stable-mvp` | Version MVP stable et complète |

---

## Sécurité

- Le backend Flask ne doit jamais être exposé directement sur Internet
- En production, utiliser un reverse proxy nginx avec HTTPS
- La clé API doit être robuste (min. 32 caractères aléatoires)
- Les chemins NAS absolus ne sont jamais renvoyés par l'API
- Le fichier `.env` est exclu du dépôt git (`.gitignore`)

---

## Version courante

Voir le fichier `VERSION` et `CHANGELOG.md` pour l'historique complet.
