from flask import Blueprint, jsonify
import shutil, os
from config import UPLOAD_DIR

health_bp = Blueprint('health', __name__)

@health_bp.route('/api/health')
def health():
    disk = shutil.disk_usage(str(UPLOAD_DIR))
    return jsonify({
        'status': 'ok',
        'version': '1.0.0',
        'storage': {
            'free_gb': round(disk.free / 1e9, 2),
            'total_gb': round(disk.total / 1e9, 2),
            'used_percent': round((disk.used / disk.total) * 100, 1)
        }
    })
