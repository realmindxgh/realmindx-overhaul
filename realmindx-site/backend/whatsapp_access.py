from flask import current_app


def can_use_whatsapp_phone_verification(user):
    """Return True when WhatsApp phone verification is enabled for this user."""
    if not current_app.config.get("WHATSAPP_PHONE_VERIFICATION_ENABLED", False):
        return False
    return True
