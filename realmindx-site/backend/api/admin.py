import csv
import io
import mimetypes
import re
import secrets
import zipfile
from datetime import date, datetime, timezone
from html import escape
from pathlib import Path
from threading import Thread
from types import SimpleNamespace
from uuid import uuid4

from flask import Blueprint, Response, current_app, jsonify, request, send_file
from flask_login import current_user, login_required
from sqlalchemy import func
from werkzeug.utils import secure_filename

from ..default_content import (
    DEFAULT_DONATION_SLIDES,
    DEFAULT_HOME_HERO_SLIDES,
    DEFAULT_PARTNERS,
    DEFAULT_PEOPLE,
    DEFAULT_SERVICES,
    DEFAULT_SITE_COPY,
    DEFAULT_TESTIMONIALS,
)
from ..email_service import OutboundEmail, app_email_shell, bookshop_email_shell, send_email
from ..extensions import db
from ..location_data import parse_location_ids
from ..models import (
    AuditLog,
    ContactMessage,
    DeliveryZone,
    Flyer,
    Job,
    JobAlertPreference,
    JobApplication,
    NewsletterSubscriber,
    News,
    Order,
    Permission,
    Product,
    ProductCategory,
    ProductReview,
    Resource,
    Role,
    GalleryItem,
    User,
    UserProfile,
    SiteSetting,
    UploadedFile,
)
from ..security import admin_or_staff_required, admin_required, permission_required
from ..serializers import delivery_zone_json, job_json, order_json, product_json, user_json
from ..upload_utils import save_upload

admin_bp = Blueprint("admin", __name__)


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "item"


def log_action(action, entity_type=None, entity_id=None, metadata=None):
    """Backward-compat wrapper — delegates to the shared audit() helper."""
    from ..audit import audit as _audit
    _audit(action, entity_type, entity_id, metadata)


def _run_in_background(task_name, func, *args):
    app = current_app._get_current_object()

    def runner():
        with app.app_context():
            try:
                func(*args)
            except Exception:
                app.logger.exception("%s failed.", task_name)

    Thread(target=runner, daemon=True).start()


def _order_contact_snapshot(order):
    return SimpleNamespace(
        order_reference=order.order_reference,
        customer_name=order.customer_name,
        email=order.email,
        phone=order.phone,
    )


def _collection_item_id(item):
    if not isinstance(item, dict):
        return ""
    return str(item.get("id") or item.get("key") or "")


def _deleted_collection_setting_key(key):
    return f"{key}__deleted_ids"


def _collection_deleted_ids(key):
    row = SiteSetting.query.filter_by(key=_deleted_collection_setting_key(key)).first()
    if row and isinstance(row.value, list):
        return {str(item) for item in row.value if str(item)}
    return set()


def _save_collection_deleted_ids(key, deleted_ids):
    row = SiteSetting.query.filter_by(key=_deleted_collection_setting_key(key)).first()
    if not row:
        row = SiteSetting(key=_deleted_collection_setting_key(key), public=False)
        db.session.add(row)
    row.value = sorted({str(item) for item in deleted_ids if str(item)})
    row.public = False
    return row


def _mark_default_item_deleted(key, default_items, item_id):
    default_ids = {_collection_item_id(item) for item in default_items}
    item_id = str(item_id)
    if item_id not in default_ids:
        return
    deleted_ids = _collection_deleted_ids(key)
    deleted_ids.add(item_id)
    _save_collection_deleted_ids(key, deleted_ids)


def _restore_deleted_item_id(key, item_id):
    item_id = str(item_id)
    deleted_ids = _collection_deleted_ids(key)
    if item_id not in deleted_ids:
        return
    deleted_ids.remove(item_id)
    _save_collection_deleted_ids(key, deleted_ids)


def _active_default_items(key, default_items):
    deleted_ids = _collection_deleted_ids(key)
    return [
        item for item in default_items
        if _collection_item_id(item) not in deleted_ids
    ]


def _collection_setting(key, default_items):
    active_defaults = _active_default_items(key, default_items)
    row = SiteSetting.query.filter_by(key=key).first()
    if row and isinstance(row.value, list):
        deleted_ids = _collection_deleted_ids(key)
        current_items = [
            item for item in row.value
            if isinstance(item, dict) and _collection_item_id(item) not in deleted_ids
        ]
        existing_ids = {_collection_item_id(item) for item in current_items}
        missing_defaults = [
            item for item in active_defaults
            if _collection_item_id(item) not in existing_ids
        ]
        if len(current_items) != len(row.value):
            row.value = current_items
        if missing_defaults:
            row.value = [*row.value, *missing_defaults]
            row.public = True
            db.session.add(row)
            db.session.flush()
        return row, row.value
    row = row or SiteSetting(key=key, public=True)
    row.value = active_defaults
    row.public = True
    db.session.add(row)
    db.session.flush()
    return row, row.value


def _save_collection_setting(key, items, public=True):
    row = SiteSetting.query.filter_by(key=key).first()
    if not row:
        row = SiteSetting(key=key)
        db.session.add(row)
    row.value = items
    row.public = public
    return row


def _next_sort_order(items):
    return max([int(item.get("sort_order") or 0) for item in items] or [0]) + 1


def _item_id(payload):
    return (
        payload.get("id")
        or payload.get("key")
        or slugify(payload.get("label") or payload.get("title") or payload.get("name"))
    )


def _admin_collection_items(setting_key, default_items):
    _, items = _collection_setting(setting_key, default_items)
    return items


def _upload_public_url(uploaded_file):
    if not uploaded_file:
        return None
    return f"/uploads/{uploaded_file.visibility}/{uploaded_file.category}/{uploaded_file.stored_filename}"


def _enrich_service_media(items):
    file_ids = {
        int(item.get("image_file_id"))
        for item in items
        if str(item.get("image_file_id") or "").isdigit()
    }
    file_ids.update(
        int(item.get("detail_image_file_id"))
        for item in items
        if str(item.get("detail_image_file_id") or "").isdigit()
    )
    files = {
        row.id: row
        for row in UploadedFile.query.filter(UploadedFile.id.in_(file_ids)).all()
    } if file_ids else {}
    enriched = []
    for item in items:
        row = dict(item)
        file_id = row.get("image_file_id")
        if str(file_id or "").isdigit():
            row["image_url"] = _upload_public_url(files.get(int(file_id))) or row.get("image_url")
        detail_file_id = row.get("detail_image_file_id")
        if str(detail_file_id or "").isdigit():
            row["detail_image_url"] = _upload_public_url(files.get(int(detail_file_id))) or row.get("detail_image_url")
        enriched.append(row)
    return enriched


def _permissions_payload():
    return [
        {"id": row.id, "key": row.key, "description": row.description}
        for row in Permission.query.order_by(Permission.key.asc()).all()
    ]


def _staff_payload(user):
    row = user_json(user)
    row["status"] = "active" if user.is_active else "inactive"
    return row


def _admin_payload(user):
    row = user_json(user)
    row["status"] = "active" if user.is_active else "inactive"
    return row


def _boolish(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "published", "active", "featured"}


