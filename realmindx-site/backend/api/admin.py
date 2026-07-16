import csv
import io
import json
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

from flask import Blueprint, Response, current_app, g, jsonify, request, send_file
from flask_login import current_user, login_required
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload
from werkzeug.utils import secure_filename

from ..analytics import build_analytics_dashboard, build_product_detail, parse_analytics_range
from ..audit_labels import AREA_LABELS, readable_audit_action, readable_audit_summary
from ..book_requests import (
    BookRequestError,
    mark_available,
    request_json,
    send_available_notification,
)
from ..contacts import (
    MARKETING_ACTIVE,
    TRANSACTIONAL_ONLY,
    UNSUBSCRIBED,
    contact_json,
    normalize_contact_email,
    upsert_contact,
)
from ..default_content import (
    DEFAULT_DONATION_SLIDES,
    DEFAULT_HOME_HERO_SLIDES,
    DEFAULT_PARTNERS,
    DEFAULT_PEOPLE,
    DEFAULT_SERVICES,
    DEFAULT_SITE_COPY,
    DEFAULT_TESTIMONIALS,
)
from ..email_service import (
    EmailAttachment,
    OutboundEmail,
    app_email_shell,
    bookshop_email_shell,
    bookshop_order_summary_table,
    send_email,
)
from ..extensions import db
from ..delivery_locations import format_location_aliases
from ..delivery_service import (
    DeliveryError,
    OTP_OVERRIDE_REASONS,
    actor_from_user,
    assign_order_to_company,
    cancel_delivery,
    create_company,
    create_company_user,
    reset_portal_password,
    resend_delivery_otp,
    send_portal_access_notification,
    staff_delivery_contact_warning,
    staff_override_otp,
)
from ..location_data import parse_location_ids
from ..order_status import normalize_order_status
from ..profile_completion import teacher_profile_completion
from ..sms_service import normalise_phone
from ..models import (
    AnalyticsEvent,
    AuditLog,
    BookRequest,
    ContactMessage,
    CartInvoice,
    DeliveryCompany,
    DeliveryCompanyUser,
    DeliveryEvent,
    DeliveryOtp,
    DeliveryRider,
    DeliverySettlementBatch,
    DeliveryZone,
    Flyer,
    Job,
    JobAlertPreference,
    JobApplication,
    NewsletterSubscriber,
    News,
    Order,
    OrderDelivery,
    OrderItem,
    OrderReview,
    Permission,
    PromoCode,
    Product,
    ProductCategory,
    ProductReview,
    Resource,
    Role,
    GalleryItem,
    TeacherPlacement,
    User,
    UserProfile,
    SiteSetting,
    UploadedFile,
)
from ..promo_affiliates import (
    record_completed_order_promo_usage,
    send_promo_usage_notification,
    usage_snapshot,
)
from ..security import DEFAULT_TEMPORARY_PASSWORD, admin_or_staff_required, admin_required, permission_required
from ..settlement_service import (
    SettlementError, apply_adjustment, batch_json, line_json, mark_settled,
    raise_dispute, resolve_dispute,
)
from ..serializers import (
    delivery_company_json,
    delivery_company_user_json,
    delivery_event_json,
    delivery_json,
    delivery_rider_json,
    delivery_zone_json,
    job_json,
    order_json,
    order_review_json,
    product_json,
    user_json,
)
from ..upload_utils import save_upload

admin_bp = Blueprint("admin", __name__)


@admin_bp.after_request
def capture_unlogged_management_change(response):
    """Guarantee that successful admin/staff changes leave an audit record."""
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"} or response.status_code >= 400:
        return response
    if getattr(g, "audit_logged", False) or not current_user.is_authenticated:
        return response
    endpoint = str(request.endpoint or "management_action").split(".")[-1]
    try:
        from ..audit import audit as _audit
        _audit(endpoint, "management_portal", details={"page": request.path, "method": request.method})
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Could not record the audit entry for %s", request.path)
    return response


def _book_request_error(exc):
    db.session.rollback()
    return jsonify(error=exc.message, code=exc.code), exc.status_code


@admin_bp.get("/book-requests")
@login_required
@permission_required("bookRequests.view")
def list_book_requests():
    page = max(1, request.args.get("page", 1, type=int))
    page_size = min(100, max(5, request.args.get("page_size", 10, type=int)))
    status = (request.args.get("status") or "").strip().lower()
    search = (request.args.get("q") or "").strip()
    query = BookRequest.query
    if status in {"pending", "available"}:
        query = query.filter(BookRequest.status == status)
    if search:
        needle = f"%{search}%"
        query = query.filter(or_(
            BookRequest.reference.ilike(needle),
            BookRequest.requested_title.ilike(needle),
            BookRequest.customer_name.ilike(needle),
            BookRequest.email.ilike(needle),
            BookRequest.phone.ilike(needle),
        ))
    pagination = query.order_by(BookRequest.created_at.desc()).paginate(page=page, per_page=page_size, error_out=False)
    pending_count = BookRequest.query.filter_by(status="pending").count()
    return jsonify(
        items=[request_json(row, include_private=True) for row in pagination.items],
        page=pagination.page,
        pages=pagination.pages,
        total=pagination.total,
        pending_count=pending_count,
    )


@admin_bp.get("/book-requests/<int:request_id>")
@login_required
@permission_required("bookRequests.view")
def get_book_request(request_id):
    row = db.get_or_404(BookRequest, request_id)
    payload = request_json(row, include_private=True)
    event_labels = {
        "book_request_created": "Request received",
        "book_request_duplicate_reused": "Existing request reused",
        "book_request_acknowledgement": "Acknowledgement sent",
        "book_request_marked_available": "Book marked available",
        "book_request_availability_notification": "Availability notice sent",
        "book_request_notification_retried": "Availability notice retried",
    }
    def request_event_label(event):
        details = event.details or {}
        if event.action == "book_request_acknowledgement" and "sent" not in {details.get("email"), details.get("sms")}:
            return "Acknowledgement could not be sent"
        if event.action in {"book_request_availability_notification", "book_request_notification_retried"} and "sent" not in {details.get("email"), details.get("sms")}:
            return "Availability notice could not be sent"
        return event_labels.get(event.action, event.action.replace("_", " ").capitalize())
    events = AuditLog.query.filter_by(entity_type="book_request", entity_id=str(row.id)).order_by(AuditLog.created_at.desc()).all()
    payload["history"] = [{
        "id": event.id,
        "action": request_event_label(event),
        "details": event.details or {},
        "created_at": event.created_at.isoformat(),
    } for event in events]
    return jsonify(request=payload)


@admin_bp.post("/book-requests/<int:request_id>/available")
@login_required
@permission_required("bookRequests.manage")
def make_book_request_available(request_id):
    payload = request.get_json(silent=True) or {}
    row = db.get_or_404(BookRequest, request_id)
    try:
        notification = mark_available(row, payload.get("product_url"), current_user.id)
        db.session.commit()
    except BookRequestError as exc:
        return _book_request_error(exc)
    return jsonify(request=request_json(row, include_private=True), notification=notification)


@admin_bp.post("/book-requests/<int:request_id>/retry-notification")
@login_required
@permission_required("bookRequests.manage")
def retry_book_request_notification(request_id):
    row = db.get_or_404(BookRequest, request_id)
    if row.status != "available":
        return jsonify(error="Only available requests can be notified."), 409
    try:
        notification = send_available_notification(row, retry=True)
        db.session.commit()
    except BookRequestError as exc:
        return _book_request_error(exc)
    return jsonify(request=request_json(row, include_private=True), notification=notification)


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "item"


def _send_internal_account_access_email(user, role_name):
    login_path = "/staff/login" if role_name == "staff" else "/admin/login"
    login_url = f"{current_app.config['BASE_URL'].rstrip('/')}{login_path}"
    role_label = "Staff" if role_name == "staff" else "Admin"
    body = (
        f"<p>Hello {escape(user.full_name or role_label)},</p>"
        f"<p>Your RealMindX {role_label.lower()} account has been created or reset.</p>"
        '<div style="background:#f5f8fc;border:1px solid #d9e3f0;border-radius:10px;padding:18px 20px;margin:20px 0;">'
        f"<p style=\"margin:0 0 8px;\"><strong>Email:</strong> {escape(user.email)}</p>"
        f"<p style=\"margin:0;\"><strong>Temporary password:</strong> {escape(DEFAULT_TEMPORARY_PASSWORD)}</p>"
        "</div>"
        "<p>You must change this password immediately after your first sign-in.</p>"
    )
    try:
        result = send_email(OutboundEmail(
            to=user.email,
            subject=f"Your RealMindX {role_label} account",
            html=app_email_shell(
                f"{role_label} account ready",
                body,
                cta_label=f"Open {role_label} sign in",
                cta_url=login_url,
                eyebrow="RealMindX Secure Access",
                preheader=f"Your RealMindX {role_label.lower()} account is ready.",
            ),
            text=(
                f"Your RealMindX {role_label} account is ready. Email: {user.email}. "
                f"Temporary password: {DEFAULT_TEMPORARY_PASSWORD}. Login: {login_url}. "
                "Change the password on first sign-in."
            ),
        ))
        return result.get("status", "failed")
    except Exception as exc:
        current_app.logger.warning("Internal account email failed for user %s: %s", user.id, exc)
        return "failed"


def placed_order_query():
    return Order.query.filter(
        or_(
            Order.payment_method.is_(None),
            Order.payment_method != "online",
            Order.payment_status == "paid",
        )
    )


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
        invoice_id=order.invoice_id,
        order_reference=order.order_reference,
        customer_name=order.customer_name,
        email=order.email,
        phone=order.phone,
        delivery_method=order.delivery_method,
        delivery_zone_name=order.delivery_zone_name,
        location=order.location,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        status=order.status,
        created_at=order.created_at,
        updated_at=order.updated_at,
        subtotal_amount=order.subtotal_amount,
        bulk_discount_amount=order.bulk_discount_amount,
        promo_code=order.promo_code,
        promo_applies_to=order.promo_applies_to,
        promo_discount_amount=order.promo_discount_amount,
        delivery_fee=order.delivery_fee,
        total_amount=order.total_amount,
        notes=order.notes,
        items=[
            SimpleNamespace(
                product_id=item.product_id,
                product_name=item.product_name,
                unit_price=item.unit_price,
                quantity=item.quantity,
            )
            for item in order.items
        ],
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


def _uploaded_file_payload(uploaded_file):
    if not uploaded_file:
        return None
    return {
        "id": uploaded_file.id,
        "name": uploaded_file.original_filename,
        "url": _upload_public_url(uploaded_file),
        "category": uploaded_file.category,
        "visibility": uploaded_file.visibility,
    }


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


def _can_view_dashboard_metric(permission_key):
    role_name = current_user.role.name if current_user.role else ""
    if role_name == "admin":
        return True
    return current_user.has_permission(permission_key)


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


def _dateish(value):
    if value in {None, ""}:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise ValueError("Use a valid YYYY-MM-DD date.") from exc


def _intish(value, default=0):
    try:
        return int(float(str(value if value is not None else "").strip()))
    except (TypeError, ValueError):
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


def _save_imported_image(filename, data, owner_id):
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
        owner_id=owner_id,
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
    return uploaded.id, target


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


def _save_imported_images(file_storage, owner_id):
    if not file_storage or not file_storage.filename:
        return {}, []
    if not file_storage.filename.lower().endswith(".zip"):
        raise ValueError("Batch images must be uploaded as a ZIP file.")
    file_storage.stream.seek(0, 2)
    archive_bytes = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if archive_bytes > 100 * 1024 * 1024:
        raise ValueError("Image ZIP must be 100 MB or smaller.")
    if not zipfile.is_zipfile(file_storage.stream):
        raise ValueError("Choose a valid ZIP archive for the product images.")
    file_storage.stream.seek(0)
    total_uncompressed = 0
    max_entries = 500
    max_image_bytes = 12 * 1024 * 1024
    max_uncompressed_bytes = 512 * 1024 * 1024
    saved_images = {}
    saved_paths = []
    with zipfile.ZipFile(file_storage.stream) as archive:
        entries = [
            entry
            for entry in archive.infolist()
            if not entry.is_dir() and "__MACOSX" not in entry.filename
        ]
        if len(entries) > max_entries:
            raise ValueError(f"Image ZIP contains too many files. Use at most {max_entries}.")
        for entry in entries:
            basename = Path(entry.filename).name
            if not basename:
                continue
            if entry.file_size > max_image_bytes:
                raise ValueError(f"{basename} is larger than the 12 MB per-image limit.")
            total_uncompressed += entry.file_size
            if total_uncompressed > max_uncompressed_bytes:
                raise ValueError("Image ZIP expands beyond the 512 MB safety limit.")
        for entry in entries:
            basename = Path(entry.filename).name
            if not basename:
                continue
            saved = _save_imported_image(basename, archive.read(entry), owner_id)
            if not saved:
                continue
            file_id, target = saved
            saved_images[basename.lower()] = file_id
            saved_paths.append(target)
    return saved_images, saved_paths


PRODUCT_IMPORT_FIELDS = (
    {"key": "name", "label": "Product name", "required": True, "aliases": ("name", "product_name", "title")},
    {"key": "slug", "label": "Slug", "aliases": ("slug",)},
    {"key": "category", "label": "Category", "aliases": ("category", "product_category")},
    {"key": "price", "label": "Price", "aliases": ("price", "unit_price")},
    {"key": "old_price", "label": "Old price", "aliases": ("old_price", "compare_at_price")},
    {
        "key": "short_description",
        "label": "Short description",
        "aliases": ("short_description", "description", "summary"),
    },
    {
        "key": "full_description",
        "label": "Full description",
        "aliases": ("full_description", "details", "body"),
    },
    {"key": "stock_status", "label": "Stock status", "aliases": ("stock_status", "stock")},
    {
        "key": "quantity_available",
        "label": "Quantity",
        "aliases": ("quantity_available", "quantity", "qty"),
    },
    {"key": "subject", "label": "Subject", "aliases": ("subject",)},
    {"key": "level", "label": "Level", "aliases": ("level", "class", "grade")},
    {
        "key": "curriculum",
        "label": "Curriculum",
        "aliases": ("curriculum", "curriculum_name", "syllabus"),
    },
    {"key": "author", "label": "Author", "aliases": ("author", "writer")},
    {"key": "publisher", "label": "Publisher", "aliases": ("publisher", "publishing_house")},
    {"key": "product_type", "label": "Product type", "aliases": ("product_type", "item_type", "type")},
    {"key": "delivery_note", "label": "Delivery note", "aliases": ("delivery_note",)},
    {"key": "tags", "label": "Tags", "aliases": ("tags", "badges")},
    {"key": "featured", "label": "Featured", "aliases": ("featured", "is_featured")},
    {"key": "source", "label": "Source", "aliases": ("source", "supplier", "vendor")},
    {
        "key": "image_filename",
        "label": "Image filename",
        "aliases": ("image_filename", "image", "cover_filename", "cover_image"),
    },
)


def _normalise_import_header(value):
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def _import_headers(rows):
    if not rows:
        return []
    return [str(header or "").strip() for header in rows[0].keys() if str(header or "").strip()]


