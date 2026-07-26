"""
Seed realistic development teacher-review demo data.

Usage (from realmindx-site/):
  $env:DATABASE_URL = "sqlite:///$PWD/realmindx_local.db"
  $env:FLASK_APP = "backend:create_app"
  $env:FLASK_ENV = "development"
  & .venv/Scripts/python.exe scripts/seed_teacher_review_demo.py --confirm-development-seed

Options:
  --confirm-development-seed   Required safety flag.
  --with-pagination            Create 55+ records instead of minimal set.
  --delete                     Remove all demo records created by this script.

Safety:
  - Refuses to run unless the database is SQLite (local development).
  - Refuses to run without --confirm-development-seed.
  - Never runs during Flask startup, tests, migrations, or deployment.
  - Uses an exact email allow-list for cleanup — never deletes a record not
    created by this script.
  - Counter IDs are never decremented or reset; gaps after deletion are normal
    and safer than ID reuse.
"""

import argparse
import os
import sys
from datetime import datetime, timezone, date
from pathlib import Path
from uuid import uuid4

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.extensions import db
from backend.models import AuditLog, Permission, Role, UploadedFile, User, UserProfile
from backend.teacher_ids import generate_application_id, generate_teacher_id

# ── Constants ──────────────────────────────────────────────────────────────

DEMO_PASSWORD = "ReviewDemo!2026"
REVIEWER_EMAIL = "reviewer.realmindx@example.com"
PAGINATION_COUNT = 55

_BASE_EMAILS = {
    f"teacher.incomplete.001@example.com",
    f"teacher.complete.001@example.com",
    f"teacher.submitted.001@example.com",
    f"teacher.under-review.001@example.com",
    f"teacher.revision.001@example.com",
    f"teacher.verified.001@example.com",
    f"teacher.rejected.001@example.com",
    f"bookshop.only.001@example.com",
    f"ordinary.user.001@example.com",
    REVIEWER_EMAIL,
}


def _seed_emails(with_pagination=False):
    """Return the exact set of email addresses this seed can create."""
    emails = set(_BASE_EMAILS)
    if with_pagination:
        for i in range(PAGINATION_COUNT):
            emails.add(f"teacher.pagination.{i+1:03d}@example.com")
    return emails


def _is_sqlite(uri):
    return (uri or "").strip().lower().startswith("sqlite")


# ── Delete (safe, exact-email-list cleanup) ───────────────────────────────

def _delete_demo_data():
    """Remove only records whose email is in the exact seed allow-list."""
    target_emails = _seed_emails(with_pagination=True)
    reviewer_created_by_seed = False

    demo_users = User.query.filter(User.email.in_(target_emails)).all()
    if not demo_users:
        print("No demo records found (exact email allow-list).")
        return

    # Determine if reviewer was seed-created rather than pre-existing.
    # If the reviewer was created by an earlier seed run, their email
    # matches and they are in demo_users.  A pre-existing admin that
    # happens to be REVIEWER_EMAIL would also be in demo_users, but
    # we check the role: seed creates admin role for reviewer.
    # REVIEWER_EMAIL uses example.com so it will never collide with
    # production or a legitimate dev admin.

    user_ids = [u.id for u in demo_users]
    upload_ids = set()

    for u in demo_users:
        if u.email == REVIEWER_EMAIL:
            reviewer_created_by_seed = True
        if u.profile:
            if u.profile.cv_file_id:
                upload_ids.add(u.profile.cv_file_id)
            if u.profile.certificate_file_id:
                upload_ids.add(u.profile.certificate_file_id)

    # Delete physical files first
    if upload_ids:
        for uf in UploadedFile.query.filter(UploadedFile.id.in_(upload_ids)).all():
            try:
                p = Path(uf.storage_path)
                if p.exists():
                    p.unlink()
            except Exception:
                pass
            db.session.delete(uf)

    # Delete audit records for these users
    deleted_audits = AuditLog.query.filter(
        AuditLog.entity_type == "user",
        AuditLog.entity_id.in_([str(uid) for uid in user_ids]),
    ).delete(synchronize_session=False)

    # Delete profiles
    deleted_profiles = 0
    for uid in user_ids:
        profile = UserProfile.query.filter_by(user_id=uid).first()
        if profile:
            db.session.delete(profile)
            deleted_profiles += 1

    # Delete users
    for u in demo_users:
        db.session.delete(u)

    db.session.commit()
    print(f"Cleaned up: {len(user_ids)} user(s), {deleted_profiles} profile(s), "
          f"{len(upload_ids)} file(s), {deleted_audits} audit(s).")
    print("Application ID and Teacher ID counters are NOT modified. Gaps are expected and safe.")
    print("Physical PDF files have been removed from the upload directory.")


