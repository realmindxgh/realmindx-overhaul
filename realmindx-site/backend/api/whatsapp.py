import hashlib
import hashlib
import hmac
import re
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from werkzeug.security import check_password_hash

from ..audit import audit
from ..extensions import db
from ..models import ContactChangeToken, User, WhatsAppWebhookEvent
from ..sms_service import normalise_phone


whatsapp_bp = Blueprint("whatsapp_webhooks", __name__)


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


def _mark_wrong_message(challenge, message, now):
    challenge.last_whatsapp_attempt_from = message["from"]
    challenge.last_whatsapp_attempt_at = now
    challenge.last_whatsapp_attempt_status = "wrong_message"
    audit(
        "contact_change_wrong_whatsapp_message",
        "user",
        challenge.user_id,
        {"field": "phone", "message_id": message["message_id"]},
        actor_email="whatsapp:webhook",
    )


def process_whatsapp_webhook_payload(payload):
    now = datetime.now(timezone.utc)
    results = []
    changed = False

    for message in _incoming_text_messages(payload):
        sender = message["from"]
        code = _extract_challenge_code(message["text"])
        result = {
            "message_id": message["message_id"],
            "from": sender,
            "phone_number_id": message.get("phone_number_id"),
            "text_preview": (message.get("text") or "")[:160],
            "status": "ignored",
        }
        if not sender:
            results.append(result)
            continue

        active_challenges = (
            ContactChangeToken.query
            .filter(
                ContactChangeToken.field == "phone",
                ContactChangeToken.delivery_channel == "whatsapp_inbound",
                ContactChangeToken.used_at.is_(None),
            )
            .order_by(ContactChangeToken.created_at.desc())
            .all()
        )
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
            results.append(result)
            continue

        for challenge in active_challenges:
            if not _challenge_is_active(challenge, now):
                continue
            if not check_password_hash(challenge.token_hash, code):
                continue
            if challenge.target_value != sender:
                challenge.last_whatsapp_attempt_from = sender
                challenge.last_whatsapp_attempt_at = now
                challenge.last_whatsapp_attempt_status = "wrong_number"
                audit(
                    "contact_change_wrong_whatsapp_number",
                    "user",
                    challenge.user_id,
                    {"field": "phone", "message_id": message["message_id"]},
                    actor_email="whatsapp:webhook",
                )
                result.update({"status": "wrong_number", "challenge_id": challenge.id})
                changed = True
                break

            user = db.session.get(User, challenge.user_id)
            if not user:
                result["status"] = "user_missing"
                break
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
            result.update({"status": "verified", "user_id": user.id, "challenge_id": challenge.id})
            changed = True
            break
        else:
            if sender_challenge:
                _mark_wrong_message(sender_challenge, message, now)
                result.update({"status": "wrong_message", "challenge_id": sender_challenge.id})
                changed = True
            else:
                result["status"] = "no_matching_challenge"
        results.append(result)

    if changed:
        db.session.commit()
    return results


def _record_whatsapp_webhook_events(results):
    for result in results:
        db.session.add(WhatsAppWebhookEvent(
            message_id=result.get("message_id"),
            sender=result.get("from"),
            phone_number_id=result.get("phone_number_id"),
            text_preview=result.get("text_preview"),
            status=result.get("status") or "unknown",
            challenge_id=result.get("challenge_id"),
            user_id=result.get("user_id"),
        ))


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
