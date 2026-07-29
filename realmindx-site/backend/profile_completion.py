"""Shared teacher-profile completion rules used by the portal and admin tools.

Provides a single authoritative source for profile completeness, status,
and next-action guidance.  Every frontend component must consume the
structured dict returned by ``account_status()`` — never recalculate or
guess the percentage.
"""

from datetime import datetime, timezone

CURRENT_TERMS_VERSION = "v1_2026_07"

PROFILE_COMPLETION_FIELDS = (
    ("email", "Email address"),
    ("location", "Current location"),
    ("teaching_subject", "Teaching subject"),
    ("preferred_level", "Preferred teaching level"),
    ("preferred_employment_type", "Preferred employment type"),
    ("curriculum_experience", "Curriculum experience"),
    ("cv_file_id", "CV"),
    ("certificate_file_id", "Certificate"),
)

_LOCKED_STATUSES = frozenset({"submitted", "under_review", "verified", "rejected"})
_SUBMISSION_ALLOWED = frozenset({"incomplete", "complete", "revision_required", "reopened"})


def teacher_profile_completion(user):
    """Return ``(percentage, list_of_missing_labels)`` — kept for callers that
    only need the scalar.
    """
    profile = getattr(user, "profile", None)
    values = {
        "email": getattr(user, "email", None) or getattr(user, "first_name", None),
        "location": getattr(profile, "location", None),
        "teaching_subject": getattr(profile, "teaching_subject", None),
        "preferred_level": getattr(profile, "preferred_level", None),
        "preferred_employment_type": getattr(profile, "preferred_employment_type", None),
        "curriculum_experience": getattr(profile, "curriculum_experience", None),
        "cv_file_id": getattr(profile, "cv_file_id", None),
        "certificate_file_id": getattr(profile, "certificate_file_id", None),
    }
    missing = [label for key, label in PROFILE_COMPLETION_FIELDS if not values[key]]
    completed = len(PROFILE_COMPLETION_FIELDS) - len(missing)
    percentage = round((completed / len(PROFILE_COMPLETION_FIELDS)) * 100) if PROFILE_COMPLETION_FIELDS else 0
    return percentage, missing


def account_status(user):
    """Return the single authoritative account-status dict.

    Every frontend component must derive its display from this response
    rather than calculating completion, consent, or next-action locally.
    """
    now = datetime.now(timezone.utc)

    # ---- terms ----
    from .models import TermsAcceptance

    terms_accepted = False
    requires_terms_acceptance = False
    terms_record = TermsAcceptance.query.filter_by(
        user_id=user.id,
        terms_type="platform_terms",
        terms_version=CURRENT_TERMS_VERSION,
    ).order_by(TermsAcceptance.accepted_at.desc()).first()
    if terms_record:
        terms_accepted = True
    elif user.terms_accepted_at is not None and user.terms_version == CURRENT_TERMS_VERSION:
        terms_accepted = True
    else:
        requires_terms_acceptance = True

    # ---- profile completion ----
    profile = getattr(user, "profile", None)
    stored_profile_status = getattr(profile, "profile_status", "incomplete") if profile else "incomplete"
    completion_percentage, missing_requirements = teacher_profile_completion(user)
    # Older profiles can reach 100% when their final required document is
    # uploaded without another profile edit. Present the canonical ready state
    # even before a subsequent write persists the repaired status.
    profile_status = (
        "complete"
        if stored_profile_status == "incomplete" and completion_percentage >= 100
        else stored_profile_status
    )

    # ---- profile / submission state ----
    application_count = 0
    under_review_count = 0
    try:
        application_count = len(user.job_applications)
        under_review_count = sum(
            1 for a in user.job_applications if a.status == "under_review"
        )
    except Exception:
        pass

    is_submitted = profile_status in ("submitted",)
    is_under_review = profile_status == "under_review"
    revision_required = profile_status == "revision_required"
    is_verified = profile_status == "verified"
    is_rejected = profile_status == "rejected"

    can_submit = (
        profile_status in _SUBMISSION_ALLOWED
        and completion_percentage >= 100
    )

    next_action = _derive_next_action(
        completion_percentage, profile_status, requires_terms_acceptance,
        missing_requirements,
    )

    return {
        "account_exists": True,
        "terms_accepted": terms_accepted,
        "requires_terms_acceptance": requires_terms_acceptance,
        "terms_version": getattr(user, "terms_version", None) or CURRENT_TERMS_VERSION,
        "terms_accepted_at": user.terms_accepted_at.isoformat() if user.terms_accepted_at else None,
        "completion_percentage": completion_percentage,
        "missing_requirements": missing_requirements,
        "profile_status": profile_status,
        "can_submit": can_submit,
        "is_submitted": is_submitted,
        "is_under_review": is_under_review,
        "revision_required": revision_required,
        "is_verified": is_verified,
        "is_rejected": is_rejected,
        "application_count": application_count,
        "under_review_count": under_review_count,
        "application_id": getattr(user, "application_id", None),
        "teacher_id": getattr(user, "teacher_id", None),
        "next_action": next_action,
        "submitted_at": profile.submitted_at.isoformat() if profile and profile.submitted_at else None,
        "reviewed_at": profile.reviewed_at.isoformat() if profile and profile.reviewed_at else None,
        "review_notes": profile.review_notes if profile else None,
    }


def _derive_next_action(completion_percentage, profile_status, requires_terms, missing):
    """Return the single correct next-action string, or None if no prompt is needed."""
    if requires_terms:
        return "accept_terms"
    if completion_percentage < 100:
        missing_list = missing[:3]
        suffix = f" ({', '.join(missing_list)}{'...' if len(missing) > 3 else ''})" if missing_list else ""
        return f"complete_profile{suffix}"
    if profile_status == "complete":
        return "submit_for_review"
    if profile_status == "revision_required":
        return "review_revision"
    if profile_status == "rejected":
        return "contact_support"
    return None