def _suggest_import_mapping(headers):
    normalised = {_normalise_import_header(header): header for header in headers}
    mapping = {}
    for field in PRODUCT_IMPORT_FIELDS:
        for alias in field["aliases"]:
            source = normalised.get(_normalise_import_header(alias))
            if source:
                mapping[field["key"]] = source
                break
    return mapping


def _parse_import_mapping(raw_mapping, headers):
    if not raw_mapping:
        return {}
    try:
        mapping = json.loads(raw_mapping)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Column mapping is invalid. Review the matched columns and try again.") from exc
    if not isinstance(mapping, dict):
        raise ValueError("Column mapping must be an object.")
    allowed_fields = {field["key"] for field in PRODUCT_IMPORT_FIELDS}
    allowed_headers = set(headers)
    clean_mapping = {}
    for field, source in mapping.items():
        if field not in allowed_fields or not source:
            continue
        if source not in allowed_headers:
            raise ValueError(f'The mapped column "{source}" is no longer present in the catalogue.')
        clean_mapping[field] = source
    return clean_mapping


def _apply_import_mapping(row, mapping):
    if not mapping:
        return row
    return {field: row.get(source) for field, source in mapping.items()}


def _json_safe_import_value(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


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
        "quantity_available": (
            int(_decimalish(pick("quantity_available", "quantity", "qty")))
            if pick("quantity_available", "quantity", "qty") not in (None, "")
            else None
        ),
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


def _matches_job_alert(job, preference, user=None):
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
    subject_match = not job_subject or job_subject in pref_subjects
    pref_location_ids = set(parse_location_ids(preference.location_ids))
    if pref_location_ids:
        location_match = bool(job.delivery_zone_id and job.delivery_zone_id in pref_location_ids)
    else:
        pref_locations = values(preference.location)
        location_match = bool(pref_locations and aliases(job.location) in {aliases(item) for item in pref_locations})
    pref_levels = {aliases(item) for item in values(preference.preferred_level)}
    job_level = aliases(job.level)
    level_match = not job_level or job_level in pref_levels
    pref_curricula = {aliases(item) for item in values(preference.curriculum)}
    job_curriculum = aliases(job.curriculum)
    curriculum_match = not job_curriculum or job_curriculum in pref_curricula
    pref_types = {aliases(item) for item in values(preference.employment_type)}
    job_type = aliases(job.employment_type)
    type_match = not job_type or job_type in pref_types
    required_sex = (job.preferred_sex or "any").strip().lower()
    required_age = (job.preferred_age_range or "any").strip().lower()
    sex_match = required_sex == "any" or (user and (user.sex or "").lower() == required_sex)
    age_match = required_age == "any" or (user and (user.age_range or "").lower() == required_age)
    return subject_match and location_match and level_match and curriculum_match and type_match and sex_match and age_match


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
    processed_user_ids = set()
    for preference in preferences:
        user = db.session.get(User, preference.user_id)
        if (
            not user
            or user.id in processed_user_ids
            or teacher_profile_completion(user)[0] < 100
            or not _matches_job_alert(job, preference, user)
        ):
            continue
        processed_user_ids.add(user.id)
        job_url = f"{current_app.config['BASE_URL'].rstrip('/')}/jobs#{job.id}"
        try:
            result = send_email(
                OutboundEmail(
                    to=user.email,
                    from_email=current_app.config["JOBS_FROM_EMAIL"],
                    subject=f"A teaching opportunity matches your preferences: {job.title}",
                    html=app_email_shell(
                        "Good news — a teaching opportunity matches you",
                        f"<p>Hello {escape(user.first_name or 'Teacher')},</p>"
                        "<p>We found a teaching opportunity that matches all of your saved preferences.</p>"
                        f"<p><strong>{escape(job.title)}</strong><br>{escape(job.location)}</p>"
                        "<p>Take a look at the role and apply if it feels like the right next step for you. We are rooting for you!</p>",
                        "View Job & Apply",
                        job_url,
                        preheader=f"{job.title} matches your saved teaching preferences.",
                    ),
                )
            )
        except Exception:
            current_app.logger.exception("Job alert delivery failed for user %s and job %s", user.id, job.id)
            continue
        if result.get("status") != "sent":
            current_app.logger.warning("Job alert was not sent for user %s and job %s: %s", user.id, job.id, result)
            continue
        preference.last_sent_at = datetime.now(timezone.utc)
        log_action("job_alert_email_sent", "job_alert_preference", preference.id, {
            "job_id": job.id,
            "job_title": job.title,
            "user_id": user.id,
            "email": user.email,
        })
        sent += 1
    return sent


@admin_bp.get("/dashboard")
@login_required
@admin_or_staff_required
def dashboard():
    recent_jobs = Job.query.order_by(Job.created_at.desc()).limit(5).all() if _can_view_dashboard_metric("jobs.view") else []
    recent_orders = placed_order_query().order_by(Order.created_at.desc()).limit(5).all() if _can_view_dashboard_metric("orders.view") else []
    teacher_count = None
    if _can_view_dashboard_metric("teachers.view"):
        teacher_count = db.session.scalar(
            db.select(func.count(User.id))
            .join(Role, User.role_id == Role.id)
            .where(Role.name.in_(("user", "teacher")), User.is_active.is_(True))
        )
    return jsonify(
        summary={
            "total_users": teacher_count,
            "total_job_applications": db.session.scalar(db.select(func.count(JobApplication.id))) if _can_view_dashboard_metric("applications.view") else None,
            "pending_applications": JobApplication.query.filter_by(status="pending").count() if _can_view_dashboard_metric("applications.view") else None,
            "new_orders": placed_order_query().filter(Order.status == "new").count() if _can_view_dashboard_metric("orders.view") else None,
            "new_contact_messages": ContactMessage.query.filter_by(status="new").count() if _can_view_dashboard_metric("messages.view") else None,
            "total_products": Product.query.count() if _can_view_dashboard_metric("products.view") else None,
            "newsletter_subscribers": NewsletterSubscriber.query.filter_by(is_active=True).count() if _can_view_dashboard_metric("newsletters.view") else None,
        },
        recent_jobs=[job_json(job) for job in recent_jobs],
        recent_orders=[order_json(order) for order in recent_orders],
    )


def _job_alert_admin_json(preference, user):
    return {
        "id": preference.id,
        "teacher_name": user.full_name if user else "",
        "email": user.email if user else "",
        "subject": preference.subject or "",
        "location": preference.location or "",
        "location_ids": preference.location_ids or "",
        "preferred_level": preference.preferred_level or "",
        "curriculum": preference.curriculum or "",
        "employment_type": preference.employment_type or "",
        "alert_by_email": preference.alert_by_email,
        "frequency": preference.frequency,
        "is_default": preference.is_default,
        "last_sent_at": preference.last_sent_at.isoformat() if preference.last_sent_at else None,
        "created_at": preference.created_at.isoformat() if preference.created_at else None,
        "updated_at": preference.updated_at.isoformat() if preference.updated_at else None,
        "status": "active" if preference.alert_by_email and user and user.is_active else "paused",
    }


@admin_bp.get("/job-alerts")
@login_required
@permission_required("alerts.view")
def list_job_alert_preferences():
    rows = (
        db.session.query(JobAlertPreference, User)
        .join(User, JobAlertPreference.user_id == User.id)
        .order_by(JobAlertPreference.updated_at.desc(), JobAlertPreference.created_at.desc())
        .limit(500)
        .all()
    )
    return jsonify(items=[_job_alert_admin_json(preference, user) for preference, user in rows])


def _csv_response(filename, rows, fieldnames):
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@admin_bp.get("/analytics/dashboard")
@login_required
@permission_required("analytics.view")
def analytics_dashboard():
    range_info = parse_analytics_range(request.args)
    return jsonify(build_analytics_dashboard(range_info))


@admin_bp.delete("/analytics/location-history")
@login_required
@admin_required
def clear_analytics_location_history():
    rows = AnalyticsEvent.query.filter(
        or_(
            AnalyticsEvent.country.isnot(None),
            AnalyticsEvent.region.isnot(None),
            AnalyticsEvent.city.isnot(None),
            AnalyticsEvent.ip_prefix.isnot(None),
        )
    ).update(
        {
            AnalyticsEvent.country: None,
            AnalyticsEvent.region: None,
            AnalyticsEvent.city: None,
            AnalyticsEvent.ip_prefix: None,
        },
        synchronize_session=False,
    )
    log_action("clear_analytics_location_history", "analytics_event", metadata={"events_cleared": rows})
    db.session.commit()
    return jsonify(message="Analytics location history cleared.", events_cleared=rows)


@admin_bp.get("/analytics/products/<int:product_id>")
@login_required
@permission_required("analytics.view")
def analytics_product_detail(product_id):
    range_info = parse_analytics_range(request.args)
    payload = build_product_detail(product_id, range_info)
    if not payload:
        return jsonify(error="Product not found."), 404
    return jsonify(payload)


@admin_bp.get("/analytics/export")
@login_required
@permission_required("analytics.export")
def analytics_export():
    report = str(request.args.get("report") or "products").strip().lower()
    range_info = parse_analytics_range(request.args)
    dashboard_payload = build_analytics_dashboard(range_info)

    if report == "top-pages":
        rows = dashboard_payload["overview"]["top_pages"]
        return _csv_response(
            "realmindx-top-pages.csv",
            rows,
            ["path", "title", "views", "unique_visitors"],
        )

    if report == "search-terms":
        rows = dashboard_payload["search"]["terms"]
        return _csv_response(
            "realmindx-search-terms.csv",
            rows,
            ["term", "searches", "with_results", "no_results", "product_views", "purchases"],
        )

    if report == "product-detail":
        product_id = request.args.get("product_id")
        payload = build_product_detail(int(product_id), range_info) if str(product_id or "").isdigit() else None
        if not payload:
            return jsonify(error="Product not found."), 404
        rows = []
        chart_maps = {
            "views": {item["date"]: item["value"] for item in payload["charts"]["views"]},
            "add_to_cart": {item["date"]: item["value"] for item in payload["charts"]["add_to_cart"]},
            "sales": {item["date"]: item["value"] for item in payload["charts"]["sales"]},
            "revenue": {item["date"]: item["value"] for item in payload["charts"]["revenue"]},
            "search_interest": {item["date"]: item["value"] for item in payload["charts"]["search_interest"]},
        }
        for date_key in chart_maps["views"]:
            rows.append({
                "product_name": payload["product"]["name"],
                "product_category": payload["product"]["category"],
                "product_status": payload["product"]["status"],
                "price": payload["product"]["price"],
                "stock_quantity": payload["product"]["stock_quantity"],
                "date": date_key,
                "views": chart_maps["views"].get(date_key, 0),
                "add_to_cart": chart_maps["add_to_cart"].get(date_key, 0),
                "sales": chart_maps["sales"].get(date_key, 0),
                "revenue": chart_maps["revenue"].get(date_key, 0),
                "search_interest": chart_maps["search_interest"].get(date_key, 0),
            })
        return _csv_response(
            f"realmindx-product-{payload['product']['id']}-analytics.csv",
            rows,
            ["product_name", "product_category", "product_status", "price", "stock_quantity", "date", "views", "add_to_cart", "sales", "revenue", "search_interest"],
        )

    rows = dashboard_payload["products"]["items"]
    return _csv_response(
        "realmindx-product-analytics.csv",
        rows,
        [
            "id",
            "name",
            "category",
            "status",
            "stock_status",
            "stock_quantity",
            "price",
            "views",
            "unique_visitors",
            "add_to_cart",
            "remove_from_cart",
            "purchases",
            "quantity_sold",
            "revenue",
            "conversion_rate",
            "add_to_cart_rate",
            "cart_abandonment_count",
            "wishlist_count",
            "search_impressions",
            "search_clicks",
            "unavailable_searches",
            "last_sale_at",
            "last_view_at",
            "last_add_to_cart_at",
            "top_traffic_source",
            "top_device",
            "top_location",
            "interest_delta",
            "interest_delta_pct",
            "performance_status",
        ],
    )


@admin_bp.get("/jobs")
@login_required
@permission_required("jobs.view")
def list_jobs():
    rows = Job.query.order_by(Job.created_at.desc()).all()
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
        preferred_sex=payload.get("preferred_sex"),
        preferred_age_range=payload.get("preferred_age_range"),
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
    for field in ["title", "organisation", "subject", "level", "curriculum", "employment_type", "preferred_sex", "preferred_age_range", "description", "requirements", "responsibilities", "salary_min", "salary_max", "status"]:
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
    rows = JobApplication.query.order_by(JobApplication.created_at.desc()).all()
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
    old_status = application.status
    application.status = status
    placement = None
    if status == "accepted":
        placement = _ensure_teacher_placement(application)
    log_action("update_application_status", "job_application", application.id, {"status": status, "prev": old_status})
    db.session.commit()
    return jsonify(
        id=application.id,
        status=application.status,
        placement_id=placement.id if placement else None,
    )


def _ensure_teacher_placement(application):
    existing = TeacherPlacement.query.filter_by(application_id=application.id).first()
    if existing:
        existing.status = "accepted"
        existing.accepted_at = existing.accepted_at or datetime.now(timezone.utc)
        return existing
    job = application.job
    placement = TeacherPlacement(
        user_id=application.user_id,
        application_id=application.id,
        job_id=application.job_id,
        school_name=(job.organisation or job.location or "School placement") if job else "School placement",
        job_title=job.title if job else None,
        status="accepted",
        accepted_at=datetime.now(timezone.utc),
    )
    db.session.add(placement)
    db.session.flush()
    return placement


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
    current_user.must_change_password = False
    log_action("change_password", "admin_user", current_user.id)
    db.session.commit()
    return jsonify(message="Password updated successfully.")


@admin_bp.get("/users")
@login_required
@permission_required("teachers.view")
def users():
    # Return only regular-user accounts (i.e. teachers); admin/staff excluded.
    rows = (
        User.query
        .join(User.role)
        .filter(Role.name == "user", User.teacher_service_enabled.is_(True))
        .order_by(User.created_at.desc())
        .all()
    )
    return jsonify(items=[user_json(user) for user in rows])


@admin_bp.get("/bookshop-accounts")
@login_required
@permission_required("orders.view")
def bookshop_accounts():
    rows = (
        db.session.query(User, func.count(Order.id).label("order_count"))
        .join(User.role)
        .outerjoin(Order, Order.user_id == User.id)
        .filter(Role.name == "user", User.bookshop_service_enabled.is_(True))
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .all()
    )
    items = []
    for user, order_count in rows:
        item = user_json(user)
        item["order_count"] = int(order_count or 0)
        items.append(item)
    return jsonify(items=items)


@admin_bp.post("/users/<int:user_id>/profile-reminder")
@login_required
@permission_required("teachers.edit")
def send_profile_reminder(user_id):
    user = db.get_or_404(User, user_id)
    if user.role and user.role.name in ("admin", "staff"):
        return jsonify(error="Profile reminders can only be sent to teacher accounts."), 403
    if not user.is_active:
        return jsonify(error="Enable this teacher account before sending a profile reminder."), 409
    completion, missing = teacher_profile_completion(user)
    if completion >= 100:
        return jsonify(error="This teacher's profile is already complete."), 409

    portal_url = f"{current_app.config['BASE_URL'].rstrip('/')}/portal?view=profile"
    missing_html = "".join(f"<li>{escape(item)}</li>" for item in missing)
    result = send_email(OutboundEmail(
        to=user.email,
        subject="You are almost ready for better-matched teaching opportunities",
        html=app_email_shell(
            "Complete your profile and unlock better job matches",
            f"<p>Hello {escape(user.first_name or 'Teacher')},</p>"
            f"<p>You are almost there — your RealMindX teaching profile is <strong>{completion}% complete</strong>.</p>"
            "<p>Add the remaining information so we can confidently send opportunities that fit your qualifications and preferences.</p>"
            f"<p><strong>Just a little more to add:</strong></p><ul>{missing_html}</ul>"
            "<p>Finishing your profile only takes a moment and gives you a better chance of seeing the right roles.</p>",
            "Finish My Profile",
            portal_url,
            preheader=f"Your teaching profile is {completion}% complete — finish it for better-matched opportunities.",
        ),
        text=f"Complete your RealMindX teaching profile to receive tailored jobs: {portal_url}",
    ))
    if result.get("status") != "sent":
        return jsonify(error="The reminder could not be delivered. Check the email service and try again."), 502
    log_action("send_teacher_profile_reminder", "user", user.id, {
        "email": user.email,
        "profile_completion": completion,
        "missing_fields": missing,
    })
    db.session.commit()
    return jsonify(message=f"Profile reminder sent to {user.email}.", profile_completion=completion)


PAYOUT_FIELDS = [
    "payout_method",
    "payout_momo_network",
    "payout_momo_number",
    "payout_bank_name",
    "payout_bank_account_name",
    "payout_bank_account_number",
    "payout_notes",
]


def _payout_payload(profile):
    if not profile:
        return {field: None for field in PAYOUT_FIELDS}
    return {field: getattr(profile, field, None) for field in PAYOUT_FIELDS}


def _apply_payout_payload(profile, payload):
    source = payload.get("payout") if isinstance(payload.get("payout"), dict) else payload
    changed = False
    for field in PAYOUT_FIELDS:
        if field not in source:
            continue
        value = source.get(field)
        if isinstance(value, str):
            value = value.strip() or None
        setattr(profile, field, value)
        changed = True
    return changed


@admin_bp.patch("/users/<int:user_id>")
@login_required
@permission_required("teachers.edit")
def update_user(user_id):
    """Update a regular-user account and admin-managed teacher payout details."""
    user = db.get_or_404(User, user_id)
    # Safety: only allow toggling regular users, not admins / staff.
    if user.role and user.role.name in ("admin", "staff"):
        return jsonify(error="Cannot modify admin or staff accounts via this endpoint."), 403
    payload = request.get_json(silent=True) or {}
    changed = False
    if "status" in payload:
        user.is_active = payload["status"] == "active"
        changed = True
        log_action("toggle_user_active", "user", user.id, {"status": payload["status"]})
    payout_source = payload.get("payout") if isinstance(payload.get("payout"), dict) else payload
    if any(field in payout_source for field in PAYOUT_FIELDS):
        profile = user.profile
        if not profile:
            profile = UserProfile(user_id=user.id)
            db.session.add(profile)
            db.session.flush()
        changed = _apply_payout_payload(profile, payload) or changed
        log_action("update_teacher_payout", "user", user.id)
    if changed:
        db.session.commit()
    return jsonify(user_json(user))


@admin_bp.delete("/users/<int:user_id>")
@login_required
@permission_required("teachers.delete")
def delete_user(user_id):
    user = db.get_or_404(User, user_id)
    if user.role and user.role.name in ("admin", "staff"):
        return jsonify(error="Cannot delete admin or staff accounts via this endpoint."), 403
    if TeacherPlacement.query.filter_by(user_id=user.id).first():
        return jsonify(error="This teacher has placement history and cannot be permanently deleted. Disable the account instead."), 409

    log_action("delete_user", "user", user.id, {"email": user.email})
    # Clean every direct users.id foreign key consistently. Required account-
    # owned rows are deleted; nullable historical references are anonymised.
    # This also covers authentication tokens and alert preferences that do not
    # have ORM cascade relationships and previously caused production 500s.
    users_table = User.__table__
    for table in db.metadata.tables.values():
        if table is users_table or table.name == "teacher_placements":
            continue
        for foreign_key in table.foreign_keys:
            if foreign_key.column.table is not users_table:
                continue
            column = foreign_key.parent
            predicate = column == user.id
            if column.nullable:
                db.session.execute(table.update().where(predicate).values({column.name: None}))
            else:
                db.session.execute(table.delete().where(predicate))
    db.session.expire(user)
    db.session.delete(user)
    db.session.commit()
    return jsonify(message="Teacher account deleted.")


@admin_bp.get("/users/<int:user_id>")
@login_required
@permission_required("teachers.view")
def get_user(user_id):
    """Return a single teacher's full profile data for the admin detail modal."""
    user = db.get_or_404(User, user_id)
    data = user_json(user)
    profile = getattr(user, "profile", None)
    if profile:
        def _file_payload(file_id):
            if not file_id:
                return {"url": None, "filename": None}
            f = db.session.get(UploadedFile, file_id)
            if not f:
                return {"url": None, "filename": None}
            return {
                "url": f"/uploads/{f.visibility}/{f.category}/{f.stored_filename}",
                "filename": f.original_filename,
            }

        age = None
        if profile.date_of_birth:
            today = date.today()
            d = profile.date_of_birth
            age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
        cv_file = _file_payload(profile.cv_file_id)
        certificate_file = _file_payload(profile.certificate_file_id)

        data["profile"] = {
            "location": profile.location,
            "preferred_locations": profile.preferred_locations,
            "preferred_location_ids": profile.preferred_location_ids,
            "teaching_subject": profile.teaching_subject,
            "preferred_level": profile.preferred_level,
            "preferred_employment_type": profile.preferred_employment_type,
            "available_from": profile.available_from,
            "curriculum_experience": profile.curriculum_experience,
            "bio": profile.bio,
            "profile_picture_url": data.get("profile_picture_url"),
            "cv_url": cv_file["url"],
            "cv_filename": cv_file["filename"],
            "certificate_url": certificate_file["url"],
            "certificate_filename": certificate_file["filename"],
            "next_of_kin_name": profile.next_of_kin_name,
            "next_of_kin_phone": profile.next_of_kin_phone,
            "next_of_kin_relationship": profile.next_of_kin_relationship,
            "next_of_kin_email": profile.next_of_kin_email,
            "years_of_experience": profile.years_of_experience,
            "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
            "age": age,
            "payout": _payout_payload(profile),
        }
    else:
        data["profile"] = None
    preferences = (
        JobAlertPreference.query
        .filter_by(user_id=user.id)
        .order_by(JobAlertPreference.is_default.desc(), JobAlertPreference.updated_at.desc())
        .all()
    )
    data["job_alert_preferences"] = [_job_alert_admin_json(preference, user) for preference in preferences]
    applications = (
        JobApplication.query
        .options(joinedload(JobApplication.job))
        .filter_by(user_id=user.id)
        .order_by(JobApplication.updated_at.desc(), JobApplication.created_at.desc())
        .all()
    )
    data["applications"] = [
        {
            "id": application.id,
            "job_id": application.job_id,
            "status": application.status,
            "cover_note": application.cover_note,
            "created_at": application.created_at.isoformat() if application.created_at else None,
            "updated_at": application.updated_at.isoformat() if application.updated_at else None,
            "job_title": application.job.title if application.job else None,
            "organisation": application.job.organisation if application.job else None,
            "location": application.job.location if application.job else None,
            "subject": application.job.subject if application.job else None,
            "level": application.job.level if application.job else None,
            "employment_type": application.job.employment_type if application.job else None,
        }
        for application in applications
    ]
    placements = (
        TeacherPlacement.query
        .filter_by(user_id=user.id)
        .order_by(TeacherPlacement.accepted_at.desc(), TeacherPlacement.created_at.desc())
        .all()
    )
    data["placements"] = [
        {
            "id": placement.id,
            "application_id": placement.application_id,
            "job_id": placement.job_id,
            "school_name": placement.school_name,
            "job_title": placement.job_title,
            "status": placement.status,
            "accepted_at": placement.accepted_at.isoformat() if placement.accepted_at else None,
            "started_at": placement.started_at.isoformat() if placement.started_at else None,
            "ended_at": placement.ended_at.isoformat() if placement.ended_at else None,
            "notes": placement.notes,
        }
        for placement in placements
    ]
    return jsonify(data)


@admin_bp.post("/uploads")
@login_required
@permission_required("uploads.create")
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
    if not email:
        return jsonify(error="Staff email is required."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="User already exists."), 409
    role = Role.query.filter_by(name="staff").first() or Role(name="staff", description="Staff")
    permissions = Permission.query.filter(Permission.key.in_(payload.get("permissions") or [])).all()
    user = User(
        email=email,
        first_name=payload.get("first_name") or "Staff",
        last_name=payload.get("last_name"),
        role=role,
        is_verified=True,
        is_active=payload.get("status", "active") != "inactive",
        must_change_password=True,
    )
    user.set_password(DEFAULT_TEMPORARY_PASSWORD)
    user.direct_permissions = permissions
    db.session.add_all([role, user])
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    log_action("create_staff", "user", user.id, {"permissions": [p.key for p in permissions]})
    notification_status = _send_internal_account_access_email(user, "staff")
    db.session.commit()
    return jsonify(
        user=_staff_payload(user),
        temporary_password=DEFAULT_TEMPORARY_PASSWORD,
        notification={"email": notification_status, "email_to": user.email},
    ), 201


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


@admin_bp.post("/staff/<int:user_id>/reset-password")
@login_required
@admin_required
def reset_staff_password(user_id):
    user = db.get_or_404(User, user_id)
    if not user.role or user.role.name != "staff":
        return jsonify(error="Only staff accounts can be reset here."), 400
    user.set_password(DEFAULT_TEMPORARY_PASSWORD)
    user.must_change_password = True
    user.failed_login_count = 0
    user.locked_until = None
    notification_status = _send_internal_account_access_email(user, "staff")
    log_action("reset_staff_password", "user", user.id, {"email": user.email})
    db.session.commit()
    return jsonify(
        message="Staff password reset. They must change it on next login.",
        temporary_password=DEFAULT_TEMPORARY_PASSWORD,
        notification={"email": notification_status, "email_to": user.email},
    )


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
    if not email:
        return jsonify(error="Admin email is required."), 400
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
        must_change_password=True,
    )
    user.set_password(DEFAULT_TEMPORARY_PASSWORD)
    db.session.add_all([role, user])
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    log_action("create_admin", "user", user.id, {"email": user.email})
    notification_status = _send_internal_account_access_email(user, "admin")
    db.session.commit()
    return jsonify(
        user=_admin_payload(user),
        temporary_password=DEFAULT_TEMPORARY_PASSWORD,
        notification={"email": notification_status, "email_to": user.email},
    ), 201


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


