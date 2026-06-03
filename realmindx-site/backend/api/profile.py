from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..audit import audit
from ..extensions import db
from ..models import UploadedFile, UserProfile
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
        "bio": profile.bio,
        "profile_picture_file_id": profile.profile_picture_file_id,
        "profile_picture_url": _upload_url(picture),
        "cv_file_id": profile.cv_file_id,
        "certificate_file_id": profile.certificate_file_id,
        "next_of_kin_name": profile.next_of_kin_name,
        "next_of_kin_phone": profile.next_of_kin_phone,
        "next_of_kin_relationship": profile.next_of_kin_relationship,
    }


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
        "bio",
        "next_of_kin_name",
        "next_of_kin_phone",
        "next_of_kin_relationship",
    ]:
        if field in payload:
            setattr(profile, field, payload[field])
    if "phone" in payload:
        current_user.phone = payload["phone"]
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
