"""
SMS service via Arkesel v1 API.

Returns CommunicationResult from .communications instead of bare True/False.
"""

import uuid

import requests
from flask import current_app

from .communications import (
    CommunicationResult,
    mask_destination,
    record_attempt,
    resolve_communication_mode,
)


def normalise_phone(phone: str) -> str | None:
    """Convert a Ghanaian number to the canonical +233XXXXXXXXX format."""
    if not phone:
        return None
    p = phone.strip().replace(" ", "").replace("-", "")
    if p.startswith("+233"):
        p = "233" + p[4:]
    elif p.startswith("00"):
        p = p[2:]
        if p.startswith("233"):
            p = p
        else:
            return None
    elif p.startswith("0") and len(p) == 10:
        p = "233" + p[1:]
    elif not p.startswith("233"):
        return None
    return f"+{p}" if len(p) == 12 and p.isdigit() else None


def send_sms(
    phone: str,
    message: str,
    sender_id: str | None = None,
    *,
    purpose: str = "security",
    recipient_user_id: int | None = None,
    template_name: str | None = None,
) -> CommunicationResult:
    mode = resolve_communication_mode()
    masked_dst = mask_destination("sms", phone)
    normalised = normalise_phone(phone)
    to = normalised.lstrip("+") if normalised else None

    if mode == "disabled":
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "none", mode, "disabled")
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="none", mode=mode,
            status="disabled",
            error_code="mode_disabled",
            error_message="SMS delivery is disabled in this environment.",
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    if mode == "mock":
        mock_id = f"mock-{uuid.uuid4().hex}"
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "mock", mode, "mocked", provider_message_id=mock_id)
        current_app.logger.info("[sms mock] %s -> %s", purpose, masked_dst)
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="mock", mode=mode,
            status="mocked",
            provider_message_id=mock_id,
            error_message="Mock mode — no real SMS was sent.",
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    api_key = current_app.config.get("ARKESEL_API_KEY", "")
    if not api_key:
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "failed", error_code="missing_credentials")
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="arkesel", mode=mode,
            status="failed",
            error_code="missing_credentials",
            error_message="ARKESEL_API_KEY is not configured.",
            retryable=False,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    if not to:
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "failed", error_code="invalid_recipient")
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="arkesel", mode=mode,
            status="failed",
            error_code="invalid_recipient",
            error_message=f"Invalid phone number: {masked_dst}",
            retryable=False,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

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
        if str(data.get("code", "")).lower() == "ok":
            balance = data.get("balance")
            current_app.logger.info("[sms] Accepted by Arkesel for %s (balance=%s)", masked_dst, balance)
            record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "accepted")
            return CommunicationResult(
                channel="sms", purpose=purpose, provider="arkesel", mode=mode,
                status="accepted",
                recipient_user_id=recipient_user_id,
                masked_destination=masked_dst,
                template_name=template_name,
            )
        else:
            err_code = str(data.get("code", "unknown"))
            err_msg = str(data.get("message", data.get("reason", "Arkesel rejected the request")))
            current_app.logger.warning("[sms] Arkesel rejected (to=%s, code=%s): %s", masked_dst, err_code, err_msg)
            record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "rejected", error_code=err_code)
            return CommunicationResult(
                channel="sms", purpose=purpose, provider="arkesel", mode=mode,
                status="rejected",
                error_code=err_code,
                error_message=err_msg,
                retryable=False,
                recipient_user_id=recipient_user_id,
                masked_destination=masked_dst,
                template_name=template_name,
            )
    except requests.Timeout:
        current_app.logger.warning("[sms] Arkesel request timed out for %s", masked_dst)
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "failed", error_code="timeout")
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="arkesel", mode=mode,
            status="failed",
            error_code="timeout",
            error_message="Arkesel request timed out.",
            retryable=True,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )
    except requests.RequestException as exc:
        current_app.logger.warning("[sms] Arkesel request failed for %s: %s", masked_dst, exc)
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "failed", error_code="provider_error")
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="arkesel", mode=mode,
            status="failed",
            error_code="provider_error",
            error_message=str(exc)[:200],
            retryable=True,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )
