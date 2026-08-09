"""
Unified communication result contract, mode validation, and attempt recording.

Every outbound message (email, SMS, WhatsApp, …) must return a
CommunicationResult so callers never need to guess provider-specific shapes.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Literal


class CommunicationMode(str, Enum):
    DISABLED = "disabled"
    MOCK = "mock"
    SANDBOX = "sandbox"
    LIVE = "live"


_VALID_MODES = frozenset(m.value for m in CommunicationMode)


class CommunicationStatus(str, Enum):
    DISABLED = "disabled"
    MOCKED = "mocked"
    SKIPPED = "skipped"
    QUEUED = "queued"
    ACCEPTED = "accepted"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    REJECTED = "rejected"
    EXPIRED = "expired"


_STATUS_VALUES = frozenset(s.value for s in CommunicationStatus)


class CommunicationPurpose(str, Enum):
    SECURITY = "security"
    TRANSACTIONAL = "transactional"
    SERVICE_REMINDER = "service_reminder"
    MARKETING = "marketing"
    ADMIN_ALERT = "admin_alert"


_PURPOSE_VALUES = frozenset(p.value for p in CommunicationPurpose)


@dataclass
class CommunicationResult:
    channel: str
    purpose: str
    provider: str
    mode: str
    status: str
    provider_message_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    retryable: bool = False
    recipient_user_id: int | None = None
    masked_destination: str | None = None
    template_name: str | None = None
    recipient: str | None = field(default=None, repr=False)

    def __post_init__(self):
        if self.mode not in _VALID_MODES:
            raise ValueError(f"Invalid communication mode: {self.mode}")
        if self.status not in _STATUS_VALUES:
            raise ValueError(f"Invalid communication status: {self.status}")
        if self.purpose and self.purpose not in _PURPOSE_VALUES:
            raise ValueError(f"Invalid purpose: {self.purpose}")


def resolve_communication_mode(app=None) -> str:
    from flask import current_app
    cfg = app or current_app
    raw = (cfg.config.get("COMMUNICATION_MODE") or "").strip().lower()
    if raw in _VALID_MODES:
        return raw
    env = cfg.config.get("ENV", "development")
    if env == "production":
        return "live"
    return "mock"


def mask_destination(channel: str, destination: str) -> str:
    if not destination:
        return ""
    if channel == "email":
        local, _, domain = destination.partition("@")
        visible = local[:2] if len(local) > 2 else local[:1]
        return f"{visible}{'*' * max(2, len(local) - len(visible))}@{domain}"
    digits = "".join(ch for ch in destination if ch.isdigit())
    visible = digits[-4:] if len(digits) >= 4 else digits
    return f"*** *** {visible}"


def generate_batch_id() -> str:
    return str(uuid.uuid4())


def record_attempt(
    channel: str,
    purpose: str,
    recipient_user_id: int | None,
    masked_destination: str | None,
    template_name: str | None,
    provider: str,
    mode: str,
    status: str,
    provider_message_id: str | None = None,
    error_code: str | None = None,
    retry_count: int = 0,
    initiated_by: int | None = None,
    batch_id: str | None = None,
    contact_id: int | None = None,
    subject: str | None = None,
    error_message: str | None = None,
    idempotency_key: str | None = None,
):
    from .extensions import db
    from .models import CommunicationAttempt

    now = datetime.now(timezone.utc)
    attempt = CommunicationAttempt(
        contact_id=contact_id,
        channel=channel,
        purpose=purpose,
        recipient_user_id=recipient_user_id,
        masked_destination=masked_destination,
        template_name=template_name,
        provider=provider,
        mode=mode,
        status=status,
        provider_message_id=provider_message_id,
        error_code=error_code,
        error_message=(error_message or "")[:500] or None,
        subject=(subject or "")[:255] or None,
        idempotency_key=idempotency_key,
        retry_count=retry_count,
        initiated_by=initiated_by,
        batch_id=batch_id,
        requested_at=now,
        accepted_at=now if status in ("accepted", "sent") else None,
        failed_at=now if status in ("failed", "rejected") else None,
        delivered_at=None,
    )
    db.session.add(attempt)
    db.session.flush()
    return attempt.id
