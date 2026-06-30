import secrets
from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email

from .extensions import db
from .models import NewsletterSubscriber


TRANSACTIONAL_ONLY = "transactional_only"
MARKETING_ACTIVE = "marketing_active"
UNSUBSCRIBED = "unsubscribed"


def normalize_contact_email(email):
    try:
        return validate_email(email or "", check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


def list_append_unique(values, *items):
    seen = []
    for value in list(values or []) + [item for item in items if item]:
        clean = str(value or "").strip()
        if clean and clean not in seen:
            seen.append(clean)
    return seen


def upsert_contact(
    email,
    *,
    source="site",
    communication_status=None,
    tags=None,
    last_invoice_generated_at=None,
    last_invoice_used_at=None,
    last_order_at=None,
    last_login_at=None,
    notes=None,
):
    normalized = normalize_contact_email(email)
    row = NewsletterSubscriber.query.filter_by(email=normalized).first()
    now = datetime.now(timezone.utc)
    if not row:
        row = NewsletterSubscriber(
            email=normalized,
            source=source or "site",
            is_active=True,
            confirmed_at=now if communication_status == MARKETING_ACTIVE else None,
            unsubscribe_token=secrets.token_urlsafe(32),
            communication_status=communication_status or MARKETING_ACTIVE,
            sources=[source or "site"],
            tags=list_append_unique([], *(tags or [])),
        )
        db.session.add(row)
    else:
        row.source = row.source or source or "site"
        row.sources = list_append_unique(row.sources or [row.source], source)
        row.tags = list_append_unique(row.tags or [], *(tags or []))
        if not row.unsubscribe_token:
            row.unsubscribe_token = secrets.token_urlsafe(32)
        if communication_status:
            if row.communication_status != UNSUBSCRIBED:
                row.communication_status = communication_status
            row.is_active = row.communication_status != UNSUBSCRIBED
    if source == "newsletter_form" and row.communication_status != UNSUBSCRIBED:
        row.communication_status = MARKETING_ACTIVE
        row.is_active = True
        row.confirmed_at = row.confirmed_at or now
    if notes:
        row.notes = notes
    if last_invoice_generated_at:
        row.last_invoice_generated_at = last_invoice_generated_at
    if last_invoice_used_at:
        row.last_invoice_used_at = last_invoice_used_at
    if last_order_at:
        row.last_order_at = last_order_at
    if last_login_at:
        row.last_login_at = last_login_at
    return row


def contact_json(row):
    return {
        "id": row.id,
        "email": row.email,
        "source": row.source,
        "sources": row.sources or ([row.source] if row.source else []),
        "tags": row.tags or [],
        "is_active": bool(row.is_active),
        "status": row.communication_status or ("active" if row.is_active else UNSUBSCRIBED),
        "communication_status": row.communication_status or ("active" if row.is_active else UNSUBSCRIBED),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "last_login_at": row.last_login_at.isoformat() if row.last_login_at else None,
        "last_invoice_generated_at": row.last_invoice_generated_at.isoformat() if row.last_invoice_generated_at else None,
        "last_invoice_used_at": row.last_invoice_used_at.isoformat() if row.last_invoice_used_at else None,
        "last_order_at": row.last_order_at.isoformat() if row.last_order_at else None,
        "notes": row.notes or "",
    }
