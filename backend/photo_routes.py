from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from pathlib import Path
import uuid, os
from config import UPLOAD_DIR, THUMB_DIR, ALLOWED_EXTENSIONS, MAX_PHOTO_SIZE_MB
from models import Photo
from database import get_db

photo_bp = Blueprint('photos', __name__)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@photo_bp.route('/api/photos/upload', methods=['POST'])
def upload_photo():
    if 'file' not in request.files:
        return jsonify({'error': 'Fichier manquant'}), 400

    file = request.files['file']
    if not file.filename or not allowed_file(file.filename):
        return jsonify({'error': 'Format non autorisé'}), 400

    # Vérification taille
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_PHOTO_SIZE_MB * 1024 * 1024:
        return jsonify({'error': f'Fichier trop grand (max {MAX_PHOTO_SIZE_MB} Mo)'}), 413

    photo_id = request.form.get('photo_id') or str(uuid.uuid4())
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower()
    nas_filename = f"{photo_id}.{ext}"
    nas_path = UPLOAD_DIR / nas_filename
    file.save(str(nas_path))

    # Sauvegarde miniature si fournie
    thumb_path = None
    thumbnail_data = request.form.get('thumbnail')
    if thumbnail_data and thumbnail_data.startswith('data:image'):
        import base64
        try:
            header, data = thumbnail_data.split(',', 1)
            thumb_bytes = base64.b64decode(data)
            thumb_file = THUMB_DIR / f"{photo_id}_thumb.jpg"
            with open(str(thumb_file), 'wb') as f:
                f.write(thumb_bytes)
            thumb_path = str(thumb_file)
        except Exception:
            pass

    Photo.create({
        'id': photo_id,
        'filename': filename,
        'nas_path': str(nas_path),
        'thumbnail_path': thumb_path,
        'lat': request.form.get('lat') or None,
        'lon': request.form.get('lon') or None,
        'site_id': request.form.get('site_id') or None,
        'site_name': request.form.get('site_name') or None,
        'taken_at': request.form.get('taken_at') or None,
        'size_bytes': size,
        'mime_type': file.content_type
    })

    return jsonify({'status': 'ok', 'id': photo_id, 'path': str(nas_path)}), 201

@photo_bp.route('/api/photos', methods=['GET'])
def list_photos():
    photos = Photo.get_all()
    # Ne pas exposer les chemins absolus NAS
    safe = [{k: v for k, v in p.items() if k not in ('nas_path', 'thumbnail_path')} for p in photos]
    return jsonify(safe)
