import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from ..audit import audit
from ..extensions import db
from ..models import ContactChangeToken, User, WhatsAppWebhookEvent
from ..sms_service import normalise_phone
from ..whatsapp_service import WHATSAPP_VERIFICATION_PHRASE, send_whatsapp_text


whatsapp_bp = Blueprint("whatsapp_webhooks", __name__)

RECENTLY_VERIFIED_WINDOW = timedelta(minutes=15)
AUTO_REPLY_COOLDOWN = timedelta(minutes=15)
EXPIRED_CHALLENGE_LOOKBACK = timedelta(days=1)


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


def _already_verified_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "✅ Your WhatsApp number has already been verified successfully.\n\n"
        "You may return to RealMindX and continue.\n\n"
        f"For help, message our monitored WhatsApp number at {support}."
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


def _no_active_request_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "We could not find an active RealMindX verification request for this number.\n\n"
        "Please start verification from your RealMindX account and try again.\n\n"
        f"For help, message our monitored WhatsApp number at {support}."
    )


def _fallback_reply_text():
    support = _support_whatsapp_display_number()
    return (
        "👋 *Thank you for contacting RealMindX Education Ltd.*\n\n"
        "This WhatsApp number is used only for automatic phone-number verification and is not monitored for general messages.\n\n"
        "For enquiries or support, please message our monitored WhatsApp number:\n"
        f"*{support}*"
    )


def _normalise_whatsapp_sender(value):
    value = str(value or "").strip()
    if value and not value.startswith("+"):
        value = f"+{value}"
    return normalise_phone(value)


def _as_aware(value):
    if value and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _is_verification_phrase(text):
    raw = str(text or "").strip()
    if not raw:
        return False
    if raw.casefold() == WHATSAPP_VERIFICATION_PHRASE.casefold():
        return True
    prefix = current_app.config.get("WHATSAPP_CHALLENGE_PREFIX", "").strip()
    if prefix:
        prefix_lower = prefix.casefold()
        raw_lower = raw.casefold()
        if raw_lower == prefix_lower:
            return True
        if raw_lower.startswith(prefix_lower) and raw[len(prefix):].strip().lstrip("0123456789").strip() == "":
            return True
    return False


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
    app_secret = current_app.config.get("WHATSAPP_APP_SECRET") or ""
    if not app_secret:
        current_app.logger.error("[whatsapp] WHATSAPP_APP_SECRET is not configured — refusing webhook")
        return False
    header = request.headers.get("X-Hub-Signature-256", "")
    if not header.startswith("sha256="):
        current_app.logger.warning("[whatsapp] Missing or malformed X-Hub-Signature-256 header")
        return False
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    match = hmac.compare_digest(header, expected)
    if not match:
        current_app.logger.warning("[whatsapp] Signature mismatch")
    return match


def _message_was_processed(message_id):
    if not message_id:
        return False
    return bool(WhatsAppWebhookEvent.query.filter_by(message_id=message_id).first())


def _active_pending_challenge_for_sender(sender, now):
    return (
        ContactChangeToken.query
        .filter(
            ContactChangeToken.field == "phone",
            ContactChangeToken.delivery_channel == "whatsapp_inbound",
            ContactChangeToken.target_value == sender,
            ContactChangeToken.status == "pending",
            ContactChangeToken.used_at.is_(None),
            ContactChangeToken.expires_at >= now,
        )
        .order_by(ContactChangeToken.created_at.desc())
        .with_for_update()
        .first()
    )


def _expired_pending_challenge_for_sender(sender, now):
    return (
        ContactChangeToken.query
        .filter(
            ContactChangeToken.field == "phone",
            ContactChangeToken.delivery_channel == "whatsapp_inbound",
            ContactChangeToken.target_value == sender,
            ContactChangeToken.status.in_(("pending", "expired")),
            ContactChangeToken.used_at.is_(None),
            ContactChangeToken.expires_at < now,
            ContactChangeToken.created_at >= now - EXPIRED_CHALLENGE_LOOKBACK,
        )
        .order_by(ContactChangeToken.created_at.desc())
        .first()
    )


def _recently_verified_user_for_sender(sender, now):
    cutoff = now - RECENTLY_VERIFIED_WINDOW
    return (
        User.query
        .filter(
            User.phone == sender,
            User.phone_verified.is_(True),
            User.phone_verified_at.isnot(None),
            User.phone_verified_at >= cutoff,
        )
        .order_by(User.phone_verified_at.desc())
        .first()
    )


def _has_recent_event(sender, statuses, since):
    if not sender:
        return False
    return bool(
        WhatsAppWebhookEvent.query
        .filter(
            WhatsAppWebhookEvent.sender == sender,
            WhatsAppWebhookEvent.status.in_(tuple(statuses)),
            WhatsAppWebhookEvent.created_at >= since,
        )
        .first()
    )