@admin_bp.post("/admins/<int:user_id>/reset-password")
@login_required
@admin_required
def reset_admin_password(user_id):
    user = db.get_or_404(User, user_id)
    if not user.role or user.role.name != "admin":
        return jsonify(error="Only admin accounts can be reset here."), 400
    if user.id == current_user.id:
        return jsonify(error="Use My Account to change your own password."), 400
    user.set_password(DEFAULT_TEMPORARY_PASSWORD)
    user.must_change_password = True
    user.failed_login_count = 0
    user.locked_until = None
    notification_status = _send_internal_account_access_email(user, "admin")
    log_action("reset_admin_password", "user", user.id, {"email": user.email})
    db.session.commit()
    return jsonify(
        message="Admin password reset. They must change it on next login.",
        temporary_password=DEFAULT_TEMPORARY_PASSWORD,
        notification={"email": notification_status, "email_to": user.email},
    )


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
            "actor": actors.get(row.actor_id).full_name if actors.get(row.actor_id) else (row.details or {}).get("actor_email") or "System",
            "actor_email": actors.get(row.actor_id).email if actors.get(row.actor_id) else (row.details or {}).get("actor_email"),
            "actor_role": actors.get(row.actor_id).role.name.replace("_", " ").title() if actors.get(row.actor_id) and actors.get(row.actor_id).role else "System",
            "action": readable_audit_action(row.action, row.details),
            "raw_action": row.action,
            "summary": readable_audit_summary(row.action, row.entity_type, row.details),
            "entity_type": (lambda label: label[:1].upper() + label[1:])(
                AREA_LABELS.get(row.entity_type) or str(row.entity_type or "System").replace("_", " ")
            ),
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
    rows = Product.query.order_by(Product.featured.desc(), Product.created_at.desc()).all()
    return jsonify(items=[product_json(row, include_private=True) for row in rows])


def _uploaded_file_exists(uploaded_file):
    if not uploaded_file:
        return False

    upload_root = Path(current_app.config["UPLOAD_FOLDER"])
    candidates = []
    if uploaded_file.storage_path:
        stored_path = Path(uploaded_file.storage_path)
        candidates.append(stored_path if stored_path.is_absolute() else upload_root / stored_path)
    if uploaded_file.visibility and uploaded_file.category and uploaded_file.stored_filename:
        candidates.append(upload_root / uploaded_file.visibility / uploaded_file.category / uploaded_file.stored_filename)

    seen = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            resolved = candidate
        if str(resolved) in seen:
            continue
        seen.add(str(resolved))
        try:
            if resolved.is_file() and resolved.stat().st_size > 0:
                return True
        except OSError:
            continue
    return False


def _products_without_display_images(active_only=None):
    query = Product.query.options(joinedload(Product.image_file))
    if active_only is True:
        query = query.filter(Product.is_active.is_(True))
    elif active_only is False:
        query = query.filter(Product.is_active.is_(False))
    return [
        product for product in query.order_by(Product.created_at.desc()).all()
        if not _uploaded_file_exists(product.image_file)
    ]


@admin_bp.get("/products/missing-images")
@login_required
@permission_required("products.view")
def products_missing_images():
    products = _products_without_display_images()
    return jsonify(
        total=len(products),
        published=sum(1 for product in products if product.is_active),
        draft=sum(1 for product in products if not product.is_active),
    )


@admin_bp.post("/products/missing-images/unpublish")
@login_required
@permission_required("products.edit")
def unpublish_products_missing_images():
    products = _products_without_display_images(active_only=True)
    product_ids = [product.id for product in products]
    for product in products:
        product.is_active = False
    log_action(
        "bulk_unpublish_products_missing_images",
        "product",
        None,
        {"count": len(product_ids), "product_ids": product_ids},
    )
    db.session.commit()
    return jsonify(
        message=f"Unpublished {len(product_ids)} product(s) without images.",
        unpublished=len(product_ids),
        product_ids=product_ids,
    )


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
    OrderItem.query.filter_by(product_id=product.id).update(
        {OrderItem.product_id: None},
        synchronize_session=False,
    )
    AnalyticsEvent.query.filter_by(product_id=product.id).update(
        {AnalyticsEvent.product_id: None},
        synchronize_session=False,
    )
    ProductReview.query.filter_by(product_id=product.id).delete(synchronize_session=False)
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


