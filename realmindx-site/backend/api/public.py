from datetime import datetime, timezone
from decimal import Decimal
from html import escape
from uuid import uuid4

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request
import requests

from ..default_content import (
    DEFAULT_DONATION_SLIDES,
    DEFAULT_HOME_HERO_SLIDES,
    DEFAULT_PARTNERS,
    DEFAULT_PEOPLE,
    DEFAULT_SERVICES,
    DEFAULT_SITE_COPY,
)
from ..audit import audit
from ..email_service import OutboundEmail, app_email_shell, send_email
from ..extensions import db, limiter
from ..models import ContactMessage, Flyer, GalleryItem, News, NewsletterSubscriber, Resource, SiteSetting, UploadedFile
from ..security import require_turnstile

public_bp = Blueprint("public", __name__)


def collection_item_id(item):
    if not isinstance(item, dict):
        return ""
    return str(item.get("id") or item.get("key") or "")


def collection_deleted_ids(key):
    row = SiteSetting.query.filter_by(key=f"{key}__deleted_ids").first()
    if row and isinstance(row.value, list):
        return {str(item) for item in row.value if str(item)}
    return set()


def active_default_items(key, default_items):
    deleted_ids = collection_deleted_ids(key)
    return [
        item for item in default_items
        if collection_item_id(item) not in deleted_ids
    ]


def setting_collection(key, default_items):
    active_defaults = active_default_items(key, default_items)
    row = SiteSetting.query.filter_by(key=key).first()
    if row and isinstance(row.value, list):
        deleted_ids = collection_deleted_ids(key)
        current_items = [
            item for item in row.value
            if isinstance(item, dict) and collection_item_id(item) not in deleted_ids
        ]
        existing_ids = {collection_item_id(item) for item in current_items}
        missing_defaults = [
            item for item in active_defaults
            if collection_item_id(item) not in existing_ids
        ]
        if len(current_items) != len(row.value):
            row.value = current_items
        if missing_defaults:
            row.value = [*row.value, *missing_defaults]
            row.public = True
            db.session.add(row)
            db.session.commit()
        return row.value
    row = row or SiteSetting(key=key, public=True)
    row.value = active_defaults
    row.public = True
    db.session.add(row)
    db.session.commit()
    return row.value


def public_rows(items):
    return [item for item in items if item.get("status") == "published" or item.get("is_active") is True]


def upload_public_url(uploaded_file):
    if not uploaded_file:
        return None
    return f"/uploads/{uploaded_file.visibility}/{uploaded_file.category}/{uploaded_file.stored_filename}"


def enrich_service_media(items):
    file_ids = {
        int(item.get("image_file_id"))
        for item in items
        if str(item.get("image_file_id") or "").isdigit()
    }
    files = {
        row.id: row
        for row in UploadedFile.query.filter(UploadedFile.id.in_(file_ids)).all()
    } if file_ids else {}
    enriched = []
    for item in items:
        row = dict(item)
        file_id = row.get("image_file_id")
        if str(file_id or "").isdigit():
            row["image_url"] = upload_public_url(files.get(int(file_id))) or row.get("image_url")
        enriched.append(row)
    return enriched


def enrich_news_sections(sections):
    rows = []
    if not isinstance(sections, list):
        return rows
    file_ids = {
        int(section.get("image_file_id"))
        for section in sections
        if isinstance(section, dict) and str(section.get("image_file_id") or "").isdigit()
    }
    files = {
        row.id: row
        for row in UploadedFile.query.filter(UploadedFile.id.in_(file_ids)).all()
    } if file_ids else {}
    for section in sections:
        if not isinstance(section, dict):
            continue
        row = {
            "heading": section.get("heading") or "",
            "body": section.get("body") or "",
            "caption": section.get("caption") or "",
            "image_file_id": section.get("image_file_id") or None,
        }
        if str(row["image_file_id"] or "").isdigit():
            row["image_url"] = upload_public_url(files.get(int(row["image_file_id"])))
        else:
            row["image_url"] = None
        if row["heading"] or row["body"] or row["image_url"] or row["caption"]:
            rows.append(row)
    return rows




