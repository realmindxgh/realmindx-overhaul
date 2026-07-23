from flask import current_app


def can_use_whatsapp_phone_verification(user):
    """Return True when WhatsApp phone verification is enabled for this user."""
    if not current_app.config.get("WHATSAPP_PHONE_VERIFICATION_ENABLED", False):
        return False

    if current_app.config.get("WHATSAPP_PHONE_VERIFICATION_ALLOW_ALL", False):
        return True

    allowed_emails = {
        email.strip().lower()
        for email in current_app.config.get("WHATSAPP_PHONE_VERIFICATION_TEST_EMAILS", "").split(",")
        if email.strip()
    }
    if allowed_emails and getattr(user, "email", "").lower() in allowed_emails:
        return True

    return not allowed_emails
