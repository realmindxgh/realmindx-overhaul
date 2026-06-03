"""
Automated backup to Google Drive.

Usage (run from realmindx-site/):
    python -m flask --app backend:create_app backup-db
    python -m flask --app backend:create_app backup-uploads
    python -m flask --app backend:create_app backup-all

On the VPS, add to crontab (daily at 2am):
    0 2 * * * cd /path/to/realmindx-overhaul/realmindx-site && .venv/bin/python -m flask --app backend:create_app backup-all >> /var/log/realmindx-backup.log 2>&1

Requires:
    pip install google-api-python-client google-auth
    GOOGLE_DRIVE_CREDENTIALS_JSON = path to your service account JSON file
    GOOGLE_DRIVE_FOLDER_ID         = the Drive folder ID to upload backups into
"""

import io
import os
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path

from flask import current_app


def _drive_service():
    """Return an authenticated Google Drive API service, or None if not configured."""
    creds_path = current_app.config.get("GOOGLE_DRIVE_CREDENTIALS_JSON", "")
    if not creds_path or not Path(creds_path).exists():
        current_app.logger.warning("[backup] GOOGLE_DRIVE_CREDENTIALS_JSON not set or file not found.")
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=["https://www.googleapis.com/auth/drive"]
        )
        return build("drive", "v3", credentials=creds, cache_discovery=False)
    except ImportError:
        current_app.logger.warning("[backup] google-api-python-client not installed. Run: pip install google-api-python-client google-auth")
        return None
    except Exception as exc:
        current_app.logger.error("[backup] Could not build Drive service: %s", exc)
        return None


def _upload_to_drive(service, local_path: str, filename: str, folder_id: str):
    from googleapiclient.http import MediaFileUpload
    meta = {"name": filename, "parents": [folder_id]}
    mime = "application/zip" if filename.endswith(".zip") else "application/octet-stream"
    media = MediaFileUpload(local_path, mimetype=mime, resumable=True)
    file = service.files().create(body=meta, media_body=media, fields="id,name").execute()
    current_app.logger.info("[backup] Uploaded %s to Drive (id=%s)", file["name"], file["id"])
    return file


def backup_database():
    """Dump the PostgreSQL database and upload to Google Drive."""
    service = _drive_service()
    folder_id = current_app.config.get("GOOGLE_DRIVE_FOLDER_ID", "")
    if not service or not folder_id:
        current_app.logger.warning("[backup] Skipping DB backup: Drive not configured.")
        return False

    db_url = current_app.config["SQLALCHEMY_DATABASE_URI"]
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dump_file = f"/tmp/realmindx_db_{ts}.sql"
    zip_file = f"/tmp/realmindx_db_{ts}.zip"

    try:
        # Build pg_dump command from database URL
        import urllib.parse
        parsed = urllib.parse.urlparse(db_url.replace("postgresql+psycopg://", "postgresql://"))
        env = os.environ.copy()
        env["PGPASSWORD"] = parsed.password or ""
        cmd = [
            "pg_dump",
            "-h", parsed.hostname or "127.0.0.1",
            "-p", str(parsed.port or 5432),
            "-U", parsed.username or "postgres",
            "-d", parsed.path.lstrip("/"),
            "-f", dump_file,
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            current_app.logger.error("[backup] pg_dump failed: %s", result.stderr)
            return False

        with zipfile.ZipFile(zip_file, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(dump_file, os.path.basename(dump_file))

        _upload_to_drive(service, zip_file, f"realmindx_db_{ts}.zip", folder_id)
        return True
    except Exception as exc:
        current_app.logger.error("[backup] Database backup failed: %s", exc)
        return False
    finally:
        for f in [dump_file, zip_file]:
            try: os.unlink(f)
            except FileNotFoundError: pass


def backup_uploads():
    """Zip the uploads folder and upload to Google Drive."""
    service = _drive_service()
    folder_id = current_app.config.get("GOOGLE_DRIVE_FOLDER_ID", "")
    if not service or not folder_id:
        current_app.logger.warning("[backup] Skipping uploads backup: Drive not configured.")
        return False

    upload_folder = current_app.config.get("UPLOAD_FOLDER", "")
    if not upload_folder or not Path(upload_folder).exists():
        current_app.logger.warning("[backup] UPLOAD_FOLDER not found: %s", upload_folder)
        return False

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    zip_file = f"/tmp/realmindx_uploads_{ts}.zip"
    try:
        with zipfile.ZipFile(zip_file, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(upload_folder):
                for file in files:
                    full = os.path.join(root, file)
                    arc = os.path.relpath(full, upload_folder)
                    z.write(full, arc)
        _upload_to_drive(service, zip_file, f"realmindx_uploads_{ts}.zip", folder_id)
        return True
    except Exception as exc:
        current_app.logger.error("[backup] Uploads backup failed: %s", exc)
        return False
    finally:
        try: os.unlink(zip_file)
        except FileNotFoundError: pass


def register_backup_commands(app):
    import click

    @app.cli.command("backup-db")
    def backup_db_command():
        """Backup PostgreSQL database to Google Drive."""
        ok = backup_database()
        click.echo("Database backup: " + ("OK" if ok else "FAILED — check logs"))

    @app.cli.command("backup-uploads")
    def backup_uploads_command():
        """Backup uploads folder to Google Drive."""
        ok = backup_uploads()
        click.echo("Uploads backup: " + ("OK" if ok else "FAILED — check logs"))

    @app.cli.command("backup-all")
    def backup_all_command():
        """Backup both database and uploads to Google Drive."""
        db_ok = backup_database()
        up_ok = backup_uploads()
        click.echo(f"DB: {'OK' if db_ok else 'FAILED'}  Uploads: {'OK' if up_ok else 'FAILED'}")
