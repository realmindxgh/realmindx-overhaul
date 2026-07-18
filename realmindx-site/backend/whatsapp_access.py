from flask import current_app


def _configured_test_emails():
    raw = current_app.config.get("WHATSAPP_PHONE_VERIFICATION_TEST_EMAILS", "") or ""
    return {
        email.strip().lower()
        for email in str(raw).replace(";", ",").split(",")
        if email.strip()
    }


def can_use_whatsapp_phone_verification(user):
    """Return True when WhatsApp phone verification is enabled for this user."""
    if not current_app.config.get("WHATSAPP_PHONE_VERIFICATION_ENABLED", False):
        return False
    if current_app.config.get("WHATSAPP_PHONE_VERIFICATION_ALLOW_ALL", False):
        return True
    email = (getattr(user, "email", "") or "").strip().lower()
    return bool(email and email in _configured_test_emails())