def _decimalish(value, default=0):
    raw = str(value if value is not None else "").replace("GH", "").replace("GHS", "").replace(",", "").strip()
    raw = raw.replace("GHC", "").replace("GH", "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _split_tags(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value or "").replace(";", ",").split(",") if item.strip()]


def _unique_product_slug(base_slug, product_id=None):
    base = slugify(base_slug)
    slug = base
    counter = 2
    while True:
        query = Product.query.filter_by(slug=slug)
        if product_id:
            query = query.filter(Product.id != product_id)
        if not query.first():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


def _ensure_category(name):
    name = (name or "").strip()
    if not name:
        return None
    category = ProductCategory.query.filter(func.lower(ProductCategory.name) == name.lower()).first()
    if category:
        return category
    category = ProductCategory(name=name, slug=_unique_category_slug(name), is_active=True)
    db.session.add(category)
    db.session.flush()
    return category


def _category_from_payload(payload):
    typed_name = (payload.get("category_name") or payload.get("category") or "").strip()
    if typed_name:
        return _ensure_category(typed_name)
    category_id = payload.get("category_id")
    return ProductCategory.query.filter_by(id=category_id).first() if category_id else None


def _unique_category_slug(name):
    base = slugify(name)
    candidate = base
    counter = 2
    while ProductCategory.query.filter_by(slug=candidate).first():
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def _save_imported_image(filename, data):
    safe_name = secure_filename(filename or "")
    if not safe_name or "." not in safe_name:
        return None
    extension = safe_name.rsplit(".", 1)[1].lower()
    allowed = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"].get("images", set())
    if extension not in allowed:
        return None
    stored_name = f"{uuid4().hex}.{extension}"
    root = Path(current_app.config["UPLOAD_FOLDER"]) / "public" / "images"
    root.mkdir(parents=True, exist_ok=True)
    target = root / stored_name
    target.write_bytes(data)
    uploaded = UploadedFile(
        owner_id=current_user.id,
        original_filename=safe_name,
        stored_filename=stored_name,
        storage_path=str(target),
        mime_type=mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
        size_bytes=len(data),
        category="images",
        visibility="public",
    )
    db.session.add(uploaded)
    db.session.flush()
    return uploaded.id


def _read_catalog_rows(file_storage):
    if not file_storage or not file_storage.filename:
        raise ValueError("Upload a CSV or XLSX catalogue file.")
    name = file_storage.filename.lower()
    if name.endswith(".csv"):
        text = file_storage.stream.read().decode("utf-8-sig")
        return list(csv.DictReader(io.StringIO(text)))
    if name.endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
        except ImportError as exc:
            raise ValueError("XLSX import requires openpyxl. Install backend requirements first.") from exc
        workbook = load_workbook(file_storage.stream, read_only=True, data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(cell or "").strip() for cell in rows[0]]
        return [
            {headers[index]: value for index, value in enumerate(row) if index < len(headers)}
            for row in rows[1:]
            if any(cell not in (None, "") for cell in row)
        ]
    raise ValueError("Only CSV and XLSX catalogue files are supported.")


def _read_image_zip(file_storage):
    if not file_storage or not file_storage.filename:
        return {}
    if not file_storage.filename.lower().endswith(".zip"):
        raise ValueError("Batch images must be uploaded as a ZIP file.")
    images = {}
    with zipfile.ZipFile(file_storage.stream) as archive:
        for name in archive.namelist():
            if name.endswith("/") or "__MACOSX" in name:
                continue
            basename = Path(name).name
            if not basename:
                continue
            images[basename.lower()] = archive.read(name)
    return images


def _normalise_import_row(row):
    lookup = {
        str(key or "").strip().lower().replace(" ", "_").replace("-", "_"): value
        for key, value in (row or {}).items()
    }

    def pick(*names):
        for name in names:
            value = lookup.get(name)
            if value not in (None, ""):
                return value
        return None

    name = str(pick("name", "product_name", "title") or "").strip()
    if not name:
        return None
    stock = str(pick("stock_status", "stock") or "in_stock").strip().lower().replace(" ", "_")
    if stock in {"in", "available"}:
        stock = "in_stock"
    if stock in {"low"}:
        stock = "low_stock"
    if stock in {"out", "unavailable"}:
        stock = "out_of_stock"

    return {
        "name": name,
        "slug": slugify(str(pick("slug") or name)),
        "category": str(pick("category", "product_category") or "").strip(),
        "price": _decimalish(pick("price", "unit_price")),
        "old_price": _decimalish(pick("old_price", "compare_at_price"), None),
        "short_description": pick("short_description", "description", "summary"),
        "full_description": pick("full_description", "details", "body"),
        "stock_status": stock or "in_stock",
        "quantity_available": int(_decimalish(pick("quantity_available", "quantity", "qty"), 0) or 0),
        "subject": pick("subject"),
        "level": pick("level", "class", "grade"),
        "curriculum": pick("curriculum", "curriculum_name", "syllabus"),
        "author": pick("author", "writer"),
        "publisher": pick("publisher", "publishing_house"),
        "product_type": pick("product_type", "type"),
        "delivery_note": pick("delivery_note"),
        "tags": _split_tags(pick("tags", "badges")),
        "featured": _boolish(pick("featured")),
        "source": pick("source", "supplier", "vendor"),
        "image_filename": str(pick("image_filename", "image", "cover_image") or "").strip(),
    }

def _ticket_reference(message_id):
    return f"RMX-{int(message_id):06d}"


def _create_admin_collection_item(setting_key, default_items, payload, entity_type):
    items = _admin_collection_items(setting_key, default_items)
    item_id = str(_item_id(payload))
    if any(str(item.get("id")) == item_id for item in items):
        return None, (jsonify(error="An item with this ID already exists."), 409)
    row = {
        **payload,
        "id": item_id,
        "status": payload.get("status") or "published",
        "sort_order": payload.get("sort_order") or _next_sort_order(items),
    }
    items.append(row)
    _restore_deleted_item_id(setting_key, item_id)
    _save_collection_setting(setting_key, items)
    log_action(f"create_{entity_type}", entity_type, item_id)
    db.session.commit()
    return row, None


def _update_admin_collection_item(setting_key, default_items, item_id, payload, entity_type):
    items = _admin_collection_items(setting_key, default_items)
    found = None
    next_items = []
    for item in items:
        if str(item.get("id")) == str(item_id):
            found = {**item, **payload, "id": str(item_id)}
            next_items.append(found)
        else:
            next_items.append(item)
    if not found:
        return None, (jsonify(error="Item not found."), 404)
    _save_collection_setting(setting_key, next_items)
    log_action(f"update_{entity_type}", entity_type, item_id)
    db.session.commit()
    return found, None


def _delete_admin_collection_item(setting_key, default_items, item_id, entity_type):
    items = _admin_collection_items(setting_key, default_items)
    next_items = [item for item in items if str(item.get("id")) != str(item_id)]
    if len(next_items) == len(items):
        return jsonify(error="Item not found."), 404
    _mark_default_item_deleted(setting_key, default_items, item_id)
    _save_collection_setting(setting_key, next_items)
    log_action(f"delete_{entity_type}", entity_type, item_id)
    db.session.commit()
    return jsonify(message="Item deleted.")


def _matches_job_alert(job, preference):
    # preference.subject is a comma-joined multi-select value (a teacher can
    # now save several teaching subjects, e.g. "Mathematics, Physics,
    # Chemistry"). Match if ANY one of those subjects appears in the job's
    # subject — a straight whole-string containment check would require the
    # entire joined list to appear verbatim inside a single-subject job
    # posting, which would never happen and would silently stop all subject
    # -based alerts for every multi-subject teacher.
    def values(raw):
        return {
            re.sub(r"[^a-z0-9]+", " ", item.lower()).strip()
            for item in (raw or "").split(",")
            if item.strip()
        }

    def aliases(value):
        normalised = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
        alias_map = {
            "english": "english language",
            "jhs": "junior high lower secondary",
            "shs": "senior high upper secondary",
            "primary": "upper primary",
            "full time": "full time",
            "part time": "part time",
        }
        return alias_map.get(normalised, normalised)

    pref_subjects = {aliases(item) for item in values(preference.subject)}
    job_subject = aliases(job.subject)
    subject_match = not pref_subjects or (
        job_subject and job_subject in pref_subjects
    )
    pref_location_ids = set(parse_location_ids(preference.location_ids))
    if pref_location_ids:
        location_match = job.delivery_zone_id in pref_location_ids
    else:
        pref_locations = values(preference.location)
        location_match = not pref_locations or aliases(job.location) in {aliases(item) for item in pref_locations}
    pref_levels = {aliases(item) for item in values(preference.preferred_level)}
    job_level = aliases(job.level)
    level_match = not pref_levels or (
        job_level and job_level in pref_levels
    )
    pref_curricula = {aliases(item) for item in values(preference.curriculum)}
    job_curriculum = aliases(job.curriculum)
    curriculum_match = not pref_curricula or (
        job_curriculum and job_curriculum in pref_curricula
    )
    pref_types = {aliases(item) for item in values(preference.employment_type)}
    job_type = aliases(job.employment_type)
    type_match = not pref_types or (
        job_type and job_type in pref_types
    )
    return subject_match and location_match and level_match and curriculum_match and type_match


def dispatch_job_alerts(job):
    if job.status != "published":
        return 0
    preferences = (
        JobAlertPreference.query
        .join(User, JobAlertPreference.user_id == User.id)
        .filter(
            JobAlertPreference.alert_by_email.is_(True),
            JobAlertPreference.frequency == "instant",
            User.is_active.is_(True),
            User.is_verified.is_(True),
        )
        .all()
    )
    sent = 0
    for preference in preferences:
        user = db.session.get(User, preference.user_id)
        if not user or not _matches_job_alert(job, preference):
            continue
        job_url = f"{current_app.config['BASE_URL'].rstrip('/')}/jobs#{job.id}"
        send_email(
            OutboundEmail(
                to=user.email,
                from_email=current_app.config["JOBS_FROM_EMAIL"],
                subject=f"New matching teaching role: {job.title}",
                html=app_email_shell(
                    "A new job matches your RealMindX alerts",
                    f"<p><strong>{job.title}</strong> in {job.location} matches your saved job preferences.</p>",
                    "View Job",
                    job_url,
                ),
            )
        )
        preference.last_sent_at = datetime.now(timezone.utc)
        sent += 1
    return sent


@admin_bp.get("/dashboard")
@login_required
@admin_or_staff_required
def dashboard():
    recent_jobs = Job.query.order_by(Job.created_at.desc()).limit(5).all()
    recent_orders = Order.query.order_by(Order.created_at.desc()).limit(5).all()
    return jsonify(
        summary={
            "total_users": db.session.scalar(db.select(func.count(User.id))),
            "total_job_applications": db.session.scalar(db.select(func.count(JobApplication.id))),
            "pending_applications": JobApplication.query.filter_by(status="pending").count(),
            "new_orders": Order.query.filter_by(status="new").count(),
            "new_contact_messages": ContactMessage.query.filter_by(status="new").count(),
            "total_products": Product.query.count(),
            "newsletter_subscribers": NewsletterSubscriber.query.filter_by(is_active=True).count(),
        },
        recent_jobs=[job_json(job) for job in recent_jobs],
        recent_orders=[order_json(order) for order in recent_orders],
    )


@admin_bp.get("/jobs")
@login_required
@permission_required("jobs.view")
def list_jobs():
    rows = Job.query.order_by(Job.created_at.desc()).limit(200).all()
    return jsonify(items=[job_json(row) for row in rows])


@admin_bp.post("/jobs")
@login_required
@permission_required("jobs.create")
def create_job():
    payload = request.get_json(silent=True) or {}
    delivery_zone = db.session.get(DeliveryZone, payload.get("delivery_zone_id")) if payload.get("delivery_zone_id") else None
    if not delivery_zone or not delivery_zone.is_active or "pickup" in delivery_zone.name.lower():
        return jsonify(error="Choose a valid job location from the delivery-area list."), 400
    job = Job(
        title=payload.get("title"),
        organisation=payload.get("organisation") or payload.get("school"),
        location=delivery_zone.name,
        delivery_zone_id=delivery_zone.id,
        subject=payload.get("subject"),
        level=payload.get("level"),
        curriculum=payload.get("curriculum"),
        employment_type=payload.get("employment_type"),
        description=payload.get("description") or "",
        requirements=payload.get("requirements"),
        responsibilities=payload.get("responsibilities"),
        deadline=date.fromisoformat(payload["deadline"]) if payload.get("deadline") else None,
        salary_min=payload.get("salary_min"),
        salary_max=payload.get("salary_max"),
        status=payload.get("status") or "draft",
        created_by_id=current_user.id,
    )
    if not job.title or not job.location or not job.description:
        return jsonify(error="Title, location, and description are required."), 400
    db.session.add(job)
    db.session.flush()
    alerts_sent = dispatch_job_alerts(job)
    log_action("create_job", "job", job.id)
    if alerts_sent:
        log_action("send_job_alerts", "job", job.id, {"count": alerts_sent})
    db.session.commit()
    return jsonify(job=job_json(job), alerts_sent=alerts_sent), 201


@admin_bp.put("/jobs/<int:job_id>")
@login_required
@permission_required("jobs.edit")
def update_job(job_id):
    job = db.get_or_404(Job, job_id)
    payload = request.get_json(silent=True) or {}
    if "delivery_zone_id" in payload:
        delivery_zone = db.session.get(DeliveryZone, payload.get("delivery_zone_id")) if payload.get("delivery_zone_id") else None
        if not delivery_zone or not delivery_zone.is_active or "pickup" in delivery_zone.name.lower():
            return jsonify(error="Choose a valid job location from the delivery-area list."), 400
        job.delivery_zone_id = delivery_zone.id
        job.location = delivery_zone.name
    for field in ["title", "organisation", "subject", "level", "curriculum", "employment_type", "description", "requirements", "responsibilities", "salary_min", "salary_max", "status"]:
        if field in payload:
            setattr(job, field, payload[field])
    if "deadline" in payload:
        job.deadline = date.fromisoformat(payload["deadline"]) if payload["deadline"] else None
    alerts_sent = dispatch_job_alerts(job) if payload.get("send_alerts") else 0
    log_action("update_job", "job", job.id)
    if alerts_sent:
        log_action("send_job_alerts", "job", job.id, {"count": alerts_sent})
    db.session.commit()
    return jsonify(job=job_json(job), alerts_sent=alerts_sent)


@admin_bp.delete("/jobs/<int:job_id>")
@login_required
@permission_required("jobs.delete")
def delete_job(job_id):
    job = db.get_or_404(Job, job_id)
    log_action("delete_job", "job", job.id, {"title": job.title})
    db.session.delete(job)
    db.session.commit()
    return jsonify(message="Job deleted.")


@admin_bp.get("/applications")
@login_required
@permission_required("applications.view")
def applications():
    rows = JobApplication.query.order_by(JobApplication.created_at.desc()).limit(200).all()
    return jsonify(
        items=[
            {
                "id": row.id,
                "status": row.status,
                "user": user_json(row.user),
                "job": job_json(row.job),
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    )


@admin_bp.put("/applications/<int:application_id>/status")
@login_required
@permission_required("applications.edit")
def update_application_status(application_id):
    application = db.get_or_404(JobApplication, application_id)
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in {"pending", "reviewed", "shortlisted", "accepted", "rejected"}:
        return jsonify(error="Invalid status."), 400
    application.status = status
    log_action("update_application_status", "job_application", application.id, {"status": status})
    db.session.commit()
    return jsonify(id=application.id, status=application.status)


@admin_bp.post("/change-password")
@login_required
def admin_change_password():
    payload = request.get_json(silent=True) or {}
    current_pw = (payload.get("current_password") or "").strip()
    new_pw = (payload.get("new_password") or "").strip()
    if not current_pw or not new_pw:
        return jsonify(error="Current and new password are required."), 400
    if len(new_pw) < 8:
        return jsonify(error="New password must be at least 8 characters."), 400
    if not current_user.check_password(current_pw):
        return jsonify(error="Current password is incorrect."), 403
    current_user.set_password(new_pw)
    log_action("change_password", "admin_user", current_user.id)
    db.session.commit()
    return jsonify(message="Password updated successfully.")


@admin_bp.get("/users")
@login_required
@admin_required
def users():
    # Return only regular-user accounts (i.e. teachers); admin/staff excluded.
    rows = (
        User.query
        .join(User.role)
        .filter(Role.name == "user")
        .order_by(User.created_at.desc())
        .limit(500)
        .all()
    )
    return jsonify(items=[user_json(user) for user in rows])


@admin_bp.patch("/users/<int:user_id>")
@login_required
@admin_required
def update_user(user_id):
    """Toggle a regular-user account active / inactive."""
    user = db.get_or_404(User, user_id)
    # Safety: only allow toggling regular users, not admins / staff.
    if user.role and user.role.name in ("admin", "staff"):
        return jsonify(error="Cannot modify admin or staff accounts via this endpoint."), 403
    payload = request.get_json(silent=True) or {}
    if "status" in payload:
        user.is_active = payload["status"] == "active"
        db.session.commit()
        log_action("toggle_user_active", "user", user.id, {"status": payload["status"]})
    return jsonify(user_json(user))


@admin_bp.get("/users/<int:user_id>")
@login_required
@admin_required
def get_user(user_id):
    """Return a single teacher's full profile data for the admin detail modal."""
    user = db.get_or_404(User, user_id)
    data = user_json(user)
    profile = getattr(user, "profile", None)
    if profile:
        def _file_url(file_id):
            if not file_id:
                return None
            f = db.session.get(UploadedFile, file_id)
            if not f:
                return None
            return f"/uploads/{f.visibility}/{f.category}/{f.stored_filename}"

        age = None
        if profile.date_of_birth:
            today = date.today()
            d = profile.date_of_birth
            age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))

        data["profile"] = {
            "location": profile.location,
            "teaching_subject": profile.teaching_subject,
            "preferred_level": profile.preferred_level,
            "preferred_employment_type": profile.preferred_employment_type,
            "available_from": profile.available_from,
            "curriculum_experience": profile.curriculum_experience,
            "bio": profile.bio,
            "cv_url": _file_url(profile.cv_file_id),
            "certificate_url": _file_url(profile.certificate_file_id),
            "next_of_kin_name": profile.next_of_kin_name,
            "next_of_kin_phone": profile.next_of_kin_phone,
            "next_of_kin_relationship": profile.next_of_kin_relationship,
            "next_of_kin_email": profile.next_of_kin_email,
            "years_of_experience": profile.years_of_experience,
            "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
            "age": age,
        }
    return jsonify(data)


@admin_bp.post("/uploads")
@login_required
@admin_or_staff_required
def upload_admin_file():
    file = request.files.get("file")
    category = request.form.get("category") or "images"
    visibility = request.form.get("visibility") or "public"
    try:
        uploaded = save_upload(file, category=category, owner_id=current_user.id, visibility=visibility)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    log_action("upload_admin_file", "uploaded_file", uploaded.id, {"category": uploaded.category})
    db.session.commit()
    url = f"/uploads/{uploaded.visibility}/{uploaded.category}/{uploaded.stored_filename}"
    return jsonify(
        file={
            "id": uploaded.id,
            "original_filename": uploaded.original_filename,
            "category": uploaded.category,
            "visibility": uploaded.visibility,
            "url": url,
        }
    ), 201


@admin_bp.post("/staff")
@login_required
@admin_required
def create_staff():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or len(password) < 8:
        return jsonify(error="Staff email and an 8 character password are required."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="User already exists."), 409
    role = Role.query.filter_by(name="staff").first() or Role(name="staff", description="Staff")
    permissions = Permission.query.filter(Permission.key.in_(payload.get("permissions") or [])).all()
    user = User(email=email, first_name=payload.get("first_name") or "Staff", last_name=payload.get("last_name"), role=role, is_verified=True)
    user.set_password(password)
    user.direct_permissions = permissions
    db.session.add_all([role, user])
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    log_action("create_staff", "user", user.id, {"permissions": [p.key for p in permissions]})
    db.session.commit()
    return jsonify(user=_staff_payload(user)), 201


@admin_bp.get("/permissions")
@login_required
@admin_required
def list_permissions():
    return jsonify(items=_permissions_payload())


@admin_bp.get("/staff")
@login_required
@admin_required
def list_staff():
    staff_role = Role.query.filter_by(name="staff").first()
    rows = User.query.filter(User.role_id == staff_role.id).order_by(User.created_at.desc()).all() if staff_role else []
    return jsonify(items=[_staff_payload(user) for user in rows])


@admin_bp.put("/staff/<int:user_id>")
@login_required
@admin_required
def update_staff(user_id):
    user = db.get_or_404(User, user_id)
    if not user.role or user.role.name != "staff":
        return jsonify(error="Only staff accounts can be edited here."), 400
    payload = request.get_json(silent=True) or {}
    if "first_name" in payload:
        user.first_name = payload.get("first_name") or user.first_name
    if "last_name" in payload:
        user.last_name = payload.get("last_name") or None
    if "email" in payload and payload.get("email"):
        next_email = payload["email"].strip().lower()
        existing = User.query.filter(User.email == next_email, User.id != user.id).first()
        if existing:
            return jsonify(error="Another account already uses this email."), 409
        user.email = next_email
    if payload.get("password"):
        if len(payload["password"]) < 8:
            return jsonify(error="Password must be at least 8 characters."), 400
        user.set_password(payload["password"])
    if "permissions" in payload:
        user.direct_permissions = Permission.query.filter(Permission.key.in_(payload.get("permissions") or [])).all()
    if "status" in payload:
        user.is_active = payload["status"] == "active"
    log_action("update_staff", "user", user.id, {"permissions": [p.key for p in user.direct_permissions]})
    db.session.commit()
    return jsonify(user=_staff_payload(user))


@admin_bp.delete("/staff/<int:user_id>")
@login_required
@admin_required
def delete_staff(user_id):
    user = db.get_or_404(User, user_id)
    if not user.role or user.role.name != "staff":
        return jsonify(error="Only staff accounts can be deleted here."), 400
    log_action("delete_staff", "user", user.id, {"email": user.email})
    db.session.delete(user)
    db.session.commit()
    return jsonify(message="Staff account deleted.")


@admin_bp.get("/admins")
@login_required
@admin_required
def list_admins():
    admin_role = Role.query.filter_by(name="admin").first()
    rows = User.query.filter(User.role_id == admin_role.id).order_by(User.created_at.desc()).all() if admin_role else []
    return jsonify(items=[_admin_payload(user) for user in rows])


@admin_bp.post("/admins")
@login_required
@admin_required
def create_admin():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or len(password) < 8:
        return jsonify(error="Admin email and an 8 character temporary password are required."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="User already exists."), 409
    role = Role.query.filter_by(name="admin").first() or Role(name="admin", description="Full administrator")
    user = User(
        email=email,
        first_name=payload.get("first_name") or "Admin",
        last_name=payload.get("last_name"),
        role=role,
        is_verified=True,
        is_active=payload.get("status", "active") != "inactive",
    )
    user.set_password(password)
    db.session.add_all([role, user])
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    log_action("create_admin", "user", user.id, {"email": user.email})
    db.session.commit()
    return jsonify(user=_admin_payload(user)), 201


@admin_bp.put("/admins/<int:user_id>")
@login_required
@admin_required
def update_admin(user_id):
    user = db.get_or_404(User, user_id)
    if not user.role or user.role.name != "admin":
        return jsonify(error="Only admin accounts can be edited here."), 400
    payload = request.get_json(silent=True) or {}
    if "first_name" in payload:
        user.first_name = payload.get("first_name") or user.first_name
    if "last_name" in payload:
        user.last_name = payload.get("last_name") or None
    if "email" in payload and payload.get("email"):
        next_email = payload["email"].strip().lower()
        existing = User.query.filter(User.email == next_email, User.id != user.id).first()
        if existing:
            return jsonify(error="Another account already uses this email."), 409
        user.email = next_email
    if payload.get("password"):
        if len(payload["password"]) < 8:
            return jsonify(error="Password must be at least 8 characters."), 400
        user.set_password(payload["password"])
    if "status" in payload:
        if user.id == current_user.id and payload["status"] != "active":
            return jsonify(error="You cannot deactivate the admin account you are currently using."), 400
        user.is_active = payload["status"] == "active"
    user.is_verified = True
    log_action("update_admin", "user", user.id, {"email": user.email})
    db.session.commit()
    return jsonify(user=_admin_payload(user))


@admin_bp.delete("/admins/<int:user_id>")
@login_required
@admin_required
def delete_admin(user_id):
    user = db.get_or_404(User, user_id)
    if not user.role or user.role.name != "admin":
        return jsonify(error="Only admin accounts can be deleted here."), 400
    if user.id == current_user.id:
        return jsonify(error="You cannot delete the admin account you are currently using."), 400
    log_action("delete_admin", "user", user.id, {"email": user.email})
    db.session.delete(user)
    db.session.commit()
    return jsonify(message="Admin account deleted.")


@admin_bp.get("/audit-logs")
@login_required
@admin_required
def list_audit_logs():
    rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(500).all()
    actor_ids = {row.actor_id for row in rows if row.actor_id}
    actors = {user.id: user for user in User.query.filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
    return jsonify(items=[
        {
            "id": row.id,
            "actor": actors.get(row.actor_id).email if actors.get(row.actor_id) else "System",
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "details": row.details or {},
            "ip_address": row.ip_address,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.created_at.isoformat(),
        }
        for row in rows
    ])


@admin_bp.get("/products")
@login_required
@permission_required("products.view")
def list_products():
    rows = Product.query.order_by(Product.featured.desc(), Product.created_at.desc()).limit(200).all()
    return jsonify(items=[product_json(row, include_private=True) for row in rows])


@admin_bp.post("/products")
@login_required
@permission_required("products.create")
def create_product():
    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    category = _category_from_payload(payload)
    slug = payload.get("slug") or name
    product = Product(
        name=name,
        slug=_unique_product_slug(slug),
        category=category,
        price=payload.get("price") or 0,
        old_price=payload.get("old_price"),
        short_description=payload.get("short_description"),
        full_description=payload.get("full_description"),
        image_file_id=payload.get("image_file_id") or None,
        stock_status=payload.get("stock_status") or "in_stock",
        quantity_available=payload.get("quantity_available"),
        subject=payload.get("subject"),
        level=payload.get("level"),
        curriculum=payload.get("curriculum"),
        author=payload.get("author"),
        publisher=payload.get("publisher"),
        product_type=payload.get("product_type"),
        source=payload.get("source"),
        featured=bool(payload.get("featured")),
        delivery_note=payload.get("delivery_note"),
        tags=payload.get("tags") or [],
    )
    if not product.name:
        return jsonify(error="Product name is required."), 400
    db.session.add(product)
    db.session.flush()
    log_action("create_product", "product", product.id)
    db.session.commit()
    return jsonify(product=product_json(product, include_private=True)), 201


@admin_bp.put("/products/<int:product_id>")
@login_required
@permission_required("products.edit")
def update_product(product_id):
    product = db.get_or_404(Product, product_id)
    payload = request.get_json(silent=True) or {}
    for field in [
        "name",
        "slug",
        "price",
        "old_price",
        "short_description",
        "full_description",
        "image_file_id",
        "stock_status",
        "quantity_available",
        "subject",
        "level",
        "curriculum",
        "author",
        "publisher",
        "product_type",
        "source",
        "featured",
        "delivery_note",
        "tags",
        "is_active",
    ]:
        if field in payload:
            setattr(product, field, payload[field])
    if "slug" in payload:
        product.slug = _unique_product_slug(payload["slug"] or product.name, product.id)
    if "category_id" in payload or "category_name" in payload or "category" in payload:
        product.category = _category_from_payload(payload)
    if "status" in payload:
        product.is_active = payload["status"] == "published"
    log_action("update_product", "product", product.id)
    db.session.commit()
    return jsonify(product=product_json(product, include_private=True))


@admin_bp.delete("/products/<int:product_id>")
@login_required
@permission_required("products.delete")
def delete_product(product_id):
    product = db.get_or_404(Product, product_id)
    log_action("delete_product", "product", product.id, {"name": product.name})
    db.session.delete(product)
    db.session.commit()
    return jsonify(message="Product deleted.")


def _review_json(review):
    return {
        "id": review.id,
        "product_id": review.product_id,
        "product_name": review.product.name if review.product else "",
        "order_id": review.order_id,
        "customer_name": review.customer_name,
        "email": review.email,
        "rating": review.rating,
        "title": review.title,
        "comment": review.comment,
        "status": review.status,
        "created_at": review.created_at.isoformat(),
        "updated_at": review.updated_at.isoformat(),
    }


@admin_bp.get("/product-reviews")
@login_required
@permission_required("productReviews.view")
def list_product_reviews():
    rows = ProductReview.query.order_by(ProductReview.created_at.desc()).limit(300).all()
    return jsonify(items=[_review_json(row) for row in rows])


@admin_bp.put("/product-reviews/<int:review_id>")
@login_required
@permission_required("productReviews.edit")
def update_product_review(review_id):
    review = db.get_or_404(ProductReview, review_id)
    payload = request.get_json(silent=True) or {}
    if "status" in payload:
        status = payload["status"]
        if status not in {"pending", "approved", "rejected"}:
            return jsonify(error="Choose pending, approved, or rejected."), 400
        review.status = status
    for field in ["title", "comment"]:
        if field in payload:
            setattr(review, field, payload[field])
    log_action("update_product_review", "product_review", review.id, {"status": review.status})
    db.session.commit()
    return jsonify(_review_json(review))


@admin_bp.delete("/product-reviews/<int:review_id>")
@login_required
@permission_required("productReviews.delete")
def delete_product_review(review_id):
    review = db.get_or_404(ProductReview, review_id)
    log_action("delete_product_review", "product_review", review.id, {"product_id": review.product_id})
    db.session.delete(review)
    db.session.commit()
    return jsonify(message="Review deleted.")


@admin_bp.post("/products/import")
@login_required
@permission_required("products.create")
def import_products():
    try:
        rows = _read_catalog_rows(request.files.get("catalog_file"))
        image_bytes = _read_image_zip(request.files.get("images_zip"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    image_ids = {
        filename: _save_imported_image(filename, data)
        for filename, data in image_bytes.items()
    }
    image_ids = {name: file_id for name, file_id in image_ids.items() if file_id}

    imported = 0
    updated = 0
    skipped = []
    for index, raw_row in enumerate(rows, start=2):
        row = _normalise_import_row(raw_row)
        if not row:
            skipped.append({"row": index, "reason": "Missing product name"})
            continue
        category = _ensure_category(row["category"])
        product = Product.query.filter_by(slug=row["slug"]).first()
        if not product:
            product = Product(name=row["name"], slug=_unique_product_slug(row["slug"]), price=row["price"])
            db.session.add(product)
            imported += 1
        else:
            updated += 1
        product.name = row["name"]
        product.category = category
        product.price = row["price"]
        product.old_price = row["old_price"]
        product.short_description = row["short_description"]
        product.full_description = row["full_description"]
        product.stock_status = row["stock_status"]
        product.quantity_available = row["quantity_available"]
        product.subject = row["subject"]
        product.level = row["level"]
        product.curriculum = row["curriculum"]
        product.author = row["author"]
        product.publisher = row["publisher"]
        product.product_type = row["product_type"]
        product.delivery_note = row["delivery_note"]
        product.tags = row["tags"]
        product.featured = row["featured"]
        product.source = row["source"]
        product.is_active = True
        image_filename = row["image_filename"].lower()
        if image_filename and image_filename in image_ids:
            product.image_file_id = image_ids[image_filename]
    log_action("import_products", "product", None, {"imported": imported, "updated": updated, "skipped": skipped})
    db.session.commit()
    return jsonify(imported=imported, updated=updated, skipped=skipped)


@admin_bp.get("/products/export")
@login_required
@permission_required("products.export")
def export_products():
    export_format = (request.args.get("format") or "csv").lower()
    rows = Product.query.order_by(Product.created_at.desc()).all()
    headers = [
        "id", "name", "category", "price", "old_price", "stock_status", "quantity_available",
        "subject", "level", "curriculum", "author", "publisher", "product_type", "source", "featured", "is_active", "tags",
    ]
    data_rows = [
        {
            "id": product.id,
            "name": product.name,
            "category": product.category.name if product.category else "",
            "price": float(product.price or 0),
            "old_price": float(product.old_price or 0) if product.old_price is not None else "",
            "stock_status": product.stock_status,
            "quantity_available": product.quantity_available or "",
            "subject": product.subject or "",
            "level": product.level or "",
            "curriculum": getattr(product, "curriculum", None) or "",
            "author": getattr(product, "author", None) or "",
            "publisher": getattr(product, "publisher", None) or "",
            "product_type": product.product_type or "",
            "source": product.source or "",
            "featured": product.featured,
            "is_active": product.is_active,
            "tags": ", ".join(product.tags or []),
        }
        for product in rows
    ]

    if export_format == "csv":
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data_rows)
        return Response(
            out.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=realmindx-products.csv"},
        )

    if export_format == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError as exc:
            return jsonify(error="XLSX export requires openpyxl. Install backend requirements first."), 501
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Products"
        sheet.append(headers)
        for row in data_rows:
            sheet.append([row[header] for header in headers])
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        return send_file(
            stream,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="realmindx-products.xlsx",
        )

    if export_format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
        except ImportError:
            return jsonify(error="PDF export requires reportlab. Install backend requirements first."), 501
        stream = io.BytesIO()
        pdf = canvas.Canvas(stream, pagesize=A4)
        width, height = A4
        y = height - 48
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(40, y, "RealMindX Bookshop Products")
        y -= 28
        pdf.setFont("Helvetica", 8)
        for product in rows:
            line = f"{product.id}. {product.name} | {product.category.name if product.category else ''} | GHS {float(product.price or 0):.2f} | {product.stock_status} | {product.source or ''}"
            pdf.drawString(40, y, line[:135])
            y -= 14
            if y < 44:
                pdf.showPage()
                y = height - 48
                pdf.setFont("Helvetica", 8)
        pdf.save()
        stream.seek(0)
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name="realmindx-products.pdf")

    return jsonify(error="Unsupported export format. Use csv, xlsx, or pdf."), 400


@admin_bp.get("/users/export")
@login_required
@admin_required
def export_users():
    """Export registered teachers/users as Excel or CSV."""
    from openpyxl import Workbook as XlsxWorkbook
    export_format = (request.args.get("format") or "xlsx").lower()
    rows = (
        User.query
        .join(Role, User.role_id == Role.id, isouter=True)
        .filter(Role.name == "user")
        .order_by(User.created_at.desc())
        .all()
    )
    headers = ["id", "first_name", "last_name", "email", "phone", "is_verified", "last_login_at", "created_at"]

    if export_format == "csv":
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=headers)
        writer.writeheader()
        for u in rows:
            writer.writerow({
                "id": u.id, "first_name": u.first_name or "", "last_name": u.last_name or "",
                "email": u.email, "phone": u.phone or "",
                "is_verified": u.is_verified, "last_login_at": str(u.last_login_at or ""),
                "created_at": str(u.created_at),
            })
        return Response(out.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=realmindx-teachers.csv"})

    wb = XlsxWorkbook()
    ws = wb.active
    ws.title = "Teachers"
    ws.append(["ID", "First Name", "Last Name", "Email", "Phone", "Verified", "Last Login", "Registered"])
    for u in rows:
        ws.append([
            u.id, u.first_name or "", u.last_name or "", u.email, u.phone or "",
            "Yes" if u.is_verified else "No",
            str(u.last_login_at.date() if u.last_login_at else ""),
            str(u.created_at.date()),
        ])
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return send_file(stream, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name="realmindx-teachers.xlsx")


@admin_bp.get("/jobs/export")
@login_required
@permission_required("jobs.export")
def export_jobs():
    """Export job posts as CSV, XLSX, or PDF."""
    export_format = (request.args.get("format") or "csv").lower()
    rows = Job.query.order_by(Job.created_at.desc()).all()
    headers = ["id", "title", "organisation", "location", "subject", "level",
               "employment_type", "salary_min", "salary_max", "deadline", "status", "created_at"]

    data_rows = [
        {
            "id": j.id,
            "title": j.title,
            "organisation": j.organisation or "",
            "location": j.location or "",
            "subject": j.subject or "",
            "level": j.level or "",
            "employment_type": j.employment_type or "",
            "salary_min": float(j.salary_min) if j.salary_min is not None else "",
            "salary_max": float(j.salary_max) if j.salary_max is not None else "",
            "deadline": str(j.deadline) if j.deadline else "",
            "status": j.status,
            "created_at": str(j.created_at.date()) if j.created_at else "",
        }
        for j in rows
    ]

    if export_format == "csv":
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data_rows)
        return Response(out.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=realmindx-jobs.csv"})

    if export_format == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError:
            return jsonify(error="XLSX export requires openpyxl."), 501
        wb = Workbook()
        ws = wb.active
        ws.title = "Job Posts"
        ws.append(headers)
        for row in data_rows:
            ws.append([row[h] for h in headers])
        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return send_file(stream, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                         as_attachment=True, download_name="realmindx-jobs.xlsx")

    if export_format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError:
            return jsonify(error="PDF export requires reportlab."), 501
        stream = io.BytesIO()
        pdf = rl_canvas.Canvas(stream, pagesize=A4)
        width, height = A4
        y = height - 48
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(40, y, "RealMindX Job Posts")
        y -= 28
        pdf.setFont("Helvetica", 8)
        for j in rows:
            line = f"{j.id}. {j.title} | {j.organisation or ''} | {j.location or ''} | {j.status}"
            pdf.drawString(40, y, line[:135])
            y -= 14
            if y < 44:
                pdf.showPage()
                y = height - 48
                pdf.setFont("Helvetica", 8)
        pdf.save()
        stream.seek(0)
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name="realmindx-jobs.pdf")

    return jsonify(error="Unsupported format. Use csv, xlsx, or pdf."), 400


@admin_bp.get("/applications/export")
@login_required
@permission_required("applications.export")
def export_applications():
    """Export job applications as CSV, XLSX, or PDF."""
    export_format = (request.args.get("format") or "csv").lower()
    rows = (
        JobApplication.query
        .join(JobApplication.user, isouter=True)
        .join(JobApplication.job, isouter=True)
        .order_by(JobApplication.created_at.desc())
        .all()
    )
    headers = ["id", "job_title", "applicant_name", "applicant_email", "status", "cover_note", "applied_at"]

    data_rows = [
        {
            "id": a.id,
            "job_title": a.job.title if a.job else "",
            "applicant_name": f"{a.user.first_name or ''} {a.user.last_name or ''}".strip() if a.user else "",
            "applicant_email": a.user.email if a.user else "",
            "status": a.status,
            "cover_note": (a.cover_note or "")[:200],
            "applied_at": str(a.created_at.date()) if a.created_at else "",
        }
        for a in rows
    ]

    if export_format == "csv":
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data_rows)
        return Response(out.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=realmindx-applications.csv"})

    if export_format == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError:
            return jsonify(error="XLSX export requires openpyxl."), 501
        wb = Workbook()
        ws = wb.active
        ws.title = "Applications"
        ws.append(headers)
        for row in data_rows:
            ws.append([row[h] for h in headers])
        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        return send_file(stream, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                         as_attachment=True, download_name="realmindx-applications.xlsx")

    if export_format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError:
            return jsonify(error="PDF export requires reportlab."), 501
        stream = io.BytesIO()
        pdf = rl_canvas.Canvas(stream, pagesize=A4)
        width, height = A4
        y = height - 48
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(40, y, "RealMindX Job Applications")
        y -= 28
        pdf.setFont("Helvetica", 8)
        for a in rows:
            name = f"{a.user.first_name or ''} {a.user.last_name or ''}".strip() if a.user else "Unknown"
            email = a.user.email if a.user else ""
            line = f"{a.id}. {a.job.title if a.job else '?'} | {name} | {email} | {a.status}"
            pdf.drawString(40, y, line[:135])
            y -= 14
            if y < 44:
                pdf.showPage()
                y = height - 48
                pdf.setFont("Helvetica", 8)
        pdf.save()
        stream.seek(0)
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name="realmindx-applications.pdf")

    return jsonify(error="Unsupported format. Use csv, xlsx, or pdf."), 400


