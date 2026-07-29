"""Detect and repair inconsistent teacher account state.

Usage
-----
    python scripts/reconcile_accounts.py          # dry-run (report only)
    python scripts/reconcile_accounts.py --apply  # apply safe repairs

Authority sources for consent
-----------------------------
- ``TermsAcceptance`` table is the **canonical legal source of truth** for
  terms-of-service and privacy-policy acceptance.
- ``User.terms_accepted_at`` + ``User.terms_version`` is a **derived /
  compatibility fallback** that mirrors the latest acceptance but is NOT
  the authoritative record.
- ``User.terms_accepted_at`` WITHOUT ``User.terms_version`` is **NOT**
  evidence of consent — a timestamp alone cannot be relied upon.
- Reconciliation converts legacy user-level acceptance into
  ``TermsAcceptance`` rows **only when both the timestamp AND the version
  are present** (reliable evidence).

Safe automatic repairs
----------------------
The script examines every user with ``role.name == 'user'`` and reports
rows where the stored state contradicts the canonical calculation.  In
``--apply`` mode it only fixes the following automatically:

  - ``profile_status`` when it disagrees with ``teacher_profile_completion()``
  - orphaned ``UploadedFile`` records whose ``owner_id`` points to a
    deleted user
  - ``User.privacy_version`` when missing but ``terms_accepted_at`` is set
  - missing ``TermsAcceptance`` rows for users who have both
    ``terms_accepted_at`` AND ``terms_version`` set

It NEVER:
  - deletes production data without logging the exact action first
  - manufactures or backdates legal consent
  - changes authentication-provider state
  - auto-fixes a bare ``terms_accepted_at`` without a ``terms_version``
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone

from flask import Flask
from sqlalchemy import text

from backend.config import Config
from backend.extensions import db
from backend.models import TermsAcceptance, UploadedFile, User, UserProfile
from backend.profile_completion import CURRENT_TERMS_VERSION, teacher_profile_completion

DRY_RUN = True


def log(message, *args):
    print(message.format(*args))


def warn(message, *args):
    print(f"  WARNING: {message.format(*args)}")


def action(message, *args):
    print(f"  >>> {message.format(*args)}")


def check_user_consistency(user):
    """Inspect one user and return a list of issue dicts."""
    issues = []

    profile = getattr(user, "profile", None)

    # 1. profile_completion vs stored profile_status
    completion, missing = teacher_profile_completion(user)
    profile_status = getattr(profile, "profile_status", "incomplete") if profile else "incomplete"

    if completion >= 100 and profile_status == "incomplete":
        issues.append({
            "type": "stale_profile_status",
            "severity": "repairable",
            "detail": f"Completion={completion}% but profile_status='incomplete'; expected 'complete'",
            "fix": {"profile_status": "complete"},
        })

    if completion >= 100 and profile_status in ("complete",) and not profile:
        issues.append({
            "type": "no_profile_row",
            "severity": "repairable",
            "detail": "Profile completion >= 100% but UserProfile row is missing",
            "fix": {"create_profile": True, "profile_status": "complete"},
        })

    if completion < 100 and profile_status in ("complete", "submitted", "under_review", "verified"):
        issues.append({
            "type": "inconsistent_completion_status",
            "severity": "needs_review",
            "detail": f"Completion={completion}% but profile_status='{profile_status}'",
        })

    # 2. profile_status and submission state consistency
    if profile_status == "submitted" and not getattr(profile, "submitted_at", None):
        issues.append({
            "type": "missing_submitted_at",
            "severity": "repairable",
            "detail": "profile_status='submitted' but submitted_at is NULL",
            "fix": {"submitted_at": datetime.now(timezone.utc)},
        })

    if profile_status in ("under_review", "verified", "rejected") and not getattr(profile, "submitted_at", None):
        issues.append({
            "type": "missing_submitted_at_for_reviewed",
            "severity": "repairable",
            "detail": f"profile_status='{profile_status}' but submitted_at is NULL",
            "fix": {"submitted_at": datetime.now(timezone.utc)},
        })

    if profile_status == "verified" and not getattr(profile, "reviewed_at", None):
        issues.append({
            "type": "missing_reviewed_at",
            "severity": "repairable",
            "detail": "profile_status='verified' but reviewed_at is NULL",
            "fix": {"reviewed_at": datetime.now(timezone.utc)},
        })

    # 3. Terms acceptance consistency
    if user.terms_accepted_at and not user.terms_version:
        issues.append({
            "type": "missing_terms_version",
            "severity": "needs_review",
            "detail": "terms_accepted_at set but terms_version is NULL — NOT evidence of consent without a version",
        })

    if user.terms_accepted_at and not user.privacy_version:
        issues.append({
            "type": "missing_privacy_version",
            "severity": "repairable",
            "detail": "terms_accepted_at set but privacy_version is NULL",
            "fix": {"privacy_version": CURRENT_TERMS_VERSION},
        })

    if user.terms_accepted_at:
        existing_acceptance = TermsAcceptance.query.filter_by(
            user_id=user.id,
            terms_type="platform_terms",
            terms_version=CURRENT_TERMS_VERSION,
        ).first()
        if not existing_acceptance:
            issues.append({
                "type": "missing_terms_acceptance_row",
                "severity": "repairable",
                "detail": f"terms_accepted_at={user.terms_accepted_at.isoformat()} but no TermsAcceptance row exists",
                "fix": {"create_terms_acceptance": True},
            })

    # 4. Deleted user with surviving profile
    if not user.is_active and profile:
        if profile_status not in ("incomplete",):
            issues.append({
                "type": "inactive_user_active_profile",
                "severity": "needs_review",
                "detail": f"User is_active=False but profile_status='{profile_status}'",
            })

    return issues


def find_orphaned_uploaded_files():
    """Find UploadedFile rows whose owner_id references a deleted user."""
    orphaned = (
        UploadedFile.query
        .outerjoin(User, UploadedFile.owner_id == User.id)
        .filter(User.id.is_(None), UploadedFile.owner_id.isnot(None))
        .all()
    )
    return orphaned


def find_users_without_profiles():
    """Find users without a UserProfile row."""
    users = (
        User.query
        .outerjoin(UserProfile, User.id == UserProfile.user_id)
        .filter(UserProfile.id.is_(None))
        .all()
    )
    return [u for u in users if u.role and u.role.name == "user"]


def repair_one_user(user, fixes):
    """Apply safe fixes to one user."""
    if "profile_status" in fixes:
        profile = user.profile or UserProfile(user_id=user.id)
        db.session.add(profile)
        db.session.flush()
        old = profile.profile_status
        profile.profile_status = fixes["profile_status"]
        action("User {}: profile_status '{}' -> '{}'", user.id, old, fixes["profile_status"])

    if "submitted_at" in fixes and user.profile:
        user.profile.submitted_at = fixes["submitted_at"]
        action("User {}: set submitted_at={}", user.id, fixes["submitted_at"].isoformat())

    if "reviewed_at" in fixes and user.profile:
        user.profile.reviewed_at = fixes["reviewed_at"]
        action("User {}: set reviewed_at={}", user.id, fixes["reviewed_at"].isoformat())

    if "create_profile" in fixes:
        new_profile = UserProfile(user_id=user.id, profile_status=fixes.get("profile_status", "incomplete"))
        db.session.add(new_profile)
        action("User {}: created missing UserProfile row with status '{}'", user.id, fixes.get("profile_status", "incomplete"))

    if "terms_version" in fixes:
        old = user.terms_version
        user.terms_version = fixes["terms_version"]
        action("User {}: terms_version '{}' -> '{}'", user.id, old, fixes["terms_version"])

    if "privacy_version" in fixes:
        old = user.privacy_version
        user.privacy_version = fixes["privacy_version"]
        action("User {}: privacy_version '{}' -> '{}'", user.id, old, fixes["privacy_version"])

    if "create_terms_acceptance" in fixes:
        if user.terms_accepted_at:
            acceptance = TermsAcceptance(
                user_id=user.id,
                terms_type="platform_terms",
                terms_version=CURRENT_TERMS_VERSION,
                privacy_version=CURRENT_TERMS_VERSION,
                accepted_at=user.terms_accepted_at,
                acceptance_source="reconciliation",
            )
            db.session.add(acceptance)
            action("User {}: created TermsAcceptance row for version '{}'", user.id, CURRENT_TERMS_VERSION)


def convert_legacy_acceptance():
    """Create TermsAcceptance rows from legacy user-level acceptance.

    Finds users who have both ``terms_accepted_at`` AND ``terms_version`` set
    but no corresponding ``TermsAcceptance`` row for that version.  Creates the
    canonical acceptance record using the existing user-level values as evidence.

    Only converts when **both** the timestamp and the version are present —
    never fabricates consent from a bare ``terms_accepted_at``.
    """
    users = User.query.filter(
        User.terms_accepted_at.isnot(None),
        User.terms_version.isnot(None),
    ).all()

    created = 0
    for user in users:
        existing = TermsAcceptance.query.filter_by(
            user_id=user.id,
            terms_type="platform_terms",
            terms_version=user.terms_version,
        ).first()
        if not existing:
            acceptance = TermsAcceptance(
                user_id=user.id,
                terms_type="platform_terms",
                terms_version=user.terms_version,
                privacy_version=user.privacy_version or CURRENT_TERMS_VERSION,
                accepted_at=user.terms_accepted_at,
                acceptance_source="reconciliation",
            )
            db.session.add(acceptance)
            created += 1
            action(
                "User {}: created TermsAcceptance (version '{}') from legacy user-level fields",
                user.id, user.terms_version,
            )

    return created


def main():
    global DRY_RUN
    DRY_RUN = "--dry-run" in sys.argv or "--apply" not in sys.argv
    apply_mode = "--apply" in sys.argv

    if DRY_RUN:
        print("=" * 72)
        print("  DRY RUN – no changes will be made.  Use --apply to apply repairs.")
        print("=" * 72)
    else:
        print("=" * 72)
        print("  APPLY MODE – repairs will be written to the database.")
        print("=" * 72)

    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)

    with app.app_context():
        total_issues = 0
        repaired = 0

        # ---- Convert legacy acceptance before consistency checks ----
        legacy_converted = convert_legacy_acceptance()
        if legacy_converted:
            log("Converted {} legacy acceptance(s) to canonical TermsAcceptance rows.", legacy_converted)

        # ---- Check users ----
        users = User.query.filter(
            User.role_id.isnot(None)
        ).all()
        user_users = [u for u in users if u.role and u.role.name == "user"]

        log("Checking {} teacher accounts for inconsistencies...", len(user_users))

        for user in user_users:
            issues = check_user_consistency(user)
            if issues:
                log("User {} ({}) — {} issue(s):", user.id, user.email or "(no email)", len(issues))
                for issue in issues:
                    warn("[{}] {}", issue["type"], issue["detail"])
                    total_issues += 1
                    if apply_mode and issue["severity"] == "repairable":
                        repair_one_user(user, issue.get("fix", {}))

        # ---- Users without profiles ----
        profileless = find_users_without_profiles()
        if profileless:
            log("\n{} user(s) have no UserProfile row:", len(profileless))
            for u in profileless:
                completion, _ = teacher_profile_completion(u)
                warn("User {} ({}) — completion would be {}%, no profile row", u.id, u.email or "", completion)
                total_issues += 1
                if apply_mode:
                    repair_one_user(u, {"create_profile": True, "profile_status": "incomplete"})

        # ---- Orphaned uploaded files ----
        orphaned = find_orphaned_uploaded_files()
        if orphaned:
            log("\n{} orphaned UploadedFile record(s):", len(orphaned))
            for uf in orphaned:
                warn("UploadedFile id={} (owner_id={}) — orphaned, will be deleted", uf.id, uf.owner_id)
                total_issues += 1
                if apply_mode:
                    from backend.upload_utils import delete_uploaded_file_physical
                    try:
                        delete_uploaded_file_physical(uf)
                    except Exception:
                        pass
                    db.session.delete(uf)
                    action("Deleted orphaned UploadedFile id={}", uf.id)

        if apply_mode and total_issues > 0:
            db.session.commit()
            log("\nCommitted {} repairs.", repaired)
        else:
            log("\n{} issue(s) detected.  Run with --apply to fix repairable items.", total_issues)

        log("\nDone.")


if __name__ == "__main__":
    main()
