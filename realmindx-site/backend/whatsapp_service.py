"""WhatsApp Cloud API helpers for phone verification."""

from urllib.parse import quote

import requests
from flask import current_app

from .sms_service import normalise_phone


def whatsapp_challenge_phrase(code: str) -> str:
    prefix = (current_app.config.get("WHATSAPP_CHALLENGE_PREFIX") or "RMX VERIFY").strip()
    return f"{prefix} {code}"


def whatsapp_business_number() -> str:
    return normalise_phone(current_app.config.get("WHATSAPP_BUSINESS_PHONE_E164", "")) or "+233257125229"


def whatsapp_challenge_url(phrase: str) -> str:
    business_number = whatsapp_business_number()
    return f"https://wa.me/{business_number.lstrip('+')}?text={quote(phrase)}"


def send_whatsapp_otp(phone: str, code: str) -> bool:
    """Send an OTP with an approved Meta authentication template."""
    access_token = current_app.config.get("WHATSAPP_ACCESS_TOKEN", "")
    phone_number_id = current_app.config.get("WHATSAPP_PHONE_NUMBER_ID", "")
    template_name = current_app.config.get("WHATSAPP_OTP_TEMPLATE_NAME", "realmindx_verification_code")
    language = current_app.config.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE", "en_US")
    graph_version = current_app.config.get("WHATSAPP_GRAPH_API_VERSION", "v23.0")

    if not access_token or not phone_number_id:
        current_app.logger.debug("[whatsapp] Cloud API credentials not set; skipping OTP")
        return False

    normalised = normalise_phone(phone)
    if not normalised:
        current_app.logger.warning("[whatsapp] Invalid OTP destination: %s", phone)
        return False

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": normalised.lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": code}],
                },
                {
                    "type": "button",
                    "sub_type": "url",
                    "index": "0",
                    "parameters": [{"type": "text", "text": code}],
                },
            ],
        },
    }
    url = f"https://graph.facebook.com/{graph_version}/{phone_number_id}/messages"

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        data = response.json()
        if response.ok and data.get("messages"):
            current_app.logger.info("[whatsapp] OTP accepted for %s", normalised)
            return True
        error = data.get("error") or {}
        current_app.logger.warning(
            "[whatsapp] Meta rejected OTP (status=%s, code=%s, type=%s)",
            response.status_code,
            error.get("code"),
            error.get("type"),
        )
    except (requests.RequestException, ValueError) as exc:
        current_app.logger.warning("[whatsapp] OTP delivery failed: %s", exc)
    return False
