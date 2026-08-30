from datetime import datetime, timedelta, timezone
from hashlib import sha256
import math
import re
import secrets

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request, session
from markupsafe import escape
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf
from werkzeug.security import check_password_hash, generate_password_hash

from sqlalchemy.exc import IntegrityError

from ..audit import audit
from ..contacts import remove_contact_source, upsert_contact_safely
from ..email_service import OutboundEmail, absolute_app_url, app_email_shell, send_email
from ..extensions import db, limiter
from ..models import AccountSecurityCode, AnalyticsEvent, AuditLog, AuthIdentity, BookRequest, BookshopPaymentIntent, CheckoutDetail, CommunicationAttempt, ContactChangeToken, ContactMessage, ContactSource, DeliverySettlementBatch, EmailVerificationToken, Job, JobAlertPreference, NewsletterSubscriber, Order, OrderDelivery, PasswordResetToken, PlatformTermsAcceptance, Role, TermsAcceptance, UploadedFile, User, UserProfile, WhatsAppWebhookEvent
from ..profile_completion import CURRENT_TERMS_VERSION, account_status
from ..security import make_token, read_token, require_turnstile, seconds
from ..serializers import user_json
from ..upload_utils import delete_uploaded_file_physical
from ..sms_service import normalise_phone
from ..teacher_ids import ensure_application_id, generate_application_id

auth_bp = Blueprint("auth", __name__)


