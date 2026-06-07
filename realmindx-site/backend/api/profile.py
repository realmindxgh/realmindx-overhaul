from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..audit import audit
from ..extensions import db
from ..models import JobAlertPreference, UploadedFile, UserProfile
from ..upload_utils import save_upload

profile_bp = Blueprint("profile", __name__)


def _upload_url(uploaded_file):
    if not uploaded_file:
        return None
    return f"/uploads/{uploaded_file.visibility}/{uploaded_file.category}/{uploaded_file.stored_filename}"


def profile_json(profile):
    picture = db.session.get(UploadedFile, profile.profile_picture_file_id) if profile.profile_picture_file_id else None
    return {
        "location": profile.location,
        "teaching_subject": profile.teaching_subject,
        "preferred_level": profile.preferred_level,
        "preferred_employment_type": profile.preferred_employment_type,
        "available_from": profile.available_from,
        "curriculum_experience": profile.curriculum_experience,
        "bio": profile.bio,
        "profile_picture_file_id": profile.profile_picture_file_id,
        "profile_picture_url": _upload_url(picture),
        "cv_file_id": profile.cv_file_id,
        "certificate_file_id": profile.certificate_file_id,
        "next_of_kin_name": profile.next_of_kin_name,
        "next_of_kin_phone": profile.next_of_kin_phone,
        "next_of_kin_relationship": profile.next_of_kin_relationship,
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
    if not profile.teaching_subject:
        return  # nothing meaningful to match on yet
    existing = JobAlertPreference.query.filter_by(user_id=profile.user_id).first()
    if existing:
        return  # respect any customisation the user has already made
    pref = JobAlertPreference(
        user_id=profile.user_id,
        subject=profile.teaching_subject,
        location=profile.location,
        preferred_level=profile.preferred_level,
        employment_type=profile.preferred_employment_type,
        alert_by_email=True,
        frequency="instant",
    )
    db.session.add(pref)


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
    ]:
        if field in payload:
            setattr(profile, field, payload[field])
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
    if "phone" in payload:
        current_user.phone = payload["phone"]
    _sync_profile_to_alert_preference(profile)
    audit("profile_updated", "user_profile", current_user.id, {"email": current_user.email})
    db.session.commit()
    return jsonify(profile=profile_json(profile))


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
