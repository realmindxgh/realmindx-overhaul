import re
import secrets
from datetime import datetime, timezone
from html import escape
from urllib.parse import urlparse

from email_validator import EmailNotValidError, validate_email
from flask import current_app
from sqlalchemy import or_

from .audit import audit
from .email_service import OutboundEmail, bookshop_email_shell, send_admin_alert, send_email
from .extensions import db
from .models import BookRequest, Product
from .sms_service import normalise_phone, send_sms


class BookRequestError(Exception):
    def __init__(self, message, status_code=400, code="book_request_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def _clean(value, limit):
    return str(value or "").strip()[:limit]


def normalize_title(value):
    return re.sub(r"[^a-z0-9]+", " ", _clean(value, 220).lower()).strip()


def normalize_email(value):
    if not _clean(value, 255):
        return None
    try:
        return validate_email(value, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise BookRequestError("Enter a valid email address.", 400, "invalid_email") from exc


def request_json(row, include_private=False):
    payload = {
        "id": row.id,
        "reference": row.reference,
        "requested_title": row.requested_title,
        "author": row.author,
        "publisher": row.publisher,
        "level": row.level,
        "status": row.status,
        "product_url": row.product_url,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "available_at": row.available_at.isoformat() if row.available_at else None,
    }
    if include_private:
        payload.update({
            "search_query": row.search_query,
            "browse_context": row.browse_context or {},
            "notes": row.notes,
            "customer_name": row.customer_name,
            "email": row.email,
            "phone": row.phone,
            "product_id": row.product_id,
            "product_name": row.product.name if row.product else None,
            "resolved_by": row.resolved_by.full_name if row.resolved_by else None,
            "acknowledgement": {"email": row.acknowledgement_email_status, "sms": row.acknowledgement_sms_status, "sent_at": row.acknowledgement_sent_at.isoformat() if row.acknowledgement_sent_at else None},
            "availability_notification": {"email": row.available_email_status, "sms": row.available_sms_status, "sent_at": row.available_notified_at.isoformat() if row.available_notified_at else None},
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        })
    return payload


def _email_status(result):
    if result.status == "mocked":
        return "mocked"
    return "sent" if result.status in ("queued", "accepted", "sent", "delivered") else "failed"


def send_acknowledgement(row):
    email_status = "unavailable"
    sms_status = "unavailable"
    if row.email:
        body = f"""
        <p>Hello {escape(row.customer_name)},</p>
        <p>We have received your request for <strong>{escape(row.requested_title)}</strong>.</p>
        <p>Our Bookshop team is checking availability and sourcing options. We will contact you when the book is available.</p>
        <p>Your request reference is <strong>{escape(row.reference)}</strong>.</p>
        """
        try:
            email_status = _email_status(send_email(
                OutboundEmail(
                    to=row.email,
                    subject=f"We received your book request - {row.reference}",
                    html=bookshop_email_shell("Book request received", body, preheader=f"We are working on {row.requested_title}."),
                    from_email=current_app.config.get("BOOKSHOP_FROM_EMAIL"),
                ),
                purpose="transactional",
                recipient_user_id=None,
                template_name="book_request_acknowledgement",
            ))
        except Exception:
            current_app.logger.exception("Book request acknowledgement email failed for %s", row.reference)
            email_status = "failed"
    elif row.phone:
        try:
            sms_result = send_sms(
                row.phone,
                f"RealMindX Bookshop received your request for {row.requested_title}. Reference: {row.reference}. We will contact you when it is available.",
                purpose="transactional",
                recipient_user_id=None,
                template_name="book_request_acknowledgement",
            )
            sms_status = _email_status(sms_result)
        except Exception:
            current_app.logger.exception("Book request acknowledgement SMS failed for %s", row.reference)
            sms_status = "failed"
    row.acknowledgement_email_status = email_status
    row.acknowledgement_sms_status = sms_status
    if "sent" in {email_status, sms_status}:
        row.acknowledgement_sent_at = datetime.now(timezone.utc)
    audit("book_request_acknowledgement", "book_request", row.id, {"email": email_status, "sms": sms_status}, actor_email=row.email)


def send_new_request_admin_alert(row):
    admin_url = f"{current_app.config['BASE_URL'].rstrip('/')}/admin/dashboard"
    details = [
        f"<p><strong>Reference:</strong> {escape(row.reference)}</p>",
        f"<p><strong>Requested book:</strong> {escape(row.requested_title)}</p>",
        f"<p><strong>Customer:</strong> {escape(row.customer_name)}</p>",
    ]
    if row.email:
        details.append(f"<p><strong>Email:</strong> {escape(row.email)}</p>")
    if row.phone:
        details.append(f"<p><strong>Phone:</strong> {escape(row.phone)}</p>")
    if row.author:
        details.append(f"<p><strong>Author:</strong> {escape(row.author)}</p>")
    if row.publisher:
        details.append(f"<p><strong>Publisher:</strong> {escape(row.publisher)}</p>")
    if row.level:
        details.append(f"<p><strong>Level:</strong> {escape(row.level)}</p>")
    if row.notes:
        details.append(f"<p><strong>Notes:</strong> {escape(row.notes)}</p>")

    return send_admin_alert(
        subject=f"New book request {row.reference}: {row.requested_title}",
        html=bookshop_email_shell(
            "New book request",
            "".join(details),
            cta_label="Review Book Requests",
            cta_url=admin_url,
            preheader=f"{row.customer_name} requested {row.requested_title}.",
        ),
        text=(
            f"New book request {row.reference}: {row.requested_title}. "
            f"Customer: {row.customer_name}. Review it at {admin_url}"
        ),
        from_email=current_app.config.get("BOOKSHOP_FROM_EMAIL"),
        reply_to=row.email,
        template_name="book_request_admin_alert",
    )


def create_request(payload):
    title = _clean(payload.get("requested_title") or payload.get("search_query"), 220)
    normalized_title = normalize_title(title)
    name = _clean(payload.get("customer_name"), 160)
    email = normalize_email(payload.get("email"))
    raw_phone = _clean(payload.get("phone"), 40)
    phone = normalise_phone(raw_phone) if raw_phone else None
    if not normalized_title:
        raise BookRequestError("Enter the book title or search term.", 400, "title_required")
    if len(name) < 2:
        raise BookRequestError("Enter your name.", 400, "name_required")
    if raw_phone and not phone:
        raise BookRequestError("Enter a valid Ghana phone number.", 400, "invalid_phone")
    if not email and not phone:
        raise BookRequestError("Enter an email address or phone number.", 400, "contact_required")

    contact_filters = []
    if email:
        contact_filters.append(BookRequest.email == email)
    if phone:
        contact_filters.append(BookRequest.phone == phone)
    existing = BookRequest.query.filter(
        BookRequest.status == "pending",
        BookRequest.normalized_title == normalized_title,
        or_(*contact_filters),
    ).order_by(BookRequest.created_at.desc()).first()
    if existing:
        audit("book_request_duplicate_reused", "book_request", existing.id, {
            "reference": existing.reference,
            "requested_title": existing.requested_title,
        }, actor_email=email)
        return existing, True

    row = BookRequest(
        reference=f"BRQ-{secrets.token_hex(4).upper()}",
        requested_title=title,
        normalized_title=normalized_title,
        search_query=_clean(payload.get("search_query"), 220) or None,
        browse_context=payload.get("browse_context") if isinstance(payload.get("browse_context"), dict) else {},
        author=_clean(payload.get("author"), 180) or None,
        publisher=_clean(payload.get("publisher"), 180) or None,
        level=_clean(payload.get("level"), 120) or None,
        notes=_clean(payload.get("notes"), 2000) or None,
        customer_name=name,
        email=email,
        phone=phone,
        status="pending",
    )
    db.session.add(row)
    db.session.flush()
    audit("book_request_created", "book_request", row.id, {"reference": row.reference, "requested_title": row.requested_title}, actor_email=email)
    send_acknowledgement(row)
    send_new_request_admin_alert(row)
    return row, False


def resolve_product_url(raw_url):
    value = _clean(raw_url, 500)
    if not value:
        raise BookRequestError("Paste the published product link.", 400, "product_url_required")
    bookshop_url = current_app.config.get("BOOKSHOP_URL", "https://bookshop.realmindxgh.com").rstrip("/")
    if value.startswith("/"):
        value = f"{bookshop_url}{value}"
    parsed = urlparse(value)
    allowed_hosts = {urlparse(bookshop_url).netloc.lower(), "bookshop.realmindxgh.com", "realmindxgh.com", "www.realmindxgh.com"}
    if parsed.scheme != "https" or parsed.netloc.lower() not in allowed_hosts:
        raise BookRequestError("Use a secure RealMindX Bookshop product link.", 400, "invalid_product_url")
    match = re.search(r"/(?:bookshop/)?products/([^/?#]+)", parsed.path)
    if not match:
        raise BookRequestError("The link must point to a Bookshop product page.", 400, "invalid_product_url")
    product = Product.query.filter_by(slug=match.group(1), is_active=True).first()
    if not product or product.stock_status == "out_of_stock":
        raise BookRequestError("This product is not currently published and available.", 400, "product_unavailable")
    return product, f"{bookshop_url}/products/{product.slug}"


def send_available_notification(row, retry=False):
    if not row.product or not row.product_url:
        raise BookRequestError("This request has no available product attached.", 409, "product_missing")
    email_status = row.available_email_status or "unavailable"
    sms_status = row.available_sms_status or "unavailable"
    if row.email and (not retry or email_status != "sent"):
        body = f"""
        <p>Hello {escape(row.customer_name)},</p>
        <p>Good news - <strong>{escape(row.product.name)}</strong> is now available at RealMindX Bookshop.</p>
        <p>You requested <strong>{escape(row.requested_title)}</strong> under reference {escape(row.reference)}.</p>
        """
        try:
            email_status = _email_status(send_email(
                OutboundEmail(
                    to=row.email,
                    subject=f"Your requested book is now available - {row.reference}",
                    html=bookshop_email_shell("Your book is available", body, cta_label="Buy Now", cta_url=row.product_url, preheader=f"{row.product.name} is ready to order."),
                    from_email=current_app.config.get("BOOKSHOP_FROM_EMAIL"),
                ),
                purpose="transactional",
                recipient_user_id=None,
                template_name="book_request_available",
            ))
        except Exception:
            current_app.logger.exception("Book availability email failed for %s", row.reference)
            email_status = "failed"
    if row.phone and (not retry or sms_status != "sent"):
        try:
            sms_result = send_sms(
                row.phone,
                f"Good news! {row.product.name} is now available at RealMindX Bookshop. Buy now: {row.product_url}",
                purpose="transactional",
                recipient_user_id=None,
                template_name="book_request_available",
            )
            sms_status = _email_status(sms_result)
        except Exception:
            current_app.logger.exception("Book availability SMS failed for %s", row.reference)
            sms_status = "failed"
    row.available_email_status = email_status
    row.available_sms_status = sms_status
    if "sent" in {email_status, sms_status}:
        row.available_notified_at = datetime.now(timezone.utc)
    audit("book_request_notification_retried" if retry else "book_request_availability_notification", "book_request", row.id, {"email": email_status, "sms": sms_status})
    return {"email": email_status, "sms": sms_status}


def mark_available(row, product_url, actor_id):
    if row.status == "available":
        raise BookRequestError("This request is already marked available.", 409, "already_available")
    product, canonical_url = resolve_product_url(product_url)
    row.status = "available"
    row.product = product
    row.product_url = canonical_url
    row.resolved_by_id = actor_id
    row.available_at = datetime.now(timezone.utc)
    audit("book_request_marked_available", "book_request", row.id, {"product_id": product.id, "product_url": canonical_url})
    return send_available_notification(row)