def _clean_email(email):
    try:
        return validate_email(email or "", check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


def _public_account_requires_verification(user):
    role_name = user.role.name if user.role else ""
    return role_name == "user" and not user.is_verified


def _privileged_mfa_status(user):
    role_name = user.role.name if user.role else ""
    privileged = role_name in {"admin", "staff"}
    configured_mode = str(current_app.config.get("PRIVILEGED_MFA_MODE") or "off").lower()
    mode = configured_mode if configured_mode in {"off", "prompt"} else "off"
    return {
        "privileged_account": privileged,
        "privileged_mfa_mode": mode if privileged else "optional",
        "mfa_recommended": privileged and mode == "prompt" and not user.two_factor_enabled,
    }


PROVIDER_LABELS = {
    "apple": "Apple",
    "facebook": "Facebook",
    "google": "Google",
    "microsoft": "Microsoft",
}

_SECURITY_EMAIL_STARTED_STATUSES = frozenset({"queued", "accepted", "sent", "delivered"})


def _security_email_started(result):
    status = getattr(result, "status", None)
    if status in _SECURITY_EMAIL_STARTED_STATUSES:
        return True
    return status == "mocked" and current_app.config.get("ENV") != "production"


def _security_email_failure_payload():
    return {
        "error": "We could not send the security email. Please try again shortly.",
        "code": "security_email_delivery_failed",
    }


def _social_login_providers(user):
    if not user:
        return []
    providers = [
        identity.provider
        for identity in AuthIdentity.query.filter_by(user_id=user.id).order_by(AuthIdentity.created_at.asc()).all()
        if identity.provider
    ]
    # Preserve order while avoiding duplicate links.
    return list(dict.fromkeys(providers))


def _social_login_hint_response(user, email, *, reason="social_password_unavailable"):
    providers = _social_login_providers(user)
    if not providers:
        return None
    labels = [PROVIDER_LABELS.get(provider, provider.title()) for provider in providers]
    if len(labels) == 1:
        provider_phrase = labels[0]
    elif len(labels) == 2:
        provider_phrase = f"{labels[0]} or {labels[1]}"
    else:
        provider_phrase = f"{', '.join(labels[:-1])}, or {labels[-1]}"
    if reason == "password_not_set":
        message = (
            f"This RealMindX account is connected with {provider_phrase} and does not have a RealMindX password yet. "
            f"Continue with {provider_phrase}, or request a secure email link to create one."
        )
    else:
        message = (
            f"This RealMindX account is also connected with {provider_phrase}. "
            f"You can continue with {provider_phrase}, or request a secure email link to reset or create a password."
        )
    return jsonify(
        error=message,
        code="social_login_required",
        reason=reason,
        email=email,
        providers=providers,
        provider_labels=labels,
        password_setup_available=True,
    ), 401


def _send_verification_otp(user):
    now = datetime.now(timezone.utc)
    code = f"{secrets.randbelow(1_000_000):06d}"
    EmailVerificationToken.query.filter_by(user_id=user.id, used_at=None).update({"used_at": now})
    token = EmailVerificationToken(
        user_id=user.id,
        token_hash=generate_password_hash(code),
        expires_at=now + timedelta(minutes=15),
    )
    db.session.add(token)
    first_name = user.first_name or "there"
    body = (
        f"<p>Hello {escape(first_name)},</p>"
        "<p>Welcome to RealMindX! We&rsquo;re thrilled to have you join us. "
        "To complete your account setup, use the code below. It is valid for 15 minutes.</p>"
        '<div style="text-align:center;margin:28px 0;">'
        '<div style="display:inline-block;background:#f5f8fc;border:2px dashed #c8d5e8;'
        'border-radius:12px;padding:18px 36px;">'
        '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;'
        'text-transform:uppercase;color:#6b80a0;">Your verification code</p>'
        f'<p style="margin:0;font-size:38px;font-weight:900;letter-spacing:.22em;color:#143670;">{escape(code)}</p>'
        '</div></div>'
        "<p style='font-size:13px;color:#6b80a0;'>Didn&rsquo;t create a RealMindX account? "
        "You can safely ignore this email. No action is needed.</p>"
    )
    result = send_email(
        OutboundEmail(
            to=user.email,
            subject=f"Your RealMindX verification code: {code}",
            html=app_email_shell(
                "Verify your account",
                body,
                eyebrow="RealMindX Account Security",
                preheader=f"Your verification code is {code}. It expires in 15 minutes.",
            ),
        ),
        purpose="security",
        recipient_user_id=user.id,
        template_name="email_verification_otp",
    )
    if not _security_email_started(result):
        token.used_at = now
    return result


@auth_bp.get("/csrf-token")
def csrf_token():
    return jsonify(csrf_token=generate_csrf())


def _send_account_security_code(user, purpose, title):
    now = datetime.now(timezone.utc)
    code = f"{secrets.randbelow(1_000_000):06d}"
    AccountSecurityCode.query.filter_by(
        user_id=user.id,
        purpose=purpose,
        used_at=None,
    ).update({"used_at": now})
    token = AccountSecurityCode(
        user_id=user.id,
        purpose=purpose,
        token_hash=generate_password_hash(code),
        expires_at=now + timedelta(minutes=10),
    )
    db.session.add(token)
    first_name = user.first_name or "there"
    body = (
        f"<p>Hello {escape(first_name)},</p>"
        f"<p>Use the code below to {escape(title.lower())}. It expires in 10 minutes.</p>"
        '<div style="text-align:center;margin:28px 0;">'
        '<div style="display:inline-block;background:#f5f8fc;border:2px dashed #c8d5e8;'
        'border-radius:12px;padding:18px 36px;">'
        '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;'
        'text-transform:uppercase;color:#6b80a0;">Your security code</p>'
        f'<p style="margin:0;font-size:38px;font-weight:900;letter-spacing:.22em;color:#143670;">{escape(code)}</p>'
        "</div></div>"
        "<p style='font-size:13px;color:#6b80a0;'>If you did not request this action, "
        "change your password and contact RealMindX support.</p>"
    )
    result = send_email(
        OutboundEmail(
            to=user.email,
            subject=f"RealMindX security code: {code}",
            html=app_email_shell(title, body, eyebrow="RealMindX Account Security"),
        ),
        purpose="security",
        recipient_user_id=user.id,
        template_name=purpose,
    )
    if not _security_email_started(result):
        token.used_at = now
    return result


def _consume_account_security_code(user_id, purpose, otp):
    now = datetime.now(timezone.utc)
    code = (
        AccountSecurityCode.query
        .filter_by(user_id=user_id, purpose=purpose, used_at=None)
        .order_by(AccountSecurityCode.created_at.desc())
        .first()
    )
    expires_at = code.expires_at if code else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not code or not expires_at or expires_at < now or not check_password_hash(code.token_hash, otp):
        return False
    code.used_at = now
    return True


def _send_teacher_account_created_email(user):
    first_name = user.first_name or "Teacher"
    dashboard_url = absolute_app_url("/portal?view=profile")
    body = (
        f"<p>Dear {escape(first_name)},</p>"
        "<p>Thank you for creating your RealMindX teacher account.</p>"
        f"<p><strong>Application ID:</strong> {escape(user.application_id or 'N/A')}</p>"
        "<p>Please keep this Application ID safe. It is your reference number for your teacher application and all related correspondence with RealMindX.</p>"
        "<p><strong>Next step:</strong> Complete your teaching profile and upload the required documents. Once your profile is complete, you can submit it for review.</p>"
        "<p>If you need to contact RealMindX about your application, please quote your Application ID so we can assist you quickly.</p>"
    )
    try:
        send_email(
            OutboundEmail(
                to=user.email,
                subject="Your RealMindX Teacher Application Has Been Created",
                html=app_email_shell(
                    "Teacher Application Created",
                    body,
                    cta_label="Complete Your Profile",
                    cta_url=dashboard_url,
                    eyebrow="RealMindX Teacher Registration",
                    preheader=f"Your Application ID is {user.application_id or 'N/A'}. Save it for future reference.",
                ),
            ),
            purpose="transactional",
            recipient_user_id=user.id,
            template_name="teacher_account_created",
        )
    except Exception as exc:
        current_app.logger.warning(
            "Teacher account-created email failed for user %s (error=%s)",
            user.id,
            type(exc).__name__,
        )


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
    raw_phone = (payload.get("phone") or "").strip()
    phone = normalise_phone(raw_phone) if raw_phone else None
    if not payload.get("accepted_terms"):
        return jsonify(error="You must agree to the Terms of Service and Privacy Policy."), 400
    if len(password) < 8:
        return jsonify(error="Password must be at least 8 characters."), 400
    if not first_name:
        return jsonify(error="First name is required."), 400
    if raw_phone and not phone:
        return jsonify(error="Enter a valid Ghana phone number."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with this email already exists."), 409

    role = Role.query.filter_by(name="user").first() or Role(name="user", description="Public account")
    db.session.add(role)
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        sex=(payload.get("sex") or "").strip() or None,
        age_range=(payload.get("age_range") or "").strip() or None,
        role=role,
        terms_accepted_at=now,
        terms_version=CURRENT_TERMS_VERSION,
        privacy_version=CURRENT_TERMS_VERSION,
        teacher_service_enabled=str(payload.get("surface") or "teacher").strip().lower() != "bookshop",
        bookshop_service_enabled=str(payload.get("surface") or "teacher").strip().lower() == "bookshop",
    )
    user.set_password(password)
    db.session.add(user)
    for _attempt in range(2):
        try:
            user.application_id = generate_application_id()
            break
        except IntegrityError:
            db.session.rollback()
            if _attempt == 1:
                current_app.logger.exception("Failed to generate application ID after retry")
                return jsonify(error="Could not complete registration. Please try again."), 500
            db.session.add(user)
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Failed to generate application ID")
            return jsonify(error="Could not complete registration. Please try again."), 500
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    if user.teacher_service_enabled:
        upsert_contact_safely(
            user.email,
            full_name=user.full_name,
            phone=user.phone,
            source="teacher",
            source_record_id=user.id,
            metadata={"application_id": user.application_id},
            logger=current_app.logger,
        )
    terms_acceptance = TermsAcceptance(
        user_id=user.id,
        terms_type="platform_terms",
        terms_version=CURRENT_TERMS_VERSION,
        privacy_version=CURRENT_TERMS_VERSION,
        accepted_at=now,
        acceptance_source="registration",
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent", "")[:500],
    )
    db.session.add(terms_acceptance)
    email_result = _send_verification_otp(user)
    audit("user_signup", "user", user.id, {"email": email})
    if not _security_email_started(email_result):
        audit(
            "user_signup_verification_email_failed",
            "user",
            user.id,
            {
                "delivery_status": getattr(email_result, "status", "failed"),
                "error_code": getattr(email_result, "error_code", None),
            },
        )
        db.session.commit()
        return jsonify(
            **_security_email_failure_payload(),
            account_created=True,
            verification_required=True,
        ), 503
    db.session.commit()

    if user.teacher_service_enabled and user.application_id:
        _send_teacher_account_created_email(user)

    return jsonify(
        user=user_json(user),
        requires_verification=True,
        message="Account created. Enter the verification code sent to your email.",
    ), 201


LOGIN_LOCKOUT_THRESHOLD = 5
LOGIN_LOCKOUT_MINUTES = 15


@auth_bp.post("/login")
@limiter.limit("10/minute")
def login():
    payload = request.get_json(silent=True) or {}
    surface = str(payload.get("surface") or "").strip().lower()
    try:
        email = _clean_email(payload.get("email"))
    except ValueError:
        return jsonify(error="Invalid email or password."), 401

    user = User.query.filter_by(email=email).first()

    now = datetime.now(timezone.utc)
    if user and user.locked_until and user.locked_until > now:
        wait_minutes = max(1, math.ceil((user.locked_until - now).total_seconds() / 60))
        audit("user_login_lockout_attempt", "user", user.id, {"email": user.email, "minutes_remaining": wait_minutes})
        db.session.commit()
        return jsonify(
            error=f"Too many failed attempts. Try again in {wait_minutes} minute{'s' if wait_minutes != 1 else ''}.",
        ), 429

    supplied_password = payload.get("password") or ""
    password_matches = bool(user and user.check_password(supplied_password))
    if user and not password_matches:
        if not getattr(user, "password_login_enabled", True):
            hint = _social_login_hint_response(user, email, reason="password_not_set")
            if hint:
                audit(
                    "user_login_social_password_hint",
                    "user",
                    user.id,
                    {"email": user.email, "reason": "password_not_set"},
                    actor_email=email,
                )
                db.session.commit()
                return hint
        hint = _social_login_hint_response(user, email, reason="password_login_failed_social_account")
        if hint:
            audit(
                "user_login_social_password_hint",
                "user",
                user.id,
                {"email": user.email, "reason": "password_login_failed_social_account"},
                actor_email=email,
            )
            db.session.commit()
            return hint

    if not user or not password_matches:
        audit(
            "user_login_failed",
            "user",
            user.id if user else None,
            {"email": email, "reason": "invalid_credentials"},
            actor_email=email,
        )
        if user:
            user.failed_login_count += 1
            if user.failed_login_count >= LOGIN_LOCKOUT_THRESHOLD:
                user.locked_until = now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
                user.failed_login_count = 0
                audit("user_login_locked", "user", user.id, {"email": user.email, "minutes": LOGIN_LOCKOUT_MINUTES})
            db.session.commit()
        return jsonify(error="Invalid email or password."), 401

    if not user.is_active:
        audit("user_login_inactive", "user", user.id, {"email": user.email, "role": user.role.name if user.role else None})
        db.session.commit()
        return jsonify(error="This account is inactive. Contact the administrator."), 403

    if _public_account_requires_verification(user):
        email_result = _send_verification_otp(user)
        if not _security_email_started(email_result):
            audit(
                "user_login_verification_email_failed",
                "user",
                user.id,
                {
                    "delivery_status": getattr(email_result, "status", "failed"),
                    "error_code": getattr(email_result, "error_code", None),
                },
            )
            db.session.commit()
            return jsonify(
                **_security_email_failure_payload(),
                verification_required=True,
                email=user.email,
            ), 503
        db.session.commit()
        return jsonify(
            error="Please verify your email before signing in. A fresh code has been sent.",
            requires_verification=True,
            email=user.email,
        ), 403

    if user.two_factor_enabled:
        email_result = _send_account_security_code(
            user,
            "login_two_factor",
            "Complete your RealMindX sign in",
        )
        if not _security_email_started(email_result):
            session.pop("pending_two_factor_login", None)
            audit(
                "user_login_two_factor_email_failed",
                "user",
                user.id,
                {
                    "delivery_status": getattr(email_result, "status", "failed"),
                    "error_code": getattr(email_result, "error_code", None),
                },
            )
            db.session.commit()
            return jsonify(**_security_email_failure_payload()), 503
        session["pending_two_factor_login"] = {
            "user_id": user.id,
            "remember": bool(payload.get("remember")),
            "surface": surface,
        }
        audit("user_login_two_factor_requested", "user", user.id, {"email": user.email})
        db.session.commit()
        return jsonify(
            requires_two_factor=True,
            email=user.email,
            message="Enter the security code sent to your email.",
        ), 202

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    if user.role and user.role.name == "user":
        if surface == "bookshop":
            user.bookshop_service_enabled = True
        elif surface == "teacher":
            user.teacher_service_enabled = True
        if user.teacher_service_enabled:
            ensure_application_id(user)
            upsert_contact_safely(
                user.email,
                full_name=user.full_name,
                phone=user.phone,
                source="teacher",
                source_record_id=user.id,
                metadata={"application_id": user.application_id},
                activity_at=now,
                logger=current_app.logger,
            )
    audit("user_login", "user", user.id, {"email": user.email, "role": user.role.name if user.role else None})
    db.session.commit()
    remember = bool(payload.get("remember"))
    session.permanent = remember
    login_user(user, remember=remember)
    return jsonify(user=user_json(user))


@auth_bp.post("/login/two-factor")
@limiter.limit("10/hour")
def complete_two_factor_login():
    pending = session.get("pending_two_factor_login") or {}
    user = db.session.get(User, pending.get("user_id")) if pending.get("user_id") else None
    otp = re.sub(r"\D", "", str((request.get_json(silent=True) or {}).get("otp") or ""))
    if not user or len(otp) != 6:
        return jsonify(error="That sign-in challenge is no longer valid. Sign in again."), 400
    if not _consume_account_security_code(user.id, "login_two_factor", otp):
        return jsonify(error="That security code is incorrect or has expired."), 400
    now = datetime.now(timezone.utc)
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    surface = str(pending.get("surface") or "").strip().lower()
    if user.role and user.role.name == "user":
        if surface == "bookshop":
            user.bookshop_service_enabled = True
        elif surface == "teacher":
            user.teacher_service_enabled = True
        if user.teacher_service_enabled:
            ensure_application_id(user)
            upsert_contact_safely(
                user.email,
                full_name=user.full_name,
                phone=user.phone,
                source="teacher",
                source_record_id=user.id,
                metadata={"application_id": user.application_id},
                activity_at=now,
                logger=current_app.logger,
            )
    session.pop("pending_two_factor_login", None)
    audit("user_login_two_factor_completed", "user", user.id, {"email": user.email})
    db.session.commit()
    remember = bool(pending.get("remember"))
    session.permanent = remember
    login_user(user, remember=remember)
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


@auth_bp.post("/change-password")
@login_required
@limiter.limit("6/hour")
def change_password():
    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    if not current_password:
        return jsonify(error="Enter your current password."), 400
    if len(new_password) < 8:
        return jsonify(error="New password must be at least 8 characters."), 400
    if not current_user.check_password(current_password):
        return jsonify(error="Current password is incorrect."), 403
    if current_user.check_password(new_password):
        return jsonify(error="Choose a password you have not already used here."), 400
    current_user.set_password(new_password)
    current_user.must_change_password = False
    audit("password_changed", "user", current_user.id, {"email": current_user.email})
    db.session.commit()
    return jsonify(message="Password updated successfully.")


@auth_bp.get("/security-status")
@login_required
def security_status():
    return jsonify(
        two_factor_enabled=bool(current_user.two_factor_enabled),
        two_factor_method="email",
        email=current_user.email,
        **_privileged_mfa_status(current_user),
    )


@auth_bp.post("/two-factor/request")
@login_required
@limiter.limit("6/hour")
def request_two_factor_change():
    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action") or "").strip().lower()
    current_password = payload.get("current_password") or ""
    if action not in {"enable", "disable"}:
        return jsonify(error="Choose whether to enable or disable two-factor authentication."), 400
    if not current_user.check_password(current_password):
        return jsonify(error="Current password is incorrect."), 403
    if action == "enable" and not current_user.is_verified:
        return jsonify(error="Verify your email address before enabling two-factor authentication."), 400
    if action == "enable" and current_user.two_factor_enabled:
        return jsonify(error="Two-factor authentication is already enabled."), 400
    if action == "disable" and not current_user.two_factor_enabled:
        return jsonify(error="Two-factor authentication is already disabled."), 400
    purpose = f"two_factor_{action}"
    title = f"{action.capitalize()} two-factor authentication"
    email_result = _send_account_security_code(current_user, purpose, title)
    if not _security_email_started(email_result):
        session.pop("pending_two_factor_change", None)
        audit(
            "two_factor_change_email_failed",
            "user",
            current_user.id,
            {
                "action": action,
                "delivery_status": getattr(email_result, "status", "failed"),
                "error_code": getattr(email_result, "error_code", None),
            },
        )
        db.session.commit()
        return jsonify(**_security_email_failure_payload()), 503
    session["pending_two_factor_change"] = {"user_id": current_user.id, "action": action}
    audit("two_factor_change_requested", "user", current_user.id, {"action": action})
    db.session.commit()
    return jsonify(
        message=f"A confirmation code was sent to {current_user.email}.",
        email=current_user.email,
        action=action,
    )


@auth_bp.post("/two-factor/confirm")
@login_required
@limiter.limit("10/hour")
def confirm_two_factor_change():
    payload = request.get_json(silent=True) or {}
    otp = re.sub(r"\D", "", str(payload.get("otp") or ""))
    pending = session.get("pending_two_factor_change") or {}
    action = pending.get("action")
    if pending.get("user_id") != current_user.id or action not in {"enable", "disable"}:
        return jsonify(error="That security request is no longer valid. Start again."), 400
    if len(otp) != 6 or not _consume_account_security_code(current_user.id, f"two_factor_{action}", otp):
        return jsonify(error="That security code is incorrect or has expired."), 400
    current_user.two_factor_enabled = action == "enable"
    session.pop("pending_two_factor_change", None)
    audit("two_factor_changed", "user", current_user.id, {"enabled": current_user.two_factor_enabled})
    db.session.commit()
    return jsonify(
        message=f"Two-factor authentication has been {'enabled' if current_user.two_factor_enabled else 'disabled'}.",
        two_factor_enabled=current_user.two_factor_enabled,
        **_privileged_mfa_status(current_user),
    )


@auth_bp.get("/me/status")
def me_status():
    if not current_user.is_authenticated:
        return jsonify({"account_exists": False, "terms_accepted": False, "requires_terms_acceptance": False}), 200
    return jsonify(account_status(current_user))


@auth_bp.get("/me")
def me():
    if not current_user.is_authenticated:
        return jsonify(user=None), 200
    payload = user_json(current_user)
    payload.update(_privileged_mfa_status(current_user))
    return jsonify(user=payload)


@auth_bp.post("/accept-terms")
@login_required
def accept_terms():
    now = datetime.now(timezone.utc)
    current_user.terms_accepted_at = now
    current_user.terms_version = CURRENT_TERMS_VERSION
    current_user.privacy_version = CURRENT_TERMS_VERSION
    from ..extensions import db
    existing = TermsAcceptance.query.filter_by(
        user_id=current_user.id,
        terms_type="platform_terms",
        terms_version=CURRENT_TERMS_VERSION,
    ).first()
    if not existing:
        acceptance = TermsAcceptance(
            user_id=current_user.id,
            terms_type="platform_terms",
            terms_version=CURRENT_TERMS_VERSION,
            privacy_version=CURRENT_TERMS_VERSION,
            accepted_at=now,
            acceptance_source="user_accept",
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent", "")[:500],
        )
        db.session.add(acceptance)
    db.session.commit()
    return jsonify(message="Terms accepted.", user=user_json(current_user))


@auth_bp.post("/decline-terms")
@login_required
def decline_terms():
    user = current_user
    actor_id = user.id
    actor_email = user.email
    try:
        audit("user_declined_terms", "user", actor_id, {"email": actor_email})

        # -- RETAIN financial/audit records: clear user references --
        BookshopPaymentIntent.query.filter_by(user_id=user.id).update({"user_id": None})
        WhatsAppWebhookEvent.query.filter_by(user_id=user.id).update({"user_id": None})
        AuditLog.query.filter_by(actor_id=user.id).update({"actor_id": None})
        CommunicationAttempt.query.filter_by(recipient_user_id=user.id).update({"recipient_user_id": None})
        CommunicationAttempt.query.filter_by(initiated_by=user.id).update({"initiated_by": None})

        # -- RETAIN orders: clear user reference (never delete a paid order) --
        Order.query.filter_by(user_id=user.id).update({"user_id": None})

        # -- Clear user references in shared/admin/operational records --
        ContactMessage.query.filter_by(assigned_to=user.id).update({"assigned_to": None})
        Job.query.filter_by(created_by_id=user.id).update({"created_by_id": None})
        OrderDelivery.query.filter_by(assigned_by_id=user.id).update({"assigned_by_id": None})
        DeliverySettlementBatch.query.filter_by(settled_by_id=user.id).update({"settled_by_id": None})
        DeliverySettlementBatch.query.filter_by(prepared_by_id=user.id).update({"prepared_by_id": None})
        BookRequest.query.filter_by(resolved_by_id=user.id).update({"resolved_by_id": None})

        # -- Remove account-linked contact sources without deleting independent order history --
        teacher_source = ContactSource.query.filter_by(source="teacher", source_record_id=str(user.id)).first()
        contact = teacher_source.contact if teacher_source else None
        subscription = NewsletterSubscriber.query.filter_by(email=user.email).first()
        if subscription:
            subscription_contact = subscription.contact
            db.session.delete(subscription)
            db.session.flush()
            if subscription_contact:
                remove_contact_source(subscription_contact, "newsletter")
        if contact and db.session.get(type(contact), contact.id):
            remove_contact_source(contact, "teacher")

        # -- DELETE volatile session/token data --
        AnalyticsEvent.query.filter_by(user_id=user.id).delete()
        CheckoutDetail.query.filter_by(user_id=user.id).delete()
        challenge_ids = [row[0] for row in db.session.query(ContactChangeToken.id).filter_by(user_id=user.id).all()]
        if challenge_ids:
            WhatsAppWebhookEvent.query.filter(WhatsAppWebhookEvent.challenge_id.in_(challenge_ids)).update(
                {"challenge_id": None}, synchronize_session=False
            )
        ContactChangeToken.query.filter_by(user_id=user.id).delete()
        EmailVerificationToken.query.filter_by(user_id=user.id).delete()
        AccountSecurityCode.query.filter_by(user_id=user.id).delete()
        PasswordResetToken.query.filter_by(user_id=user.id).delete()
        JobAlertPreference.query.filter_by(user_id=user.id).delete()

        # -- COLLECT file paths before any DB mutation --
        uploaded = UploadedFile.query.filter_by(owner_id=user.id).all()
        file_paths = [(uf.id, uf.storage_path) for uf in uploaded if uf.storage_path]

        # -- DELETE upload DB rows --
        for uf in uploaded:
            db.session.delete(uf)

        # -- DELETE user (cascade removes profile, auth_identities, terms_acceptances, etc.) --
        db.session.delete(user)

        # -- COMMIT transaction first (safe point) --
        db.session.commit()

        # -- DELETE physical files AFTER commit --
        failed = []
        for fid, path in file_paths:
            import os
            if path and os.path.isfile(path):
                try:
                    os.remove(path)
                except OSError:
                    failed.append((fid, path))
                    current_app.logger.warning("Could not remove physical file id=%s path=%s", fid, path)

        if failed:
            current_app.logger.info(
                "User %s deletion: %d file(s) could not be removed. "
                "Paths available for retry cleanup: %s",
                actor_id, len(failed), [p for _, p in failed],
            )

        logout_user()
        return jsonify(message="Account deleted.")
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to delete user %s during decline-terms", actor_id)
        return jsonify(error="Failed to delete account."), 500


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
        return jsonify(error="Email is already verified. Verification codes cannot be reused."), 409
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
    email_result = _send_verification_otp(user)
    if not _security_email_started(email_result):
        audit(
            "user_verification_email_resend_failed",
            "user",
            user.id,
            {
                "delivery_status": getattr(email_result, "status", "failed"),
                "error_code": getattr(email_result, "error_code", None),
            },
        )
        db.session.commit()
        return jsonify(
            **_security_email_failure_payload(),
            verification_required=True,
        ), 503
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
        setup_password = str(payload.get("purpose") or "").strip().lower() == "setup_password"
        password_fingerprint = sha256((user.password_hash or "").encode("utf-8")).hexdigest()
        token = make_token(
            {"user_id": user.id, "password_fingerprint": password_fingerprint},
            "password-reset",
        )
        reset_base_url = (
            current_app.config.get("BOOKSHOP_URL")
            if str(payload.get("surface") or "").strip().lower() == "bookshop"
            else current_app.config.get("BASE_URL")
        )
        reset_url = f"{reset_base_url.rstrip('/')}/reset-password?token={token}"
        first_name = user.first_name or "there"
        send_email(
            OutboundEmail(
                to=user.email,
                subject="Create your RealMindX password" if setup_password else "Reset your RealMindX password",
                html=app_email_shell(
                    "Create your password" if setup_password else "Password reset request",
                    (
                        f"<p>Hello {escape(first_name)},</p>"
                        f"<p>We received a request to {'create' if setup_password else 'reset'} the password for your RealMindX account. "
                        "If this was you, click the button below to set a secure password. "
                        "The link is valid for <strong>one hour</strong>.</p>"
                        f"<p>If you did not request this password {'creation' if setup_password else 'reset'}, you can safely ignore this email. "
                        "Your account remains secure and no changes have been made.</p>"
                    ),
                    "Create My Password" if setup_password else "Reset My Password",
                    reset_url,
                    eyebrow="RealMindX Account Security",
                    preheader="Create your password. This link expires in one hour." if setup_password else "Reset your password. This link expires in one hour.",
                ),
            ),
            purpose="security",
            recipient_user_id=user.id,
            template_name="password_setup" if setup_password else "password_reset",
        )
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
    expected_fingerprint = sha256((user.password_hash or "").encode("utf-8")).hexdigest()
    if data.get("password_fingerprint") != expected_fingerprint:
        return jsonify(error="This password reset link has already been used or is no longer valid."), 400
    user.set_password(password)
    user.must_change_password = False
    audit("password_reset_confirmed", "user", user.id, {"email": user.email})
    db.session.commit()
    return jsonify(message="Password updated.")
