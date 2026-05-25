# Configuration backend NAS — ne jamais mettre de clés en dur
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / 'uploads'
THUMB_DIR = BASE_DIR / 'thumbnails'
DB_PATH = BASE_DIR / 'sorties.db'

UPLOAD_DIR.mkdir(exist_ok=True)
THUMB_DIR.mkdir(exist_ok=True)

API_KEY = os.environ.get('SORTIES_API_KEY', '')  # À définir dans .env
MAX_PHOTO_SIZE_MB = int(os.environ.get('MAX_PHOTO_MB', '20'))
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'}
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
PORT = int(os.environ.get('PORT', '5000'))
