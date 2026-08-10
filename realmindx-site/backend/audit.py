"""
Shared audit-logging utility.

Every admin, staff, and user action that changes state should call
    audit(action, entity_type, entity_id, details)
from within a request context.  The actor is read from flask_login's
current_user; for public (unauthenticated) actions pass actor_email
so the log still has a useful identifier.
"""

from flask import g, has_request_context, request
from flask_login import current_user

from .extensions import db
from .models import AuditLog


def _get_ip():
    """Return the proxy-adjusted client IP for the current request."""
    if not has_request_context():
        return ""
    return request.remote_addr or ""


def audit(
    action: str,
    entity_type: str | None = None,
    entity_id=None,
    details: dict | None = None,
    actor_email: str | None = None,
):
    """
    Write one audit record.  Does NOT commit — caller or surrounding request
    handling will commit.  If the session has no open transaction, we flush
    immediately so the record is visible after the enclosing commit.

    Parameters
    ----------
    action       : snake_case verb, e.g. "user_login", "order_placed"
    entity_type  : table / domain name, e.g. "order", "user", "job"
    entity_id    : primary key (any type; coerced to str)
    details      : arbitrary dict of extra context
    actor_email  : fallback identifier when no authenticated user exists
    """
    actor_id = None
    if has_request_context() and getattr(current_user, "is_authenticated", False):
        actor_id = current_user.id
        if not actor_email:
            actor_email = current_user.email

    row = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details={**(details or {}), **({"actor_email": actor_email} if actor_email and not actor_id else {})},
        ip_address=_get_ip(),
    )
    db.session.add(row)
    if has_request_context():
        g.audit_logged = True