@admin_bp.get("/order-reviews")
@login_required
@permission_required("orderReviews.view")
def list_order_reviews():
    rows = OrderReview.query.order_by(OrderReview.created_at.desc()).limit(300).all()
    return jsonify(items=[order_review_json(row) for row in rows])


@admin_bp.put("/order-reviews/<int:review_id>")
@login_required
@permission_required("orderReviews.edit")
def update_order_review(review_id):
    review = db.get_or_404(OrderReview, review_id)
    payload = request.get_json(silent=True) or {}
    if "status" in payload:
        status = str(payload["status"] or "").strip().lower()
        if status not in {"new", "reviewed", "follow_up", "archived"}:
            return jsonify(error="Choose new, reviewed, follow_up, or archived."), 400
        review.status = status
    if "admin_notes" in payload:
        review.admin_notes = (payload.get("admin_notes") or "").strip() or None
    log_action("update_order_review", "order_review", review.id, {"status": review.status})
    db.session.commit()
    return jsonify(order_review_json(review))


@admin_bp.delete("/order-reviews/<int:review_id>")
@login_required
@permission_required("orderReviews.delete")
def delete_order_review(review_id):
    review = db.get_or_404(OrderReview, review_id)
    log_action("delete_order_review", "order_review", review.id, {"order_id": review.order_id})
    db.session.delete(review)
    db.session.commit()
    return jsonify(message="Order review deleted.")