@admin_bp.get("/categories")
@login_required
@permission_required("categories.view")
def categories():
    rows = ProductCategory.query.order_by(ProductCategory.sort_order.asc(), ProductCategory.name.asc()).all()
    return jsonify(items=[{"id": row.id, "name": row.name, "slug": row.slug, "description": row.description,
                            "is_active": row.is_active, "bulk_discount_percent": float(row.bulk_discount_percent or 0),
                            "bulk_min_qty": int(row.bulk_min_qty or 10)} for row in rows])


@admin_bp.post("/categories")
@login_required
@permission_required("categories.create")
def create_category():
    payload = request.get_json(silent=True) or {}
    name = payload.get("name") or payload.get("label")
    category = ProductCategory(
        name=name,
        slug=payload.get("slug") or slugify(name),
        description=payload.get("description"),
        sort_order=payload.get("sort_order") or 0,
        is_active=bool(payload.get("is_active", True)),
    )
    if not category.name:
        return jsonify(error="Category name is required."), 400
    db.session.add(category)
    db.session.flush()
    log_action("create_category", "product_category", category.id)
    db.session.commit()
    return jsonify(id=category.id, name=category.name, slug=category.slug), 201


@admin_bp.put("/categories/<int:category_id>")
@login_required
@permission_required("categories.edit")
def update_category(category_id):
    category = db.get_or_404(ProductCategory, category_id)
    payload = request.get_json(silent=True) or {}
    for field in ["name", "slug", "description", "sort_order", "is_active"]:
        if field in payload:
            setattr(category, field, payload[field])
    log_action("update_category", "product_category", category.id)
    db.session.commit()
    return jsonify(id=category.id, name=category.name, slug=category.slug)