def _result_for_message(message):
    return {
        "message_id": message["message_id"],
        "from": message["from"],
        "phone_number_id": message.get("phone_number_id"),
        "text_preview": (message.get("text") or "")[:160],
        "status": "ignored",
        "record_event": True,
        "reply_kind": None,
    }


def _complete_whatsapp_challenge(challenge, message, now, result):
    user = db.session.get(User, challenge.user_id)
    if not user:
        result["status"] = "user_missing"
        return False
    if challenge.target_value != message["from"] or challenge.status != "pending" or challenge.used_at:
        result["status"] = "verification_race_lost"
        return False

    challenge.last_whatsapp_attempt_from = message["from"]
    challenge.last_whatsapp_attempt_at = now
    challenge.last_whatsapp_attempt_status = "verified"
    challenge.status = "verified"
    challenge.verified_at = now
    challenge.used_at = now
    challenge.active_lock_key = None
    user.phone = challenge.target_value
    user.phone_verified = True
    user.phone_verified_at = now

    ContactChangeToken.query.filter(
        ContactChangeToken.user_id == user.id,
        ContactChangeToken.field == "phone",
        ContactChangeToken.id != challenge.id,
        ContactChangeToken.status == "pending",
        ContactChangeToken.used_at.is_(None),
    ).update({"used_at": now, "status": "cancelled", "active_lock_key": None}, synchronize_session=False)

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
    return True


def _mark_expired_challenge(challenge, message, now, result):
    challenge.last_whatsapp_attempt_from = message["from"]
    challenge.last_whatsapp_attempt_at = now
    challenge.last_whatsapp_attempt_status = "expired"
    challenge.status = "expired"
    challenge.active_lock_key = None
    audit(
        "contact_change_expired_whatsapp_message",
        "user",
        challenge.user_id,
        {"field": "phone", "message_id": message["message_id"]},
        actor_email="whatsapp:webhook",
    )
    result.update({
        "status": "verification_failed",
        "failure_reason": "expired",
        "challenge_id": challenge.id,
        "user_id": challenge.user_id,
    })
    if not _has_recent_event(message["from"], {"verification_failed"}, now - AUTO_REPLY_COOLDOWN):
        result["reply_kind"] = "failure"
    else:
        result["status"] = "verification_failed_suppressed"
    return True


def _mark_recently_verified(message, now, user, result):
    verified_at = _as_aware(user.phone_verified_at) or now
    result.update({
        "status": "already_verified_recent",
        "user_id": user.id,
    })
    if _has_recent_event(message["from"], {"already_verified_recent"}, verified_at):
        result.update({"status": "already_verified_recent_suppressed", "reply_kind": None})
        return False
    result["reply_kind"] = "already_verified"
    return False


def _mark_fallback(message, now, result):
    if _has_recent_event(message["from"], {"fallback_redirect"}, now - AUTO_REPLY_COOLDOWN):
        result.update({"status": "fallback_redirect_suppressed", "reply_kind": None})
        return False
    result.update({"status": "fallback_redirect", "reply_kind": "fallback"})
    return False


def _mark_no_active_request(message, now, result):
    if _has_recent_event(message["from"], {"verification_no_active_request"}, now - AUTO_REPLY_COOLDOWN):
        result.update({"status": "verification_no_active_request_suppressed", "reply_kind": None})
        return False
    result.update({"status": "verification_no_active_request", "reply_kind": "no_active_request"})
    return False


def process_whatsapp_webhook_payload(payload):
    now = datetime.now(timezone.utc)
    results = []
    changed = False

    for message in _incoming_text_messages(payload):
        sender = message["from"]
        message_id = message["message_id"]
        result = _result_for_message(message)

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

        if _is_verification_phrase(message.get("text")):
            active_challenge = _active_pending_challenge_for_sender(sender, now)
            if active_challenge:
                changed = _complete_whatsapp_challenge(active_challenge, message, now, result) or changed
                results.append(result)
                continue

            recent_user = _recently_verified_user_for_sender(sender, now)
            if recent_user:
                _mark_recently_verified(message, now, recent_user, result)
                results.append(result)
                continue

            expired_challenge = _expired_pending_challenge_for_sender(sender, now)
            if expired_challenge:
                changed = _mark_expired_challenge(expired_challenge, message, now, result) or changed
                results.append(result)
                continue

            _mark_no_active_request(message, now, result)
            results.append(result)
            continue

        _mark_fallback(message, now, result)
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
    if reply_kind == "already_verified":
        return _already_verified_reply_text()
    if reply_kind == "failure":
        return _failure_reply_text()
    if reply_kind == "no_active_request":
        return _no_active_request_reply_text()
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
        wam_result = send_whatsapp_text(
            result["from"],
            reply_text,
            purpose="transactional",
            recipient_user_id=result.get("user_id"),
            template_name="whatsapp_verification_reply",
        )
        if wam_result.status == "mocked":
            result["reply_status"] = "mocked"
        else:
            result["reply_status"] = (
                "sent"
                if wam_result.status in ("queued", "accepted", "sent", "delivered")
                else "failed"
            )


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
