from database import get_db
from datetime import datetime

class Photo:
    @staticmethod
    def create(data):
        conn = get_db()
        conn.execute('''
            INSERT OR REPLACE INTO photos
            (id, filename, nas_path, thumbnail_path, lat, lon, site_id, site_name, taken_at, imported_at, size_bytes, mime_type, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            data['id'], data['filename'], data.get('nas_path'), data.get('thumbnail_path'),
            data.get('lat'), data.get('lon'), data.get('site_id'), data.get('site_name'),
            data.get('taken_at'), datetime.utcnow().isoformat(),
            data.get('size_bytes'), data.get('mime_type'), 'received'
        ))
        conn.commit()
        conn.close()

    @staticmethod
    def get_all(limit=200):
        conn = get_db()
        rows = conn.execute('SELECT * FROM photos ORDER BY created_at DESC LIMIT ?', (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def get_by_id(photo_id):
        conn = get_db()
        row = conn.execute('SELECT * FROM photos WHERE id = ?', (photo_id,)).fetchone()
        conn.close()
        return dict(row) if row else None