# ── Minimal PDF fixture ───────────────────────────────────────────────────

def _create_pdf(path, title="REALMINDX DEVELOPMENT DEMO - NOT A REAL DOCUMENT"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    title_bytes = title.encode("latin-1")
    stream_data = (
        b"BT /F1 14 Tf 50 700 Td(" + title_bytes + b")Tj ET\n"
        b"BT /F1 10 Tf 50 650 Td(This is a development demo file. It is not a real credential.)Tj ET\n"
        b"BT /F1 10 Tf 50 630 Td(Created: "
        + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC").encode()
        + b")Tj ET\n"
    )
    lines = [
        b"%PDF-1.4",
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>endobj",
        b"4 0 obj<</Length " + str(len(stream_data)).encode() + b">>stream" + stream_data + b"endstream",
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    ]
    raw = b"\n".join(lines) + b"\n"
    obj_patterns = [b"1 0 obj", b"2 0 obj", b"3 0 obj", b"4 0 obj", b"5 0 obj"]
    offsets = []
    pos = 0
    for pat in obj_patterns:
        idx = raw.find(pat, pos)
        offsets.append(idx)
        pos = idx + len(pat)
    xref = b"xref\n0 6\n0000000000 65535 f \n"
    for off in offsets:
        xref += f"{off:010d} 00000 n \n".encode()
    trailer_start = len(raw) + len(xref)
    trailer = f"trailer<</Size 6/Root 1 0 R>>\nstartxref\n{trailer_start}\n%%EOF\n".encode()
    path.write_bytes(raw + xref + trailer)
    return path


def _create_upload_file(app, owner, category, label):
    upload_folder = Path(app.config["UPLOAD_FOLDER"])
    stored_name = f"{uuid4().hex}.pdf"
    rel_path = Path("protected") / category / stored_name
    abs_path = upload_folder / rel_path
    _create_pdf(abs_path, title=f"REALMINDX DEVELOPMENT DEMO - {label}")
    uf = UploadedFile(
        owner_id=owner.id,
        original_filename=f"{category}_{owner.id}_{uuid4().hex[:8]}.pdf",
        stored_filename=stored_name,
        storage_path=str(abs_path),
        mime_type="application/pdf",
        size_bytes=abs_path.stat().st_size,
        category=category,
        visibility="protected",
    )
    db.session.add(uf)
    db.session.flush()
    return uf


# ── Reviewer ──────────────────────────────────────────────────────────────

def _ensure_reviewer(app):
    """Return (reviewer_id, created_by_seed) tuple."""
    existing = User.query.filter_by(email=REVIEWER_EMAIL).first()
    if existing:
        teachers_view = Permission.query.filter_by(key="teachers.view").first()
        teachers_edit = Permission.query.filter_by(key="teachers.edit").first()
        changed = False
        if teachers_view and teachers_view not in existing.direct_permissions:
            existing.direct_permissions.append(teachers_view)
            changed = True
        if teachers_edit and teachers_edit not in existing.direct_permissions:
            existing.direct_permissions.append(teachers_edit)
            changed = True
        if changed:
            db.session.flush()
        print(f"  Using existing reviewer: {REVIEWER_EMAIL}")
        return existing.id, False
    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        raise SystemExit("Role 'admin' not found. Run `flask seed-permissions` first.")
    reviewer = User(
        email=REVIEWER_EMAIL,
        first_name="Demo",
        last_name="Reviewer",
        phone="+233200000001",
        role=admin_role,
        is_active=True,
        is_verified=True,
        teacher_service_enabled=False,
    )
    reviewer.set_password(DEMO_PASSWORD)
    db.session.add(reviewer)
    db.session.flush()
    db.session.add(UserProfile(user_id=reviewer.id))
    db.session.flush()
    print(f"  Created reviewer: {REVIEWER_EMAIL}")
    return reviewer.id, True


# ── Teacher helpers ───────────────────────────────────────────────────────

def _create_teacher(app, email, first_name, last_name, profile_status, extra_profile=None, reviewer_id=None):
    role = Role.query.filter_by(name="user").first()
    if not role:
        raise SystemExit("Role 'user' not found. Run `flask seed-permissions` first.")
    existing = User.query.filter_by(email=email.lower()).first()
    if existing:
        print(f"  SKIP (exists): {email}")
        return existing, existing.profile
    user = User(
        email=email.lower(),
        first_name=first_name,
        last_name=last_name,
        phone=f"+23320{uuid4().hex[:8]}",
        sex="unspecified",
        age_range="25-34",
        role=role,
        is_active=True,
        is_verified=True,
        teacher_service_enabled=True,
        application_id=generate_application_id(),
    )
    user.set_password(DEMO_PASSWORD)
    db.session.add(user)
    db.session.flush()
    ep = extra_profile or {}
    profile = UserProfile(
        user_id=user.id,
        location=ep.get("location", "Accra"),
        teaching_subject=ep.get("teaching_subject", "Mathematics"),
        preferred_level=ep.get("preferred_level", "Senior High / Upper Secondary"),
        preferred_employment_type=ep.get("preferred_employment_type", "Full Time"),
        curriculum_experience=ep.get("curriculum_experience", "GES / NaCCA Curriculum, WASSCE"),
        years_of_experience=ep.get("years_of_experience", 5),
        date_of_birth=date(1995, 6, 15),
        bio=ep.get("bio", "Dedicated educator committed to student success."),
        profile_status=profile_status,
    )
    for k in ("review_notes", "reviewed_by_id", "reviewed_at", "submitted_at", "location",
              "teaching_subject", "preferred_level", "preferred_employment_type", "curriculum_experience",
              "years_of_experience", "bio"):
        if k in ep:
            setattr(profile, k, ep[k])
    db.session.add(profile)
    db.session.flush()
    if profile_status in ("complete", "submitted", "under_review", "revision_required", "verified", "rejected"):
        cv = _create_upload_file(app, user, "cv", f"CV - {first_name} {last_name}")
        cert = _create_upload_file(app, user, "certificate", f"Certificate - {first_name} {last_name}")
        profile.cv_file_id = cv.id
        profile.certificate_file_id = cert.id
    if profile_status in ("submitted", "under_review", "revision_required", "verified", "rejected"):
        if not profile.submitted_at:
            profile.submitted_at = datetime.now(timezone.utc)
    if profile_status in ("under_review", "revision_required", "verified", "rejected"):
        if not profile.reviewed_at:
            profile.reviewed_at = datetime.now(timezone.utc)
        if not profile.reviewed_by_id:
            profile.reviewed_by_id = reviewer_id
    db.session.flush()
    audit_actor = reviewer_id or user.id
    audits = []
    if profile_status in ("submitted", "under_review", "revision_required", "verified", "rejected"):
        audits.append(AuditLog(
            actor_id=audit_actor, action="teacher_profile_submitted",
            entity_type="user", entity_id=str(user.id),
            details={"new_status": "submitted"},
        ))
    if profile_status in ("under_review", "revision_required", "verified", "rejected"):
        audits.append(AuditLog(
            actor_id=reviewer_id, action="teacher_profile_review_started",
            entity_type="user", entity_id=str(user.id),
            details={"new_status": "under_review", "reviewed_by": reviewer_id},
        ))
    if profile_status == "revision_required":
        audits.append(AuditLog(
            actor_id=reviewer_id, action="teacher_profile_revision_requested",
            entity_type="user", entity_id=str(user.id),
            details={"new_status": "revision_required", "reviewed_by": reviewer_id,
                     "review_notes": profile.review_notes},
        ))
    elif profile_status == "verified":
        audits.append(AuditLog(
            actor_id=reviewer_id, action="teacher_profile_visually_verified",
            entity_type="user", entity_id=str(user.id),
            details={"new_status": "verified", "teacher_id": user.teacher_id,
                     "reviewed_by": reviewer_id},
        ))
        if user.teacher_id:
            audits.append(AuditLog(
                actor_id=reviewer_id, action="teacher_id_issued",
                entity_type="user", entity_id=str(user.id),
                details={"teacher_id": user.teacher_id},
            ))
    elif profile_status == "rejected":
        audits.append(AuditLog(
            actor_id=reviewer_id, action="teacher_profile_rejected",
            entity_type="user", entity_id=str(user.id),
            details={"new_status": "rejected", "reviewed_by": reviewer_id,
                     "review_notes": profile.review_notes},
        ))
    for al in audits:
        db.session.add(al)
    db.session.flush()
    return user, profile


# ── Record factories ──────────────────────────────────────────────────────

def _make_incomplete(app, reviewer_id):
    return _create_teacher(app, "teacher.incomplete.001@example.com",
                           "Ama", "Demo Incomplete", "incomplete",
                           extra_profile={
                               "location": "Kumasi",
                               "teaching_subject": None,
                               "preferred_level": None,
                               "preferred_employment_type": None,
                               "curriculum_experience": None,
                               "years_of_experience": None,
                               "bio": None,
                           })


def _make_complete(app, reviewer_id):
    return _create_teacher(app, "teacher.complete.001@example.com",
                           "Yaw", "Demo Complete", "complete")


def _make_submitted(app, reviewer_id):
    return _create_teacher(app, "teacher.submitted.001@example.com",
                           "Ama", "Demo Submitted", "submitted",
                           extra_profile={
                               "bio": "Passionate mathematics educator with 8 years of experience in senior high schools across the Greater Accra Region.",
                               "years_of_experience": 8,
                           })


def _make_under_review(app, reviewer_id):
    return _create_teacher(app, "teacher.under-review.001@example.com",
                           "Kwesi", "Demo Review", "under_review",
                           extra_profile={
                               "location": "Tema",
                               "teaching_subject": "Science, Mathematics",
                               "bio": "Science teacher with a focus on making STEM accessible.",
                               "preferred_level": "Junior High / Lower Secondary, Senior High / Upper Secondary",
                           },
                           reviewer_id=reviewer_id)


def _make_revision_required(app, reviewer_id):
    return _create_teacher(app, "teacher.revision.001@example.com",
                           "Efua", "Demo Revision", "revision_required",
                           extra_profile={
                               "location": "Cape Coast",
                               "teaching_subject": "English Language, Literature",
                               "preferred_level": "Senior High / Upper Secondary",
                               "review_notes": "The name on the certificate does not fully match the profile name.\nPlease confirm the correct name and upload a clearer copy of the certificate.",
                           },
                           reviewer_id=reviewer_id)


def _make_verified(app, reviewer_id):
    user, profile = _create_teacher(app, "teacher.verified.001@example.com",
                                    "Kojo", "Demo Verified", "verified",
                                    extra_profile={
                                        "location": "Accra",
                                        "teaching_subject": "Mathematics, Physics",
                                        "preferred_level": "Senior High / Upper Secondary",
                                    },
                                    reviewer_id=reviewer_id)
    # Only issue a Teacher ID if the account doesn't already have one.
    # This makes the seed idempotent across repeated runs.
    if not user.teacher_id:
        new_id = generate_teacher_id()
        user.teacher_id = new_id
        user.teacher_id_issued_at = datetime.now(timezone.utc)
        db.session.flush()
    return user, profile


def _make_rejected(app, reviewer_id):
    return _create_teacher(app, "teacher.rejected.001@example.com",
                           "Abena", "Demo Rejected", "rejected",
                           extra_profile={
                               "location": "Takoradi",
                               "teaching_subject": "Social Studies",
                               "preferred_level": "Junior High / Lower Secondary",
                               "review_notes": "The submitted certificate does not meet the required verification standards. The document appears to be a statement of result rather than a full certificate. Please upload the official certificate as issued by the awarding body.",
                           },
                           reviewer_id=reviewer_id)


def _make_bookshop_only(app, reviewer_id):
    _create_non_teacher(app, "bookshop.only.001@example.com",
                        "Mensah", "Bookshop Only", bookshop=True)


def _make_ordinary_user(app, reviewer_id):
    _create_non_teacher(app, "ordinary.user.001@example.com",
                        "Akosua", "Ordinary User", bookshop=False)


def _create_non_teacher(app, email, first_name, last_name, bookshop=False):
    existing = User.query.filter_by(email=email).first()
    if existing:
        print(f"  SKIP (exists): {email}")
        return
    role = Role.query.filter_by(name="user").first()
    user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone=f"+23320{uuid4().hex[:8]}",
        role=role,
        is_active=True,
        is_verified=True,
        teacher_service_enabled=False,
        bookshop_service_enabled=bookshop,
    )
    user.set_password(DEMO_PASSWORD)
    db.session.add(user)
    db.session.flush()
    db.session.add(UserProfile(user_id=user.id))
    print(f"  Created {'bookshop-only' if bookshop else 'ordinary'} user: {email}")


# ── Pagination ────────────────────────────────────────────────────────────

def _make_pagination_teachers(app, reviewer_id):
    statuses = ["submitted", "under_review", "revision_required", "submitted", "under_review"]
    count = 0
    for i in range(PAGINATION_COUNT):
        status = statuses[i % len(statuses)]
        email = f"teacher.pagination.{i+1:03d}@example.com"
        extra = {}
        if status in ("under_review", "revision_required"):
            extra["reviewed_by_id"] = reviewer_id
            extra["reviewed_at"] = datetime.now(timezone.utc)
        if status == "revision_required":
            extra["review_notes"] = "Please upload a clearer copy of your certificate for verification."
        _create_teacher(app, email, f"Page{i+1}", "Demo", status, extra_profile=extra, reviewer_id=reviewer_id)
        count += 1
    print(f"  Created {count} pagination teachers.")


# ── Main seed orchestration ──────────────────────────────────────────────

def seed_demo_data(app, with_pagination=False):
    print("=" * 60)
    print("Seeding Teacher Review Demo Data")
    print("=" * 60)
    reviewer_id, reviewer_created = _ensure_reviewer(app)
    print(f"  Reviewer ID: {reviewer_id} (seed-created: {reviewer_created})")
    print("\n--- Creating records ---")
    _make_incomplete(app, reviewer_id)
    _make_complete(app, reviewer_id)
    _make_submitted(app, reviewer_id)
    _make_under_review(app, reviewer_id)
    _make_revision_required(app, reviewer_id)
    _make_verified(app, reviewer_id)
    _make_rejected(app, reviewer_id)
    _make_bookshop_only(app, reviewer_id)
    _make_ordinary_user(app, reviewer_id)
    if with_pagination:
        print("\n--- Pagination mode ---")
        _make_pagination_teachers(app, reviewer_id)
    db.session.commit()
    print("\n--- Verification ---")
    target_emails = _seed_emails(with_pagination=with_pagination)
    seeded = User.query.filter(User.email.in_(target_emails)).order_by(User.email.asc()).all()
    teacher_seeded = [u for u in seeded if u.teacher_service_enabled]
    if teacher_seeded:
        missing_app_ids = [u for u in teacher_seeded if not u.application_id]
        verified_teachers = [u for u in teacher_seeded if u.teacher_id]
        teacher_ids = [u.teacher_id for u in verified_teachers]
        non_unique = [tid for tid in teacher_ids if teacher_ids.count(tid) > 1]
        print(f"  Total seeded accounts: {len(seeded)}")
        print(f"  Teacher-service accounts: {len(teacher_seeded)}")
        print(f"  With Application IDs: {len(teacher_seeded) - len(missing_app_ids)}")
        if missing_app_ids:
            print(f"  WARNING: {len(missing_app_ids)} teacher accounts missing Application IDs")
        if non_unique:
            print(f"  WARNING: Non-unique Teacher IDs: {set(non_unique)}")
        app_ids = [u.application_id for u in teacher_seeded if u.application_id]
        unique_app_ids = set(app_ids)
        if len(app_ids) != len(unique_app_ids):
            print(f"  WARNING: {len(app_ids) - len(unique_app_ids)} duplicate Application IDs")
    else:
        print("  (no teacher-service accounts)")
    print(f"\n{'Name':<30} {'Email':<40} {'App ID':<20} {'Teacher ID':<16} {'Status':<20}")
    print(f"{'-'*30} {'-'*40} {'-'*20} {'-'*16} {'-'*20}")
    for u in seeded:
        name = f"{u.first_name} {u.last_name or ''}"
        status = u.profile.profile_status if u.profile else "N/A"
        tid = u.teacher_id or "-"
        aid = u.application_id or "-"
        print(f"{name:<30} {u.email:<40} {aid:<20} {tid:<16} {status:<20}")
    print(f"\n  Reviewer login: {REVIEWER_EMAIL} / {DEMO_PASSWORD}")
    print(f"  All demo passwords: {DEMO_PASSWORD}")
    print(f"\n--- Completeness check ---")
    from backend.profile_completion import teacher_profile_completion
    for u in seeded:
        if not u.teacher_service_enabled:
            continue
        pct, missing = teacher_profile_completion(u)
        status = u.profile.profile_status if u.profile else "?"
        print(f"  {u.email:<45} status={status:<20} completion={pct}%"
              f"{' MISSING: ' + ', '.join(missing) if missing else ''}")


# ── Entrypoint ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed teacher review demo data")
    parser.add_argument("--confirm-development-seed", action="store_true", required=True)
    parser.add_argument("--with-pagination", action="store_true")
    parser.add_argument("--delete", action="store_true")
    args = parser.parse_args()

    if not args.confirm_development_seed:
        print("ERROR: --confirm-development-seed is required.")
        sys.exit(1)

    # --- SQLite safety gate ---
    raw_db_url = os.environ.get("DATABASE_URL", "").strip()
    if not _is_sqlite(raw_db_url):
        print("ERROR: This seed tool requires a local SQLite database.")
        print(f"  DATABASE_URL={raw_db_url[:80]}")
        print("  Set: $env:DATABASE_URL = \"sqlite:///$PWD/realmindx_local.db\"")
        sys.exit(1)

    app = create_app()
    resolved_uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if not _is_sqlite(resolved_uri):
        print("ERROR: Resolved database URI is not SQLite.")
        print(f"  Resolved: {resolved_uri[:80]}")
        sys.exit(1)

    with app.app_context():
        # Also check FLASK_ENV as defence-in-depth
        env = os.environ.get("FLASK_ENV", "").strip().lower()
        if env == "production":
            print("ERROR: FLASK_ENV=production detected. Refusing to seed.")
            sys.exit(1)

        safe_path = resolved_uri.replace("sqlite:///", "").replace("sqlite://", "")
        print(f"Database type: SQLite")
        print(f"Database path: {safe_path}")
        print(f"Environment:   {env or 'development (default)'}")

        if args.delete:
            _delete_demo_data()
            return

        seed_demo_data(app, with_pagination=args.with_pagination)


if __name__ == "__main__":
    main()
