from flask import Blueprint, jsonify, request
from models import Photo

sync_bp = Blueprint('sync', __name__)

@sync_bp.route('/api/sync/status', methods=['GET'])
def sync_status():
    photos = Photo.get_all()
    return jsonify({
        'total': len(photos),
        'received': len([p for p in photos if p['sync_status'] == 'received']),
        'ok': True
    })
