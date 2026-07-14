import os
import sys
from datetime import date

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend import create_app
from backend.extensions import db
from backend.models import User, Role, UserProfile

app = create_app()
with app.app_context():
    role = Role.query.filter_by(name='user').first()
    if not role:
        raise SystemExit('Role user not found')

    email = 'teacher@realmindxgh.local'
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(
            email=email,
            first_name='Shadrach',
            last_name='Asante',
            phone='+233208895535',
            sex='male',
            age_range='25-34',
            role=role,
            is_verified=True,
            is_active=True,
        )
        user.set_password('Teacher@123')
        db.session.add(user)
        db.session.flush()
        profile = UserProfile(
            user_id=user.id,
            location='Accra',
            teaching_subject='Mathematics',
            preferred_level='Kindergarten, Senior High / Upper Secondary',
            preferred_employment_type='Full Time, Part Time',
            available_from='After Current Term',
            curriculum_experience='GES / NaCCA Curriculum, Cambridge International Curriculum',
            preferred_locations='Madina, Adenta, Adenta Housing Down, Adenta Housing Up, Oyarifa, Oyibi, Abeka',
            bio='Experienced mathematics teacher with proven results in both senior high and primary school settings.',
            next_of_kin_name='Ama Mansah',
            next_of_kin_phone='0201166122',
            next_of_kin_relationship='Sibling',
            next_of_kin_email='realmindxgh@gmail.com',
            years_of_experience=4,
            date_of_birth=date(1998, 1, 1),
        )
        db.session.add(profile)
        db.session.commit()
        print('Created teacher account:', email)
    else:
        print('Teacher account already exists:', email)
