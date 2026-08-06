import os
import zipfile

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
    allowed = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"].get(category, set())
    if not allowed_file(file_storage.filename, category):
        supported = ", ".join(sorted(ext.upper() for ext in allowed)) or "no file types"
        raise ValueError(f"Unsupported file type. Supported types: {supported}.")

    safe_name = secure_filename(file_storage.filename)
    extension = safe_name.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid4().hex}.{extension}"
    root = Path(current_app.config["UPLOAD_FOLDER"]) / visibility / category
    root.mkdir(parents=True, exist_ok=True)
    target = root / stored_name
    file_storage.save(target)

    size_bytes = target.stat().st_size
    max_bytes = int(current_app.config.get("MAX_UPLOAD_FILE_BYTES", 100 * 1024 * 1024))
    try:
        if size_bytes == 0:
            raise ValueError("The selected file is empty. Choose a file that contains data.")
        if size_bytes > max_bytes:
            raise ValueError(f"The file is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.")
        if extension == "pdf":
            with target.open("rb") as handle:
                if handle.read(5) != b"%PDF-":
                    raise ValueError("This is not a valid PDF file. Re-save or export it as PDF and try again.")
        elif extension == "docx":
            try:
                with zipfile.ZipFile(target) as archive:
                    names = set(archive.namelist())
                    if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                        raise ValueError
            except (zipfile.BadZipFile, ValueError):
                raise ValueError("This DOCX is damaged or is not a valid Word document. Re-save it in Word and try again.") from None
    except Exception:
        try:
            target.unlink(missing_ok=True)
        finally:
            raise

    uploaded = UploadedFile(
        owner_id=owner_id,
        original_filename=safe_name,
        stored_filename=stored_name,
        storage_path=str(target),
        mime_type=file_storage.mimetype,
        size_bytes=size_bytes,
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

