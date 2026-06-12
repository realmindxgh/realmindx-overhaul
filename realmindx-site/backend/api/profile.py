from datetime import datetime, timedelta, timezone
import re
import secrets

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from markupsafe import escape
from werkzeug.security import check_password_hash, generate_password_hash

from ..audit import audit
from ..email_service import OutboundEmail, app_email_shell, send_email
from ..extensions import db, limiter
from ..location_data import canonical_delivery_locations, joined_location_ids, joined_location_names
from ..models import ContactChangeToken, JobAlertPreference, UploadedFile, User, UserProfile
from ..serializers import user_json
from ..sms_service import normalise_phone, send_sms
from ..upload_utils import save_upload

profile_bp = Blueprint("profile", __name__)


def _upload_url(uploaded_file):
    if not uploaded_file:
        return None
    return f"/uploads/{uploaded_file.visibility}/{uploaded_file.category}/{uploaded_file.stored_filename}"


def profile_json(profile):
    picture = db.session.get(UploadedFile, profile.profile_picture_file_id) if profile.profile_picture_file_id else None
    cv = db.session.get(UploadedFile, profile.cv_file_id) if profile.cv_file_id else None
    certificate = db.session.get(UploadedFile, profile.certificate_file_id) if profile.certificate_file_id else None
    return {
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "phone_verified": current_user.phone_verified,
        "is_verified": current_user.is_verified,
        "location": profile.location,
        "teaching_subject": profile.teaching_subject,
        "preferred_level": profile.preferred_level,
        "preferred_employment_type": profile.preferred_employment_type,
        "available_from": profile.available_from,
        "curriculum_experience": profile.curriculum_experience,
        "preferred_locations": profile.preferred_locations,
        "preferred_location_ids": profile.preferred_location_ids,
        "bio": profile.bio,
        "profile_picture_file_id": profile.profile_picture_file_id,
        "profile_picture_url": _upload_url(picture),
        "cv_file_id": profile.cv_file_id,
        "cv_url": _upload_url(cv),
        "cv_filename": cv.original_filename if cv else None,
        "certificate_file_id": profile.certificate_file_id,
        "certificate_url": _upload_url(certificate),
        "certificate_filename": certificate.original_filename if certificate else None,
        "next_of_kin_name": profile.next_of_kin_name,
        "next_of_kin_phone": profile.next_of_kin_phone,
        "next_of_kin_relationship": profile.next_of_kin_relationship,
        "next_of_kin_email": profile.next_of_kin_email,
        "years_of_experience": profile.years_of_experience,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
    }


def _sync_profile_to_alert_preference(profile):
    """Bridge UserProfile → JobAlertPreference on first profile save.

    dispatch_job_alerts() in admin.py queries JobAlertPreference, NOT
    UserProfile.  Without this bridge, a user who sets their teaching subject
    and location in their profile never receives any job alerts, because no
    JobAlertPreference row exists for them.

    We only INSERT — never UPDATE — so a user who has already manually
    customised their alert preference keeps their customisation.
    """
    values = (
        profile.teaching_subject,
        profile.preferred_locations or profile.location,
        profile.preferred_level,
        profile.preferred_employment_type,
    )
    if not any(values):
        return
    pref = JobAlertPreference.query.filter_by(user_id=profile.user_id, is_default=True).first()
    if not pref:
        pref = JobAlertPreference(user_id=profile.user_id, is_default=True)
        db.session.add(pref)
    pref.subject = profile.teaching_subject
    pref.location = profile.preferred_locations or profile.location
    pref.location_ids = profile.preferred_location_ids
    pref.preferred_level = profile.preferred_level
    pref.curriculum = profile.curriculum_experience
    pref.employment_type = profile.preferred_employment_type
    pref.alert_by_email = True if pref.alert_by_email is None else pref.alert_by_email
    pref.frequency = pref.frequency or "instant"


def get_or_create_profile():
    profile = current_user.profile
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.session.add(profile)
        db.session.flush()
    return profile


@profile_bp.get("/me/profile")
@login_required
def get_profile():
    return jsonify(profile=profile_json(get_or_create_profile()))


