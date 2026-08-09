import secrets
from datetime import datetime, timezone

from email_validator import EmailNotValidError, validate_email
from sqlalchemy.exc import IntegrityError

from .extensions import db
from .models import CommunicationAttempt, Contact, ContactSource, NewsletterSubscriber


TRANSACTIONAL_ONLY = "transactional_only"
MARKETING_ACTIVE = "marketing_active"
UNSUBSCRIBED = "unsubscribed"

CONTACT_SOURCES = {
    "teacher",
    "bookshop",
    "newsletter",
    "school",
    "enquiry",
    "client",
    "admin_added",
}


def utcnow():
    return datetime.now(timezone.utc)


def _comparable_datetime(value):
    """Normalize SQLite-naive and Postgres-aware values for safe comparisons."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _earliest(*values):
    available = [value for value in values if value is not None]
    return min(available, key=_comparable_datetime) if available else None


def _latest(*values):
    available = [value for value in values if value is not None]
    return max(available, key=_comparable_datetime) if available else None


def normalize_contact_email(email):
    try:
        return validate_email(str(email or "").strip(), check_deliverability=False).normalized.lower().strip()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


def normalize_contact_source(source):
    clean = str(source or "").strip().lower()
    aliases = {
        "newsletter_form": "newsletter",
        "site": "newsletter",
        "cart_invoice": "enquiry",
        "manual_campaign_recipient": "admin_added",
        "manual_institution_import": "admin_added",
    }
    clean = aliases.get(clean, clean)
    if clean not in CONTACT_SOURCES:
        raise ValueError(f"Unsupported contact source: {source}")
    return clean


def list_append_unique(values, *items):
    seen = []
    for value in list(values or []) + [item for item in items if item]:
        clean = str(value or "").strip()
        if clean and clean not in seen:
            seen.append(clean)
    return seen


def _merge_metadata(existing, incoming):
    merged = dict(existing or {})
    for key, value in dict(incoming or {}).items():
        if value is not None and value != "":
            merged[str(key)] = value
    return merged


def _merge_contacts(source_contact, target_contact):
    if source_contact.id == target_contact.id:
        return target_contact

    if not target_contact.full_name and source_contact.full_name:
        target_contact.full_name = source_contact.full_name
    if not target_contact.phone and source_contact.phone:
        target_contact.phone = source_contact.phone
    target_contact.first_seen_at = _earliest(target_contact.first_seen_at, source_contact.first_seen_at)
    target_contact.last_activity_at = _latest(target_contact.last_activity_at, source_contact.last_activity_at)
    for link in list(source_contact.sources):
        existing = ContactSource.query.filter_by(
            contact_id=target_contact.id,
            source=link.source,
        ).first()
        if existing:
            existing.first_seen_at = _earliest(existing.first_seen_at, link.first_seen_at)
            existing.last_seen_at = _latest(existing.last_seen_at, link.last_seen_at)
            existing.source_record_id = existing.source_record_id or link.source_record_id
            existing.details = _merge_metadata(existing.details, link.details)
            db.session.delete(link)
        else:
            link.contact = target_contact

    source_subscription = source_contact.newsletter_subscription
    target_subscription = target_contact.newsletter_subscription
    if source_subscription:
        if not target_subscription:
            source_subscription.contact = target_contact
            source_subscription.email = target_contact.email
        else:
            target_subscription.confirmed_at = target_subscription.confirmed_at or source_subscription.confirmed_at
            target_subscription.sources = list_append_unique(
                target_subscription.sources,
                *(source_subscription.sources or []),
            )
            target_subscription.tags = list_append_unique(
                target_subscription.tags,
                *(source_subscription.tags or []),
            )
            if source_subscription.communication_status == UNSUBSCRIBED:
                target_subscription.communication_status = UNSUBSCRIBED
                target_subscription.is_active = False
            db.session.delete(source_subscription)

    CommunicationAttempt.query.filter_by(contact_id=source_contact.id).update(
        {"contact_id": target_contact.id},
        synchronize_session=False,
    )
    db.session.delete(source_contact)
    db.session.flush()
    return target_contact


def upsert_contact(
    email,
    *,
    full_name=None,
    phone=None,
    source,
    source_record_id=None,
    metadata=None,
    activity_at=None,
):
    normalized = normalize_contact_email(email)
    canonical_source = normalize_contact_source(source)
    record_id = str(source_record_id).strip() if source_record_id not in (None, "") else None
    now = activity_at or utcnow()

    source_link = None
    if record_id:
        source_link = ContactSource.query.filter_by(
            source=canonical_source,
            source_record_id=record_id,
        ).first()
    row = source_link.contact if source_link else Contact.query.filter_by(email=normalized).first()
    email_match = Contact.query.filter_by(email=normalized).first()
    if row and email_match and row.id != email_match.id:
        row = _merge_contacts(row, email_match)
    elif row and row.email != normalized:
        row.email = normalized

    if not row:
        try:
            with db.session.begin_nested():
                row = Contact(
                    email=normalized,
                    full_name=(full_name or "").strip() or None,
                    phone=(phone or "").strip() or None,
                    first_seen_at=now,
                    last_activity_at=now,
                )
                db.session.add(row)
                db.session.flush()
        except IntegrityError:
            row = Contact.query.filter_by(email=normalized).one()

    clean_name = str(full_name or "").strip()
    clean_phone = str(phone or "").strip()
    if clean_name and not row.full_name:
        row.full_name = clean_name
    if clean_phone and not row.phone:
        row.phone = clean_phone
    row.first_seen_at = _earliest(row.first_seen_at, now)
    row.last_activity_at = _latest(row.last_activity_at, now)

    link = ContactSource.query.filter_by(contact_id=row.id, source=canonical_source).first()
    if not link:
        try:
            with db.session.begin_nested():
                link = ContactSource(
                    contact=row,
                    source=canonical_source,
                    source_record_id=record_id,
                    first_seen_at=now,
                    last_seen_at=now,
                    details=dict(metadata or {}),
                )
                db.session.add(link)
                db.session.flush()
        except IntegrityError:
            link = ContactSource.query.filter_by(contact_id=row.id, source=canonical_source).one()
    else:
        link.first_seen_at = _earliest(link.first_seen_at, now)
        link.last_seen_at = _latest(link.last_seen_at, now)
        link.source_record_id = link.source_record_id or record_id
        link.details = _merge_metadata(link.details, metadata)
    return row


def upsert_contact_safely(*args, logger=None, **kwargs):
    try:
        with db.session.begin_nested():
            row = upsert_contact(*args, **kwargs)
            db.session.flush()
            return row
    except Exception as exc:
        if logger:
            logger.warning(
                "Contact synchronization failed (source=%s, error=%s)",
                kwargs.get("source"),
                type(exc).__name__,
            )
        return None


def remove_contact_source(contact, source):
    canonical_source = normalize_contact_source(source)
    link = ContactSource.query.filter_by(contact_id=contact.id, source=canonical_source).first()
    if link:
        db.session.delete(link)
        db.session.flush()
    if not ContactSource.query.filter_by(contact_id=contact.id).first():
        db.session.delete(contact)
        return True
    return False


def upsert_newsletter_subscription(email, *, source="site"):
    normalized = normalize_contact_email(email)
    now = utcnow()
    row = NewsletterSubscriber.query.filter_by(email=normalized).first()
    if not row:
        row = NewsletterSubscriber(
            email=normalized,
            source=source or "site",
            is_active=True,
            confirmed_at=now,
            unsubscribe_token=secrets.token_urlsafe(32),
            communication_status=MARKETING_ACTIVE,
            sources=[source or "site"],
            tags=[],
        )
        db.session.add(row)
        db.session.flush()
    else:
        row.source = row.source or source or "site"
        row.sources = list_append_unique(row.sources or [row.source], source)
        row.is_active = True
        row.communication_status = MARKETING_ACTIVE
        row.confirmed_at = row.confirmed_at or now
        if not row.unsubscribe_token:
            row.unsubscribe_token = secrets.token_urlsafe(32)
    contact = upsert_contact(
        normalized,
        source="newsletter",
        source_record_id=row.id,
        metadata={"signup_source": source or "site"},
        activity_at=now,
    )
    row.contact = contact
    return row, contact


def contact_json(row, *, include_sources=True):
    payload = {
        "id": row.id,
        "email": row.email,
        "full_name": row.full_name or "",
        "phone": row.phone or "",
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "first_seen_at": row.first_seen_at.isoformat() if row.first_seen_at else None,
        "last_activity_at": row.last_activity_at.isoformat() if row.last_activity_at else None,
    }
    if include_sources:
        payload["sources"] = [
            {
                "id": link.id,
                "source": link.source,
                "source_record_id": link.source_record_id,
                "first_seen_at": link.first_seen_at.isoformat() if link.first_seen_at else None,
                "last_seen_at": link.last_seen_at.isoformat() if link.last_seen_at else None,
                "metadata": link.details or {},
            }
            for link in sorted(
                row.sources,
                key=lambda item: (_comparable_datetime(item.first_seen_at or datetime.min), item.id),
            )
        ]
    return payload


def newsletter_subscriber_json(row):
    return {
        "id": row.id,
        "contact_id": row.contact_id,
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
