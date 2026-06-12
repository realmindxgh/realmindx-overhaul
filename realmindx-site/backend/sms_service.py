"""
SMS service via Arkesel v1 API.

To activate:
    Add to realmindx-site/.env:
        ARKESEL_API_KEY=***REMOVED-ARKESEL-API-KEY***
        ARKESEL_SENDER_ID=RealMindX

Completely silent when key is not set — emails are never affected.
"""

import requests
from flask import current_app


def normalise_phone(phone: str) -> str | None:
    """Convert a Ghanaian number to the canonical +233XXXXXXXXX format."""
    if not phone:
        return None
    p = phone.strip().replace(" ", "").replace("-", "")
    if p.startswith("+233"):
        p = "233" + p[4:]
    elif p.startswith("0") and len(p) == 10:
        p = "233" + p[1:]
    elif not p.startswith("233"):
        p = "233" + p  # best-effort for numbers without country code
    return f"+{p}" if len(p) == 12 and p.isdigit() else None


def send_sms(phone: str, message: str, sender_id: str | None = None) -> bool:
    """
    Send a single SMS via Arkesel v1 GET API.
    Returns True if sent, False if skipped or failed. Never raises.
    """
    api_key = current_app.config.get("ARKESEL_API_KEY", "")
    if not api_key:
        current_app.logger.debug("[sms] ARKESEL_API_KEY not set — skipping SMS to %s", phone)
        return False

    normalised = normalise_phone(phone)
    to = normalised.lstrip("+") if normalised else None
    if not to:
        current_app.logger.warning("[sms] Invalid phone number: %s", phone)
        return False

    sender = sender_id or current_app.config.get("ARKESEL_SENDER_ID", "RealMindX")

    try:
        response = requests.get(
            "https://sms.arkesel.com/sms/api",
            params={
                "action": "send-sms",
                "api_key": api_key,
                "to": to,
                "from": sender,
                "sms": message,
            },
            timeout=10,
        )
        data = response.json()
        # Arkesel v1 returns {"code": "ok", ...} on success
        if str(data.get("code", "")).lower() == "ok":
            current_app.logger.info("[sms] Sent to %s via Arkesel", to)
            return True
        else:
            current_app.logger.warning("[sms] Arkesel rejected (to=%s): %s", to, data)
            return False
    except Exception as exc:
        current_app.logger.warning("[sms] Failed to send SMS to %s: %s", to, exc)
        return False
