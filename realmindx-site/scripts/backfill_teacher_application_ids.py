"""One-time backfill: generate application IDs for existing teacher accounts.

Run after migration 0048 has been applied.

Usage:
    cd realmindx-site
    $env:DATABASE_URL = "sqlite:///$PWD/realmindx_local.db"
    $env:FLASK_APP = "backend:create_app"
    $env:FLASK_ENV = "development"
    & .venv\\Scripts\\python.exe scripts/backfill_teacher_application_ids.py

This script is safe to re-run: it skips users that already have an
application_id.  It does NOT generate permanent teacher IDs.
"""

import sys
import os

# Ensure the parent of backend/ is on sys.path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import create_app
from backend.extensions import db
from backend.models import User, Role
from backend.teacher_ids import generate_application_id

app = create_app()


def main():
    with app.app_context():
        teachers = (
            User.query.join(Role)
            .filter(
                Role.name == "user",
                User.teacher_service_enabled.is_(True),
                User.application_id.is_(None),
            )
            .order_by(User.created_at.asc())
            .all()
        )

        if not teachers:
            print("No teachers found without application IDs. Nothing to do.")
            return

        print(f"Found {len(teachers)} teacher(s) without application IDs. Generating...")

        count = 0
        for user in teachers:
            try:
                user.application_id = generate_application_id()
                count += 1
            except Exception as exc:
                print(f"  ERROR assigning ID to user {user.id} ({user.email}): {exc}")
                db.session.rollback()
                return

        db.session.commit()
        print(f"Done. Assigned application IDs to {count} teacher(s).")


if __name__ == "__main__":
    main()