@admin_bp.delete("/categories/<int:category_id>")
@login_required
@permission_required("categories.delete")
def delete_category(category_id):
    category = db.get_or_404(ProductCategory, category_id)
    log_action("delete_category", "product_category", category.id, {"name": category.name})
    db.session.delete(category)
    db.session.commit()
    return jsonify(message="Category deleted.")


@admin_bp.get("/delivery-zones")
@login_required
@permission_required("orders.view")
def delivery_zones():
    rows = DeliveryZone.query.order_by(DeliveryZone.sort_order.asc(), DeliveryZone.name.asc()).all()
    return jsonify(items=[delivery_zone_json(row) for row in rows])


@admin_bp.post("/delivery-zones")
@login_required
@permission_required("orders.create")
def create_delivery_zone():
    payload = request.get_json(silent=True) or {}
    zone = DeliveryZone(
        name=(payload.get("name") or "").strip(),
        fee=payload.get("fee") or 0,
        description=payload.get("description"),
        sort_order=payload.get("sort_order") or 0,
        is_active=bool(payload.get("is_active", True)),
    )
    if not zone.name:
        return jsonify(error="Delivery zone name is required."), 400
    db.session.add(zone)
    db.session.flush()
    log_action("create_delivery_zone", "delivery_zone", zone.id)
    db.session.commit()
    return jsonify(delivery_zone=delivery_zone_json(zone)), 201


