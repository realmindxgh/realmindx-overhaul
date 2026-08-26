"""
SMS service via Arkesel v1 API.

Returns CommunicationResult from .communications instead of bare True/False.
"""

import uuid
from math import ceil

import requests
from flask import current_app

from .communications import (
    CommunicationResult,
    mask_destination,
    record_attempt,
    resolve_communication_mode,
)


GSM_7_BASIC_CHARACTERS = frozenset(
    "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5"
    "\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e"
    "\u001b\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./"
    "0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0"
)
GSM_7_EXTENSION_CHARACTERS = frozenset("^{}\\[~]|\u20ac")


def sms_character_metrics(message: str) -> dict:
    """Return the encoding and billable segment usage for an SMS message."""
    text = message or ""
    gsm_7 = all(char in GSM_7_BASIC_CHARACTERS or char in GSM_7_EXTENSION_CHARACTERS for char in text)
    if gsm_7:
        units = sum(2 if char in GSM_7_EXTENSION_CHARACTERS else 1 for char in text)
        single_limit, multipart_limit = 160, 153
        encoding = "GSM-7"
    else:
        # UCS-2 billing is based on UTF-16 code units; astral characters such
        # as emoji consume a surrogate pair (two units).
        units = len(text.encode("utf-16-be")) // 2
        single_limit, multipart_limit = 70, 67
        encoding = "Unicode"

    if not units:
        segments = 0
        limit = single_limit
        remaining = single_limit
    elif units <= single_limit:
        segments = 1
        limit = single_limit
        remaining = single_limit - units
    else:
        segments = ceil(units / multipart_limit)
        limit = multipart_limit
        remaining = (segments * multipart_limit) - units

    return {
        "characters": len(text),
        "units": units,
        "encoding": encoding,
        "segments": segments,
        "segment_limit": limit,
        "remaining_in_segment": remaining,
    }


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
            timeout=current_app.config.get("SMS_SEND_TIMEOUT", 5),
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
            current_app.logger.warning("[sms] Arkesel rejected (to=%s, code=%s)", masked_dst, err_code)
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
        current_app.logger.warning(
            "[sms] Arkesel request failed for %s (error=%s)",
            masked_dst,
            type(exc).__name__,
        )
        record_attempt("sms", purpose, recipient_user_id, masked_dst, template_name, "arkesel", mode, "failed", error_code="provider_error")
        return CommunicationResult(
            channel="sms", purpose=purpose, provider="arkesel", mode=mode,
            status="failed",
            error_code="provider_error",
            error_message="Arkesel request failed.",
            retryable=True,
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )
