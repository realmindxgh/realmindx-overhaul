from datetime import datetime, timedelta, timezone
import re
import secrets

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf
from werkzeug.security import check_password_hash, generate_password_hash

from ..audit import audit
from ..email_service import OutboundEmail, app_email_shell, send_email
from ..extensions import db, limiter
from ..models import EmailVerificationToken, Role, User, UserProfile
from ..security import make_token, read_token, require_turnstile, seconds
from ..serializers import user_json

auth_bp = Blueprint("auth", __name__)


def _clean_email(email):
    try:
        return validate_email(email or "", check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


def _public_account_requires_verification(user):
    role_name = user.role.name if user.role else ""
    return role_name == "user" and not user.is_verified


def _send_verification_otp(user):
    now = datetime.now(timezone.utc)
    code = f"{secrets.randbelow(1_000_000):06d}"
    EmailVerificationToken.query.filter_by(user_id=user.id, used_at=None).update({"used_at": now})
    db.session.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=generate_password_hash(code),
            expires_at=now + timedelta(minutes=15),
        )
    )
    first_name = user.first_name or "there"
    body = (
        f"<p>Hello {escape(first_name)},</p>"
        "<p>Welcome to RealMindX! We&rsquo;re thrilled to have you join us. "
        "To complete your account setup, use the code below &mdash; it&rsquo;s valid for 15 minutes.</p>"
        '<div style="text-align:center;margin:28px 0;">'
        '<div style="display:inline-block;background:#f5f8fc;border:2px dashed #c8d5e8;'
        'border-radius:12px;padding:18px 36px;">'
        '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;'
        'text-transform:uppercase;color:#6b80a0;">Your verification code</p>'
        f'<p style="margin:0;font-size:38px;font-weight:900;letter-spacing:.22em;color:#0b1d38;">{escape(code)}</p>'
        '</div></div>'
        "<p style='font-size:13px;color:#6b80a0;'>Didn&rsquo;t create a RealMindX account? "
        "You can safely ignore this email &mdash; no action is needed.</p>"
    )
    send_email(OutboundEmail(
        to=user.email,
        subject=f"Your RealMindX verification code: {code}",
        html=app_email_shell(
            "Verify your account",
            body,
            eyebrow="RealMindX — Account Security",
            preheader=f"Your code is {code} — expires in 15 minutes.",
        ),
    ))


@auth_bp.get("/csrf-token")
def csrf_token():
    return jsonify(csrf_token=generate_csrf())