@admin_bp.post("/products/import")
@login_required
@permission_required("products.create")
def import_products():
    saved_paths = []
    try:
        rows = _read_catalog_rows(request.files.get("catalog_file"))
        headers = _import_headers(rows)
        mapping = _parse_import_mapping(request.form.get("column_mapping"), headers)
        overwrite_slugs = set(json.loads(request.form.get("overwrite_slugs") or "[]"))
        if mapping and not mapping.get("name"):
            raise ValueError("Map a catalogue column to Product name before importing.")
        image_ids, saved_paths = _save_imported_images(request.files.get("images_zip"), current_user.id)
    except ValueError as exc:
        db.session.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        return jsonify(error=str(exc)), 400

    imported = 0
    updated = 0
    skipped = []
    missing_images = set()
    try:
        for index, raw_row in enumerate(rows, start=2):
            row = _normalise_import_row(_apply_import_mapping(raw_row, mapping))
            if not row:
                skipped.append({"row": index, "reason": "Missing product name"})
                continue
            category = _ensure_category(row["category"])
            category_slug = slugify(row["category"]) if row.get("category") else None
            product = Product.query.filter_by(slug=row["slug"]).first()
            if not product and category_slug:
                product = Product.query.filter(
                    Product.name.ilike(row["name"]),
                    Product.category.has(ProductCategory.slug == category_slug)
                ).first()
            
            if product and row["slug"] not in overwrite_slugs:
                skipped.append({"row": index, "reason": f"Conflict with existing product '{product.name}' not marked for overwrite"})
                continue

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
            elif image_filename:
                missing_images.add(image_filename)
        log_action(
            "import_products",
            "product",
            None,
            {
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "images_saved": len(image_ids),
                "missing_images": sorted(missing_images),
            },
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        current_app.logger.exception("Product catalogue import failed.")
        return jsonify(error="The catalogue could not be imported. No product changes were saved."), 500
    return jsonify(
        imported=imported,
        updated=updated,
        skipped=skipped,
        images_saved=len(image_ids),
        missing_images=sorted(missing_images),
    )


@admin_bp.post("/products/import/preview")
@login_required
@permission_required("products.create")
def preview_product_import():
    try:
        rows = _read_catalog_rows(request.files.get("catalog_file"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    if not rows:
        return jsonify(error="The catalogue contains headers but no product rows."), 400

    headers = _import_headers(rows)
    mapping = _suggest_import_mapping(headers)
    name_source = mapping.get("name")
    blank_names = sum(
        1
        for row in rows
        if not str(row.get(name_source) or "").strip()
    ) if name_source else len(rows)
    warnings = []
    if not name_source:
        warnings.append("No product-name column was matched. Choose the correct column below.")
    elif blank_names:
        warnings.append(f"{blank_names} row(s) have no product name and will be skipped.")

    conflicts = []
    if name_source:
        for index, raw_row in enumerate(rows, start=2):
            row = _normalise_import_row(_apply_import_mapping(raw_row, mapping))
            if not row:
                continue
            category_slug = slugify(row["category"]) if row.get("category") else None
            product = Product.query.filter_by(slug=row["slug"]).first()
            if not product and category_slug:
                product = Product.query.filter(
                    Product.name.ilike(row["name"]),
                    Product.category.has(ProductCategory.slug == category_slug)
                ).first()
            if product:
                conflicts.append({
                    "row": index,
                    "slug": row["slug"],
                    "existing_id": product.id,
                    "existing_name": product.name,
                    "existing_category": product.category.name if product.category else "",
                    "import_name": row["name"],
                })

    sample_rows = [
        {key: _json_safe_import_value(value) for key, value in row.items()}
        for row in rows[:8]
    ]
    fields = [
        {
            "key": field["key"],
            "label": field["label"],
            "required": bool(field.get("required")),
        }
        for field in PRODUCT_IMPORT_FIELDS
    ]
    return jsonify(
        row_count=len(rows),
        headers=headers,
        mapping=mapping,
        fields=fields,
        sample_rows=sample_rows,
        warnings=warnings,
        conflicts=conflicts,
    )


@admin_bp.get("/products/export")
@login_required
@permission_required("products.export")
def export_products():
    export_format = request.args.get("format", "zip").lower()
    
    rows = Product.query.order_by(Product.created_at.desc()).all()
    headers = [
        "id", "name", "category", "price", "old_price", "stock_status", "quantity_available",
        "subject", "level", "curriculum", "author", "publisher", "product_type", "source", "featured", "is_active", "tags",
        "image_filename",
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
            "image_filename": getattr(product.image_file, "original_filename", "") if getattr(product, "image_file", None) else "",
        }
        for product in rows
    ]

    if export_format == "csv":
        csv_out = io.StringIO(); writer = csv.DictWriter(csv_out, fieldnames=headers); writer.writeheader(); writer.writerows(data_rows)
        return Response(csv_out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=products.csv"})
    if export_format == "xlsx":
        try: from openpyxl import Workbook
        except ImportError: return jsonify(error="XLSX export requires openpyxl."), 501
        workbook = Workbook(); sheet = workbook.active; sheet.title = "Products"; sheet.append(headers)
        for row in data_rows: sheet.append([row.get(key) for key in headers])
        stream = io.BytesIO(); workbook.save(stream); stream.seek(0)
        return send_file(stream, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name="products.xlsx")
    if export_format == "pdf":
        try:
            from reportlab.pdfgen import canvas as rl_canvas
            from reportlab.lib.pagesizes import A4
        except ImportError: return jsonify(error="PDF export requires reportlab."), 501
        pdf_stream = io.BytesIO(); pdf = rl_canvas.Canvas(pdf_stream, pagesize=A4); width, height = A4; y = height - 40
        pdf.setFont("Helvetica-Bold", 14); pdf.drawString(40, y, "RealMindX Bookshop Products")
        y -= 20; pdf.setFont("Helvetica", 8)
        for row in data_rows:
            line = f"{row['id']} | {row['name']} | {row['category']} | GHS {row['price']} | {row['stock_status']}"
            pdf.drawString(40, y, line[:135]); y -= 12
            if y < 40: pdf.showPage(); y = height - 40; pdf.setFont("Helvetica", 8)
        pdf.save(); pdf_stream.seek(0)
        return send_file(pdf_stream, mimetype="application/pdf", as_attachment=True, download_name="products.pdf")
    if export_format == "zip":
        zip_stream = io.BytesIO()
        with zipfile.ZipFile(zip_stream, "w", zipfile.ZIP_DEFLATED) as zf:
            csv_out = io.StringIO(); writer = csv.DictWriter(csv_out, fieldnames=headers); writer.writeheader(); writer.writerows(data_rows)
            zf.writestr("products.csv", csv_out.getvalue())
            try:
                from reportlab.pdfgen import canvas as rl_canvas
                from reportlab.lib.pagesizes import A4
                pdf_stream = io.BytesIO(); pdf = rl_canvas.Canvas(pdf_stream, pagesize=A4); width, height = A4; y = height - 40
                pdf.setFont("Helvetica-Bold", 14); pdf.drawString(40, y, "RealMindX Bookshop Products")
                y -= 20; pdf.setFont("Helvetica", 8)
                for row in data_rows:
                    line = f"{row['id']} | {row['name']} | {row['category']} | GHS {row['price']} | {row['stock_status']}"
                    pdf.drawString(40, y, line[:135]); y -= 12
                    if y < 40: pdf.showPage(); y = height - 40; pdf.setFont("Helvetica", 8)
                pdf.save(); pdf_stream.seek(0); zf.writestr("products.pdf", pdf_stream.getvalue())
            except ImportError: zf.writestr("products.pdf", b"PDF export requires reportlab.")
            for product in rows:
                if getattr(product, "image_file", None) and product.image_file.storage_path:
                    try:
                        with open(product.image_file.storage_path, "rb") as f: zf.writestr(f"images/{product.image_file.original_filename}", f.read())
                    except Exception: pass
        zip_stream.seek(0)
        return send_file(zip_stream, mimetype="application/zip", as_attachment=True, download_name="realmindx-products-export.zip")
    return jsonify(error="Use csv, xlsx, pdf, or zip."), 400


@admin_bp.get("/users/export")
@login_required
@permission_required("teachers.export")
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


def _category_bulk_payload(payload, category=None):
    current_discount = float(getattr(category, "bulk_discount_percent", 0) or 0) if category else 0
    current_min_qty = int(getattr(category, "bulk_min_qty", 10) or 10) if category else 10
    discount = _decimalish(payload.get("bulk_discount_percent"), current_discount)
    min_qty = _intish(payload.get("bulk_min_qty"), current_min_qty)
    if discount < 0 or discount > 100:
        raise ValueError("Bulk discount percent must be between 0 and 100.")
    if min_qty < 1:
        raise ValueError("Bulk minimum quantity must be at least 1.")
    return discount, min_qty


@admin_bp.post("/categories")
@login_required
@permission_required("categories.create")
def create_category():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or payload.get("label") or "").strip()
    if not name:
        return jsonify(error="Category name is required."), 400
    try:
        bulk_discount_percent, bulk_min_qty = _category_bulk_payload(payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    category = ProductCategory(
        name=name,
        slug=payload.get("slug") or slugify(name),
        description=payload.get("description"),
        sort_order=_intish(payload.get("sort_order"), 0),
        is_active=_boolish(payload.get("is_active", True)),
        bulk_discount_percent=bulk_discount_percent,
        bulk_min_qty=bulk_min_qty,
    )
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
    for field in ["name", "slug", "description", "is_active"]:
        if field in payload:
            setattr(category, field, payload[field])
    if "sort_order" in payload:
        category.sort_order = _intish(payload.get("sort_order"), category.sort_order or 0)
    if "bulk_discount_percent" in payload or "bulk_min_qty" in payload:
        try:
            category.bulk_discount_percent, category.bulk_min_qty = _category_bulk_payload(payload, category)
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
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
@permission_required("deliveryZones.view")
def delivery_zones():
    rows = DeliveryZone.query.order_by(DeliveryZone.sort_order.asc(), DeliveryZone.name.asc()).all()
    return jsonify(items=[delivery_zone_json(row) for row in rows])


def _delivery_zone_payload(zone, payload):
    name = (payload.get("name") or (zone.name if zone else "")).strip()
    if not name:
        raise ValueError("Delivery zone name is required.")
    duplicate = DeliveryZone.query.filter(func.lower(DeliveryZone.name) == name.lower())
    if zone:
        duplicate = duplicate.filter(DeliveryZone.id != zone.id)
    if duplicate.first():
        raise ValueError("A delivery zone with this name already exists.")
    raw_aliases = payload.get("aliases", payload.get("aliases_text", None))

    def text_value(field):
        if field in payload:
            return (str(payload.get(field) or "").strip() or None)
        return getattr(zone, field, None) if zone else None

    def numeric_value(field, default=0):
        if field in payload:
            return _decimalish(payload.get(field), default)
        return float(getattr(zone, field, default) or default) if zone else default

    def integer_value(field, default=0):
        if field in payload:
            return int(payload.get(field) or default)
        return int(getattr(zone, field, default) or default) if zone else default

    def bool_value(field, default):
        if field in payload:
            return _boolish(payload.get(field))
        return bool(getattr(zone, field, default)) if zone else default

    values = {
        "name": name,
        "fee": numeric_value("fee"),
        "description": text_value("description"),
        "aliases": format_location_aliases(raw_aliases, name) if raw_aliases is not None else (zone.aliases if zone else None),
        "region": text_value("region"),
        "district_or_municipality": text_value("district_or_municipality"),
        "nearby_major_town": text_value("nearby_major_town"),
        "delivery_zone_label": text_value("delivery_zone_label"),
        "sort_order": integer_value("sort_order"),
        "is_active": bool_value("is_active", True),
        "is_delivery_area": bool_value("is_delivery_area", True),
        "is_search_alias_only": bool_value("is_search_alias_only", False),
    }
    return values


@admin_bp.post("/delivery-zones")
@login_required
@permission_required("deliveryZones.create")
def create_delivery_zone():
    payload = request.get_json(silent=True) or {}
    try:
        values = _delivery_zone_payload(None, payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    zone = DeliveryZone(**values)
    db.session.add(zone)
    db.session.flush()
    log_action("create_delivery_zone", "delivery_zone", zone.id)
    db.session.commit()
    return jsonify(delivery_zone=delivery_zone_json(zone)), 201


@admin_bp.put("/delivery-zones/<int:zone_id>")
@login_required
@permission_required("deliveryZones.edit")
def update_delivery_zone(zone_id):
    zone = db.get_or_404(DeliveryZone, zone_id)
    payload = request.get_json(silent=True) or {}
    try:
        values = _delivery_zone_payload(zone, payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    for field, value in values.items():
        setattr(zone, field, value)
    log_action("update_delivery_zone", "delivery_zone", zone.id)
    db.session.commit()
    return jsonify(delivery_zone=delivery_zone_json(zone))


@admin_bp.delete("/delivery-zones/<int:zone_id>")
@login_required
@permission_required("deliveryZones.delete")
def delete_delivery_zone(zone_id):
    zone = db.get_or_404(DeliveryZone, zone_id)
    log_action("delete_delivery_zone", "delivery_zone", zone.id, {"name": zone.name})
    db.session.delete(zone)
    db.session.commit()
    return jsonify(message="Delivery zone deleted.")


def _delivery_error_response(exc):
    return jsonify(error=exc.message, code=exc.code), exc.status_code


@admin_bp.get("/delivery-companies")
@login_required
@permission_required("delivery.view")
def delivery_companies():
    rows = DeliveryCompany.query.order_by(DeliveryCompany.name.asc()).all()
    return jsonify(items=[delivery_company_json(company) for company in rows])


@admin_bp.post("/delivery-companies")
@login_required
@permission_required("delivery.companies.manage")
def create_delivery_company():
    payload = request.get_json(silent=True) or {}
    try:
        company, manager = create_company(payload, actor=actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    notification = send_portal_access_notification(manager, "manager") if manager else None
    log_action("create_delivery_company", "delivery_company", company.id, {"name": company.name})
    db.session.commit()
    return jsonify(
        company=delivery_company_json(company),
        manager=delivery_company_user_json(manager) if manager else None,
        temporary_password=DEFAULT_TEMPORARY_PASSWORD if manager else None,
        notification=notification,
    ), 201


@admin_bp.get("/delivery-companies/<int:company_id>")
@login_required
@permission_required("delivery.view")
def delivery_company_detail(company_id):
    company = db.get_or_404(DeliveryCompany, company_id)
    deliveries = (
        OrderDelivery.query
        .filter_by(company_id=company.id)
        .order_by(OrderDelivery.updated_at.desc())
        .limit(100)
        .all()
    )
    include_events = current_user.has_permission("delivery.audit.view")
    serialized_deliveries = []
    for delivery in deliveries:
        try:
            serialized_deliveries.append(delivery_json(delivery, include_events=include_events))
        except Exception as exc:
            current_app.logger.exception("Could not serialize delivery %s for company %s: %s", delivery.id, company.id, exc)
            serialized_deliveries.append({
                "id": delivery.id,
                "order_id": delivery.order_id,
                "order_reference": delivery.order.order_reference if delivery.order else None,
                "company_id": delivery.company_id,
                "company_name": company.name,
                "rider_id": delivery.rider_id,
                "rider_name": delivery.rider.name if delivery.rider else None,
                "status": delivery.status,
                "assigned_at": delivery.assigned_at.isoformat() if delivery.assigned_at else None,
                "updated_at": delivery.updated_at.isoformat() if delivery.updated_at else None,
                "serialization_warning": True,
            })
    return jsonify(
        company=delivery_company_json(company),
        managers=[delivery_company_user_json(user) for user in company.company_users],
        riders=[delivery_rider_json(rider) for rider in company.riders],
        deliveries=serialized_deliveries,
    )


@admin_bp.get("/delivery-riders/<int:rider_id>")
@login_required
@permission_required("delivery.view")
def admin_delivery_rider_detail(rider_id):
    rider = db.get_or_404(DeliveryRider, rider_id)
    deliveries = (
        OrderDelivery.query
        .filter_by(rider_id=rider.id)
        .order_by(OrderDelivery.updated_at.desc())
        .limit(200)
        .all()
    )
    include_events = current_user.has_permission("delivery.audit.view")
    return jsonify(
        rider=delivery_rider_json(rider),
        company=delivery_company_json(rider.company),
        deliveries=[delivery_json(delivery, include_events=include_events) for delivery in deliveries],
    )


@admin_bp.put("/delivery-companies/<int:company_id>")
@login_required
@permission_required("delivery.companies.manage")
def update_delivery_company(company_id):
    company = db.get_or_404(DeliveryCompany, company_id)
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or company.name).strip()
    if not name:
        return jsonify(error="Delivery company name is required."), 400
    duplicate = DeliveryCompany.query.filter(func.lower(DeliveryCompany.name) == name.lower(), DeliveryCompany.id != company.id).first()
    if duplicate:
        return jsonify(error="A delivery company with this name already exists."), 409
    company.name = name
    company.contact_name = (payload.get("contact_name") if "contact_name" in payload else company.contact_name) or None
    company.contact_email = (payload.get("contact_email") if "contact_email" in payload else company.contact_email) or None
    if "contact_phone" in payload:
        raw_phone = payload.get("contact_phone") or ""
        company.contact_phone = normalise_phone(raw_phone) if raw_phone else None
    company.notes = (payload.get("notes") if "notes" in payload else company.notes) or None
    if "default_delivery_payable" in payload:
        company.default_delivery_payable = payload.get("default_delivery_payable") or None
    if "is_active" in payload:
        company.is_active = _boolish(payload.get("is_active"))
        company.status = "active" if company.is_active else "inactive"
    if "status" in payload:
        company.status = str(payload.get("status") or company.status).strip() or company.status
        company.is_active = company.status == "active"
    log_action("update_delivery_company", "delivery_company", company.id, {"name": company.name})
    db.session.commit()
    return jsonify(company=delivery_company_json(company))


@admin_bp.post("/delivery-companies/<int:company_id>/managers")
@login_required
@permission_required("delivery.companies.manage")
def create_delivery_company_manager(company_id):
    company = db.get_or_404(DeliveryCompany, company_id)
    payload = request.get_json(silent=True) or {}
    try:
        manager = create_company_user(company, payload, actor=actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    notification = send_portal_access_notification(manager, "manager")
    log_action("create_delivery_company_manager", "delivery_company_user", manager.id, {"company_id": company.id})
    db.session.commit()
    return jsonify(
        manager=delivery_company_user_json(manager),
        temporary_password=DEFAULT_TEMPORARY_PASSWORD,
        notification=notification,
    ), 201


@admin_bp.put("/delivery-company-users/<int:company_user_id>")
@login_required
@permission_required("delivery.companies.manage")
def update_delivery_company_user(company_user_id):
    company_user = db.get_or_404(DeliveryCompanyUser, company_user_id)
    payload = request.get_json(silent=True) or {}
    if "name" in payload:
        company_user.name = (payload.get("name") or company_user.name).strip()
        first, _, last = company_user.name.partition(" ")
        company_user.user.first_name = first or company_user.user.first_name
        company_user.user.last_name = last
    if "title" in payload:
        company_user.title = (payload.get("title") or "").strip() or None
    if "phone" in payload:
        phone = normalise_phone(payload.get("phone") or "")
        if not phone:
            return jsonify(error="Enter a valid Ghana phone number."), 400
        duplicate = DeliveryCompanyUser.query.filter(DeliveryCompanyUser.phone == phone, DeliveryCompanyUser.id != company_user.id).first()
        if duplicate:
            return jsonify(error="A company user already exists for this phone number."), 409
        company_user.phone = phone
        company_user.user.phone = phone
    if "is_active" in payload:
        company_user.is_active = _boolish(payload.get("is_active"))
        company_user.user.is_active = company_user.is_active
    log_action("update_delivery_company_user", "delivery_company_user", company_user.id)
    db.session.commit()
    return jsonify(manager=delivery_company_user_json(company_user))


@admin_bp.post("/delivery-company-users/<int:company_user_id>/reset-password")
@login_required
@permission_required("delivery.companies.manage")
def reset_delivery_company_user_password(company_user_id):
    company_user = db.get_or_404(DeliveryCompanyUser, company_user_id)
    try:
        reset_portal_password(company_user.user)
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    notification = send_portal_access_notification(company_user, "manager")
    log_action("reset_delivery_company_user_password", "delivery_company_user", company_user.id)
    db.session.commit()
    return jsonify(
        message="Company manager password reset. They must change it on next login.",
        temporary_password=DEFAULT_TEMPORARY_PASSWORD,
        notification=notification,
    )


@admin_bp.get("/deliveries")
@login_required
@permission_required("delivery.view")
def admin_deliveries():
    status = (request.args.get("status") or "").strip()
    query = OrderDelivery.query.order_by(OrderDelivery.updated_at.desc())
    if status:
        query = query.filter_by(status=status)
    rows = query.limit(200).all()
    return jsonify(items=[delivery_json(delivery) for delivery in rows])


@admin_bp.get("/orders/<int:order_id>/delivery")
@login_required
@permission_required("delivery.view")
def admin_order_delivery(order_id):
    order = db.get_or_404(Order, order_id)
    delivery = getattr(order, "delivery", None)
    return jsonify(
        order=order_json(order),
        delivery=delivery_json(delivery, include_events=True) if delivery else None,
        contact_warning=staff_delivery_contact_warning(order),
        override_reasons=OTP_OVERRIDE_REASONS,
    )


@admin_bp.post("/orders/<int:order_id>/delivery/assign")
@login_required
@permission_required("delivery.assign")
@permission_required("orders.edit")
def admin_assign_order_delivery(order_id):
    order = db.get_or_404(Order, order_id)
    payload = request.get_json(silent=True) or {}
    company = db.session.get(DeliveryCompany, payload.get("company_id"))
    if not company:
        return jsonify(error="Choose a delivery company."), 400
    try:
        delivery = assign_order_to_company(
            order, company, actor_from_user(current_user), note=payload.get("note"),
            company_payable_amount=payload.get("company_payable_amount"),
            promotion_payer=payload.get("promotion_payer"), promotion_amount=payload.get("promotion_amount"),
        )
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    log_action("assign_order_delivery_company", "order_delivery", delivery.id, {
        "order_reference": order.order_reference,
        "company_id": company.id,
    })
    db.session.commit()
    return jsonify(
        delivery=delivery_json(delivery, include_events=True),
        contact_warning=staff_delivery_contact_warning(order),
    )


@admin_bp.post("/deliveries/<int:delivery_id>/otp-resend")
@login_required
@permission_required("delivery.assign")
@permission_required("orders.edit")
def admin_resend_delivery_otp(delivery_id):
    delivery = db.get_or_404(OrderDelivery, delivery_id)
    try:
        resend_delivery_otp(delivery, actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    log_action("resend_delivery_otp", "order_delivery", delivery.id)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True))


@admin_bp.post("/deliveries/<int:delivery_id>/otp-override")
@login_required
@permission_required("delivery.override_otp")
@permission_required("orders.edit")
def admin_override_delivery_otp(delivery_id):
    delivery = db.get_or_404(OrderDelivery, delivery_id)
    payload = request.get_json(silent=True) or {}
    try:
        staff_override_otp(
            delivery,
            actor_from_user(current_user),
            payload.get("reason"),
            note=payload.get("note"),
        )
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    log_action("override_delivery_otp", "order_delivery", delivery.id, {
        "reason": payload.get("reason"),
        "order_reference": delivery.order.order_reference if delivery.order else None,
    })
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True))


@admin_bp.post("/deliveries/<int:delivery_id>/cancel")
@login_required
@permission_required("delivery.assign")
@permission_required("orders.edit")
def admin_cancel_delivery(delivery_id):
    delivery = db.get_or_404(OrderDelivery, delivery_id)
    payload = request.get_json(silent=True) or {}
    reason = (payload.get("reason") or "cancelled_by_realmindx").strip()
    cancel_delivery(delivery, actor_from_user(current_user), reason=reason, note=payload.get("note"))
    if payload.get("cancel_order"):
        delivery.order.status = "cancelled"
    log_action("cancel_delivery_assignment", "order_delivery", delivery.id, {"reason": reason, "cancel_order": bool(payload.get("cancel_order"))})
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True), order=order_json(delivery.order))


def _settlement_query():
    query = DeliverySettlementBatch.query.order_by(DeliverySettlementBatch.settlement_date.desc(), DeliverySettlementBatch.id.desc())
    company_id = request.args.get("company_id", type=int)
    status = (request.args.get("status") or "").strip()
    start = (request.args.get("start_date") or "").strip()
    end = (request.args.get("end_date") or "").strip()
    payment_method = (request.args.get("payment_method") or "").strip()
    if company_id: query = query.filter_by(company_id=company_id)
    if status: query = query.filter_by(status=status)
    if start: query = query.filter(DeliverySettlementBatch.settlement_date >= date.fromisoformat(start))
    if end: query = query.filter(DeliverySettlementBatch.settlement_date <= date.fromisoformat(end))
    rows = query.all()
    if payment_method:
        rows = [row for row in rows if any(line.payment_method == payment_method for line in row.lines)]
    return rows


@admin_bp.get("/delivery-settlements")
@login_required
@permission_required("delivery.settlements.view")
def admin_delivery_settlements():
    return jsonify(items=[batch_json(batch) for batch in _settlement_query()])


@admin_bp.get("/delivery-settlements/<int:batch_id>")
@login_required
@permission_required("delivery.settlements.view")
def admin_delivery_settlement_detail(batch_id):
    return jsonify(settlement=batch_json(db.get_or_404(DeliverySettlementBatch, batch_id), include_lines=True, include_events=True))


@admin_bp.post("/delivery-settlements/<int:batch_id>/adjust")
@login_required
@permission_required("delivery.settlements.adjust")
def admin_adjust_delivery_settlement(batch_id):
    payload = request.get_json(silent=True) or {}
    try: batch = apply_adjustment(db.get_or_404(DeliverySettlementBatch, batch_id), payload.get("amount"), payload.get("reason"), actor_from_user(current_user))
    except SettlementError as exc: return jsonify(error=exc.message, code=exc.code), exc.status_code
    db.session.commit()
    return jsonify(settlement=batch_json(batch, include_lines=True, include_events=True))


@admin_bp.post("/delivery-settlements/<int:batch_id>/mark-paid")
@login_required
@permission_required("delivery.settlements.mark_paid")
def admin_mark_delivery_settlement_paid(batch_id):
    payload = request.get_json(silent=True) or {}
    try:
        batch = mark_settled(db.get_or_404(DeliverySettlementBatch, batch_id), payload.get("payment_reference"), payload.get("payment_date"), actor_from_user(current_user), payload.get("payment_proof_url"))
    except (SettlementError, ValueError) as exc:
        return jsonify(error=getattr(exc, "message", "Enter a valid payment date.")), getattr(exc, "status_code", 400)
    db.session.commit()
    company_email = (batch.company.contact_email or "").strip() if batch.company else ""
    if company_email:
        portal_url = f"{current_app.config['DELIVERY_URL'].rstrip('/')}/manager/"
        try:
            send_email(OutboundEmail(
                to=company_email,
                subject=f"Delivery settlement confirmed: {batch.reference}",
                html=app_email_shell(
                    "Delivery settlement confirmed",
                    f"<p>Settlement <strong>{escape(batch.reference)}</strong> has been marked settled.</p><p>Payment reference: <strong>{escape(batch.payment_reference)}</strong>.</p>",
                    cta_label="Open delivery company portal", cta_url=portal_url,
                ),
                text=f"Settlement {batch.reference} has been marked settled. Payment reference: {batch.payment_reference}. {portal_url}",
            ))
        except Exception:
            current_app.logger.exception("Could not send settlement confirmation for %s", batch.reference)
    return jsonify(settlement=batch_json(batch, include_lines=True, include_events=True))


@admin_bp.post("/delivery-settlements/<int:batch_id>/resolve-dispute")
@login_required
@permission_required("delivery.settlements.dispute_resolve")
def admin_resolve_delivery_settlement_dispute(batch_id):
    payload = request.get_json(silent=True) or {}
    try: batch = resolve_dispute(db.get_or_404(DeliverySettlementBatch, batch_id), payload.get("note"), actor_from_user(current_user))
    except SettlementError as exc: return jsonify(error=exc.message, code=exc.code), exc.status_code
    db.session.commit()
    return jsonify(settlement=batch_json(batch, include_lines=True, include_events=True))


def _settlement_export_response(batch, export_format):
    rows = [line_json(line) for line in batch.lines]
    for row in rows:
        row.update(payment_reference=batch.payment_reference, dispute_status=batch.dispute_status)
    headers = ["settlement_date", "order_reference", "company_name", "rider_name", "customer_name", "delivery_location", "payment_method", "book_subtotal", "customer_delivery_fee", "company_payable", "promotion_amount", "promotion_payer", "amount_collected_realmindx", "amount_collected_company", "amount_due_realmindx", "amount_due_company", "net_balance", "status", "delivered_at", "payment_reference", "dispute_status"]
    if export_format == "csv":
        output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=headers); writer.writeheader()
        writer.writerows([{key: row.get(key) for key in headers} for row in rows])
        return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={batch.reference}.csv"})
    if export_format == "xlsx":
        try: from openpyxl import Workbook
        except ImportError: return jsonify(error="XLSX export requires openpyxl."), 501
        workbook = Workbook(); sheet = workbook.active; sheet.title = "Settlement"; sheet.append(headers)
        for row in rows: sheet.append([row.get(key) for key in headers])
        stream = io.BytesIO(); workbook.save(stream); stream.seek(0)
        return send_file(stream, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name=f"{batch.reference}.xlsx")
    if export_format == "pdf":
        try:
            from reportlab.lib.pagesizes import landscape, A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError: return jsonify(error="PDF export requires reportlab."), 501
        stream = io.BytesIO(); pdf = rl_canvas.Canvas(stream, pagesize=landscape(A4)); width, height = landscape(A4)
        totals = batch_json(batch); y = height - 40; pdf.setFont("Helvetica-Bold", 16); pdf.drawString(35, y, "RealMindX Delivery Settlement")
        y -= 20; pdf.setFont("Helvetica", 9); pdf.drawString(35, y, f"{batch.reference} | {batch.company.name} | {batch.settlement_date} | {batch.status}")
        y -= 18; pdf.drawString(35, y, f"Deliveries: {totals['delivery_count']} | Book value: GHS {totals['book_subtotal']:.2f} | Company payable: GHS {totals['company_payable']:.2f} | Net: GHS {totals['net_balance']:.2f}")
        y -= 24; pdf.setFont("Helvetica-Bold", 7); pdf.drawString(35, y, "Order | Rider | Location | Payment | Book | Delivery | Payable | Due RMX | Due Company | Net")
        pdf.setFont("Helvetica", 7)
        for row in rows:
            y -= 14
            if y < 35: pdf.showPage(); y = height - 40; pdf.setFont("Helvetica", 7)
            text = f"{row['order_reference']} | {row['rider_name'] or '-'} | {row['delivery_location'] or '-'} | {row['payment_method']} | {row['book_subtotal']:.2f} | {row['customer_delivery_fee']:.2f} | {row['company_payable']:.2f} | {row['amount_due_realmindx']:.2f} | {row['amount_due_company']:.2f} | {row['net_balance']:.2f}"
            pdf.drawString(35, y, text[:180])
        pdf.save(); stream.seek(0)
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name=f"{batch.reference}.pdf")
    if export_format == "zip":
        try: from openpyxl import Workbook
        except ImportError: return jsonify(error="ZIP export requires openpyxl."), 501
        try:
            from reportlab.lib.pagesizes import landscape, A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError: return jsonify(error="ZIP export requires reportlab."), 501
        zip_stream = io.BytesIO()
        with zipfile.ZipFile(zip_stream, "w", zipfile.ZIP_DEFLATED) as zf:
            output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=headers); writer.writeheader(); writer.writerows([{key: row.get(key) for key in headers} for row in rows])
            zf.writestr(f"{batch.reference}.csv", output.getvalue())
            workbook = Workbook(); sheet = workbook.active; sheet.title = "Settlement"; sheet.append(headers)
            for row in rows: sheet.append([row.get(key) for key in headers])
            xlsx_stream = io.BytesIO(); workbook.save(xlsx_stream); xlsx_stream.seek(0); zf.writestr(f"{batch.reference}.xlsx", xlsx_stream.getvalue())
            pdf_stream = io.BytesIO(); pdf = rl_canvas.Canvas(pdf_stream, pagesize=landscape(A4)); width, height = landscape(A4)
            totals = batch_json(batch); y = height - 40; pdf.setFont("Helvetica-Bold", 16); pdf.drawString(35, y, "RealMindX Delivery Settlement")
            y -= 20; pdf.setFont("Helvetica", 9); pdf.drawString(35, y, f"{batch.reference} | {batch.company.name} | {batch.settlement_date} | {batch.status}")
            y -= 18; pdf.drawString(35, y, f"Deliveries: {totals['delivery_count']} | Book value: GHS {totals['book_subtotal']:.2f} | Company payable: GHS {totals['company_payable']:.2f} | Net: GHS {totals['net_balance']:.2f}")
            y -= 24; pdf.setFont("Helvetica-Bold", 7); pdf.drawString(35, y, "Order | Rider | Location | Payment | Book | Delivery | Payable | Due RMX | Due Company | Net")
            pdf.setFont("Helvetica", 7)
            for row in rows:
                y -= 14
                if y < 35: pdf.showPage(); y = height - 40; pdf.setFont("Helvetica", 7)
                text = f"{row['order_reference']} | {row['rider_name'] or '-'} | {row['delivery_location'] or '-'} | {row['payment_method']} | {row['book_subtotal']:.2f} | {row['customer_delivery_fee']:.2f} | {row['company_payable']:.2f} | {row['amount_due_realmindx']:.2f} | {row['amount_due_company']:.2f} | {row['net_balance']:.2f}"
                pdf.drawString(35, y, text[:180])
            pdf.save(); pdf_stream.seek(0); zf.writestr(f"{batch.reference}.pdf", pdf_stream.getvalue())
        zip_stream.seek(0)
        return send_file(zip_stream, mimetype="application/zip", as_attachment=True, download_name=f"{batch.reference}.zip")
    return jsonify(error="Use csv, xlsx, pdf, or zip."), 400


