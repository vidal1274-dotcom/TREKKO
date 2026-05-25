# Backend NAS — Mes Sorties Nîmes

## Lancement

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Éditer .env avec votre clé API
python app.py
```

## Endpoints

| Méthode | URL | Description |
|---------|-----|-------------|
| GET | /api/health | Statut serveur + espace disque |
| POST | /api/photos/upload | Upload photo avec métadonnées |
| GET | /api/photos | Liste des photos |
| GET | /api/sync/status | Statut synchronisation |

## Variables d'environnement

- `SORTIES_API_KEY` : clé API (vide = accès libre sur réseau local)
- `PORT` : port d'écoute (défaut 5000)
- `DEBUG` : mode debug Flask
- `MAX_PHOTO_MB` : taille max upload (défaut 20 Mo)

## Sécurité

- Ne jamais exposer sur Internet sans reverse proxy (nginx) + HTTPS
- Utiliser une clé API robuste en production
- Les uploads sont stockés dans `backend/uploads/`
- Les miniatures dans `backend/thumbnails/`
