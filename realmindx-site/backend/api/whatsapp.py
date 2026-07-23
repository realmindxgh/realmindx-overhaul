import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from werkzeug.security import check_password_hash

from ..audit import audit
from ..extensions import db
from ..models import ContactChangeToken, User, WhatsAppWebhookEvent
from ..sms_service import normalise_phone
from ..whatsapp_service import send_whatsapp_text


whatsapp_bp = Blueprint("whatsapp_webhooks", __name__)


def _support_whatsapp_number():
    return normalise_phone(current_app.config.get("WHATSAPP_SUPPORT_PHONE_E164", "")) or "+233201166122"


def _support_whatsapp_display_number():
    return str(current_app.config.get("WHATSAPP_SUPPORT_PHONE_DISPLAY") or "+233 20 116 6122").strip()


def _success_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "✅ WhatsApp number verified successfully\n\n"
        "The number you entered on RealMindX has now been verified. You may return to the website and continue.\n\n"
        "Please note that this WhatsApp number is used only for automatic verification and is not monitored for messages or support. "
        f"For help, please contact RealMindX on WhatsApp at {support}."
    )


def _failure_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "⚠️ *Verification could not be completed*\n\n"
        "The verification message may be incorrect, expired, or linked to a different phone number. "
        "Please return to RealMindX and start a new verification challenge.\n\n"
        "This WhatsApp number is used only for automatic verification and is not monitored. "
        f"For help, contact RealMindX on WhatsApp at *{support}*."
    )


def _fallback_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "👋 *Thank you for contacting RealMindX Education Ltd.*\n\n"
        "This WhatsApp number is used only for automatic phone-number verification and is not monitored for general messages.\n\n"
        "For enquiries or support, please message our monitored WhatsApp number:\n"
        f"*{support}*"
    )


def _success_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "\u2705 WhatsApp number verified successfully\n\n"
        "The number you entered on RealMindX has now been verified. You may return to the website and continue.\n\n"
        "Please note that this WhatsApp number is used only for automatic verification and is not monitored for messages or support. "
        f"For help, please contact RealMindX on WhatsApp at {support}."
    )


def _failure_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "\u26a0\ufe0f *Verification could not be completed*\n\n"
        "The verification message may be incorrect, expired, or linked to a different phone number. "
        "Please return to RealMindX and start a new verification challenge.\n\n"
        "This WhatsApp number is used only for automatic verification and is not monitored. "
        f"For help, contact RealMindX on WhatsApp at *{support}*."
    )


def _fallback_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "\U0001f44b *Thank you for contacting RealMindX Education Ltd.*\n\n"
        "This WhatsApp number is used only for automatic phone-number verification and is not monitored for general messages.\n\n"
        "For enquiries or support, please message our monitored WhatsApp number:\n"
        f"*{support}*"
    )


def _normalise_whatsapp_sender(value):
    value = str(value or "").strip()
    if value and not value.startswith("+"):
        value = f"+{value}"
    return normalise_phone(value)


def _extract_challenge_code(text):
    body = re.sub(r"\s+", " ", str(text or "")).strip()
    if not body:
        return None
    prefix = re.escape((current_app.config.get("WHATSAPP_CHALLENGE_PREFIX") or "RMX VERIFY").strip())
    match = re.fullmatch(rf"{prefix}\s+(\d{{6}})", body, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    match = re.fullmatch(r"(\d{6})", body)
    return match.group(1) if match else None


def _incoming_text_messages(payload):
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for message in value.get("messages") or []:
                if message.get("type") != "text":
                    continue
                text = (message.get("text") or {}).get("body") or ""
                yield {
                    "from": _normalise_whatsapp_sender(message.get("from")),
                    "text": text,
                    "message_id": message.get("id"),
                    "phone_number_id": (value.get("metadata") or {}).get("phone_number_id"),
                }


def _verify_signature(raw_body):
    app_secret = current_app.config.get("WHATSAPP_APP_SECRET") or current_app.config.get("FACEBOOK_APP_SECRET", "")
    if not app_secret:
        return True
    header = request.headers.get("X-Hub-Signature-256", "")
    if not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header, expected)


def _challenge_is_active(challenge, now):
    expires_at = challenge.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return bool(expires_at and expires_at >= now)