@admin_bp.get("/delivery-settlements/<int:batch_id>/export/<string:export_format>")
@login_required
@permission_required("delivery.settlements.export")
def admin_export_delivery_settlement(batch_id, export_format):
    batch = db.get_or_404(DeliverySettlementBatch, batch_id)
    log_action("settlement_exported", "delivery_settlement", batch.id, {"format": export_format})
    db.session.commit()
    return _settlement_export_response(batch, export_format)


@admin_bp.get("/orders")
@login_required
@permission_required("orders.view")
def orders():
    rows = placed_order_query().order_by(Order.created_at.desc()).all()
    return jsonify(items=[order_json(order) for order in rows])


def _ledger_iso(value):
    return value.isoformat() if value else None


def _ledger_amount(value):
    return float(value or 0)


def _cart_invoice_status(invoice):
    if invoice.converted_at or invoice.converted_order_id:
        return "converted"
    if invoice.emailed_at:
        return "emailed"
    return invoice.status or "generated"


def _receipt_invoice_order_row(order):
    document_id = order.invoice_id or order.order_reference
    return {
        "id": f"receipt-{order.id}",
        "record_id": order.id,
        "document_type": "receipt",
        "document_label": "Receipt",
        "document_id": document_id,
        "lookup_id": order.order_reference or document_id,
        "order_reference": order.order_reference,
        "customer_name": order.customer_name,
        "email": order.email,
        "phone": order.phone,
        "recipients": [order.email] if order.email else [],
        "status": normalize_order_status(order.status),
        "payment_status": order.payment_status or "",
        "source": "bookshop_order",
        "subtotal_amount": _ledger_amount(order.subtotal_amount),
        "delivery_fee": _ledger_amount(order.delivery_fee),
        "total_amount": _ledger_amount(order.total_amount),
        "created_at": _ledger_iso(order.created_at),
        "issued_at": _ledger_iso(order.paid_at or order.created_at),
        "emailed_at": None,
        "viewed_at": None,
        "converted_at": _ledger_iso(order.created_at),
        "converted_order_id": order.id,
        "linked_cart_invoice_id": order.cart_invoice.invoice_id if order.cart_invoice else None,
        "item_count": len(order.items or []),
        "pdf_document": "receipt",
    }


def _receipt_invoice_cart_row(invoice):
    recipients = [str(email) for email in (invoice.recipients or []) if email]
    return {
        "id": f"cart-invoice-{invoice.id}",
        "record_id": invoice.id,
        "document_type": "cart_invoice",
        "document_label": "Cart Invoice",
        "document_id": invoice.invoice_id,
        "lookup_id": invoice.invoice_id,
        "order_reference": "",
        "customer_name": "Cart invoice",
        "email": recipients[0] if recipients else "",
        "phone": "",
        "recipients": recipients,
        "status": _cart_invoice_status(invoice),
        "payment_status": "not_applicable",
        "source": "cart_invoice",
        "subtotal_amount": _ledger_amount(invoice.subtotal_amount),
        "delivery_fee": _ledger_amount(invoice.delivery_fee),
        "total_amount": _ledger_amount(invoice.total_amount),
        "created_at": _ledger_iso(invoice.created_at),
        "issued_at": _ledger_iso(invoice.created_at),
        "emailed_at": _ledger_iso(invoice.emailed_at),
        "viewed_at": _ledger_iso(invoice.viewed_at),
        "converted_at": _ledger_iso(invoice.converted_at),
        "converted_order_id": invoice.converted_order_id,
        "linked_cart_invoice_id": invoice.invoice_id,
        "item_count": len(invoice.items or []),
        "pdf_document": "",
    }


@admin_bp.get("/receipts-invoices")
@login_required
@permission_required("orders.view")
def receipts_invoices():
    orders = (
        placed_order_query()
        .options(joinedload(Order.items), joinedload(Order.cart_invoice))
        .order_by(Order.created_at.desc())
        .limit(300)
        .all()
    )
    invoices = (
        CartInvoice.query
        .options(joinedload(CartInvoice.items))
        .order_by(CartInvoice.created_at.desc())
        .limit(300)
        .all()
    )
    rows = [_receipt_invoice_order_row(order) for order in orders]
    rows.extend(_receipt_invoice_cart_row(invoice) for invoice in invoices)

    query = (request.args.get("q") or "").strip().lower()
    document_type = (request.args.get("type") or "all").strip()
    status = (request.args.get("status") or "all").strip().lower()

    if document_type != "all":
        rows = [row for row in rows if row["document_type"] == document_type]
    if status != "all":
        rows = [row for row in rows if str(row["status"]).lower() == status]
    if query:
        rows = [
            row for row in rows
            if query in " ".join([
                str(row.get("document_id") or ""),
                str(row.get("order_reference") or ""),
                str(row.get("customer_name") or ""),
                str(row.get("email") or ""),
                " ".join(row.get("recipients") or []),
                str(row.get("source") or ""),
                str(row.get("status") or ""),
            ]).lower()
        ]

    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    summary = {
        "total": len(rows),
        "receipts": sum(1 for row in rows if row["document_type"] == "receipt"),
        "cart_invoices": sum(1 for row in rows if row["document_type"] == "cart_invoice"),
        "converted": sum(1 for row in rows if row["status"] == "converted"),
        "emailed": sum(1 for row in rows if row["status"] == "emailed"),
    }
    return jsonify(items=rows[:400], summary=summary)


@admin_bp.get("/orders/export")
@login_required
@permission_required("orders.export")
def export_orders():
    export_format = (request.args.get("format") or "csv").lower()
    rows = placed_order_query().order_by(Order.created_at.desc()).all()
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
    raw_status = payload.get("status")
    if raw_status in {None, ""}:
        return jsonify(error="Select a valid order status."), 400
    status = normalize_order_status(raw_status)
    delivery = getattr(order, "delivery", None)
    if delivery and delivery.company_id:
        return jsonify(
            error="This order is managed by an external delivery company. Use delivery actions instead of the manual order status control.",
            code="external_delivery_status_managed",
        ), 409
    cancel_reason = (payload.get("cancel_reason") or "").strip()
    valid_statuses = {"new", "confirmed", "shipped", "complete", "cancelled", "archived"}
    if status not in valid_statuses:
        return jsonify(error="Invalid order status."), 400
    old_status = normalize_order_status(order.status)
    order.status = status
    if cancel_reason:
        order.notes = cancel_reason
    if status == "cancelled" and getattr(order, "delivery", None):
        try:
            cancel_delivery(order.delivery, actor_from_user(current_user), reason=cancel_reason or "order_cancelled")
        except DeliveryError:
            pass
    promo_snapshot = None
    if status == "complete" and old_status != "complete":
        usage, created = record_completed_order_promo_usage(order)
        if created and usage and usage.affiliate_email and getattr(usage.promo_code, "affiliate_notify_on_use", True):
            promo_snapshot = usage_snapshot(usage)
    log_action("update_order_status", "order", order.id, {"status": status, "prev": old_status})
    db.session.commit()

    if status != old_status:
        snapshot = _order_contact_snapshot(order)
        if snapshot.email:
            _run_in_background("Order status email", _send_order_status_email, snapshot, status, cancel_reason)
        if snapshot.phone:
            _run_in_background("Order status SMS", _send_order_status_sms, snapshot, status, cancel_reason)
    if promo_snapshot:
        _run_in_background("Promo commission email", send_promo_usage_notification, promo_snapshot)

    return jsonify(order=order_json(order))


