import sqlite3
from config import DB_PATH

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            nas_path TEXT,
            thumbnail_path TEXT,
            lat REAL,
            lon REAL,
            site_id TEXT,
            site_name TEXT,
            taken_at TEXT,
            imported_at TEXT,
            size_bytes INTEGER,
            mime_type TEXT,
            sync_status TEXT DEFAULT 'received',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_photos_site ON photos(site_id);
        CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(sync_status);
    ''')
    conn.commit()
    conn.close()
    print('[db] Base de données initialisée')
