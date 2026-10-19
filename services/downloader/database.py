import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from services.downloader.config import config

class Database:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or config.DB_PATH
        self._local = threading.local()
        self._init_db()

    def get_connection(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self._local.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn

    def _init_db(self):
        conn = self.get_connection()
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    title TEXT NOT NULL,
                    thumbnail TEXT,
                    source TEXT,
                    format_id TEXT,
                    ext TEXT,
                    status TEXT NOT NULL,
                    progress REAL DEFAULT 0.0,
                    speed TEXT,
                    downloaded_bytes INTEGER DEFAULT 0,
                    total_bytes INTEGER DEFAULT 0,
                    eta TEXT,
                    output_path TEXT,
                    file_size INTEGER DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            # Initialize default settings if not exists
            defaults = {
                "download_dir": str(config.DEFAULT_DOWNLOAD_DIR),
                "max_concurrent": "3",
                "preferred_format": "best",
                "preferred_resolution": "1080p",
                "theme": "cream",
                "minimize_to_tray": "false",
                "notify_on_complete": "true"
            }
            for k, v in defaults.items():
                conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        cursor = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def list_jobs(self, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        if status:
            cursor = conn.execute(
                "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit)
            )
        else:
            cursor = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?",
                (limit,)
            )
        return [dict(row) for row in cursor.fetchall()]

    def create_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        job_data.setdefault("created_at", now)
        job_data.setdefault("updated_at", now)
        job_data.setdefault("progress", 0.0)
        job_data.setdefault("downloaded_bytes", 0)
        job_data.setdefault("total_bytes", 0)
        job_data.setdefault("speed", "")
        job_data.setdefault("eta", "")
        job_data.setdefault("output_path", "")
        job_data.setdefault("file_size", 0)
        job_data.setdefault("error_message", None)

        fields = [
            "id", "url", "title", "thumbnail", "source", "format_id", "ext",
            "status", "progress", "speed", "downloaded_bytes", "total_bytes",
            "eta", "output_path", "file_size", "error_message", "created_at", "updated_at"
        ]
        values = [job_data.get(f) for f in fields]
        placeholders = ", ".join(["?"] * len(fields))
        columns = ", ".join(fields)

        conn = self.get_connection()
        with conn:
            conn.execute(f"INSERT OR REPLACE INTO jobs ({columns}) VALUES ({placeholders})", values)

        return self.get_job(job_data["id"]) or job_data

    def update_job(self, job_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clauses = [f"{k} = ?" for k in updates.keys()]
        values = list(updates.values()) + [job_id]

        conn = self.get_connection()
        with conn:
            conn.execute(f"UPDATE jobs SET {', '.join(set_clauses)} WHERE id = ?", values)

        return self.get_job(job_id)

    def delete_job(self, job_id: str) -> bool:
        conn = self.get_connection()
        with conn:
            cursor = conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            return cursor.rowcount > 0

    def clear_history(self, keep_active: bool = True) -> int:
        conn = self.get_connection()
        with conn:
            if keep_active:
                cursor = conn.execute("DELETE FROM jobs WHERE status IN ('completed', 'failed', 'canceled')")
            else:
                cursor = conn.execute("DELETE FROM jobs")
            return cursor.rowcount

    def get_settings(self) -> Dict[str, str]:
        conn = self.get_connection()
        cursor = conn.execute("SELECT key, value FROM settings")
        return {row["key"]: row["value"] for row in cursor.fetchall()}

    def update_settings(self, new_settings: Dict[str, Any]):
        conn = self.get_connection()
        with conn:
            for k, v in new_settings.items():
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))

db = Database()
