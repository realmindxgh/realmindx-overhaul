"""Seed disposable local database with test users across all profile states."""
import os
import sys
from datetime import date, datetime, timezone

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend import create_app
from backend.extensions import db
from backend.models import User, Role, UserProfile

app = create_app()
with app.app_context():
    role = Role.query.filter_by(name="user").first()
    if not role:
        role = Role(name="user", description="Teacher / end user")
        db.session.add(role)
        db.session.flush()
        print("Created 'user' role")

    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        admin_role = Role(name="admin", description="Administrator")
        db.session.add(admin_role)
        db.session.flush()
        print("Created 'admin' role")

    now = datetime.now(timezone.utc)

    users_data = [
        # 1. Incomplete — no profile row at all
        {
            "email": "incomplete@test.dev",
            "first_name": "Incomplete",
            "password": "Test@123",
            "profile": None,
        },
        # 2. Incomplete — has profile but empty
        {
            "email": "incomplete2@test.dev",
            "first_name": "Incomplete2",
            "password": "Test@123",
            "profile": {},
        },
        # 3. Complete (100%) — all required fields, not submitted
        {
            "email": "complete@test.dev",
            "first_name": "Complete",
            "password": "Test@123",
            "profile": {
                "location": "Accra",
                "teaching_subject": "Mathematics",
                "preferred_level": "Senior High / Upper Secondary",
                "preferred_employment_type": "Full Time",
                "curriculum_experience": "GES / NaCCA Curriculum",
            },
        },
        # 4. Submitted
        {
            "email": "submitted@test.dev",
            "first_name": "Submitted",
            "password": "Test@123",
            "profile": {
                "location": "Kumasi",
                "teaching_subject": "Physics, Chemistry",
                "preferred_level": "Senior High / Upper Secondary",
                "preferred_employment_type": "Full Time, Part Time",
                "curriculum_experience": "GES / NaCCA Curriculum, Cambridge International",
                "profile_status": "submitted",
                "submitted_at": now,
            },
        },
        # 5. Under review
        {
            "email": "under-review@test.dev",
            "first_name": "UnderReview",
            "password": "Test@123",
            "profile": {
                "location": "Takoradi",
                "teaching_subject": "English Language, Literature",
                "preferred_level": "Junior High / Lower Secondary",
                "preferred_employment_type": "Full Time",
                "curriculum_experience": "GES / NaCCA Curriculum",
                "profile_status": "under_review",
                "submitted_at": now,
            },
        },
        # 6. Revision required
        {
            "email": "revision@test.dev",
            "first_name": "RevisionReq",
            "password": "Test@123",
            "profile": {
                "location": "Cape Coast",
                "teaching_subject": "Social Studies, History",
                "preferred_level": "Senior High / Upper Secondary",
                "preferred_employment_type": "Full Time",
                "curriculum_experience": "GES / NaCCA Curriculum",
                "profile_status": "revision_required",
                "submitted_at": now,
                "review_notes": "Please upload a valid teaching certificate.",
            },
        },
        # 7. Verified
        {
            "email": "verified@test.dev",
            "first_name": "Verified",
            "password": "Test@123",
            "profile": {
                "location": "Accra",
                "teaching_subject": "Mathematics, Further Mathematics",
                "preferred_level": "Senior High / Upper Secondary",
                "preferred_employment_type": "Full Time",
                "curriculum_experience": "GES / NaCCA Curriculum",
                "profile_status": "verified",
                "submitted_at": now,
            },
        },
    ]

    created = 0
    for data in users_data:
        if User.query.filter_by(email=data["email"]).first():
            print(f"  exists: {data['email']}")
            continue

        user = User(
            email=data["email"],
            first_name=data["first_name"],
            last_name="Test",
            phone="+233500000000",
            sex="male",
            age_range="25-34",
            role=role,
            is_verified=True,
            is_active=True,
            phone_verified=True,
        )
        user.set_password(data["password"])
        db.session.add(user)
        db.session.flush()

        if data["profile"] is not None:
            profile_fields = {
                "user_id": user.id,
                "years_of_experience": 3,
                "date_of_birth": date(1995, 6, 15),
                **data["profile"],
            }
            profile = UserProfile(**profile_fields)
            db.session.add(profile)

        created += 1
        print(f"  created: {data['email']}")

    db.session.commit()
    print(f"\nDone. {created} test user(s) created.")

    # Ensure admin account exists
    admin = User.query.filter_by(email="admin@realmindxgh.com").first()
    if not admin:
        admin = User(
            email="admin@realmindxgh.com",
            first_name="Admin",
            role=admin_role,
            is_verified=True,
            is_active=True,
        )
        admin.set_password("Admin@12345")
        db.session.add(admin)
        db.session.commit()
        print("Created admin account: admin@realmindxgh.com")
    else:
        print("Admin account already exists: admin@realmindxgh.com")
