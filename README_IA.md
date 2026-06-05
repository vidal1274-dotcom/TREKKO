# TREKKO — Circuit IA avec OpenAI

## Architecture sécurisée
La clé API OpenAI est lue côté serveur depuis un fichier `.env`.
Elle n'est jamais exposée dans le navigateur, dans localStorage, ni dans le code source.

## Prérequis
- Node.js v18+
- Une clé API OpenAI (https://platform.openai.com/api-keys)
- ⚠️ L'API OpenAI est facturée séparément de ChatGPT Plus/Pro.

## Configurer la clé API
1. Copier le fichier exemple : `cp .env.example .env`
2. Ouvrir `.env` et renseigner votre clé : `OPENAI_API_KEY=sk-...`
3. Ne jamais commiter `.env`

## Lancer le backend
```bash
cd server
npm install
npm start
```
Le backend démarre sur http://localhost:3001

## Lancer le frontend Trekko
```bash
# Depuis la racine du projet
python -m http.server 8000
```
Ouvrir http://localhost:8000

## Tester la connexion
Dans Trekko → Paramètres → IA → cliquer "Tester la connexion".

## Modèles disponibles
- `gpt-4o-mini` : rapide et économique (recommandé)
- `gpt-4o` : plus puissant (~10x plus cher)

## Limites
- La génération d'un circuit coûte ~0.01-0.05€ selon le modèle
- Les informations générées sont indicatives — toujours vérifier avant le départ
- Le mode offline fonctionne après sauvegarde locale du circuit
