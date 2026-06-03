from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..audit import audit
from ..email_service import OutboundEmail, app_email_shell, send_email
from ..extensions import db, limiter
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
    pref = JobAlertPreference.query.filter_by(user_id=current_user.id).first()
    if not pref:
        return jsonify(preferences=None)
    return jsonify(
        preferences={
            "subject": pref.subject,
            "location": pref.location,
            "preferred_level": pref.preferred_level,
            "employment_type": pref.employment_type,
            "alert_by_email": pref.alert_by_email,
            "frequency": pref.frequency,
        }
    )


@jobs_bp.put("/me/job-alerts")
@login_required
def save_job_alerts():
    payload = request.get_json(silent=True) or {}
    pref = JobAlertPreference.query.filter_by(user_id=current_user.id).first()
    if not pref:
        pref = JobAlertPreference(user_id=current_user.id)
        db.session.add(pref)
    pref.subject = payload.get("subject")
    pref.location = payload.get("location")
    pref.preferred_level = payload.get("preferred_level")
    pref.employment_type = payload.get("employment_type")
    pref.alert_by_email = bool(payload.get("alert_by_email", True))
    pref.frequency = payload.get("frequency") or "instant"
    audit("job_alerts_updated", "job_alert_preference", current_user.id, {
        "subject": pref.subject, "location": pref.location, "level": pref.preferred_level,
    })
    db.session.commit()
    return jsonify(message="Job alert preferences saved.")