@admin_bp.put("/delivery-zones/<int:zone_id>")
@login_required
@permission_required("orders.edit")
def update_delivery_zone(zone_id):
    zone = db.get_or_404(DeliveryZone, zone_id)
    payload = request.get_json(silent=True) or {}
    for field in ["name", "fee", "description", "sort_order", "is_active"]:
        if field in payload:
            setattr(zone, field, payload[field])
    log_action("update_delivery_zone", "delivery_zone", zone.id)
    db.session.commit()
    return jsonify(delivery_zone=delivery_zone_json(zone))


@admin_bp.delete("/delivery-zones/<int:zone_id>")
@login_required
@permission_required("orders.delete")
def delete_delivery_zone(zone_id):
    zone = db.get_or_404(DeliveryZone, zone_id)
    log_action("delete_delivery_zone", "delivery_zone", zone.id, {"name": zone.name})
    db.session.delete(zone)
    db.session.commit()
    return jsonify(message="Delivery zone deleted.")


@admin_bp.get("/orders")
@login_required
@permission_required("orders.view")
def orders():
    rows = Order.query.order_by(Order.created_at.desc()).limit(200).all()
    return jsonify(items=[order_json(order) for order in rows])


@admin_bp.get("/orders/export")
@login_required
@permission_required("orders.export")
def export_orders():
    export_format = (request.args.get("format") or "csv").lower()
    rows = Order.query.order_by(Order.created_at.desc()).all()
    headers = [
        "id",
        "order_reference",
        "customer_name",
        "email",
        "phone",
        "delivery_method",
        "delivery_zone_name",
        "delivery_region",
        "location",
        "payment_method",
        "payment_status",
        "status",
        "subtotal_amount",
        "delivery_fee",
        "total_amount",
        "items",
        "notes",
        "created_at",
        "updated_at",
    ]
    data_rows = [
        {
            "id": order.id,
            "order_reference": order.order_reference,
            "customer_name": order.customer_name,
            "email": order.email,
            "phone": order.phone,
            "delivery_method": order.delivery_method,
            "delivery_zone_name": order.delivery_zone_name or "",
            "delivery_region": order.delivery_region or "",
            "location": order.location or "",
            "payment_method": order.payment_method or "",
            "payment_status": order.payment_status or "",
            "status": order.status,
            "subtotal_amount": float(order.subtotal_amount or 0) if order.subtotal_amount is not None else "",
            "delivery_fee": float(order.delivery_fee or 0),
            "total_amount": float(order.total_amount or 0) if order.total_amount is not None else "",
            "items": "; ".join(
                f"{item.product_name} x{item.quantity} @ GHS {float(item.unit_price or 0):.2f}"
                for item in order.items
            ),
            "notes": order.notes or "",
            "created_at": str(order.created_at.date()) if order.created_at else "",
            "updated_at": str(order.updated_at.date()) if order.updated_at else "",
        }
        for order in rows
    ]

    if export_format == "csv":
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data_rows)
        return Response(
            out.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=realmindx-orders.csv"},
        )

    if export_format == "xlsx":
        try:
            from openpyxl import Workbook
        except ImportError:
            return jsonify(error="XLSX export requires openpyxl."), 501
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Orders"
        sheet.append(headers)
        for row in data_rows:
            sheet.append([row[header] for header in headers])
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        return send_file(
            stream,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="realmindx-orders.xlsx",
        )

    if export_format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError:
            return jsonify(error="PDF export requires reportlab."), 501
        stream = io.BytesIO()
        pdf = rl_canvas.Canvas(stream, pagesize=A4)
        _, height = A4
        y = height - 48
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(40, y, "RealMindX Bookshop Orders")
        y -= 28
        pdf.setFont("Helvetica", 8)
        for order in rows:
            line = (
                f"{order.order_reference} | {order.customer_name} | "
                f"GHS {float(order.total_amount or 0):.2f} | {order.status} | {order.payment_status}"
            )
            pdf.drawString(40, y, line[:135])
            y -= 14
            if y < 44:
                pdf.showPage()
                y = height - 48
                pdf.setFont("Helvetica", 8)
        pdf.save()
        stream.seek(0)
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name="realmindx-orders.pdf")

    return jsonify(error="Unsupported format. Use csv, xlsx, or pdf."), 400


@admin_bp.put("/orders/<int:order_id>/status")
@login_required
@permission_required("orders.edit")
def update_order_status(order_id):
    order = db.get_or_404(Order, order_id)
    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    cancel_reason = (payload.get("cancel_reason") or "").strip()
    valid_statuses = {"new", "received", "shipped", "complete", "cancelled", "archived",
                      "confirmed", "processing", "completed"}
    if status not in valid_statuses:
        return jsonify(error="Invalid order status."), 400
    old_status = order.status
    order.status = status
    if cancel_reason:
        order.notes = cancel_reason
    log_action("update_order_status", "order", order.id, {"status": status, "prev": old_status})
    db.session.commit()

    if status != old_status:
        snapshot = _order_contact_snapshot(order)
        if snapshot.email:
            _run_in_background("Order status email", _send_order_status_email, snapshot, status, cancel_reason)
        if snapshot.phone:
            _run_in_background("Order status SMS", _send_order_status_sms, snapshot, status, cancel_reason)

    return jsonify(order=order_json(order))


def _send_order_status_sms(order, status, cancel_reason=""):
    """Send an SMS to the customer when their order status changes."""
    from ..sms_service import send_sms
    if not order.phone:
        return
    first_name = (order.customer_name or "").split()[0] or "there"
    ref = order.order_reference
    messages = {
        "received": (
            f"Hi {first_name}, your RealMindX Bookshop order {ref} is confirmed "
            f"and being prepared. We'll be in touch shortly."
        ),
        "shipped": (
            f"Hi {first_name}, great news! Your order {ref} is on its way. "
            f"Expected delivery within 48 hours. - RealMindX Bookshop"
        ),
        "complete": (
            f"Hi {first_name}, your order {ref} has been delivered. "
            f"Thank you for choosing RealMindX Bookshop!"
        ),
        "cancelled": (
            f"Hi {first_name}, your order {ref} has been cancelled."
            + (f" Reason: {cancel_reason}." if cancel_reason else "")
            + " Contact us on WhatsApp for help. - RealMindX Bookshop"
        ),
    }
    msg = messages.get(status)
    if msg:
        send_sms(order.phone, msg)


