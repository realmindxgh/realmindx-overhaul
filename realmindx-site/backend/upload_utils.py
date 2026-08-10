import os
import mimetypes
import shutil
import subprocess
import zipfile

from pathlib import Path
from uuid import uuid4

from flask import current_app
from PIL import Image, UnidentifiedImageError
from werkzeug.utils import secure_filename

from .extensions import db
from .models import UploadedFile


class UploadSecurityUnavailable(RuntimeError):
    """Raised when required malware scanning cannot safely complete."""


def malware_scanner_ready(config):
    """Return whether the configured clamd client and daemon are reachable."""
    if not config.get("UPLOAD_MALWARE_SCANNING_ENABLED", False):
        return True
    scanner = str(config.get("UPLOAD_MALWARE_SCANNER_PATH") or "").strip()
    executable = shutil.which(scanner) if scanner else None
    if not executable:
        return False
    try:
        result = subprocess.run(
            [executable, "--ping", "1:0"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _scan_upload_for_malware(target):
    if not current_app.config.get("UPLOAD_MALWARE_SCANNING_ENABLED", False):
        return

    scanner = str(current_app.config.get("UPLOAD_MALWARE_SCANNER_PATH") or "").strip()
    executable = shutil.which(scanner) if scanner else None
    if not executable:
        raise UploadSecurityUnavailable(
            "File security scanning is temporarily unavailable. Your file was not retained; please try again later."
        )

    timeout = max(1, int(current_app.config.get("UPLOAD_MALWARE_SCAN_TIMEOUT_SECONDS", 30)))
    try:
        result = subprocess.run(
            [executable, "--no-summary", "--fdpass", str(target)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise UploadSecurityUnavailable(
            "File security scanning is temporarily unavailable. Your file was not retained; please try again later."
        ) from None

    if result.returncode == 1:
        raise ValueError(
            "For your security, this file was rejected by our malware scanner. "
            "Check it with antivirus software or export a fresh copy, then try again."
        )
    if result.returncode != 0:
        raise UploadSecurityUnavailable(
            "File security scanning is temporarily unavailable. Your file was not retained; please try again later."
        )


def allowed_file(filename, category):
    if "." not in filename:
        return False
    extension = filename.rsplit(".", 1)[1].lower()
    allowed = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"].get(category, set())
    return extension in allowed


def save_upload(file_storage, category, owner_id=None, visibility="protected"):
    if not file_storage or not file_storage.filename:
        raise ValueError("No file supplied.")
    categories = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"]
    if category not in categories:
        raise ValueError("Unsupported upload category.")
    if visibility not in {"public", "protected"}:
        raise ValueError("Unsupported upload visibility.")
    allowed = categories.get(category, set())
    if not allowed_file(file_storage.filename, category):
        supported = ", ".join(sorted(ext.upper() for ext in allowed)) or "no file types"
        raise ValueError(f"Unsupported file type. Supported types: {supported}.")

    safe_name = secure_filename(file_storage.filename)
    extension = safe_name.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid4().hex}.{extension}"
    upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    root = (upload_root / visibility / category).resolve()
    try:
        root.relative_to(upload_root)
    except ValueError:
        raise ValueError("Invalid upload destination.") from None
    root.mkdir(parents=True, exist_ok=True)
    target = root / stored_name
    file_storage.save(target)

    size_bytes = target.stat().st_size
    global_max_bytes = int(current_app.config.get("MAX_UPLOAD_FILE_BYTES", 100 * 1024 * 1024))
    category_max_bytes = int(
        (current_app.config.get("UPLOAD_CATEGORY_MAX_BYTES") or {}).get(category, global_max_bytes)
    )
    max_bytes = min(global_max_bytes, category_max_bytes)
    try:
        if size_bytes == 0:
            raise ValueError("The selected file is empty. Choose a file that contains data.")
        if size_bytes > max_bytes:
            raise ValueError(f"The file is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.")
        if extension in {"jpg", "jpeg", "png", "webp"}:
            try:
                with Image.open(target) as image:
                    image.verify()
            except (Image.DecompressionBombError, UnidentifiedImageError, OSError):
                raise ValueError("This is not a valid image file. Export it again and try uploading it.") from None
        elif extension == "pdf":
            with target.open("rb") as handle:
                if handle.read(5) != b"%PDF-":
                    raise ValueError("This is not a valid PDF file. Re-save or export it as PDF and try again.")
        elif extension == "docx":
            try:
                with zipfile.ZipFile(target) as archive:
                    entries = archive.infolist()
                    if len(entries) > 2_000 or sum(entry.file_size for entry in entries) > max_bytes:
                        raise ValueError
                    names = {entry.filename for entry in entries}
                    if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                        raise ValueError
            except (zipfile.BadZipFile, ValueError):
                raise ValueError("This DOCX is damaged or is not a valid Word document. Re-save it in Word and try again.") from None
        _scan_upload_for_malware(target)
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
        mime_type=mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
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