@profile_bp.put("/me/profile")
@login_required
def update_profile():
    payload = request.get_json(silent=True) or {}
    profile = get_or_create_profile()
    for field in [
        "location",
        "teaching_subject",
        "preferred_level",
        "preferred_employment_type",
        "available_from",
        "curriculum_experience",
        "bio",
        "next_of_kin_name",
        "next_of_kin_phone",
        "next_of_kin_relationship",
        "next_of_kin_email",
    ]:
        if field in payload:
            setattr(profile, field, payload[field])
    if "preferred_location_ids" in payload:
        try:
            zones, location_ids = canonical_delivery_locations(payload.get("preferred_location_ids"))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        profile.preferred_location_ids = joined_location_ids(location_ids)
        profile.preferred_locations = joined_location_names(zones)
    if "years_of_experience" in payload:
        # Integer column — the form sends '' for "not selected", which Postgres
        # rejects outright ("invalid input syntax for type integer: ''"),
        # crashing the whole request with an unhandled 500. Coerce like
        # date_of_birth below: blank/invalid → NULL, valid → parsed value.
        raw = payload["years_of_experience"]
        if raw == "" or raw is None:
            profile.years_of_experience = None
        else:
            try:
                profile.years_of_experience = int(raw)
            except (ValueError, TypeError):
                pass
    if "date_of_birth" in payload:
        import datetime as _dt
        raw = payload["date_of_birth"]
        if raw:
            try:
                profile.date_of_birth = _dt.date.fromisoformat(raw)
            except (ValueError, TypeError):
                pass
        else:
            profile.date_of_birth = None
    if "phone" in payload and payload["phone"] != current_user.phone:
        return jsonify(error="Phone changes require OTP verification in Account & Security."), 400
    _sync_profile_to_alert_preference(profile)
    audit("profile_updated", "user_profile", current_user.id, {"email": current_user.email})
    db.session.commit()
    return jsonify(profile=profile_json(profile))