def _send_order_status_sms(order, status, cancel_reason=""):
    """Send an SMS to the customer when their order status changes."""
    from ..sms_service import send_sms
    if not order.phone:
        return
    first_name = (order.customer_name or "").split()[0] or "there"
    ref = order.order_reference
    status = normalize_order_status(status)
    messages = {
        "new": (
            f"Hi {first_name}, your RealMindX Bookshop order {ref} has been placed. "
            f"Our team will contact you within 1 business day to arrange receipt of your package."
        ),
        "confirmed": (
            f"Hi {first_name}, your RealMindX Bookshop order {ref} is confirmed "
            f"and being packaged. We will contact you shortly with any final receipt details."
        ),
        "shipped": (
            f"Hi {first_name}, great news! Your order {ref} is on its way. "
            f"Expected delivery within 48 hours. - RealMindX Bookshop"
        ),
        "complete": (
            f"Hi {first_name}, your order {ref} has been delivered. "
            f"Thank you for choosing RealMindX Bookshop. Please check your email to rate your experience."
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
    base_url = current_app.config["BASE_URL"].rstrip("/")
    bookshop_url = current_app.config.get("BOOKSHOP_URL", f"{base_url}/bookshop").rstrip("/")
    status = normalize_order_status(status)
    delivery_info = (
        "Pickup from our Dome Pillar 2 shop"
        if order.delivery_method == "pickup"
        else f"Delivery to {order.location or 'the address on file'}"
    )
    payment_info = (
        "Payment on delivery"
        if order.payment_method == "cash_on_delivery"
        else "Online payment via Paystack"
    )
    order_meta_html = f"""
    <div style="background:#f5f8fc;border:1px solid #dce5f0;border-radius:12px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0 0 6px;"><strong>Reference:</strong> {escape(ref)}</p>
      <p style="margin:0 0 6px;"><strong>Fulfilment:</strong> {escape(delivery_info)}</p>
      <p style="margin:0 0 6px;"><strong>Payment:</strong> {escape(payment_info)}</p>
      <p style="margin:0;"><strong>Contact number:</strong> {escape(order.phone or "not provided")}</p>
    </div>
    """
    order_summary_html = bookshop_order_summary_table(order)
    feedback_url = f"{bookshop_url}/review?ref={escape(ref, quote=True)}"
    feedback_rows = (
        "<tr>"
        + "".join(
            f'<td style="padding:0 2px 8px;"><a href="{feedback_url}&score={score}" '
            f'style="display:inline-block;min-width:28px;padding:9px 0;border-radius:7px;'
            f'background:#143670;color:#ffffff;font-weight:800;font-family:Arial,Helvetica,sans-serif;'
            f'font-size:13px;text-decoration:none;text-align:center;">{score}</a></td>'
            for score in range(1, 11)
        )
        + "</tr>"
    )
    feedback_scale_html = f"""
    <div style="margin:22px 0 6px;">
      <p style="margin:0 0 12px;font-weight:700;color:#143670;">How likely are you to recommend RealMindX Bookshop to others?</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
        {feedback_rows}
      </table>
      <p style="margin:8px 0 0;color:#53657d;font-size:13px;">1 = Not likely at all, 10 = Extremely likely.</p>
    </div>
    """

    status_messages = {
        "new": {
            "subject": f"Your RealMindX Bookshop order has been placed: {ref}",
            "title": "Your order has been placed!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Your order <strong>{escape(ref)}</strong> has been placed successfully and our team is reviewing it now.</p>"
                f"{order_meta_html}"
                f"{order_summary_html}"
                f"<p>Our team will contact you within <strong>1 business day</strong> to confirm your order.</p>"
                f"<p>If you need anything sooner, contact us on any of the channels below and we&rsquo;ll help right away.</p>"
            ),
            "cta_label": "Track Your Order",
            "cta_url": "track",
        },
        "confirmed": {
            "subject": f"Your RealMindX Bookshop order is confirmed: {ref}",
            "title": "Your order is confirmed!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Great news! Your order <strong>{escape(ref)}</strong> has been confirmed and our team is getting it ready for you.</p>"
                f"{order_meta_html}"
                f"{order_summary_html}"
                f"<p>Our team will contact you when your order is ready to ensure you receive your order.</p>"
                f"<p>In the meantime, feel free to reach us through any of the channels below if you have any questions or concerns.</p>"
            ),
            "cta_label": "Track Your Order",
            "cta_url": "track",
        },
        "shipped": {
            "subject": f"Your RealMindX order is on its way: {ref}",
            "title": "Your order is on its way!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Good news! Your order <strong>{escape(ref)}</strong> has been dispatched and is heading your way.</p>"
                f"{order_meta_html}"
                f"{order_summary_html}"
                f"<p>Expected delivery is within 48 hours. Our team will contact you if any final handover details are needed.</p>"
            ),
            "cta_label": "Track Your Order",
            "cta_url": "track",
        },
        "complete": {
            "subject": f"Order delivered. Thank you, {escape(first_name)}!",
            "title": "Order delivered. Thank you!",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Your order <strong>{escape(ref)}</strong> has been marked as delivered. We hope you&rsquo;re pleased with our service.</p>"
                f"{order_meta_html}"
                f"{order_summary_html}"
                f"<p>If anything is missing or not as expected, please contact us through our channels below and we&rsquo;ll investigate and rectify.</p>"
                f"{feedback_scale_html}"
                f"<p>Thank you for choosing RealMindX Bookshop. We look forward to serving you again.</p>"
            ),
            "cta_label": "Rate Your Experience",
            "cta_url": feedback_url,
        },
        "cancelled": {
            "subject": f"Your RealMindX order {ref} has been cancelled",
            "title": "Order cancelled",
            "body": (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>We&rsquo;re sorry to let you know that your order <strong>{escape(ref)}</strong> has been cancelled.</p>"
                + order_summary_html
                + (f"<p><strong>Reason:</strong> {escape(cancel_reason)}</p>" if cancel_reason else "")
                + "<p>If you believe this is an error or would like to place a new order, please reach out to us and we&rsquo;ll be happy to help.</p>"
            ),
            "cta_label": "Contact Us",
            "cta_url": f"{base_url}/contact",
        },
    }

    info = status_messages.get(status)
    if not info:
        return  # no email for other status changes (archived, etc.)

    try:
        attachments = []
        if status == "complete":
            try:
                from ..invoices import build_receipt_pdf

                receipt_stream = build_receipt_pdf(order)
                attachments.append(EmailAttachment(
                    filename=f"{ref}-receipt.pdf",
                    content=receipt_stream.getvalue(),
                    content_type="application/pdf",
                ))
            except Exception:
                current_app.logger.exception("Could not build receipt PDF for order %s.", ref)

        send_email(OutboundEmail(
            to=order.email,
            from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
            subject=info["subject"],
            html=bookshop_email_shell(
                info["title"],
                info["body"],
                cta_label=info.get("cta_label"),
                cta_url=info.get("cta_url"),
                eyebrow="RealMindX Bookshop",
                preheader=info["subject"],
            ),
            attachments=attachments,
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
        image_position = (section.get("image_position") or "auto").strip().lower()
        image_size = (section.get("image_size") or "medium").strip().lower()
        if image_position not in {"auto", "left", "right", "full"}:
            image_position = "auto"
        if image_size not in {"small", "medium", "large"}:
            image_size = "medium"
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
                "image_position": image_position,
                "image_size": image_size,
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
    rows = News.query.order_by(News.created_at.desc()).all()
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
    rows = Resource.query.order_by(Resource.created_at.desc()).all()
    items = []
    for r in rows:
        file_payload = _uploaded_file_payload(r.resource_file)
        file_url = file_payload["url"] if file_payload else None
        items.append({
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "source": r.source,
            "category": r.category,
            "level": r.level,
            "subject": r.subject,
            "curriculum": r.curriculum,
            "publication_year": r.publication_year,
            "tags": r.tags,
            "audience": r.audience,
            "official_source_url": r.official_source_url,
            "featured": r.featured,
            "last_verified_at": r.last_verified_at.isoformat() if r.last_verified_at else None,
            "copyright_status": r.copyright_status,
            "document_type": r.document_type,
            "original_filename": r.original_filename or (file_payload["name"] if file_payload else ""),
            "external_url": r.external_url,
            "url": r.external_url or file_url,
            "file_url": file_url,
            "resource_file_id": r.resource_file_id,
            "resource_file_name": file_payload["name"] if file_payload else "",
            "is_published": r.is_published,
            "status": "published" if r.is_published else "draft",
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        })
    return jsonify(items=items)


def _resource_file_id_from_payload(payload):
    if "resource_file_id" not in payload:
        return None, False
    raw = payload.get("resource_file_id")
    if raw in (None, ""):
        return None, True
    try:
        file_id = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("Resource file is invalid.") from exc
    uploaded = db.session.get(UploadedFile, file_id)
    if not uploaded:
        raise ValueError("Uploaded resource file was not found.")
    if uploaded.category != "resources":
        raise ValueError("Choose a file uploaded as a resource.")
    return uploaded.id, True


@admin_bp.post("/resources")
@login_required
@permission_required("resources.create")
def create_resource():
    payload = request.get_json(silent=True) or {}
    try:
        resource_file_id, has_resource_file = _resource_file_id_from_payload(payload)
        last_verified_at = _dateish(payload.get("last_verified_at"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    row = Resource(
        title=(payload.get("title") or "").strip(),
        category=(payload.get("category") or "").strip(),
        description=payload.get("description"),
        source=payload.get("source"),
        level=payload.get("level") or None,
        subject=payload.get("subject") or None,
        curriculum=payload.get("curriculum") or None,
        publication_year=_intish(payload.get("publication_year"), None),
        tags=payload.get("tags") or None,
        audience=payload.get("audience") or None,
        official_source_url=payload.get("official_source_url") or None,
        featured=bool(payload.get("featured")),
        last_verified_at=last_verified_at,
        copyright_status=payload.get("copyright_status") or None,
        document_type=payload.get("document_type") or None,
        original_filename=payload.get("original_filename") or None,
        external_url=payload.get("external_url") or payload.get("url"),
        resource_file_id=resource_file_id if has_resource_file else None,
        is_published=bool(payload.get("is_published", payload.get("status") == "published")),
    )
    if not row.title:
        return jsonify(error="Title is required."), 400
    if not row.category:
        return jsonify(error="Category is required."), 400
    if not row.resource_file_id and not row.external_url:
        return jsonify(error="Upload a document or enter an external URL."), 400
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
    try:
        resource_file_id, has_resource_file = _resource_file_id_from_payload(payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    for field in ["title", "category", "description", "source", "level", "subject", "curriculum", "tags", "audience", "official_source_url", "copyright_status", "document_type", "original_filename", "external_url", "is_published", "featured"]:
        if field in payload:
            value = payload[field]
            if field in {"title", "category"}:
                value = (value or "").strip()
            elif field in {"is_published", "featured"}:
                value = bool(value)
            else:
                value = value or None
            setattr(row, field, value)
    if "publication_year" in payload:
        row.publication_year = _intish(payload.get("publication_year"), None)
    if "last_verified_at" in payload:
        try:
            row.last_verified_at = _dateish(payload.get("last_verified_at"))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
    if "url" in payload:
        row.external_url = payload["url"]
    if has_resource_file:
        row.resource_file_id = resource_file_id
    if "status" in payload:
        row.is_published = payload["status"] == "published"
    if not (row.title or "").strip() or not (row.category or "").strip():
        return jsonify(error="Title and category are required."), 400
    if not row.resource_file_id and not row.external_url:
        return jsonify(error="Upload a document or enter an external URL."), 400
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
    query = NewsletterSubscriber.query
    q = (request.args.get("q") or "").strip().lower()
    source = (request.args.get("source") or "").strip()
    status = (request.args.get("status") or "").strip()
    tag = (request.args.get("tag") or "").strip()
    if q:
        query = query.filter(NewsletterSubscriber.email.ilike(f"%{q}%"))
    if source:
        query = query.filter(or_(
            NewsletterSubscriber.source == source,
            NewsletterSubscriber.sources.contains([source]),
        ))
    if status:
        if status == "active":
            query = query.filter(NewsletterSubscriber.is_active.is_(True))
        elif status == "unsubscribed":
            query = query.filter(or_(
                NewsletterSubscriber.is_active.is_(False),
                NewsletterSubscriber.communication_status == UNSUBSCRIBED,
            ))
        else:
            query = query.filter(NewsletterSubscriber.communication_status == status)
    if tag:
        query = query.filter(NewsletterSubscriber.tags.contains([tag]))
    rows = query.order_by(NewsletterSubscriber.created_at.desc()).limit(500).all()
    return jsonify(items=[contact_json(r) for r in rows])


@admin_bp.post("/newsletters")
@login_required
@permission_required("newsletters.create")
def create_newsletter_contact():
    payload = request.get_json(silent=True) or {}
    try:
        email = normalize_contact_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    source = (payload.get("source") or "manual_institution_import").strip()
    status = (payload.get("communication_status") or payload.get("status") or MARKETING_ACTIVE).strip()
    tags = payload.get("tags") or []
    if isinstance(tags, str):
        tags = [item.strip() for item in re.split(r"[,;]+", tags) if item.strip()]
    row = upsert_contact(
        email,
        source=source,
        communication_status=status,
        tags=tags,
        notes=(payload.get("notes") or "").strip() or None,
    )
    db.session.commit()
    log_action("create_newsletter_contact", "newsletter_subscriber", row.id, {"email": row.email, "source": source})
    return jsonify(item=contact_json(row)), 201


NEWSLETTER_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
NEWSLETTER_IMAGE_RE = re.compile(r"^!\[(?:(left|right|full):)?([^\]]*)\]\(([^)\s]+)\)$", re.IGNORECASE)


def _absolute_newsletter_url(raw_url):
    value = (raw_url or "").strip()
    if not value:
        return ""
    if value.startswith(("http://", "https://", "mailto:", "tel:")):
        return value
    base_url = current_app.config.get("BASE_URL", "https://realmindxgh.com").rstrip("/")
    return f"{base_url}/{value.lstrip('/')}"


def _render_newsletter_inline(text):
    rendered = []
    position = 0
    for match in NEWSLETTER_LINK_RE.finditer(text or ""):
        rendered.append(escape((text or "")[position:match.start()]).replace("\n", "<br>"))
        label = escape(match.group(1).strip())
        href = escape(_absolute_newsletter_url(match.group(2)), quote=True)
        rendered.append(
            f'<a class="newsletter-rich-link" href="{href}" '
            'style="color:#143670!important;font-weight:800;text-decoration:underline;text-underline-offset:3px;">'
            f"{label}</a>"
        )
        position = match.end()
    rendered.append(escape((text or "")[position:]).replace("\n", "<br>"))
    return "".join(rendered)


def _render_newsletter_image(match):
    align = (match.group(1) or "full").lower()
    alt = escape((match.group(2) or "Newsletter image").strip(), quote=True)
    src = escape(_absolute_newsletter_url(match.group(3)), quote=True)
    if align in {"left", "right"}:
        margin = "4px 18px 12px 0" if align == "left" else "4px 0 12px 18px"
        return (
            f'<img class="newsletter-rich-image newsletter-rich-image-{align}" src="{src}" alt="{alt}" '
            f'align="{align}" width="240" '
            f'style="display:block;max-width:46%;width:240px;height:auto;border-radius:12px;'
            f'border:1px solid #dce5f0;float:{align};margin:{margin};" />'
        )
    return (
        f'<img class="newsletter-rich-image" src="{src}" alt="{alt}" '
        'style="display:block;width:100%;max-width:100%;height:auto;border-radius:14px;'
        'border:1px solid #dce5f0;margin:18px 0;" />'
    )


def _render_newsletter_body(body):
    blocks = []
    for block in re.split(r"\n\s*\n", body or ""):
        clean = block.strip()
        if not clean:
            continue
        image_match = NEWSLETTER_IMAGE_RE.match(clean)
        if image_match:
            blocks.append(_render_newsletter_image(image_match))
        else:
            blocks.append(f'<p style="margin:0 0 18px;">{_render_newsletter_inline(clean)}</p>')
    return (
        '<style>'
        '@media (prefers-color-scheme:dark){.newsletter-rich-link{color:#ffcc01!important;}}'
        '@media only screen and (max-width:600px){.newsletter-rich-image-left,.newsletter-rich-image-right{'
        'float:none!important;margin:16px 0!important;max-width:100%!important;width:100%!important;}}'
        '</style>'
        '<div class="newsletter-rich" style="background:#ffffff;color:#1a2a40;">'
        + "".join(blocks)
        + '<div style="clear:both;height:1px;line-height:1px;">&nbsp;</div></div>'
    )


def _render_newsletter_sections(sections):
    if not isinstance(sections, list) or not sections:
        return ""
    blocks = []
    for index, section in enumerate(sections):
        heading = escape((section.get("heading") or "").strip())
        body = (section.get("body") or "").strip()
        caption = escape((section.get("caption") or "").strip())
        image_file_id = section.get("image_file_id")
        image_url = ""
        if image_file_id:
            image_file = db.session.get(UploadedFile, image_file_id)
            image_url = _upload_public_url(image_file) if image_file else ""
        position = (section.get("image_position") or "auto").strip().lower()
        if position == "auto":
            position = "right" if index % 2 == 0 else "left"
        if position not in {"left", "right", "full"}:
            position = "right"

        text_html = ""
        if heading:
            text_html += f'<h2 style="margin:0 0 10px;color:#143670;font-size:20px;line-height:1.25;">{heading}</h2>'
        if body:
            text_html += _render_newsletter_body(body)

        image_html = ""
        if image_url:
            safe_url = escape(_absolute_newsletter_url(image_url), quote=True)
            image_html = (
                f'<img src="{safe_url}" alt="{caption or heading or "Campaign image"}" width="260" '
                'style="display:block;width:100%;max-width:260px;height:auto;border-radius:12px;'
                'border:1px solid #dce5f0;" />'
            )
            if caption:
                image_html += f'<p style="margin:8px 0 0;color:#53657d;font-size:12px;line-height:1.4;">{caption}</p>'

        if image_html and position != "full":
            image_cell = f'<td class="newsletter-section-image" width="42%" style="width:42%;vertical-align:top;padding:0 0 16px;">{image_html}</td>'
            text_cell = f'<td class="newsletter-section-text" style="vertical-align:top;padding:0 0 16px;">{text_html}</td>'
            cells = image_cell + '<td width="18" style="width:18px;">&nbsp;</td>' + text_cell if position == "left" else text_cell + '<td width="18" style="width:18px;">&nbsp;</td>' + image_cell
            blocks.append(f'<table class="newsletter-section-row" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;"><tr>{cells}</tr></table>')
        else:
            blocks.append(
                '<div style="margin:0 0 24px;">'
                + (f'<div style="margin:0 0 14px;">{image_html}</div>' if image_html else "")
                + text_html
                + '</div>'
            )
    return (
        '<style>@media only screen and (max-width:600px){'
        '.newsletter-section-row,.newsletter-section-row tbody,.newsletter-section-row tr,.newsletter-section-row td{display:block!important;width:100%!important;}'
        '.newsletter-section-image{padding:0 0 14px!important}.newsletter-section-text{padding:0!important}'
        '}</style>'
        + "".join(blocks)
    )


def _campaign_from_email(sender):
    sender = (sender or "news").strip().lower()
    if sender == "sales":
        return current_app.config.get("SALES_FROM_EMAIL") or "RealMindX Sales <sales@send.realmindxgh.com>"
    if sender == "bookshop":
        return current_app.config.get("BOOKSHOP_FROM_EMAIL")
    if sender == "default":
        return current_app.config.get("DEFAULT_FROM_EMAIL")
    return current_app.config.get("NEWSLETTER_FROM_EMAIL")


@admin_bp.post("/newsletters/send")
@login_required
@permission_required("newsletters.create")
def send_newsletter_campaign():
    payload = request.get_json(silent=True) or {}
    subject = (payload.get("subject") or "").strip()
    title = (payload.get("title") or subject).strip()
    body = (payload.get("body") or "").strip()
    sections = payload.get("sections") or []
    if not subject or not title or (not body and not sections):
        return jsonify(error="Subject, title, and message content are required."), 400

    body_html = _render_newsletter_sections(sections) if sections else _render_newsletter_body(body)
    image_url = None
    image_file_id = payload.get("image_file_id")
    if image_file_id:
        image_file = db.session.get(UploadedFile, image_file_id)
        image_url = _upload_public_url(image_file) if image_file else None

    brand = (payload.get("brand") or "realmindx").strip().lower()
    is_bookshop = brand == "bookshop"
    shell = bookshop_email_shell if is_bookshop else app_email_shell
    sender = (payload.get("sender") or payload.get("purpose") or ("bookshop" if is_bookshop else "news")).strip().lower()
    eyebrow = {
        "sales": "RealMindX Sales",
        "bookshop": "RealMindX Bookshop Updates",
        "news": "RealMindX Updates",
    }.get(sender, "RealMindX Updates")
    from_email = _campaign_from_email(sender)
    base_url = current_app.config.get("SITE_BASE_URL", "https://realmindxgh.com").rstrip("/")
    recipient_ids = payload.get("recipient_ids") or []
    recipient_emails = payload.get("recipient_emails") or payload.get("recipients") or []
    if isinstance(recipient_emails, str):
        recipient_emails = [item.strip() for item in re.split(r"[\s,;]+", recipient_emails) if item.strip()]
    subscribers = []
    seen = set()
    if recipient_ids:
        subscribers.extend(NewsletterSubscriber.query.filter(NewsletterSubscriber.id.in_(recipient_ids)).all())
    for raw_email in recipient_emails:
        try:
            email = normalize_contact_email(raw_email)
        except ValueError:
            continue
        row = NewsletterSubscriber.query.filter_by(email=email).first()
        if not row:
            row = upsert_contact(
                email,
                source="manual_campaign_recipient",
                communication_status=MARKETING_ACTIVE,
                tags=["campaign"],
            )
        subscribers.append(row)
    if not subscribers:
        subscribers = NewsletterSubscriber.query.filter(
            NewsletterSubscriber.is_active.is_(True),
            NewsletterSubscriber.communication_status != UNSUBSCRIBED,
        ).order_by(NewsletterSubscriber.email.asc()).all()

    sent = 0
    for subscriber in subscribers:
        if subscriber.email in seen:
            continue
        seen.add(subscriber.email)
        if subscriber.communication_status == UNSUBSCRIBED or not subscriber.is_active:
            continue
        if not subscriber.unsubscribe_token:
            subscriber.unsubscribe_token = secrets.token_urlsafe(32)
        unsubscribe_url = f"{base_url}/unsubscribe?token={subscriber.unsubscribe_token}"
        send_email(
            OutboundEmail(
                to=subscriber.email,
                subject=subject,
                from_email=from_email,
                html=shell(
                    title,
                    body_html,
                    payload.get("cta_label") or None,
                    payload.get("cta_url") or None,
                    eyebrow=eyebrow,
                    preheader=payload.get("preheader") or payload.get("summary") or title,
                    hero_image_url=image_url,
                    footer_note=(
                        f'You are receiving this RealMindX email because your address is listed under '
                        f'{escape(", ".join(subscriber.sources or [subscriber.source or "RealMindX contacts"]))}. '
                        f'<a href="{unsubscribe_url}" style="color:#aaa;">Unsubscribe</a>.'
                    ),
                ),
            )
        )
        sent += 1

    log_action("send_newsletter_campaign", "newsletter", None, {"subject": subject, "brand": brand, "sender": sender, "sent": sent})
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
        if not row.is_active:
            row.communication_status = UNSUBSCRIBED
    if "status" in payload:
        row.communication_status = payload["status"]
        row.is_active = payload["status"] != UNSUBSCRIBED
    if "communication_status" in payload:
        row.communication_status = payload["communication_status"]
        row.is_active = payload["communication_status"] != UNSUBSCRIBED
    if "source" in payload:
        row.source = (payload.get("source") or row.source or "site").strip()
    if "sources" in payload and isinstance(payload["sources"], list):
        row.sources = [str(item).strip() for item in payload["sources"] if str(item).strip()]
    if "tags" in payload:
        tags = payload["tags"]
        if isinstance(tags, str):
            tags = [item.strip() for item in re.split(r"[,;]+", tags) if item.strip()]
        row.tags = tags if isinstance(tags, list) else []
    if "notes" in payload:
        row.notes = (payload.get("notes") or "").strip() or None
    log_action("update_newsletter_subscriber", "newsletter_subscriber", row.id)
    db.session.commit()
    return jsonify(item=contact_json(row))


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


SETTING_SCOPES = {"all", "main", "bookshop"}


def _split_setting_key(storage_key):
    for scope in ("main", "bookshop"):
        prefix = f"{scope}__"
        if storage_key.startswith(prefix):
            return scope, storage_key[len(prefix):]
    return "all", storage_key


def _storage_setting_key(key, scope):
    clean_key = (key or "").strip()
    clean_scope = (scope or "all").strip().lower()
    if not clean_key:
        raise ValueError("Detail Name is required.")
    if "__" in clean_key:
        raise ValueError("Detail Name cannot contain double underscores.")
    if clean_scope not in SETTING_SCOPES:
        raise ValueError("Choose Both sites, Main website only, or Bookshop only.")
    return clean_key if clean_scope == "all" else f"{clean_scope}__{clean_key}"


@admin_bp.get("/settings")
@login_required
@permission_required("settings.view")
def list_settings():
    rows = SiteSetting.query.order_by(SiteSetting.key.asc()).all()
    items = []
    for row in rows:
        scope, display_key = _split_setting_key(row.key)
        items.append({
            "id": row.key,
            "database_id": row.id,
            "key": display_key,
            "site_scope": scope,
            "value": row.value,
            "public": row.public,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        })
    return jsonify(items=items)


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
        "is_focus": r.is_focus,
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
        is_focus=bool(payload.get("is_focus", False)),
    )
    if not row.headline and not row.image_file_id:
        return jsonify(error="Add headline text, an image, or both."), 400
    if row.is_focus:
        Flyer.query.update({Flyer.is_focus: False}, synchronize_session=False)
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
    for field in ["headline", "accent", "subline", "badge", "sort_order", "image_file_id", "show_overlay", "image_fit", "image_position", "status", "is_focus"]:
        if field in payload:
            value = payload[field]
            if field in {"headline", "accent", "subline", "badge", "image_file_id"}:
                value = (str(value).strip() if value is not None else "") or None
            setattr(row, field, value)
    if row.is_focus:
        Flyer.query.filter(Flyer.id != row.id).update({Flyer.is_focus: False}, synchronize_session=False)
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
@permission_required("priceAdjustment.view")
def list_promo_codes():
    rows = PromoCode.query.order_by(PromoCode.created_at.desc()).all()
    return jsonify(items=[_promo_json(r) for r in rows])


def _apply_promo_payload(row, payload):
    discount_type = (payload.get("discount_type", row.discount_type or "percentage") or "percentage").strip().lower()
    applies_to = (payload.get("applies_to", row.applies_to or "products") or "products").strip().lower()
    if discount_type not in {"percentage", "fixed"}:
        raise ValueError("Discount type must be percentage or fixed.")
    if applies_to not in {"products", "delivery", "all"}:
        raise ValueError("Promo codes can apply to products, delivery, or all.")

    discount_value = _decimalish(payload.get("discount_value"), float(row.discount_value or 0))
    min_order_amount = _decimalish(payload.get("min_order_amount"), float(row.min_order_amount or 0))
    commission_percent = _decimalish(
        payload.get("affiliate_commission_percent"),
        float(getattr(row, "affiliate_commission_percent", 0) or 0),
    )
    if discount_value < 0:
        raise ValueError("Discount value cannot be negative.")
    if discount_type == "percentage" and discount_value > 100:
        raise ValueError("Percentage discount cannot exceed 100%.")
    if min_order_amount < 0:
        raise ValueError("Minimum order amount cannot be negative.")
    if commission_percent < 0 or commission_percent > 100:
        raise ValueError("Affiliate commission percent must be between 0 and 100.")

    max_uses_value = payload.get("max_uses", row.max_uses)
    max_uses = None if max_uses_value in {None, ""} else max(1, _intish(max_uses_value, 0))
    row.description = (payload.get("description", row.description) or "").strip() or None
    row.discount_type = discount_type
    row.discount_value = discount_value
    row.applies_to = applies_to
    row.min_order_amount = min_order_amount
    row.max_uses = max_uses
    if "valid_from" in payload:
        row.valid_from = _dateish(payload.get("valid_from"))
    if "valid_until" in payload:
        row.valid_until = _dateish(payload.get("valid_until"))
    if row.valid_from and row.valid_until and row.valid_from > row.valid_until:
        raise ValueError("Valid From cannot be later than Valid Until.")
    if "is_active" in payload:
        row.is_active = _boolish(payload.get("is_active"))

    row.affiliate_name = (payload.get("affiliate_name", row.affiliate_name) or "").strip() or None
    row.affiliate_email = (payload.get("affiliate_email", row.affiliate_email) or "").strip().lower() or None
    row.affiliate_phone = (payload.get("affiliate_phone", row.affiliate_phone) or "").strip() or None
    row.affiliate_commission_percent = commission_percent
    if "affiliate_notify_on_use" in payload:
        row.affiliate_notify_on_use = _boolish(payload.get("affiliate_notify_on_use"))


@admin_bp.post("/promo-codes")
@login_required
@permission_required("priceAdjustment.edit")
def create_promo_code():
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().upper()
    if not code:
        return jsonify(error="Code is required."), 400
    if PromoCode.query.filter_by(code=code).first():
        return jsonify(error="A promo code with that name already exists."), 409
    row = PromoCode(code=code, is_active=True)
    try:
        _apply_promo_payload(row, payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    db.session.add(row)
    db.session.flush()
    log_action("create_promo_code", "promo_code", row.id, {"code": row.code})
    db.session.commit()
    return jsonify(promo_code=_promo_json(row)), 201


@admin_bp.put("/promo-codes/<int:promo_id>")
@login_required
@permission_required("priceAdjustment.edit")
def update_promo_code(promo_id):
    row = db.get_or_404(PromoCode, promo_id)
    payload = request.get_json(silent=True) or {}
    try:
        _apply_promo_payload(row, payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    log_action("update_promo_code", "promo_code", row.id, {"code": row.code})
    db.session.commit()
    return jsonify(promo_code=_promo_json(row))


@admin_bp.delete("/promo-codes/<int:promo_id>")
@login_required
@permission_required("priceAdjustment.edit")
def delete_promo_code(promo_id):
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
        "is_active": r.is_active,
        "affiliate_name": getattr(r, "affiliate_name", None),
        "affiliate_email": getattr(r, "affiliate_email", None),
        "affiliate_phone": getattr(r, "affiliate_phone", None),
        "affiliate_commission_percent": float(getattr(r, "affiliate_commission_percent", 0) or 0),
        "affiliate_notify_on_use": bool(getattr(r, "affiliate_notify_on_use", True)),
        "completed_affiliate_uses": len(getattr(r, "usages", []) or []),
        "created_at": r.created_at.isoformat(),
    }


# ============================================================
# BULK PRICE ADJUSTMENT
# ============================================================

@admin_bp.post("/products/bulk-price-adjust")
@login_required
@permission_required("priceAdjustment.edit")
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
@permission_required("priceAdjustment.edit")
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
    display_key = payload.get("key")
    if display_key is None:
        _, display_key = _split_setting_key(key)
    scope = payload.get("site_scope")
    if scope is None:
        scope, _ = _split_setting_key(key)
    try:
        storage_key = _storage_setting_key(display_key, scope)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    conflict = SiteSetting.query.filter_by(key=storage_key).first()
    if conflict is not None and conflict is not row:
        return jsonify(error="That detail already exists for the selected website."), 409
    if not row:
        row = SiteSetting(key=storage_key)
        db.session.add(row)
    else:
        row.key = storage_key
    row.value = payload.get("value")
    row.public = bool(payload.get("public", row.public))
    log_action("upsert_setting", "site_setting", storage_key, {"scope": scope, "detail": display_key})
    db.session.commit()
    return jsonify(id=row.key, key=display_key, site_scope=scope, value=row.value, public=row.public)


@admin_bp.delete("/settings/<string:key>")
@login_required
@permission_required("settings.delete")
def delete_setting(key):
    row = SiteSetting.query.filter_by(key=key).first_or_404()
    log_action("delete_setting", "site_setting", key)
    db.session.delete(row)
    db.session.commit()
    return jsonify(message="Setting deleted.")
