import os

from pathlib import Path
from uuid import uuid4

from flask import current_app
from werkzeug.utils import secure_filename

from .extensions import db
from .models import UploadedFile


def allowed_file(filename, category):
    if "." not in filename:
        return False
    extension = filename.rsplit(".", 1)[1].lower()
    allowed = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"].get(category, set())
    return extension in allowed


def save_upload(file_storage, category, owner_id=None, visibility="protected"):
    if not file_storage or not file_storage.filename:
        raise ValueError("No file supplied.")
    if not allowed_file(file_storage.filename, category):
        raise ValueError("Unsupported file type.")

    safe_name = secure_filename(file_storage.filename)
    extension = safe_name.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid4().hex}.{extension}"
    root = Path(current_app.config["UPLOAD_FOLDER"]) / visibility / category
    root.mkdir(parents=True, exist_ok=True)
    target = root / stored_name
    file_storage.save(target)

    uploaded = UploadedFile(
        owner_id=owner_id,
        original_filename=safe_name,
        stored_filename=stored_name,
        storage_path=str(target),
        mime_type=file_storage.mimetype,
        size_bytes=target.stat().st_size,
        category=category,
        visibility=visibility,
    )
    db.session.add(uploaded)
    return uploaded


def delete_uploaded_file_physical(uploaded_file):
    """Remove the physical file from disk for a given UploadedFile row.

    Does not delete the DB row — the caller is responsible for that.
    Silently succeeds if the file does not exist on disk.
    """
    if not uploaded_file:
        return
    try:
        path = uploaded_file.storage_path
        if path and os.path.isfile(path):
            os.remove(path)
    except OSError:
        current_app.logger.warning("Could not remove physical file: %s", uploaded_file.storage_path)