def _send_order_status_email(order, status, cancel_reason=""):
    """Send a friendly, branded email when order status changes."""
    first_name = (order.customer_name or "").split()[0] or "there"
    ref = order.order_reference

    status_messages = {
        "received": {
            "subject": f"Your RealMindX Bookshop order is confirmed: {ref}",
            "title": "Your order is confirmed!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Great news! Your order <strong>{escape(ref)}</strong> has been confirmed and our team is getting it ready for you.</p>"
                f"<p>We&rsquo;ll be in touch to arrange delivery or let you know when it&rsquo;s ready for pickup at our Dome Pillar 2 shop.</p>"
                f"<p>In the meantime, feel free to reach us on WhatsApp if you have any questions.</p>"
            ),
            "cta_label": "Track Your Order",
            "cta_url": "/bookshop/track",
        },
        "shipped": {
            "subject": f"Your RealMindX order is on its way: {ref}",
            "title": "Your order is on its way!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Good news! Your order <strong>{escape(ref)}</strong> has been dispatched and is heading your way.</p>"
                f"<p>Expected delivery is within 48 hours. Our team will contact you to coordinate handover if needed.</p>"
            ),
            "cta_label": "Track Your Order",
            "cta_url": "/bookshop/track",
        },
        "complete": {
            "subject": f"Order delivered. Thank you, {escape(first_name)}!",
            "title": "Order delivered. Thank you!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Your order <strong>{escape(ref)}</strong> has been marked as delivered. We hope you&rsquo;re happy with your books!</p>"
                f"<p>If anything is missing or not as expected, please reply to this email or reach us on WhatsApp and we&rsquo;ll make it right.</p>"
                f"<p>Thank you for choosing RealMindX Bookshop. We look forward to serving you again.</p>"
            ),
            "cta_label": "Shop Again",
            "cta_url": "/bookshop",
        },
        "cancelled": {
            "subject": f"Your RealMindX order {ref} has been cancelled",
            "title": "Order cancelled",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>We&rsquo;re sorry to let you know that your order <strong>{escape(ref)}</strong> has been cancelled.</p>"
                + (f"<p><strong>Reason:</strong> {escape(cancel_reason)}</p>" if cancel_reason else "")
                + "<p>If you believe this is an error or would like to place a new order, please reach out to us and we&rsquo;ll be happy to help.</p>"
            ),
            "cta_label": "Contact Us",
            "cta_url": "/contact",
        },
    }

    info = status_messages.get(status)
    if not info:
        return  # no email for other status changes (archived, etc.)

    try:
        send_email(OutboundEmail(
            to=order.email,
            from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
            subject=info["subject"],
            html=app_email_shell(
                info["title"],
                info["body"],
                cta_label=info.get("cta_label"),
                cta_url=info.get("cta_url"),
                eyebrow="RealMindX Bookshop",
                preheader=info["subject"],
            ),
        ))
    except Exception as exc:
        current_app.logger.warning("Order status email failed: %s", exc)


@admin_bp.delete("/orders/<int:order_id>")
@login_required
@permission_required("orders.delete")
def delete_order(order_id):
    order = db.get_or_404(Order, order_id)
    log_action("delete_order", "order", order.id, {"order_reference": order.order_reference})
    db.session.delete(order)
    db.session.commit()
    return jsonify(message="Order deleted.")


def _content_payload(model, payload, fields):
    row = model()
    for field in fields:
        if field in payload:
            setattr(row, field, payload[field])
    return row


def _clean_news_sections(sections):
    cleaned = []
    if not isinstance(sections, list):
        return cleaned
    for section in sections:
        if not isinstance(section, dict):
            continue
        heading = (section.get("heading") or "").strip()
        body = (section.get("body") or "").strip()
        caption = (section.get("caption") or "").strip()
        image_file_id = section.get("image_file_id") or None
        if image_file_id in ("", "null", "None"):
            image_file_id = None
        if not heading and not body and not image_file_id and not caption:
            continue
        cleaned.append(
            {
                "heading": heading,
                "body": body,
                "caption": caption,
                "image_file_id": int(image_file_id) if str(image_file_id or "").isdigit() else None,
            }
        )
    return cleaned


def _enrich_news_sections(sections):
    rows = _clean_news_sections(sections)
    file_ids = {row["image_file_id"] for row in rows if row.get("image_file_id")}
    files = {
        uploaded.id: uploaded
        for uploaded in UploadedFile.query.filter(UploadedFile.id.in_(file_ids)).all()
    } if file_ids else {}
    enriched = []
    for row in rows:
        item = dict(row)
        uploaded = files.get(item.get("image_file_id"))
        item["image_url"] = _upload_public_url(uploaded) if uploaded else None
        enriched.append(item)
    return enriched


def _news_json(row):
    image_url = _upload_public_url(row.image_file) if row.image_file else None
    return {
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "category": row.category,
        "summary": row.summary,
        "body": row.body,
        "sections": _enrich_news_sections(row.sections or []),
        "image_url": image_url,
        "image_file_id": row.image_file_id,
        "status": row.status,
        "date": str(row.display_date) if row.display_date else None,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
    }


@admin_bp.get("/news")
@login_required
@permission_required("news.view")
def list_news():
    rows = News.query.order_by(News.created_at.desc()).limit(200).all()
    return jsonify(items=[_news_json(r) for r in rows])


@admin_bp.post("/news")
@login_required
@permission_required("news.create")
def create_news():
    payload = request.get_json(silent=True) or {}
    row = News(
        title=payload.get("title"),
        slug=payload.get("slug") or slugify(payload.get("title")),
        category=payload.get("category"),
        summary=payload.get("summary"),
        body=payload.get("body") or "",
        sections=_clean_news_sections(payload.get("sections")),
        image_file_id=payload.get("image_file_id") or None,
        status=payload.get("status") or "draft",
        display_date=date.fromisoformat(payload["date"]) if payload.get("date") else None,
    )
    if not row.title:
        return jsonify(error="Title is required."), 400
    db.session.add(row)
    db.session.flush()
    if row.status == "published" and not row.published_at:
        row.published_at = datetime.now(timezone.utc)
    log_action("create_news", "news", row.id)
    db.session.commit()
    return jsonify(_news_json(row)), 201


@admin_bp.put("/news/<int:news_id>")
@login_required
@permission_required("news.edit")
def update_news(news_id):
    row = db.get_or_404(News, news_id)
    payload = request.get_json(silent=True) or {}
    for field in ["title", "slug", "category", "summary", "body", "image_file_id", "status"]:
        if field in payload:
            setattr(row, field, payload[field])
    if "sections" in payload:
        row.sections = _clean_news_sections(payload.get("sections"))
    if "date" in payload:
        row.display_date = date.fromisoformat(payload["date"]) if payload["date"] else None
    if row.status == "published" and not row.published_at:
        row.published_at = datetime.now(timezone.utc)
    log_action("update_news", "news", row.id)
    db.session.commit()
    return jsonify(_news_json(row))


@admin_bp.delete("/news/<int:news_id>")
@login_required
@permission_required("news.delete")
def delete_news(news_id):
    row = db.get_or_404(News, news_id)
    log_action("delete_news", "news", row.id, {"title": row.title})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="News post deleted.")


@admin_bp.get("/gallery")
@login_required
@permission_required("gallery.view")
def list_gallery():
    rows = GalleryItem.query.order_by(GalleryItem.sort_order.asc(), GalleryItem.created_at.desc()).limit(100).all()
    def _img(r):
        return f"/uploads/{r.image_file.visibility}/{r.image_file.category}/{r.image_file.stored_filename}" if r.image_file else None
    return jsonify(items=[{"id": r.id, "title": r.title, "description": r.description, "image_url": _img(r), "image_file_id": r.image_file_id, "is_published": r.is_published, "status": "published" if r.is_published else "draft", "created_at": r.created_at.isoformat()} for r in rows])


@admin_bp.post("/gallery")
@login_required
@permission_required("gallery.create")
def create_gallery_item():
    payload = request.get_json(silent=True) or {}
    row = GalleryItem(
        title=payload.get("title"),
        description=payload.get("description"),
        image_file_id=payload.get("image_file_id"),
        sort_order=payload.get("sort_order") or 0,
        is_published=bool(payload.get("is_published", payload.get("status") == "published")),
    )
    if not row.title:
        return jsonify(error="Title is required."), 400
    db.session.add(row)
    db.session.flush()
    log_action("create_gallery_item", "gallery_item", row.id)
    db.session.commit()
    return jsonify(id=row.id, title=row.title), 201


@admin_bp.put("/gallery/<int:item_id>")
@login_required
@permission_required("gallery.edit")
def update_gallery_item(item_id):
    row = db.get_or_404(GalleryItem, item_id)
    payload = request.get_json(silent=True) or {}
    for field in ["title", "description", "image_file_id", "sort_order", "is_published"]:
        if field in payload:
            setattr(row, field, payload[field])
    if "status" in payload:
        row.is_published = payload["status"] == "published"
    log_action("update_gallery_item", "gallery_item", row.id)
    db.session.commit()
    return jsonify(id=row.id, title=row.title)


@admin_bp.delete("/gallery/<int:item_id>")
@login_required
@permission_required("gallery.delete")
def delete_gallery_item(item_id):
    row = db.get_or_404(GalleryItem, item_id)
    log_action("delete_gallery_item", "gallery_item", row.id, {"title": row.title})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Gallery item deleted.")


@admin_bp.get("/resources")
@login_required
@permission_required("resources.view")
def list_resources():
    rows = Resource.query.order_by(Resource.created_at.desc()).limit(200).all()
    return jsonify(items=[{"id": r.id, "title": r.title, "description": r.description, "url": r.external_url, "is_published": r.is_published, "status": "published" if r.is_published else "draft", "created_at": r.created_at.isoformat()} for r in rows])


@admin_bp.post("/resources")
@login_required
@permission_required("resources.create")
def create_resource():
    payload = request.get_json(silent=True) or {}
    row = Resource(
        title=payload.get("title"),
        description=payload.get("description"),
        external_url=payload.get("external_url") or payload.get("url"),
        is_published=bool(payload.get("is_published", payload.get("status") == "published")),
    )
    if not row.title:
        return jsonify(error="Title is required."), 400
    db.session.add(row)
    db.session.flush()
    log_action("create_resource", "resource", row.id)
    db.session.commit()
    return jsonify(id=row.id, title=row.title), 201


@admin_bp.put("/resources/<int:resource_id>")
@login_required
@permission_required("resources.edit")
def update_resource(resource_id):
    row = db.get_or_404(Resource, resource_id)
    payload = request.get_json(silent=True) or {}
    for field in ["title", "description", "external_url", "is_published"]:
        if field in payload:
            setattr(row, field, payload[field])
    if "url" in payload:
        row.external_url = payload["url"]
    if "status" in payload:
        row.is_published = payload["status"] == "published"
    log_action("update_resource", "resource", row.id)
    db.session.commit()
    return jsonify(id=row.id, title=row.title)


@admin_bp.delete("/resources/<int:resource_id>")
@login_required
@permission_required("resources.delete")
def delete_resource(resource_id):
    row = db.get_or_404(Resource, resource_id)
    log_action("delete_resource", "resource", row.id, {"title": row.title})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Resource deleted.")


@admin_bp.get("/messages")
@login_required
@permission_required("messages.view")
def list_messages():
    status_filter = request.args.get("status")
    source_filter = request.args.get("source")
    q = ContactMessage.query
    if status_filter:
        q = q.filter(ContactMessage.status == status_filter)
    if source_filter:
        q = q.filter(ContactMessage.source == source_filter)
    rows = q.order_by(ContactMessage.created_at.desc()).limit(500).all()
    return jsonify(items=[{
        "id": r.id,
        "ticket_reference": r.ticket_reference or _ticket_reference(r.id),
        "name": r.name,
        "email": r.email,
        "phone": r.phone or "",
        "subject": r.subject,
        "service": r.source,
        "status": r.status,
        "message": r.message,
        "notes": r.notes or "",
        "date": r.created_at.strftime("%d %b %Y"),
        "created_at": r.created_at.isoformat(),
    } for r in rows])


@admin_bp.put("/messages/<int:message_id>")
@login_required
@permission_required("messages.edit")
def update_message(message_id):
    row = db.get_or_404(ContactMessage, message_id)
    payload = request.get_json(silent=True) or {}
    if "status" in payload:
        row.status = payload["status"]
    if "notes" in payload:
        row.notes = (payload["notes"] or "").strip() or None
    log_action("update_message", "contact_message", row.id, {"status": row.status})
    db.session.commit()
    return jsonify(id=row.id, status=row.status, notes=row.notes)


@admin_bp.post("/messages/<int:message_id>/reply")
@login_required
@permission_required("messages.edit")
def reply_to_message(message_id):
    row = db.get_or_404(ContactMessage, message_id)
    payload = request.get_json(silent=True) or {}
    reply_body = (payload.get("message") or "").strip()
    if not reply_body:
        return jsonify(error="Reply message is required."), 400
    ticket_reference = row.ticket_reference or _ticket_reference(row.id)
    is_bookshop = (row.source or "").lower() == "bookshop"
    _shell = bookshop_email_shell if is_bookshop else app_email_shell
    _eyebrow = "RealMindX Bookshop" if is_bookshop else "RealMindX Education"
    send_email(
        OutboundEmail(
            to=row.email,
            subject=f"Re: [{ticket_reference}] {row.subject}",
            html=_shell(
                f"Reply: {ticket_reference}",
                (
                    f"<p>Hello {escape(row.name.split()[0] if row.name else 'there')},</p>"
                    f"<p>{escape(reply_body).replace(chr(10), '<br>')}</p>"
                    "<hr style=\"border:none;border-top:1px solid #e5e7eb;margin:22px 0;\" />"
                    f"<p style=\"font-size:13px;color:#5b667a;\"><strong>Your original message:</strong><br>"
                    f"{escape(row.message).replace(chr(10), '<br>')}</p>"
                ),
                eyebrow=_eyebrow,
                preheader=f"A reply to your enquiry ref {ticket_reference}.",
            ),
        )
    )
    row.status = "replied"
    log_action("reply_contact_message", "contact_message", row.id, {"ticket_reference": ticket_reference})
    db.session.commit()
    return jsonify(id=row.id, status=row.status, ticket_reference=ticket_reference)


@admin_bp.delete("/messages/<int:message_id>")
@login_required
@permission_required("messages.delete")
def delete_message(message_id):
    row = db.get_or_404(ContactMessage, message_id)
    log_action("delete_message", "contact_message", row.id, {"subject": row.subject})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Message deleted.")


@admin_bp.get("/newsletters")
@login_required
@permission_required("newsletters.view")
def list_newsletters():
    rows = NewsletterSubscriber.query.order_by(NewsletterSubscriber.created_at.desc()).limit(200).all()
    return jsonify(items=[{"id": r.id, "email": r.email, "source": r.source, "is_active": r.is_active, "status": "active" if r.is_active else "unsubscribed", "created_at": r.created_at.isoformat()} for r in rows])


@admin_bp.post("/newsletters/send")
@login_required
@permission_required("newsletters.create")
def send_newsletter_campaign():
    payload = request.get_json(silent=True) or {}
    subject = (payload.get("subject") or "").strip()
    title = (payload.get("title") or subject).strip()
    body = (payload.get("body") or "").strip()
    if not subject or not title or not body:
        return jsonify(error="Subject, title, and body are required."), 400

    body_html = "".join(
        f"<p>{escape(block).replace(chr(10), '<br>')}</p>"
        for block in re.split(r"\n\s*\n", body)
        if block.strip()
    )
    image_url = None
    image_file_id = payload.get("image_file_id")
    if image_file_id:
        image_file = db.session.get(UploadedFile, image_file_id)
        image_url = _upload_public_url(image_file) if image_file else None

    base_url = current_app.config.get("SITE_BASE_URL", "https://realmindxgh.com").rstrip("/")
    subscribers = NewsletterSubscriber.query.filter_by(is_active=True).order_by(NewsletterSubscriber.email.asc()).all()
    sent = 0
    for subscriber in subscribers:
        if not subscriber.unsubscribe_token:
            subscriber.unsubscribe_token = secrets.token_urlsafe(32)
        unsubscribe_url = f"{base_url}/unsubscribe?token={subscriber.unsubscribe_token}"
        send_email(
            OutboundEmail(
                to=subscriber.email,
                subject=subject,
                from_email=current_app.config.get("NEWSLETTER_FROM_EMAIL"),
                html=app_email_shell(
                    title,
                    body_html,
                    payload.get("cta_label") or None,
                    payload.get("cta_url") or None,
                    eyebrow="RealMindX Updates",
                    preheader=payload.get("preheader") or payload.get("summary") or title,
                    hero_image_url=image_url,
                    footer_note=(
                        f'You are receiving this because you subscribed to RealMindX updates. '
                        f'<a href="{unsubscribe_url}" style="color:#aaa;">Unsubscribe</a>'
                    ),
                ),
            )
        )
        sent += 1

    log_action("send_newsletter_campaign", "newsletter", None, {"subject": subject, "sent": sent})
    db.session.commit()
    return jsonify(message=f"Newsletter sent to {sent} subscriber(s).", sent=sent)


@admin_bp.put("/newsletters/<int:subscriber_id>")
@login_required
@permission_required("newsletters.edit")
def update_newsletter_subscriber(subscriber_id):
    row = db.get_or_404(NewsletterSubscriber, subscriber_id)
    payload = request.get_json(silent=True) or {}
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    if "status" in payload:
        row.is_active = payload["status"] == "active"
    log_action("update_newsletter_subscriber", "newsletter_subscriber", row.id)
    db.session.commit()
    return jsonify(id=row.id, email=row.email, is_active=row.is_active)


@admin_bp.delete("/newsletters/<int:subscriber_id>")
@login_required
@permission_required("newsletters.delete")
def delete_newsletter_subscriber(subscriber_id):
    row = db.get_or_404(NewsletterSubscriber, subscriber_id)
    log_action("delete_newsletter_subscriber", "newsletter_subscriber", row.id, {"email": row.email})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Subscriber deleted.")


@admin_bp.get("/services")
@login_required
@permission_required("services.view")
def list_services_content():
    rows = _admin_collection_items("services", DEFAULT_SERVICES)
    rows = _enrich_service_media(rows)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("sort_order") or 0, item.get("label") or "")))


@admin_bp.post("/services")
@login_required
@permission_required("services.create")
def create_service_content():
    payload = request.get_json(silent=True) or {}
    if not (payload.get("label") or payload.get("title")):
        return jsonify(error="Service label or title is required."), 400
    row, error = _create_admin_collection_item("services", DEFAULT_SERVICES, payload, "service")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0]), 201


@admin_bp.put("/services/<string:service_id>")
@login_required
@permission_required("services.edit")
def update_service_content(service_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("services", DEFAULT_SERVICES, service_id, payload, "service")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0])


@admin_bp.delete("/services/<string:service_id>")
@login_required
@permission_required("services.delete")
def delete_service_content(service_id):
    return _delete_admin_collection_item("services", DEFAULT_SERVICES, service_id, "service")


@admin_bp.get("/partners")
@login_required
@permission_required("partners.view")
def list_partners_content():
    rows = _admin_collection_items("partners", DEFAULT_PARTNERS)
    rows = _enrich_service_media(rows)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("sort_order") or 0, item.get("name") or "")))


@admin_bp.post("/partners")
@login_required
@permission_required("partners.create")
def create_partner_content():
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        return jsonify(error="Partner name is required."), 400
    row, error = _create_admin_collection_item("partners", DEFAULT_PARTNERS, payload, "partner")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0]), 201


@admin_bp.put("/partners/<string:partner_id>")
@login_required
@permission_required("partners.edit")
def update_partner_content(partner_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("partners", DEFAULT_PARTNERS, partner_id, payload, "partner")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0])


@admin_bp.delete("/partners/<string:partner_id>")
@login_required
@permission_required("partners.delete")
def delete_partner_content(partner_id):
    return _delete_admin_collection_item("partners", DEFAULT_PARTNERS, partner_id, "partner")


@admin_bp.get("/people")
@login_required
@permission_required("people.view")
def list_people_content():
    rows = _admin_collection_items("people", DEFAULT_PEOPLE)
    rows = _enrich_service_media(rows)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("sort_order") or 0, item.get("name") or "")))


@admin_bp.post("/people")
@login_required
@permission_required("people.create")
def create_people_content():
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        return jsonify(error="Person name is required."), 400
    row, error = _create_admin_collection_item("people", DEFAULT_PEOPLE, payload, "person")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0]), 201


@admin_bp.put("/people/<string:person_id>")
@login_required
@permission_required("people.edit")
def update_people_content(person_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("people", DEFAULT_PEOPLE, person_id, payload, "person")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0])


@admin_bp.delete("/people/<string:person_id>")
@login_required
@permission_required("people.delete")
def delete_people_content(person_id):
    return _delete_admin_collection_item("people", DEFAULT_PEOPLE, person_id, "person")


@admin_bp.get("/testimonials")
@login_required
@permission_required("testimonials.view")
def list_testimonials_content():
    rows = _admin_collection_items("testimonials", DEFAULT_TESTIMONIALS)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("sort_order") or 0, item.get("name") or "")))


@admin_bp.post("/testimonials")
@login_required
@permission_required("testimonials.create")
def create_testimonial_content():
    payload = request.get_json(silent=True) or {}
    if not payload.get("quote"):
        return jsonify(error="Testimonial quote is required."), 400
    if not payload.get("name"):
        return jsonify(error="Client name is required."), 400
    row, error = _create_admin_collection_item("testimonials", DEFAULT_TESTIMONIALS, payload, "testimonial")
    if error:
        return error
    return jsonify(row), 201


@admin_bp.put("/testimonials/<string:testimonial_id>")
@login_required
@permission_required("testimonials.edit")
def update_testimonial_content(testimonial_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("testimonials", DEFAULT_TESTIMONIALS, testimonial_id, payload, "testimonial")
    if error:
        return error
    return jsonify(row)


@admin_bp.delete("/testimonials/<string:testimonial_id>")
@login_required
@permission_required("testimonials.delete")
def delete_testimonial_content(testimonial_id):
    return _delete_admin_collection_item("testimonials", DEFAULT_TESTIMONIALS, testimonial_id, "testimonial")


@admin_bp.get("/home-hero-slides")
@login_required
@permission_required("homeHeroSlides.view")
def list_home_hero_slides():
    rows = _admin_collection_items("home_hero_slides", DEFAULT_HOME_HERO_SLIDES)
    rows = _enrich_service_media(rows)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("sort_order") or 0, item.get("label") or "")))


@admin_bp.post("/home-hero-slides")
@login_required
@permission_required("homeHeroSlides.create")
def create_home_hero_slide():
    payload = request.get_json(silent=True) or {}
    if not payload.get("label"):
        return jsonify(error="Slide label is required."), 400
    row, error = _create_admin_collection_item("home_hero_slides", DEFAULT_HOME_HERO_SLIDES, payload, "home_hero_slide")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0]), 201


@admin_bp.put("/home-hero-slides/<string:slide_id>")
@login_required
@permission_required("homeHeroSlides.edit")
def update_home_hero_slide(slide_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("home_hero_slides", DEFAULT_HOME_HERO_SLIDES, slide_id, payload, "home_hero_slide")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0])


@admin_bp.delete("/home-hero-slides/<string:slide_id>")
@login_required
@permission_required("homeHeroSlides.delete")
def delete_home_hero_slide(slide_id):
    return _delete_admin_collection_item("home_hero_slides", DEFAULT_HOME_HERO_SLIDES, slide_id, "home_hero_slide")


@admin_bp.get("/donation-slides")
@login_required
@permission_required("donationSlides.view")
def list_donation_slides():
    rows = _admin_collection_items("donation_slides", DEFAULT_DONATION_SLIDES)
    rows = _enrich_service_media(rows)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("sort_order") or 0, item.get("label") or "")))


@admin_bp.post("/donation-slides")
@login_required
@permission_required("donationSlides.create")
def create_donation_slide():
    payload = request.get_json(silent=True) or {}
    if not payload.get("label"):
        return jsonify(error="Slide label is required."), 400
    row, error = _create_admin_collection_item("donation_slides", DEFAULT_DONATION_SLIDES, payload, "donation_slide")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0]), 201


@admin_bp.put("/donation-slides/<string:slide_id>")
@login_required
@permission_required("donationSlides.edit")
def update_donation_slide(slide_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("donation_slides", DEFAULT_DONATION_SLIDES, slide_id, payload, "donation_slide")
    if error:
        return error
    return jsonify(_enrich_service_media([row])[0])


@admin_bp.delete("/donation-slides/<string:slide_id>")
@login_required
@permission_required("donationSlides.delete")
def delete_donation_slide(slide_id):
    return _delete_admin_collection_item("donation_slides", DEFAULT_DONATION_SLIDES, slide_id, "donation_slide")


@admin_bp.get("/site-copy")
@login_required
@permission_required("siteCopy.view")
def list_site_copy_content():
    rows = _admin_collection_items("site_copy", DEFAULT_SITE_COPY)
    return jsonify(items=sorted(rows, key=lambda item: (item.get("area") or "", item.get("label") or "")))


@admin_bp.post("/site-copy")
@login_required
@permission_required("siteCopy.create")
def create_site_copy_content():
    payload = request.get_json(silent=True) or {}
    if not payload.get("key"):
        return jsonify(error="Copy key is required."), 400
    payload["id"] = payload.get("id") or payload["key"]
    row, error = _create_admin_collection_item("site_copy", DEFAULT_SITE_COPY, payload, "site_copy")
    if error:
        return error
    return jsonify(row), 201


@admin_bp.put("/site-copy/<string:copy_id>")
@login_required
@permission_required("siteCopy.edit")
def update_site_copy_content(copy_id):
    payload = request.get_json(silent=True) or {}
    row, error = _update_admin_collection_item("site_copy", DEFAULT_SITE_COPY, copy_id, payload, "site_copy")
    if error:
        return error
    return jsonify(row)


@admin_bp.delete("/site-copy/<string:copy_id>")
@login_required
@permission_required("siteCopy.delete")
def delete_site_copy_content(copy_id):
    return _delete_admin_collection_item("site_copy", DEFAULT_SITE_COPY, copy_id, "site_copy")


@admin_bp.get("/settings")
@login_required
@permission_required("settings.view")
def list_settings():
    rows = SiteSetting.query.order_by(SiteSetting.key.asc()).all()
    return jsonify(items=[{"id": r.id, "key": r.key, "value": r.value, "public": r.public} for r in rows])


@admin_bp.get("/flyers")
@login_required
@permission_required("flyers.view")
def list_flyers():
    rows = Flyer.query.order_by(Flyer.sort_order.asc(), Flyer.created_at.asc()).all()
    def _img(r):
        return f"/uploads/{r.image_file.visibility}/{r.image_file.category}/{r.image_file.stored_filename}" if r.image_file else None
    return jsonify(items=[{
        "id": r.id,
        "headline": r.headline,
        "accent": r.accent,
        "subline": r.subline,
        "badge": r.badge,
        "sort_order": r.sort_order,
        "show_overlay": r.show_overlay,
        "image_fit": r.image_fit,
        "image_position": r.image_position,
        "image_url": _img(r),
        "image_file_id": r.image_file_id,
        "status": r.status,
    } for r in rows])


@admin_bp.post("/flyers")
@login_required
@permission_required("flyers.create")
def create_flyer():
    payload = request.get_json(silent=True) or {}
    row = Flyer(
        headline=(payload.get("headline") or "").strip() or None,
        accent=(payload.get("accent") or "").strip() or None,
        subline=(payload.get("subline") or "").strip() or None,
        badge=(payload.get("badge") or "").strip() or None,
        sort_order=int(payload.get("sort_order") or 0),
        image_file_id=payload.get("image_file_id") or None,
        show_overlay=bool(payload.get("show_overlay", False)),
        image_fit=payload.get("image_fit") or "cover",
        image_position=payload.get("image_position") or "center",
        status=payload.get("status") or "published",
    )
    if not row.headline and not row.image_file_id:
        return jsonify(error="Add headline text, an image, or both."), 400
    db.session.add(row)
    db.session.flush()
    log_action("create_flyer", "flyer", row.id)
    db.session.commit()
    return jsonify(id=row.id, headline=row.headline, status=row.status), 201


@admin_bp.put("/flyers/<int:flyer_id>")
@login_required
@permission_required("flyers.edit")
def update_flyer(flyer_id):
    row = db.get_or_404(Flyer, flyer_id)
    payload = request.get_json(silent=True) or {}
    for field in ["headline", "accent", "subline", "badge", "sort_order", "image_file_id", "show_overlay", "image_fit", "image_position", "status"]:
        if field in payload:
            value = payload[field]
            if field in {"headline", "accent", "subline", "badge", "image_file_id"}:
                value = (str(value).strip() if value is not None else "") or None
            setattr(row, field, value)
    if not row.headline and not row.image_file_id:
        return jsonify(error="Add headline text, an image, or both."), 400
    log_action("update_flyer", "flyer", row.id)
    db.session.commit()
    return jsonify(id=row.id, headline=row.headline, status=row.status)


@admin_bp.delete("/flyers/<int:flyer_id>")
@login_required
@permission_required("flyers.delete")
def delete_flyer(flyer_id):
    row = db.get_or_404(Flyer, flyer_id)
    log_action("delete_flyer", "flyer", row.id, {"headline": row.headline})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Flyer deleted.")


# ============================================================
# PROMO CODES
# ============================================================

@admin_bp.get("/promo-codes")
@login_required
@permission_required("manage_products")
def list_promo_codes():
    from ..models import PromoCode
    rows = PromoCode.query.order_by(PromoCode.created_at.desc()).all()
    return jsonify(items=[_promo_json(r) for r in rows])


@admin_bp.post("/promo-codes")
@login_required
@permission_required("manage_products")
def create_promo_code():
    from ..models import PromoCode
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().upper()
    if not code:
        return jsonify(error="Code is required."), 400
    if PromoCode.query.filter_by(code=code).first():
        return jsonify(error="A promo code with that name already exists."), 409
    row = PromoCode(
        code=code,
        description=(payload.get("description") or "").strip() or None,
        discount_type=payload.get("discount_type") or "percentage",
        discount_value=payload.get("discount_value") or 0,
        applies_to=payload.get("applies_to") or "products",
        min_order_amount=payload.get("min_order_amount") or 0,
        max_uses=payload.get("max_uses") or None,
        valid_from=payload.get("valid_from") or None,
        valid_until=payload.get("valid_until") or None,
        is_active=bool(payload.get("is_active", True)),
    )
    db.session.add(row)
    db.session.flush()
    log_action("create_promo_code", "promo_code", row.id, {"code": row.code})
    db.session.commit()
    return jsonify(promo_code=_promo_json(row)), 201


@admin_bp.put("/promo-codes/<int:promo_id>")
@login_required
@permission_required("manage_products")
def update_promo_code(promo_id):
    from ..models import PromoCode
    row = db.get_or_404(PromoCode, promo_id)
    payload = request.get_json(silent=True) or {}
    for field in ["description", "discount_type", "discount_value", "applies_to",
                  "min_order_amount", "max_uses", "valid_from", "valid_until", "is_active"]:
        if field in payload:
            setattr(row, field, payload[field])
    log_action("update_promo_code", "promo_code", row.id, {"code": row.code})
    db.session.commit()
    return jsonify(promo_code=_promo_json(row))


@admin_bp.delete("/promo-codes/<int:promo_id>")
@login_required
@permission_required("manage_products")
def delete_promo_code(promo_id):
    from ..models import PromoCode
    row = db.get_or_404(PromoCode, promo_id)
    log_action("delete_promo_code", "promo_code", row.id, {"code": row.code})
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Promo code deleted.")


def _promo_json(r):
    return {
        "id": r.id, "code": r.code, "description": r.description,
        "discount_type": r.discount_type, "discount_value": float(r.discount_value or 0),
        "applies_to": r.applies_to, "min_order_amount": float(r.min_order_amount or 0),
        "max_uses": r.max_uses, "uses_count": r.uses_count,
        "valid_from": str(r.valid_from) if r.valid_from else None,
        "valid_until": str(r.valid_until) if r.valid_until else None,
        "is_active": r.is_active, "created_at": r.created_at.isoformat(),
    }


# ============================================================
# BULK PRICE ADJUSTMENT
# ============================================================

@admin_bp.post("/products/bulk-price-adjust")
@login_required
@permission_required("manage_products")
def bulk_price_adjust():
    """Apply a percentage or fixed amount increase/decrease to ALL active product prices."""
    payload = request.get_json(silent=True) or {}
    adjustment_type = payload.get("type") or "percentage"   # percentage | fixed
    value = float(payload.get("value") or 0)
    direction = payload.get("direction") or "decrease"       # increase | decrease
    if value <= 0:
        return jsonify(error="Value must be greater than zero."), 400

    products = Product.query.filter_by(is_active=True).all()
    count = 0
    for p in products:
        old_price = float(p.price or 0)
        if adjustment_type == "percentage":
            delta = old_price * (value / 100)
        else:
            delta = value
        if direction == "increase":
            new_price = old_price + delta
        else:
            new_price = max(0.01, old_price - delta)
        p.price = round(new_price, 2)
        count += 1
    log_action("bulk_price_adjust", "product", None, {
        "type": adjustment_type, "value": value, "direction": direction, "count": count,
    })
    db.session.commit()
    return jsonify(message=f"Updated {count} products.", count=count)


# ============================================================
# DELIVERY FEE BULK ADJUST
# ============================================================

@admin_bp.post("/delivery-zones/bulk-adjust")
@login_required
@permission_required("manage_orders")
def bulk_delivery_adjust():
    """Apply a percentage or fixed amount increase/decrease to ALL active delivery zone fees."""
    from ..models import DeliveryZone
    payload = request.get_json(silent=True) or {}
    adjustment_type = payload.get("type") or "percentage"
    value = float(payload.get("value") or 0)
    direction = payload.get("direction") or "increase"
    if value <= 0:
        return jsonify(error="Value must be greater than zero."), 400

    zones = DeliveryZone.query.filter_by(is_active=True).all()
    count = 0
    for z in zones:
        if float(z.fee or 0) == 0:
            continue  # skip free zones
        old_fee = float(z.fee)
        if adjustment_type == "percentage":
            delta = old_fee * (value / 100)
        else:
            delta = value
        if direction == "increase":
            new_fee = old_fee + delta
        else:
            new_fee = max(0, old_fee - delta)
        z.fee = round(new_fee, 2)
        count += 1
    log_action("bulk_delivery_adjust", "delivery_zone", None, {
        "type": adjustment_type, "value": value, "direction": direction, "count": count,
    })
    db.session.commit()
    return jsonify(message=f"Updated {count} delivery zones.", count=count)


@admin_bp.put("/settings/<string:key>")
@login_required
@permission_required("settings.edit")
def upsert_setting(key):
    payload = request.get_json(silent=True) or {}
    row = SiteSetting.query.filter_by(key=key).first()
    if not row:
        row = SiteSetting(key=key)
        db.session.add(row)
    row.value = payload.get("value")
    row.public = bool(payload.get("public", row.public))
    log_action("upsert_setting", "site_setting", key)
    db.session.commit()
    return jsonify(key=row.key, value=row.value, public=row.public)


@admin_bp.delete("/settings/<string:key>")
@login_required
@permission_required("settings.delete")
def delete_setting(key):
    row = SiteSetting.query.filter_by(key=key).first_or_404()
    log_action("delete_setting", "site_setting", key)
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Setting deleted.")