@auth_bp.post("/signup")
@limiter.limit("8/hour")
def signup():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    try:
        email = _clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    password = payload.get("password") or ""
    first_name = (payload.get("first_name") or payload.get("name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    if not payload.get("accepted_terms"):
        return jsonify(error="You must agree to the Terms of Service and Privacy Policy."), 400
    if len(password) < 8:
        return jsonify(error="Password must be at least 8 characters."), 400
    if not first_name:
        return jsonify(error="First name is required."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with this email already exists."), 409

    role = Role.query.filter_by(name="user").first() or Role(name="user", description="Public account")
    db.session.add(role)
    user = User(email=email, first_name=first_name, last_name=last_name, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    _send_verification_otp(user)
    audit("user_signup", "user", user.id, {"email": email})
    db.session.commit()

    return jsonify(
        user=user_json(user),
        requires_verification=True,
        message="Account created. Enter the verification code sent to your email.",
    ), 201


@auth_bp.post("/login")
@limiter.limit("10/minute")
def login():
    payload = request.get_json(silent=True) or {}
    try:
        email = _clean_email(payload.get("email"))
    except ValueError:
        return jsonify(error="Invalid email or password."), 401

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(payload.get("password") or ""):
        if user:
            user.failed_login_count += 1
            db.session.commit()
        return jsonify(error="Invalid email or password."), 401

    if _public_account_requires_verification(user):
        _send_verification_otp(user)
        db.session.commit()
        return jsonify(
            error="Please verify your email before signing in. A fresh code has been sent.",
            requires_verification=True,
            email=user.email,
        ), 403

    user.failed_login_count = 0
    user.last_login_at = datetime.now(timezone.utc)
    audit("user_login", "user", user.id, {"email": user.email, "role": user.role.name if user.role else None})
    db.session.commit()
    login_user(user, remember=bool(payload.get("remember")))
    return jsonify(user=user_json(user))


@auth_bp.post("/logout")
@login_required
def logout():
    actor_id = current_user.id
    actor_email = current_user.email
    audit("user_logout", "user", actor_id, {"email": actor_email})
    db.session.commit()
    logout_user()
    return jsonify(message="Logged out.")


@auth_bp.get("/me")
def me():
    if not current_user.is_authenticated:
        return jsonify(user=None), 200
    return jsonify(user=user_json(current_user))


@auth_bp.post("/verify-email-otp")
@limiter.limit("10/hour")
def verify_email_otp():
    payload = request.get_json(silent=True) or {}
    try:
        email = _clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    otp = re.sub(r"\D", "", str(payload.get("otp") or ""))
    if len(otp) != 6:
        return jsonify(error="Enter the 6 digit verification code."), 400
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(error="Account not found."), 404
    if user.is_verified:
        return jsonify(message="Email is already verified.", user=user_json(user))
    now = datetime.now(timezone.utc)
    token = (
        EmailVerificationToken.query
        .filter_by(user_id=user.id, used_at=None)
        .order_by(EmailVerificationToken.created_at.desc())
        .first()
    )
    if not token:
        return jsonify(error="Verification code expired. Request a fresh code."), 400
    expires_at = token.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < now:
        return jsonify(error="Verification code expired. Request a fresh code."), 400
    if not check_password_hash(token.token_hash, otp):
        return jsonify(error="Verification code is incorrect."), 400
    token.used_at = now
    user.is_verified = True
    db.session.commit()
    return jsonify(message="Email verified. You can now sign in.", user=user_json(user))


@auth_bp.post("/resend-verification-otp")
@limiter.limit("6/hour")
def resend_verification_otp():
    payload = request.get_json(silent=True) or {}
    try:
        email = _clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify(message="If the account exists, a fresh code has been sent.")
    if user.role and user.role.name in {"admin", "staff"}:
        return jsonify(message="Internal admin and staff accounts do not use OTP verification.")
    if user.is_verified:
        return jsonify(message="This email is already verified.")
    _send_verification_otp(user)
    db.session.commit()
    return jsonify(message="A fresh verification code has been sent.")


@auth_bp.post("/verify-email")
def verify_email():
    token = (request.get_json(silent=True) or {}).get("token") or request.args.get("token")
    if not token:
        return jsonify(error="Verification token is required."), 400
    try:
        data = read_token(token, "email-verification", seconds(hours=24))
    except Exception:
        return jsonify(error="Verification token is invalid or expired."), 400
    user = db.session.get(User, data["user_id"])
    if not user:
        return jsonify(error="Account not found."), 404
    user.is_verified = True
    db.session.commit()
    return jsonify(message="Email verified.")


@auth_bp.post("/password-reset/request")
@limiter.limit("5/hour")
def request_password_reset():
    payload = request.get_json(silent=True) or {}
    try:
        email = _clean_email(payload.get("email"))
    except ValueError:
        return jsonify(message="If the email exists, reset instructions have been sent.")
    user = User.query.filter_by(email=email).first()
    if user:
        token = make_token({"user_id": user.id}, "password-reset")
        reset_url = f"{current_app.config['BASE_URL'].rstrip('/')}/reset-password?token={token}"
        first_name = user.first_name or "there"
        send_email(OutboundEmail(
            to=user.email,
            subject="Reset your RealMindX password",
            html=app_email_shell(
                "Password reset request",
                (
                    f"<p>Hello {escape(first_name)},</p>"
                    "<p>We received a request to reset the password for your RealMindX account. "
                    "If this was you, click the button below to create a new password. "
                    "The link is valid for <strong>one hour</strong>.</p>"
                    "<p>If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash; "
                    "your account remains secure and no changes have been made.</p>"
                ),
                "Reset My Password",
                reset_url,
                eyebrow="RealMindX — Account Security",
                preheader="Reset your password — this link expires in one hour.",
            ),
        ))
    return jsonify(message="If the email exists, reset instructions have been sent.")


@auth_bp.post("/password-reset/confirm")
@limiter.limit("6/hour")
def confirm_password_reset():
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    password = payload.get("password") or ""
    if len(password) < 8:
        return jsonify(error="Password must be at least 8 characters."), 400
    try:
        data = read_token(token, "password-reset", seconds(hours=1))
    except Exception:
        return jsonify(error="Password reset token is invalid or expired."), 400
    user = db.session.get(User, data["user_id"])
    if not user:
        return jsonify(error="Account not found."), 404
    user.set_password(password)
    audit("password_reset_confirmed", "user", user.id, {"email": user.email})
    db.session.commit()
    return jsonify(message="Password updated.")