def clean_email(email):
    try:
        return validate_email(email or "", check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


@public_bp.post("/contact")
@limiter.limit("5/minute")
def contact():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    name = (payload.get("name") or "").strip()
    subject = (payload.get("subject") or "Website enquiry").strip()
    message = (payload.get("message") or "").strip()
    if not name or not message:
        return jsonify(error="Name and message are required."), 400

    contact_message = ContactMessage(
        name=name,
        email=email,
        phone=(payload.get("phone") or "").strip() or None,
        subject=subject,
        message=message,
        source=payload.get("source") or "site",
    )
    db.session.add(contact_message)
    db.session.flush()
    ticket_reference = f"RMX-{contact_message.id:06d}"
    audit("contact_message_submitted", "contact_message", contact_message.id, {
        "email": email, "subject": subject, "source": contact_message.source,
        "ticket": ticket_reference,
    }, actor_email=email)
    db.session.commit()

    notification_html = app_email_shell(
        "New contact message",
        (
            f"<p><strong>Ticket:</strong> {ticket_reference}</p>"
            f"<p><strong>{escape(name)}</strong> ({escape(email)}) sent a message:</p>"
            f"<p><strong>Service:</strong> {escape(contact_message.source)}</p>"
            f"<p>{escape(message).replace(chr(10), '<br>')}</p>"
        ),
    )
    notification_subject = f"[{ticket_reference}] New RealMindX enquiry: {subject}"

    # Notify the primary inbox
    send_email(OutboundEmail(
        to=current_app.config["DEFAULT_REPLY_TO_EMAIL"],
        subject=notification_subject,
        html=notification_html,
        reply_to=email,
    ))
    # Also CC the Gmail inbox so nothing is missed
    admin_gmail = current_app.config.get("ADMIN_CC_EMAIL", "")
    if admin_gmail and admin_gmail.lower() != current_app.config["DEFAULT_REPLY_TO_EMAIL"].lower():
        send_email(OutboundEmail(
            to=admin_gmail,
            subject=notification_subject,
            html=notification_html,
            reply_to=email,
        ))

    first_name = (name.split()[0] if name else "there")
    # Warm confirmation to the sender
    send_email(OutboundEmail(
        to=email,
        subject=f"We've got your message, {escape(first_name)} — ref {ticket_reference}",
        html=app_email_shell(
            "We've received your message!",
            (
                f"<p>Hello {escape(first_name)},</p>"
                f"<p>Thank you for reaching out to RealMindX. We really appreciate you getting in touch, "
                f"and we want you to know your message has been received and is in the hands of our team.</p>"
                f"<div style='background:#f5f8fc;border-left:4px solid #f2bd00;border-radius:6px;"
                f"padding:14px 18px;margin:20px 0;'>"
                f"<p style='margin:0;'><strong>Your reference:</strong> {escape(ticket_reference)}</p>"
                f"<p style='margin:6px 0 0;'><strong>Subject:</strong> {escape(subject)}</p>"
                f"</div>"
                f"<p>One of our team members will get back to you within <strong>one business day</strong>. "
                f"If your enquiry is urgent, feel free to reply to this email or reach us directly on WhatsApp.</p>"
                f"<p>We look forward to speaking with you!</p>"
            ),
            eyebrow="RealMindX — Enquiry Received",
            preheader=f"Reference {ticket_reference} — we'll be in touch within one business day.",
        ),
    ))
    return jsonify(message="Message received. We will get back to you shortly.", ticket_reference=ticket_reference), 201


@public_bp.post("/newsletter")
@limiter.limit("8/minute")
def newsletter():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    subscriber = NewsletterSubscriber.query.filter_by(email=email).first()
    if subscriber:
        if not subscriber.is_active:
            subscriber.is_active = True
        status = "already_subscribed"
    else:
        subscriber = NewsletterSubscriber(email=email, source=payload.get("source") or "site")
        db.session.add(subscriber)
        status = "subscribed"
    subscriber.confirmed_at = subscriber.confirmed_at or datetime.now(timezone.utc)
    audit("newsletter_subscription", "newsletter_subscriber", None, {
        "email": email, "status": status, "source": payload.get("source") or "site",
    }, actor_email=email)
    db.session.commit()
    send_email(
        OutboundEmail(
            to=email,
            subject="Welcome to RealMindX updates",
            html=app_email_shell(
                "You are subscribed",
                "<p>Thanks for joining RealMindX updates. We will only send useful education, jobs, and bookshop updates.</p>",
            ),
        )
    )
    return jsonify(status=status, message="Newsletter subscription saved.")


@public_bp.post("/donations/paystack/initialize")
@limiter.limit("8/hour")
def initialize_donation_paystack():
    payload = request.get_json(silent=True) or {}
    secret_key = current_app.config.get("PAYSTACK_SECRET_KEY")
    if not secret_key:
        return jsonify(error="Paystack is not configured for this environment."), 503
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify(error="Full name is required."), 400
    try:
        amount = Decimal(str(payload.get("amount") or "0"))
    except Exception:
        return jsonify(error="Enter a valid donation amount."), 400
    if amount < Decimal("1"):
        return jsonify(error="Enter an amount of at least GHS 1."), 400

    reference = f"RMX-DON-{uuid4().hex[:12].upper()}"
    base_url = (current_app.config.get("BASE_URL") or request.host_url.rstrip("/")).rstrip("/")
    callback_url = payload.get("callback_url") or f"{base_url}/donate"
    try:
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"},
            json={
                "email": email,
                "amount": int(amount * 100),
                "reference": reference,
                "callback_url": callback_url,
                "metadata": {
                    "donor_name": name,
                    "phone": (payload.get("phone") or "").strip(),
                    "organisation": (payload.get("organisation") or "").strip(),
                    "contribution_type": (payload.get("type") or "Donation").strip(),
                    "support_area": (payload.get("area") or "General").strip(),
                    "message": (payload.get("message") or "").strip(),
                    "source": "donation_page",
                },
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json().get("data") or {}
    except requests.RequestException:
        current_app.logger.exception("Paystack donation initialization failed for %s", email)
        return jsonify(error="Could not open Paystack. Please try again or use WhatsApp."), 502
    return jsonify(payment=data, reference=reference)


@public_bp.post("/promo-codes/validate")
@limiter.limit("20/minute")
def validate_promo_code():
    """Validate a promo code and return its discount details."""
    from ..models import PromoCode
    from datetime import date
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().upper()
    order_total = float(payload.get("order_total") or 0)
    if not code:
        return jsonify(valid=False, error="No code provided."), 400

    row = PromoCode.query.filter_by(code=code, is_active=True).first()
    if not row:
        return jsonify(valid=False, error="This code is not valid or has expired."), 404

    today = date.today()
    if row.valid_from and today < row.valid_from:
        return jsonify(valid=False, error="This code is not yet active."), 400
    if row.valid_until and today > row.valid_until:
        return jsonify(valid=False, error="This code has expired."), 400
    if row.max_uses and row.uses_count >= row.max_uses:
        return jsonify(valid=False, error="This code has reached its usage limit."), 400
    if order_total < float(row.min_order_amount or 0):
        return jsonify(valid=False, error=f"Minimum order of GH₵{float(row.min_order_amount):.2f} required for this code."), 400

    return jsonify(
        valid=True,
        code=row.code,
        discount_type=row.discount_type,
        discount_value=float(row.discount_value or 0),
        applies_to=row.applies_to,
        description=row.description or "",
    )


@public_bp.get("/flyers")
def flyers():
    rows = Flyer.query.filter_by(status="published").order_by(Flyer.sort_order.asc(), Flyer.created_at.asc()).all()
    def _img(r):
        return f"/uploads/{r.image_file.visibility}/{r.image_file.category}/{r.image_file.stored_filename}" if r.image_file else None
    return jsonify(items=[{
        "id": r.id,
        "headline": r.headline,
        "accent": r.accent,
        "subline": r.subline,
        "badge": r.badge,
        "show_overlay": r.show_overlay,
        "image_fit": r.image_fit,
        "image_position": r.image_position,
        "image_url": _img(r),
    } for r in rows])


@public_bp.get("/settings")
def settings():
    rows = SiteSetting.query.filter_by(public=True).all()
    return jsonify(settings={row.key: row.value for row in rows})


@public_bp.get("/services")
def services():
    rows = setting_collection("services", DEFAULT_SERVICES)
    rows = sorted(public_rows(rows), key=lambda item: (item.get("sort_order") or 0, item.get("label") or ""))
    return jsonify(items=enrich_service_media(rows))


@public_bp.get("/site-copy")
def site_copy():
    rows = setting_collection("site_copy", DEFAULT_SITE_COPY)
    return jsonify(items=public_rows(rows))


@public_bp.get("/partners")
def partners():
    rows = setting_collection("partners", DEFAULT_PARTNERS)
    rows = sorted(public_rows(rows), key=lambda item: (item.get("sort_order") or 0, item.get("name") or ""))
    return jsonify(items=enrich_service_media(rows))


@public_bp.get("/people")
def people():
    rows = setting_collection("people", DEFAULT_PEOPLE)
    rows = sorted(public_rows(rows), key=lambda item: (item.get("sort_order") or 0, item.get("name") or ""))
    return jsonify(items=enrich_service_media(rows))


@public_bp.get("/home-hero-slides")
def home_hero_slides():
    rows = setting_collection("home_hero_slides", DEFAULT_HOME_HERO_SLIDES)
    rows = sorted(public_rows(rows), key=lambda item: (item.get("sort_order") or 0, item.get("label") or ""))
    return jsonify(items=enrich_service_media(rows))


@public_bp.get("/donation-slides")
def donation_slides():
    rows = setting_collection("donation_slides", DEFAULT_DONATION_SLIDES)
    rows = sorted(public_rows(rows), key=lambda item: (item.get("sort_order") or 0, item.get("label") or ""))
    return jsonify(items=enrich_service_media(rows))


@public_bp.get("/news")
def news():
    rows = News.query.filter_by(status="published").order_by(News.published_at.desc().nullslast()).limit(20).all()
    def _img(row):
        return upload_public_url(row.image_file) if row.image_file else None
    return jsonify(items=[{
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "category": row.category,
        "summary": row.summary,
        "body": row.body,
        "sections": enrich_news_sections(row.sections or []),
        "image_url": _img(row),
        "published_at": row.published_at.isoformat() if row.published_at else row.created_at.isoformat(),
    } for row in rows])


@public_bp.get("/gallery")
def gallery():
    rows = GalleryItem.query.filter_by(is_published=True).order_by(GalleryItem.sort_order.asc()).limit(40).all()
    def _img(row):
        return upload_public_url(row.image_file) if row.image_file else None
    return jsonify(items=[{"id": row.id, "title": row.title, "description": row.description, "image_url": _img(row)} for row in rows])


@public_bp.get("/resources")
def resources():
    rows = Resource.query.filter_by(is_published=True).order_by(Resource.created_at.desc()).limit(40).all()
    return jsonify(items=[{"id": row.id, "title": row.title, "description": row.description, "external_url": row.external_url} for row in rows])
