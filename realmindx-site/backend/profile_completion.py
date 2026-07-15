"""Shared teacher-profile completion rules used by the portal and admin tools."""


PROFILE_COMPLETION_FIELDS = (
    ("email", "Email address"),
    ("verified_phone", "Verified phone number"),
    ("location", "Current location"),
    ("teaching_subject", "Teaching subject"),
    ("preferred_level", "Preferred teaching level"),
    ("preferred_employment_type", "Preferred employment type"),
    ("curriculum_experience", "Curriculum experience"),
    ("cv_file_id", "CV"),
    ("certificate_file_id", "Certificate"),
)


def teacher_profile_completion(user):
    """Return the portal-compatible completion percentage and missing labels."""
    profile = getattr(user, "profile", None)
    values = {
        "email": getattr(user, "email", None) or getattr(user, "first_name", None),
        "verified_phone": bool(getattr(user, "phone", None) and getattr(user, "phone_verified", False)),
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
    percentage = round((completed / len(PROFILE_COMPLETION_FIELDS)) * 100)
    return percentage, missing