def _recent_whatsapp_challenges(now):
    # Verification codes are valid for minutes, but keeping a one-day lookback lets
    # us give a clear "expired" or "already used" response for recent mistakes
    # without comparing every historical hash on each inbound webhook.
    window_start = now - timedelta(days=1)
    return (
        ContactChangeToken.query
        .filter(
            ContactChangeToken.field == "phone",
            ContactChangeToken.delivery_channel == "whatsapp_inbound",
            ContactChangeToken.created_at >= window_start,
        )
        .order_by(ContactChangeToken.created_at.desc())
        .all()
    )


def _message_was_processed(message_id):
    if not message_id:
        return False
    return bool(WhatsAppWebhookEvent.query.filter_by(message_id=message_id).first())


def _mark_whatsapp_attempt(challenge, message, now, status, audit_action):
    challenge.last_whatsapp_attempt_from = message["from"]
    challenge.last_whatsapp_attempt_at = now
    challenge.last_whatsapp_attempt_status = status
    audit(
        audit_action,
        "user",
        challenge.user_id,
        {"field": "phone", "message_id": message["message_id"]},
        actor_email="whatsapp:webhook",
    )


def _mark_wrong_message(challenge, message, now):
    _mark_whatsapp_attempt(
        challenge,
        message,
        now,
        "wrong_message",
        "contact_change_wrong_whatsapp_message",
    )


def process_whatsapp_webhook_payload(payload):
    now = datetime.now(timezone.utc)
    results = []
    changed = False

    for message in _incoming_text_messages(payload):
        sender = message["from"]
        message_id = message["message_id"]
        code = _extract_challenge_code(message["text"])
        result = {
            "message_id": message_id,
            "from": sender,
            "phone_number_id": message.get("phone_number_id"),
            "text_preview": (message.get("text") or "")[:160],
            "status": "ignored",
            "record_event": True,
            "reply_kind": None,
        }
        if not message_id:
            result["status"] = "missing_message_id"
            results.append(result)
            continue
        if _message_was_processed(message_id):
            result.update({"status": "duplicate", "record_event": False})
            results.append(result)
            continue
        if not sender:
            results.append(result)
            continue

        challenges = _recent_whatsapp_challenges(now)
        active_challenges = [
            challenge for challenge in challenges
            if challenge.used_at is None and _challenge_is_active(challenge, now)
        ]
        sender_challenge = next(
            (
                challenge for challenge in active_challenges
                if challenge.target_value == sender and _challenge_is_active(challenge, now)
            ),
            None,
        )
        if not code:
            if sender_challenge:
                _mark_wrong_message(sender_challenge, message, now)
                result.update({"status": "wrong_message", "challenge_id": sender_challenge.id})
                changed = True
            else:
                result["status"] = "non_verification_text"
            result["reply_kind"] = "fallback"
            results.append(result)
            continue

        matching_challenges = [
            challenge for challenge in challenges
            if check_password_hash(challenge.token_hash, code)
        ]
        active_matches = [
            challenge for challenge in matching_challenges
            if challenge.used_at is None and _challenge_is_active(challenge, now)
        ]
        verified_match = next(
            (challenge for challenge in active_matches if challenge.target_value == sender),
            None,
        )

        if verified_match:
            challenge = verified_match
            user = db.session.get(User, challenge.user_id)
            if not user:
                result["status"] = "user_missing"
                results.append(result)
                continue
            challenge.last_whatsapp_attempt_from = sender
            challenge.last_whatsapp_attempt_at = now
            challenge.last_whatsapp_attempt_status = "verified"
            user.phone = challenge.target_value
            user.phone_verified = True
            ContactChangeToken.query.filter(
                ContactChangeToken.user_id == user.id,
                ContactChangeToken.field == "phone",
                ContactChangeToken.used_at.is_(None),
            ).update({"used_at": now}, synchronize_session=False)
            audit(
                "contact_change_verified",
                "user",
                user.id,
                {"field": "phone", "channel": "whatsapp_inbound", "message_id": message["message_id"]},
                actor_email="whatsapp:webhook",
            )
            result.update({
                "status": "verified",
                "user_id": user.id,
                "challenge_id": challenge.id,
                "reply_kind": "success",
            })
            changed = True
            results.append(result)
            continue

        wrong_number_match = active_matches[0] if active_matches else None
        if wrong_number_match:
            _mark_whatsapp_attempt(
                wrong_number_match,
                message,
                now,
                "wrong_number",
                "contact_change_wrong_whatsapp_number",
            )
            result.update({
                "status": "wrong_number",
                "challenge_id": wrong_number_match.id,
                "user_id": wrong_number_match.user_id,
                "reply_kind": "failure",
            })
            changed = True
            results.append(result)
            continue

        expired_match = next(
            (
                challenge for challenge in matching_challenges
                if challenge.used_at is None and not _challenge_is_active(challenge, now)
            ),
            None,
        )
        if expired_match:
            _mark_whatsapp_attempt(
                expired_match,
                message,
                now,
                "expired",
                "contact_change_expired_whatsapp_message",
            )
            result.update({
                "status": "expired",
                "challenge_id": expired_match.id,
                "user_id": expired_match.user_id,
                "reply_kind": "failure",
            })
            changed = True
            results.append(result)
            continue

        used_match = next(
            (challenge for challenge in matching_challenges if challenge.used_at is not None),
            None,
        )
        if used_match:
            _mark_whatsapp_attempt(
                used_match,
                message,
                now,
                "already_used",
                "contact_change_used_whatsapp_message",
            )
            result.update({
                "status": "already_used",
                "challenge_id": used_match.id,
                "user_id": used_match.user_id,
                "reply_kind": "failure",
            })
            changed = True
            results.append(result)
            continue

        if sender_challenge:
            _mark_wrong_message(sender_challenge, message, now)
            result.update({
                "status": "wrong_message",
                "challenge_id": sender_challenge.id,
                "user_id": sender_challenge.user_id,
                "reply_kind": "failure",
            })
            changed = True
        else:
            result.update({"status": "invalid_code", "reply_kind": "failure"})
        results.append(result)

    if changed:
        db.session.flush()
    return results


