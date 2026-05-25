#!/usr/bin/env python3
"""
Backend Flask NAS — Mes Sorties Nîmes
Gestion des photos géolocalisées avec stockage NAS.
Lancez avec : python app.py ou flask run
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from flask import Flask, request, jsonify
from flask_cors import CORS

from config import PORT, DEBUG, API_KEY
from database import init_db
from health_routes import health_bp
from photo_routes import photo_bp
from sync_routes import sync_bp

app = Flask(__name__)
CORS(app, resources={r'/api/*': {'origins': '*'}})

# -- Authentification API Key -----------------------------------------------
@app.before_request
def check_api_key():
    if request.path.startswith('/api/') and request.method != 'OPTIONS':
        if API_KEY:  # Uniquement si une clé est configurée
            key = request.headers.get('X-API-Key', '')
            if key != API_KEY:
                return jsonify({'error': 'Non autorisé'}), 401

# -- Routes -----------------------------------------------------------------
app.register_blueprint(health_bp)
app.register_blueprint(photo_bp)
app.register_blueprint(sync_bp)

@app.route('/')
def index():
    return jsonify({'name': 'Sorties Nîmes NAS API', 'version': '1.0.0', 'status': 'running'})

# -- Démarrage --------------------------------------------------------------
if __name__ == '__main__':
    init_db()
    print(f'[backend] Démarrage sur http://0.0.0.0:{PORT}')
    print(f'[backend] API Key configurée : {"OUI" if API_KEY else "NON (accès libre)"}')
    app.run(host='0.0.0.0', port=PORT, debug=DEBUG)
