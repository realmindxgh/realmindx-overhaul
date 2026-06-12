from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..audit import audit
from ..email_service import OutboundEmail, app_email_shell, send_email
from ..extensions import db, limiter
from ..location_data import canonical_delivery_locations, joined_location_ids, joined_location_names
from ..models import Job, JobAlertPreference, JobApplication
from ..serializers import job_json

jobs_bp = Blueprint("jobs", __name__)


@jobs_bp.get("/jobs")
def list_jobs():
    query = Job.query.filter_by(status="published")
    subject = request.args.get("subject")
    location = request.args.get("location")
    level = request.args.get("level")
    employment_type = request.args.get("employment_type")
    search = request.args.get("q")
    if subject:
        query = query.filter(Job.subject.ilike(f"%{subject}%"))
    if location:
        query = query.filter(Job.location.ilike(f"%{location}%"))
    if level:
        query = query.filter(Job.level == level)
    if employment_type:
        query = query.filter(Job.employment_type == employment_type)
    if search:
        query = query.filter(Job.title.ilike(f"%{search}%"))
    jobs = query.order_by(Job.created_at.desc()).limit(100).all()
    return jsonify(items=[job_json(job) for job in jobs])


@jobs_bp.get("/jobs/<int:job_id>")
def get_job(job_id):
    job = db.get_or_404(Job, job_id)
    if job.status != "published":
        return jsonify(error="Job not available."), 404
    return jsonify(job=job_json(job))


@jobs_bp.post("/jobs/<int:job_id>/apply")
@login_required
@limiter.limit("10/hour")
def apply_for_job(job_id):
    job = db.get_or_404(Job, job_id)
    if not current_user.is_verified:
        return jsonify(error="Please verify your email before applying."), 403
    existing = JobApplication.query.filter_by(user_id=current_user.id, job_id=job.id).first()
    if existing:
        return jsonify(application_id=existing.id, status=existing.status, message="You have already applied."), 409
    application = JobApplication(
        user_id=current_user.id,
        job_id=job.id,
        cover_note=(request.get_json(silent=True) or {}).get("cover_note"),
    )
    db.session.add(application)
    audit("job_application_submitted", "job_application", None, {
        "job_id": job.id,
        "job_title": job.title,
        "applicant_email": current_user.email,
    })
    db.session.commit()

    send_email(
        OutboundEmail(
            to=current_user.email,
            subject=f"Application received: {job.title}",
            html=app_email_shell(
                "Application received",
                f"<p>Your application for <strong>{job.title}</strong> has been received.</p>",
            ),
        )
    )
    return jsonify(application_id=application.id, status=application.status), 201


@jobs_bp.get("/me/applications")
@login_required
def my_applications():
    applications = (
        JobApplication.query.filter_by(user_id=current_user.id)
        .join(Job)
        .order_by(JobApplication.created_at.desc())
        .all()
    )
    return jsonify(
        items=[
            {
                "id": app.id,
                "status": app.status,
                "job": job_json(app.job),
                "created_at": app.created_at.isoformat(),
            }
            for app in applications
        ]
    )


@jobs_bp.get("/me/job-alerts")
@login_required
def get_job_alerts():
    preferences = (
        JobAlertPreference.query
        .filter_by(user_id=current_user.id)
        .order_by(JobAlertPreference.is_default.desc(), JobAlertPreference.created_at.asc())
        .all()
    )
    items = [_job_alert_json(pref) for pref in preferences]
    return jsonify(items=items, preferences=items[0] if items else None)


def _job_alert_json(pref):
    return {
        "id": pref.id,
        "subject": pref.subject,
        "location": pref.location,
        "location_ids": pref.location_ids,
        "preferred_level": pref.preferred_level,
        "curriculum": pref.curriculum,
        "employment_type": pref.employment_type,
        "alert_by_email": pref.alert_by_email,
        "frequency": pref.frequency,
        "is_default": pref.is_default,
    }


def _apply_job_alert_payload(pref, payload):
    pref.subject = (payload.get("subject") or "").strip() or None
    zones, location_ids = canonical_delivery_locations(payload.get("location_ids"))
    pref.location_ids = joined_location_ids(location_ids)
    pref.location = joined_location_names(zones)
    pref.preferred_level = (payload.get("preferred_level") or "").strip() or None
    pref.curriculum = (payload.get("curriculum") or "").strip() or None
    pref.employment_type = (payload.get("employment_type") or "").strip() or None
    pref.alert_by_email = bool(payload.get("alert_by_email", True))
    pref.frequency = "instant"


def _sync_default_alert_to_profile(pref):
    if not pref.is_default:
        return
    profile = current_user.profile
    if not profile:
        return
    profile.teaching_subject = pref.subject
    profile.preferred_locations = pref.location
    profile.preferred_location_ids = pref.location_ids
    profile.preferred_level = pref.preferred_level
    profile.curriculum_experience = pref.curriculum
    profile.preferred_employment_type = pref.employment_type


def _save_job_alert(pref, payload, action):
    try:
        _apply_job_alert_payload(pref, payload)
    except ValueError as exc:
        return None, (jsonify(error=str(exc)), 400)
    if not pref.subject and not pref.location:
        return None, (jsonify(error="Choose at least a subject or preferred location."), 400)
    db.session.add(pref)
    db.session.flush()
    _sync_default_alert_to_profile(pref)
    audit(action, "job_alert_preference", pref.id, {
        "subject": pref.subject,
        "location": pref.location,
        "location_ids": pref.location_ids,
        "level": pref.preferred_level,
        "curriculum": pref.curriculum,
        "is_default": pref.is_default,
    })
    db.session.commit()
    return pref, None


@jobs_bp.put("/me/job-alerts")
@login_required
def save_job_alerts():
    payload = request.get_json(silent=True) or {}
    pref = JobAlertPreference.query.filter_by(user_id=current_user.id, is_default=True).first()
    if not pref:
        pref = JobAlertPreference(user_id=current_user.id, is_default=True)
    pref, error = _save_job_alert(pref, payload, "job_alert_default_updated")
    if error:
        return error
    return jsonify(message="Default job alert saved.", preference=_job_alert_json(pref))


@jobs_bp.post("/me/job-alerts")
@login_required
def create_job_alert():
    payload = request.get_json(silent=True) or {}
    pref = JobAlertPreference(user_id=current_user.id, is_default=False)
    pref, error = _save_job_alert(pref, payload, "job_alert_created")
    if error:
        return error
    return jsonify(message="Job alert created.", preference=_job_alert_json(pref)), 201


@jobs_bp.put("/me/job-alerts/<int:preference_id>")
@login_required
def update_job_alert(preference_id):
    pref = JobAlertPreference.query.filter_by(
        id=preference_id,
        user_id=current_user.id,
    ).first_or_404()
    pref, error = _save_job_alert(
        pref,
        request.get_json(silent=True) or {},
        "job_alert_updated",
    )
    if error:
        return error
    return jsonify(message="Job alert updated.", preference=_job_alert_json(pref))


@jobs_bp.delete("/me/job-alerts/<int:preference_id>")
@login_required
def delete_job_alert(preference_id):
    pref = JobAlertPreference.query.filter_by(
        id=preference_id,
        user_id=current_user.id,
    ).first_or_404()
    if pref.is_default:
        return jsonify(error="The default alert is managed from Teaching Preferences and cannot be deleted."), 400
    audit("job_alert_deleted", "job_alert_preference", pref.id, {})
    db.session.delete(pref)
    db.session.commit()
    return jsonify(message="Job alert deleted.")