def _record_whatsapp_webhook_events(results):
    for result in results:
        if result.get("record_event") is False:
            continue
        message_id = result.get("message_id")
        if message_id and _message_was_processed(message_id):
            continue
        db.session.add(WhatsAppWebhookEvent(
            message_id=message_id,
            sender=result.get("from"),
            phone_number_id=result.get("phone_number_id"),
            text_preview=result.get("text_preview"),
            status=result.get("status") or "unknown",
            challenge_id=result.get("challenge_id"),
            user_id=result.get("user_id"),
        ))


def _reply_text_for_result(result):
    reply_kind = result.get("reply_kind")
    if reply_kind == "success":
        return _success_reply_text()
    if reply_kind == "failure":
        return _failure_reply_text()
    if reply_kind == "fallback":
        return _fallback_reply_text()
    return None


def _send_whatsapp_webhook_replies(results):
    for result in results:
        if result.get("record_event") is False:
            continue
        reply_text = _reply_text_for_result(result)
        if not reply_text or not result.get("from"):
            continue
        result["reply_status"] = "sent" if send_whatsapp_text(result["from"], reply_text) else "failed"


def _can_view_whatsapp_diagnostics():
    role_name = current_user.role.name if current_user.is_authenticated and current_user.role else ""
    return role_name in {"admin", "staff"}


@whatsapp_bp.get("/webhooks/whatsapp")
def verify_whatsapp_webhook():
    verify_token = current_app.config.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge", "")
    if verify_token and mode == "subscribe" and hmac.compare_digest(token or "", verify_token):
        return challenge, 200, {"Content-Type": "text/plain"}
    return "Forbidden", 403


@whatsapp_bp.post("/webhooks/whatsapp")
def receive_whatsapp_webhook():
    raw_body = request.get_data()
    if not _verify_signature(raw_body):
        return jsonify(error="Invalid signature."), 403
    payload = request.get_json(silent=True) or {}
    results = process_whatsapp_webhook_payload(payload)
    if results:
        _record_whatsapp_webhook_events(results)
        db.session.commit()
        _send_whatsapp_webhook_replies(results)
    return jsonify(status="ok", results=results)


@whatsapp_bp.get("/admin/whatsapp-webhook-events")
@login_required
def recent_whatsapp_webhook_events():
    if not _can_view_whatsapp_diagnostics():
        return jsonify(error="You do not have permission to view WhatsApp diagnostics."), 403
    events = (
        WhatsAppWebhookEvent.query
        .order_by(WhatsAppWebhookEvent.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify(events=[
        {
            "id": event.id,
            "created_at": event.created_at.isoformat() if event.created_at else None,
            "message_id": event.message_id,
            "sender": event.sender,
            "phone_number_id": event.phone_number_id,
            "text_preview": event.text_preview,
            "status": event.status,
            "challenge_id": event.challenge_id,
            "user_id": event.user_id,
        }
        for event in events
    ])
