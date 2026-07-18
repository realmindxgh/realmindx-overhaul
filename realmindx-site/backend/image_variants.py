from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from typing import Iterable

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError

from .extensions import db
from .models import Product, UploadedFile


@dataclass(frozen=True)
class ImageVariantSpec:
    key: str
    width: int
    quality: int
    product_field: str


PRODUCT_IMAGE_VARIANTS = (
    ImageVariantSpec("thumb", 400, 78, "image_thumb_file_id"),
    ImageVariantSpec("medium", 1200, 82, "image_medium_file_id"),
)


def upload_public_url(uploaded_file: UploadedFile | None) -> str | None:
    if not uploaded_file:
        return None
    return f"/uploads/{uploaded_file.visibility}/{uploaded_file.category}/{uploaded_file.stored_filename}"


def _upload_root() -> Path:
    return Path(current_app.config["UPLOAD_FOLDER"])


def resolve_uploaded_path(uploaded_file: UploadedFile | None) -> Path | None:
    if not uploaded_file:
        return None
    upload_root = _upload_root()
    candidates = []
    if uploaded_file.storage_path:
        stored_path = Path(uploaded_file.storage_path)
        candidates.append(stored_path if stored_path.is_absolute() else upload_root / stored_path)
    if uploaded_file.visibility and uploaded_file.category and uploaded_file.stored_filename:
        candidates.append(upload_root / uploaded_file.visibility / uploaded_file.category / uploaded_file.stored_filename)
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            resolved = candidate
        try:
            if resolved.is_file() and resolved.stat().st_size > 0:
                return resolved
        except OSError:
            continue
    return None


def uploaded_file_exists(uploaded_file: UploadedFile | None) -> bool:
    return resolve_uploaded_path(uploaded_file) is not None


def _source_file(product: Product) -> UploadedFile | None:
    source_id = product.image_original_file_id or product.image_file_id
    return db.session.get(UploadedFile, source_id) if source_id else None


def _variant_file(product: Product, spec: ImageVariantSpec) -> UploadedFile | None:
    file_id = getattr(product, spec.product_field, None)
    return db.session.get(UploadedFile, file_id) if file_id else None


def product_image_variant_status(product: Product) -> dict:
    source = _source_file(product)
    source_path = resolve_uploaded_path(source)
    missing = []
    existing = []
    for spec in PRODUCT_IMAGE_VARIANTS:
        uploaded = _variant_file(product, spec)
        if uploaded_file_exists(uploaded):
            existing.append(spec.key)
        else:
            missing.append(spec.key)
    return {
        "product_id": product.id,
        "source_id": source.id if source else None,
        "source_exists": source_path is not None,
        "missing": missing,
        "existing": existing,
    }


def _normalised_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in {"RGBA", "LA"} or ("transparency" in image.info)
    return image.convert("RGBA" if has_alpha else "RGB")


def _resized_copy(image: Image.Image, max_width: int) -> Image.Image:
    image = _normalised_image(image)
    if image.width <= max_width:
        return image.copy()
    ratio = max_width / float(image.width)
    target_height = max(1, round(image.height * ratio))
    return image.resize((max_width, target_height), Image.Resampling.LANCZOS)


def _safe_stem(uploaded_file: UploadedFile) -> str:
    name = Path(uploaded_file.original_filename or uploaded_file.stored_filename or "product").stem
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in name).strip("-")
    return (cleaned or "product")[:70]


def _write_webp_variant(source: UploadedFile, source_path: Path, spec: ImageVariantSpec, owner_id: int | None) -> UploadedFile:
    with Image.open(source_path) as image:
        variant = _resized_copy(image, spec.width)
        output = BytesIO()
        variant.save(output, format="WEBP", quality=spec.quality, method=6)
    data = output.getvalue()
    digest = sha256(data).hexdigest()[:16]
    stored_name = f"{_safe_stem(source)}-{spec.key}-{digest}.webp"
    root = _upload_root() / "public" / "images"
    root.mkdir(parents=True, exist_ok=True)
    target = root / stored_name
    if not target.exists():
        target.write_bytes(data)

    existing = UploadedFile.query.filter_by(
        stored_filename=stored_name,
        category="images",
        visibility="public",
    ).first()
    if existing and uploaded_file_exists(existing):
        return existing

    uploaded = UploadedFile(
        owner_id=owner_id if owner_id is not None else source.owner_id,
        original_filename=f"{Path(source.original_filename or source.stored_filename).stem}-{spec.key}.webp",
        stored_filename=stored_name,
        storage_path=str(target),
        mime_type="image/webp",
        size_bytes=target.stat().st_size,
        category="images",
        visibility="public",
    )
    db.session.add(uploaded)
    db.session.flush()
    return uploaded


def reset_product_image_variants(product: Product) -> None:
    product.image_original_file_id = product.image_file_id
    product.image_thumb_file_id = None
    product.image_medium_file_id = None


def ensure_product_image_variants(
    product: Product,
    *,
    owner_id: int | None = None,
    only: Iterable[str] | None = None,
    force: bool = False,
) -> dict:
    if product.image_file_id and not product.image_original_file_id:
        product.image_original_file_id = product.image_file_id

    source = _source_file(product)
    source_path = resolve_uploaded_path(source)
    if not source or not source_path:
        return {
            "product_id": product.id,
            "status": "missing_source",
            "created": [],
            "skipped": [],
            "error": "Original product image file is missing.",
        }

    wanted = set(only or [spec.key for spec in PRODUCT_IMAGE_VARIANTS])
    created = []
    skipped = []
    try:
        for spec in PRODUCT_IMAGE_VARIANTS:
            if spec.key not in wanted:
                continue
            current = _variant_file(product, spec)
            if not force and uploaded_file_exists(current):
                skipped.append(spec.key)
                continue
            variant = _write_webp_variant(source, source_path, spec, owner_id)
            setattr(product, spec.product_field, variant.id)
            created.append(spec.key)
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        current_app.logger.warning(
            "Could not generate product image variants for product %s: %s",
            product.id,
            exc,
        )
        return {
            "product_id": product.id,
            "status": "failed",
            "created": created,
            "skipped": skipped,
            "error": str(exc),
        }

    return {
        "product_id": product.id,
        "status": "ok",
        "created": created,
        "skipped": skipped,
        "error": None,
    }
