from datetime import timedelta
from functools import wraps
import secrets

import requests
from flask import abort, current_app, jsonify, request
from flask_login import current_user
from itsdangerous import URLSafeTimedSerializer



def generate_temporary_password():
    """Return a unique, high-entropy password suitable for one-time delivery."""
    return secrets.token_urlsafe(18)


def _require_password_rotation():
    if getattr(current_user, "must_change_password", False):
        response = jsonify(
            error="Change your temporary password before continuing.",
            code="password_change_required",
        )
        response.status_code = 428
        abort(response)


def serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def make_token(payload, salt):
    return serializer().dumps(payload, salt=salt)


def read_token(token, salt, max_age_seconds):
    return serializer().loads(token, salt=salt, max_age=max_age_seconds)


def permission_required(permission_key):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not current_user.is_authenticated:
                abort(401)
            _require_password_rotation()
            role_name = current_user.role.name if current_user.role else ""
            if role_name == "admin":
                return view(*args, **kwargs)
            if not current_user.has_permission(permission_key):
                abort(403)
            return view(*args, **kwargs)

        return wrapped

    return decorator


def admin_or_staff_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            abort(401)
        _require_password_rotation()
        role_name = current_user.role.name if current_user.role else ""
        if role_name not in {"admin", "staff"}:
            abort(403)
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            abort(401)
        _require_password_rotation()
        if not current_user.role or current_user.role.name != "admin":
            abort(403)
        return view(*args, **kwargs)

    return wrapped


def seconds(hours=0, minutes=0):
    return int(timedelta(hours=hours, minutes=minutes).total_seconds())


def verify_turnstile_token(token):
    secret = current_app.config.get("TURNSTILE_SECRET_KEY")
    if not secret:
        return True
    if not token:
        return False
    try:
        response = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": secret,
                "response": token,
                "remoteip": request.remote_addr,
            },
            timeout=8,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        current_app.logger.warning("Turnstile verification request failed: %s", exc)
        return False
    return bool(response.json().get("success"))


def require_turnstile(payload):
    payload = payload or {}
    token = (
        payload.get("turnstile_token")
        or payload.get("cf-turnstile-response")
        or payload.get("cf_turnstile_response")
    )
    if not verify_turnstile_token(token):
        from flask import jsonify as _jsonify
        response = _jsonify(error="CAPTCHA verification failed. Please refresh the page and try again.")
        response.status_code = 400
        abort(response)