def _clean_email(value):
    try:
        return validate_email(value or "", check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


def _mask_destination(field, value):
    if field == "email":
        name, domain = value.split("@", 1)
        visible = name[:2] if len(name) > 2 else name[:1]
        return f"{visible}{'*' * max(2, len(name) - len(visible))}@{domain}"
    return f"*** *** {value[-4:]}"


def _send_contact_change_code(field, target, code):
    if field == "phone":
        return send_sms(
            target,
            f"Your RealMindX verification code is {code}. It expires in 15 minutes. "
            "Do not share this code.",
        )
    first_name = current_user.first_name or "there"
    body = (
        f"<p>Hello {escape(first_name)},</p>"
        "<p>Use the code below to verify your new email address for your RealMindX account.</p>"
        '<div style="text-align:center;margin:28px 0;">'
        '<div style="display:inline-block;background:#f5f8fc;border:2px dashed #c8d5e8;'
        'border-radius:12px;padding:18px 36px;">'
        f'<p style="margin:0;font-size:38px;font-weight:900;letter-spacing:.22em;color:#143670;">{escape(code)}</p>'
        '</div></div>'
        "<p style='font-size:13px;color:#6b80a0;'>This code expires in 15 minutes. "
        "If you did not request this change, keep your current account details and contact RealMindX.</p>"
    )
    return send_email(
        OutboundEmail(
            to=target,
            subject=f"Verify your RealMindX email change: {code}",
            html=app_email_shell(
                "Verify your new email",
                body,
                eyebrow="RealMindX Account Security",
                preheader=f"Your verification code is {code}. It expires in 15 minutes.",
            ),
        )
    )


@profile_bp.put("/me/account")
@login_required
def update_account():
    payload = request.get_json(silent=True) or {}
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    if not first_name:
        return jsonify(error="First name is required."), 400
    current_user.first_name = first_name
    current_user.last_name = last_name or None
    audit("account_name_updated", "user", current_user.id, {"email": current_user.email})
    db.session.commit()
    return jsonify(user=user_json(current_user))


@profile_bp.post("/me/contact-change/request")
@login_required
@limiter.limit("6/hour")
def request_contact_change():
    payload = request.get_json(silent=True) or {}
    field = str(payload.get("field") or "").strip().lower()
    raw_value = str(payload.get("value") or "").strip()
    if field not in {"email", "phone"}:
        return jsonify(error="Choose email or phone verification."), 400

    if field == "email":
        try:
            target = _clean_email(raw_value)
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        if target == current_user.email:
            return jsonify(error="That is already your account email."), 400
        existing = User.query.filter(User.email == target, User.id != current_user.id).first()
        if existing:
            return jsonify(error="That email is already connected to another account."), 409
    else:
        target = normalise_phone(raw_value)
        if not target:
            return jsonify(error="Enter a valid Ghana phone number."), 400
        if target == current_user.phone and current_user.phone_verified:
            return jsonify(error="That phone number is already verified."), 400

    now = datetime.now(timezone.utc)
    ContactChangeToken.query.filter_by(
        user_id=current_user.id,
        field=field,
        used_at=None,
    ).update({"used_at": now})
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = ContactChangeToken(
        user_id=current_user.id,
        field=field,
        target_value=target,
        token_hash=generate_password_hash(code),
        expires_at=now + timedelta(minutes=15),
    )
    db.session.add(challenge)
    db.session.flush()
    delivered = _send_contact_change_code(field, target, code)
    if not delivered:
        db.session.rollback()
        current_app.logger.warning("Could not deliver %s verification code for user %s", field, current_user.id)
        return jsonify(error=f"Could not send the {field} verification code. Please try again."), 502
    audit(
        "contact_change_requested",
        "user",
        current_user.id,
        {"field": field, "destination": _mask_destination(field, target)},
    )
    db.session.commit()
    masked = _mask_destination(field, target)
    return jsonify(
        challenge_id=challenge.id,
        field=field,
        destination=masked,
        expires_in_seconds=900,
        message=f"Verification code sent to {masked}.",
    )


@profile_bp.post("/me/contact-change/verify")
@login_required
@limiter.limit("12/hour")
def verify_contact_change():
    payload = request.get_json(silent=True) or {}
    try:
        challenge_id = int(payload.get("challenge_id"))
    except (TypeError, ValueError):
        return jsonify(error="Verification request not found. Send a fresh code."), 400
    otp = re.sub(r"\D", "", str(payload.get("otp") or ""))
    if len(otp) != 6:
        return jsonify(error="Enter the 6 digit verification code."), 400

    challenge = ContactChangeToken.query.filter_by(
        id=challenge_id,
        user_id=current_user.id,
        used_at=None,
    ).first()
    if not challenge:
        return jsonify(error="Verification code expired. Send a fresh code."), 400
    expires_at = challenge.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < datetime.now(timezone.utc):
        return jsonify(error="Verification code expired. Send a fresh code."), 400
    if not check_password_hash(challenge.token_hash, otp):
        return jsonify(error="Verification code is incorrect."), 400

    if challenge.field == "email":
        existing = User.query.filter(
            User.email == challenge.target_value,
            User.id != current_user.id,
        ).first()
        if existing:
            return jsonify(error="That email is already connected to another account."), 409
        current_user.email = challenge.target_value
        current_user.is_verified = True
    elif challenge.field == "phone":
        current_user.phone = challenge.target_value
        current_user.phone_verified = True
    else:
        return jsonify(error="Unsupported verification request."), 400

    now = datetime.now(timezone.utc)
    challenge.used_at = now
    ContactChangeToken.query.filter(
        ContactChangeToken.user_id == current_user.id,
        ContactChangeToken.field == challenge.field,
        ContactChangeToken.used_at.is_(None),
    ).update({"used_at": now})
    audit("contact_change_verified", "user", current_user.id, {"field": challenge.field})
    db.session.commit()
    return jsonify(
        message=f"{challenge.field.title()} updated and verified.",
        user=user_json(current_user),
    )


@profile_bp.post("/me/uploads")
@login_required
def upload_user_file():
    file = request.files.get("file")
    kind = request.form.get("kind") or "documents"
    field_map = {
        "profile_picture": ("images", "profile_picture_file_id", "public"),
        "cv": ("documents", "cv_file_id", "protected"),
        "certificate": ("documents", "certificate_file_id", "protected"),
        "document": ("documents", None, "protected"),
    }
    category, profile_field, visibility = field_map.get(kind, ("documents", None, "protected"))
    try:
        uploaded = save_upload(file, category=category, owner_id=current_user.id, visibility=visibility)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    profile = get_or_create_profile()
    if profile_field:
        setattr(profile, profile_field, uploaded.id)
    audit("file_uploaded", "uploaded_file", uploaded.id, {
        "kind": kind, "filename": uploaded.original_filename, "category": uploaded.category,
    })
    db.session.commit()
    return jsonify(
        file_id=uploaded.id,
        original_filename=uploaded.original_filename,
        category=uploaded.category,
        url=_upload_url(uploaded),
        profile=profile_json(profile),
    ), 201
