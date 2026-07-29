"""WhatsApp Cloud API helpers for phone verification.

Limited changes in this phase — only the result contract, attempt recording,
and safe logging. Webhook behaviour, templates, and verification matching
are unchanged until the separate WhatsApp audit is complete.
"""

import uuid
from urllib.parse import quote

import requests
from flask import current_app

from .communications import (
    CommunicationResult,
    mask_destination,
    record_attempt,
    resolve_communication_mode,
)
from .sms_service import normalise_phone

WHATSAPP_VERIFICATION_PHRASE = "Verify my RealMindX number"


def whatsapp_challenge_phrase(code: str | None = None) -> str:
    return (current_app.config.get("WHATSAPP_CHALLENGE_MESSAGE") or WHATSAPP_VERIFICATION_PHRASE).strip() or WHATSAPP_VERIFICATION_PHRASE


def whatsapp_business_number() -> str:
    return normalise_phone(current_app.config.get("WHATSAPP_BUSINESS_PHONE_E164", "")) or "+233257125229"


def whatsapp_challenge_url(phrase: str) -> str:
    business_number = whatsapp_business_number()
    return f"https://wa.me/{business_number.lstrip('+')}?text={quote(phrase)}"


def _mask_phone(phone: str) -> str:
    return mask_destination("sms", phone)


def _whatsapp_send(
    phone: str,
    body: str,
    template: dict | None,
    purpose: str,
    recipient_user_id: int | None,
    template_name: str | None,
) -> CommunicationResult:
    mode = resolve_communication_mode()
    masked_dst = _mask_phone(phone)
    access_token = current_app.config.get("WHATSAPP_ACCESS_TOKEN", "")
    phone_number_id = current_app.config.get("WHATSAPP_PHONE_NUMBER_ID", "")

    if mode == "disabled":
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "none", mode, "disabled")
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="none", mode=mode,
            status="disabled",
            error_code="mode_disabled",
            error_message="WhatsApp delivery is disabled in this environment.",
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    if mode == "mock":
        mock_id = f"mock-{uuid.uuid4().hex}"
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "mock", mode, "mocked", provider_message_id=mock_id)
        current_app.logger.info("[whatsapp mock] %s -> %s", purpose, masked_dst)
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="mock", mode=mode,
            status="mocked",
            provider_message_id=mock_id,
            error_message="Mock mode — no real WhatsApp message was sent.",
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    if not access_token or not phone_number_id:
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "meta", mode, "failed", error_code="missing_credentials")
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="meta", mode=mode,
            status="failed",
            error_code="missing_credentials",
            error_message="WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set.",
            retryable=False,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    normalised = normalise_phone(phone)
    if not normalised:
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "meta", mode, "failed", error_code="invalid_recipient")
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="meta", mode=mode,
            status="failed",
            error_code="invalid_recipient",
            error_message=f"Invalid WhatsApp destination: {masked_dst}",
            retryable=False,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    graph_version = current_app.config.get("WHATSAPP_GRAPH_API_VERSION", "v23.0")
    url = f"https://graph.facebook.com/{graph_version}/{phone_number_id}/messages"

    if template is not None:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": normalised.lstrip("+"),
            "type": "template",
            "template": template,
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": normalised.lstrip("+"),
            "type": "text",
            "text": {
                "preview_url": False,
                "body": str(body or "").strip(),
            },
        }

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
            msg_id = data["messages"][0].get("id")
            record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "meta", mode, "accepted", provider_message_id=msg_id)
            current_app.logger.info("[whatsapp] %s accepted for %s (id=%s)", purpose, masked_dst, msg_id)
            return CommunicationResult(
                channel="whatsapp", purpose=purpose, provider="meta", mode=mode,
                status="accepted",
                provider_message_id=msg_id,
                recipient_user_id=recipient_user_id,
                masked_destination=masked_dst,
                template_name=template_name,
            )
        error = data.get("error") or {}
        error_code = str(error.get("code", "unknown"))
        error_msg = error.get("message", str(data.get("error", "Meta rejected the request")))[:200]
        current_app.logger.warning(
            "[whatsapp] Meta rejected (to=%s, code=%s, type=%s)",
            masked_dst, error_code, error.get("type", "?"),
        )
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "meta", mode, "rejected", error_code=error_code)
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="meta", mode=mode,
            status="rejected",
            error_code=error_code,
            error_message=error_msg,
            retryable=False,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )
    except requests.Timeout:
        current_app.logger.warning("[whatsapp] Meta request timed out for %s", masked_dst)
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "meta", mode, "failed", error_code="timeout")
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="meta", mode=mode,
            status="failed",
            error_code="timeout",
            error_message="WhatsApp API request timed out.",
            retryable=True,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )
    except requests.RequestException as exc:
        current_app.logger.warning("[whatsapp] Meta request failed for %s: %s", masked_dst, exc)
        record_attempt("whatsapp", purpose, recipient_user_id, masked_dst, template_name, "meta", mode, "failed", error_code="provider_error")
        return CommunicationResult(
            channel="whatsapp", purpose=purpose, provider="meta", mode=mode,
            status="failed",
            error_code="provider_error",
            error_message=str(exc)[:200],
            retryable=True,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )


def send_whatsapp_text(
    phone: str,
    body: str,
    *,
    purpose: str = "transactional",
    recipient_user_id: int | None = None,
    template_name: str | None = None,
) -> CommunicationResult:
    """Send a plain WhatsApp text message through the Cloud API."""
    return _whatsapp_send(
        phone=phone, body=body, template=None,
        purpose=purpose, recipient_user_id=recipient_user_id,
        template_name=template_name or "plain_text",
    )


def send_whatsapp_otp(
    phone: str,
    code: str,
    *,
    purpose: str = "security",
    recipient_user_id: int | None = None,
    template_name: str | None = None,
) -> CommunicationResult:
    """Send an OTP with an approved Meta authentication template."""
    tpl_name = template_name or current_app.config.get("WHATSAPP_OTP_TEMPLATE_NAME", "realmindx_verification_code")
    language = current_app.config.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE", "en_US")
    template = {
        "name": tpl_name,
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
    }
    return _whatsapp_send(
        phone=phone, body="", template=template,
        purpose=purpose, recipient_user_id=recipient_user_id,
        template_name=tpl_name,
    )
