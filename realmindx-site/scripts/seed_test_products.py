"""
Seed 50+ test products into the local database using its configured DATABASE_URL.
Run from realmindx-site/ with:
  $env:DATABASE_URL = "sqlite:///$PWD/realmindx_local.db"
  $env:FLASK_APP = "backend:create_app"
  $env:FLASK_ENV = "development"
  & .venv\Scripts\python.exe scripts\seed_test_products.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import create_app
from backend.extensions import db
from backend.models import ProductCategory, Product, SiteSetting
from decimal import Decimal
from datetime import datetime, timezone

app = create_app()

CATEGORIES = [
    {"name": "Textbooks", "slug": "textbooks", "description": "Academic textbooks for all levels"},
    {"name": "Fiction", "slug": "fiction", "description": "Novels and fiction books"},
    {"name": "Educational Resources", "slug": "educational-resources", "description": "Learning aids and reference materials"},
    {"name": "Children's Books", "slug": "childrens-books", "description": "Books for young readers"},
    {"name": "Stationery", "slug": "stationery", "description": "Writing materials and supplies"},
    {"name": "Professional Development", "slug": "professional-development", "description": "Career and skill development books"},
]

# Shared public contact settings are used by both the main site and Bookshop.
# Keeping them unscoped makes the footer, contact, checkout and support pages
# display one canonical set of details across the two public experiences.
CONTACT_SETTINGS = {
    "contact_email": "info@realmindxgh.com",
    "contact_phone_1": "+233 55 803 9190",
    "contact_phone_2": "+233 55 452 9493",
    "contact_phone_3": "+233 55 132 4729",
    "contact_address": "Dome Pillar 2, Accra, Ghana",
    "working_hours_weekday": "Monday - Friday: 8:00am - 5:00pm",
    "working_hours_saturday": "Saturday: 9:00am - 1:00pm",
    "contact_map_embed": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3970.4149449183387!2d-0.21959702603021514!3d5.652959532669197!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xfdf9d0d971fa545%3A0xb6793ef61afc720f!2sDome%20pillar%202!5e0!3m2!1sen!2sgh!4v1780224663665!5m2!1sen!2sgh",
}

PRODUCTS = [
    # Textbooks (category 1)
    {"name": "Mathematics for Senior High Schools", "slug": "maths-shs-1", "price": "85.00", "author": "Dr. Kofi Asante", "publisher": "Ghana Education Service", "subject": "Mathematics", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 50, "product_type": "physical", "category_idx": 0},
    {"name": "Integrated Science for JHS", "slug": "science-jhs-1", "price": "65.00", "author": "Prof. Esi Mensah", "publisher": "Ministry of Education", "subject": "Science", "level": "Junior High / Lower Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 120, "product_type": "physical", "category_idx": 0},
    {"name": "English Language for Primary Schools", "slug": "english-primary-3", "price": "45.00", "author": "Grace Oduro", "publisher": "Sedco Publishing", "subject": "English", "level": "Primary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 200, "product_type": "physical", "category_idx": 0},
    {"name": "Social Studies for JHS 1-3", "slug": "social-studies-jhs", "price": "55.00", "author": "Samuel Adjei", "publisher": "Akoma Publications", "subject": "Social Studies", "level": "Junior High / Lower Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 80, "product_type": "physical", "category_idx": 0},
    {"name": "Core Mathematics for WASSCE", "slug": "core-maths-wassce", "price": "95.00", "author": "A. A. Asare", "publisher": "Aki-Ola Publications", "subject": "Mathematics", "level": "Senior High / Upper Secondary", "curriculum": "WASSCE", "stock_status": "in_stock", "quantity_available": 150, "product_type": "physical", "category_idx": 0},
    {"name": "Elective Physics for SHS", "slug": "physics-shs", "price": "110.00", "author": "Dr. James Ayew", "publisher": "Unimax Macmillan", "subject": "Physics", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "out_of_stock", "quantity_available": 0, "product_type": "physical", "category_idx": 0},
    {"name": "Chemistry for SHS 1-3", "slug": "chemistry-shs", "price": "105.00", "author": "Dr. Mary Asare", "publisher": "Ghana Education Service", "subject": "Science", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 60, "product_type": "physical", "category_idx": 0},
    {"name": "Biology for Senior High Schools", "slug": "biology-shs", "price": "100.00", "author": "Prof. Nana Agyeman", "publisher": "Ministry of Education", "subject": "Science", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 90, "product_type": "physical", "category_idx": 0},
    {"name": "Principles of Accounting", "slug": "principles-accounting", "price": "120.00", "author": "P. K. Osei", "publisher": "Aki-Ola Publications", "subject": "Business", "level": "Senior High / Upper Secondary", "curriculum": "WASSCE", "stock_status": "in_stock", "quantity_available": 75, "product_type": "physical", "category_idx": 0},
    {"name": "Government for SHS", "slug": "government-shs", "price": "80.00", "author": "Emmanuel Tetteh", "publisher": "Sedco Publishing", "subject": "Social Studies", "level": "Senior High / Upper Secondary", "curriculum": "WASSCE", "stock_status": "in_stock", "quantity_available": 45, "product_type": "physical", "category_idx": 0},
    {"name": "Geography for SHS", "slug": "geography-shs", "price": "78.00", "author": "Dr. Akosua Frempong", "publisher": "Unimax Macmillan", "subject": "Social Studies", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 30, "product_type": "physical", "category_idx": 0},
    {"name": "Literature in English for SHS", "slug": "literature-shs", "price": "70.00", "author": "Prof. Ama Ata Aidoo", "publisher": "Ghana Education Service", "subject": "English", "level": "Senior High / Upper Secondary", "curriculum": "WASSCE", "stock_status": "out_of_stock", "quantity_available": 0, "product_type": "physical", "category_idx": 0},
    {"name": "Home Economics for JHS", "slug": "home-economics-jhs", "price": "60.00", "author": "Beatrice Ankrah", "publisher": "Ministry of Education", "subject": "Vocational", "level": "Junior High / Lower Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 100, "product_type": "physical", "category_idx": 0},
    {"name": "French for Primary Schools", "slug": "french-primary", "price": "50.00", "author": "Jean-Claude Koffi", "publisher": "Langue Francaise Ed.", "subject": "French", "level": "Primary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 65, "product_type": "physical", "category_idx": 0},
    {"name": "ICT for SHS", "slug": "ict-shs", "price": "90.00", "author": "Dr. Kwame Nkrumah Jr.", "publisher": "TechWorld Publishers", "subject": "Computing", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 110, "product_type": "physical", "category_idx": 0},
    # Fiction (category 2)
    {"name": "The Beautyful Ones Are Not Yet Born", "slug": "beautyful-ones", "price": "55.00", "author": "Ayi Kwei Armah", "publisher": "Heinemann", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 40, "product_type": "physical", "category_idx": 1},
    {"name": "Weep Not Child", "slug": "weep-not-child", "price": "45.00", "author": "Ngũgĩ wa Thiong'o", "publisher": "Penguin Books", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 35, "product_type": "physical", "category_idx": 1},
    {"name": "Things Fall Apart", "slug": "things-fall-apart", "price": "50.00", "author": "Chinua Achebe", "publisher": "Heinemann", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 25, "product_type": "physical", "category_idx": 1},
    {"name": "The River Between", "slug": "river-between", "price": "42.00", "author": "Ngũgĩ wa Thiong'o", "publisher": "Penguin Books", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 20, "product_type": "physical", "category_idx": 1},
    {"name": "Harvest of Corruption", "slug": "harvest-corruption", "price": "48.00", "author": "Frank Ogodo Ogbeche", "publisher": "African First Publishers", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 55, "product_type": "physical", "category_idx": 1},
    {"name": "The Dilemma of a Ghost", "slug": "dilemma-ghost", "price": "40.00", "author": "Ama Ata Aidoo", "publisher": "Longman", "subject": "Drama", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 15, "product_type": "physical", "category_idx": 1},
    {"name": "Faceless", "slug": "faceless", "price": "52.00", "author": "Amma Darko", "publisher": "Sub-Saharan Publishers", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 70, "product_type": "physical", "category_idx": 1},
    {"name": "The African Child", "slug": "african-child", "price": "35.00", "author": "Camara Laye", "publisher": "Collins", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "out_of_stock", "quantity_available": 0, "product_type": "physical", "category_idx": 1},
    {"name": "Anthills of the Savannah", "slug": "anthills-savannah", "price": "58.00", "author": "Chinua Achebe", "publisher": "Heinemann", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 18, "product_type": "physical", "category_idx": 1},
    {"name": "Sozaboy", "slug": "sozaboy", "price": "38.00", "author": "Ken Saro-Wiwa", "publisher": "Longman", "subject": "Literature", "level": "General", "curriculum": None, "stock_status": "in_stock", "quantity_available": 12, "product_type": "physical", "category_idx": 1},
    # Educational Resources (category 3)
    {"name": "Map of Ghana (Wall Chart)", "slug": "map-ghana-wall", "price": "25.00", "author": "Survey Department", "publisher": "Ghana Map Publishers", "subject": "Geography", "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 200, "product_type": "physical", "category_idx": 2},
    {"name": "Periodic Table Poster", "slug": "periodic-table-poster", "price": "30.00", "author": "Science Teachers Assn.", "publisher": "EduMedia Ghana", "subject": "Science", "level": "Senior High / Upper Secondary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 150, "product_type": "physical", "category_idx": 2},
    {"name": "Mathematics Set (Geometry)", "slug": "maths-set-geometry", "price": "35.00", "author": None, "publisher": "OfficeMart Ghana", "subject": "Mathematics", "level": "Junior High / Lower Secondary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 300, "product_type": "physical", "category_idx": 2},
    {"name": "Scientific Calculator (Casio fx-991)", "slug": "casio-fx991", "price": "180.00", "author": None, "publisher": "Casio", "subject": "Mathematics", "level": "Senior High / Upper Secondary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 85, "product_type": "physical", "category_idx": 2},
    {"name": "World Map (Political)", "slug": "world-map-political", "price": "28.00", "author": None, "publisher": "Globe Publishers", "subject": "Geography", "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 95, "product_type": "physical", "category_idx": 2},
    {"name": "Chemistry Lab Apparatus Kit", "slug": "chem-lab-kit", "price": "250.00", "author": None, "publisher": "LabTech Ghana", "subject": "Science", "level": "Senior High / Upper Secondary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 20, "product_type": "physical", "category_idx": 2},
    {"name": "Algebra Formula Flash Cards", "slug": "algebra-flash-cards", "price": "22.00", "author": "Maths Made Easy", "publisher": "EduMedia Ghana", "subject": "Mathematics", "level": "Junior High / Lower Secondary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 180, "product_type": "physical", "category_idx": 2},
    {"name": "English Grammar Handbook", "slug": "english-grammar-handbook", "price": "42.00", "author": "E. S. Odoi", "publisher": "Sedco Publishing", "subject": "English", "level": "Senior High / Upper Secondary", "curriculum": "GES / NaCCA Curriculum", "stock_status": "in_stock", "quantity_available": 75, "product_type": "physical", "category_idx": 2},
    # Children's Books (category 4)
    {"name": "Sosu's Call", "slug": "sosus-call", "price": "32.00", "author": "Meshack Asare", "publisher": "Sub-Saharan Publishers", "subject": "Children's Fiction", "level": "Primary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 50, "product_type": "physical", "category_idx": 3},
    {"name": "The Golden Bead", "slug": "golden-bead", "price": "28.00", "author": "Meshack Asare", "publisher": "Sub-Saharan Publishers", "subject": "Children's Fiction", "level": "Primary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 40, "product_type": "physical", "category_idx": 3},
    {"name": "Ananse and the Pot of Wisdom", "slug": "ananse-pot-wisdom", "price": "25.00", "author": "Nana K. A. Busia", "publisher": "Afram Publications", "subject": "Folklore", "level": "Primary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 100, "product_type": "physical", "category_idx": 3},
    {"name": "Kofi and the Missing Homework", "slug": "kofi-missing-homework", "price": "22.00", "author": "Yvonne A. Osei", "publisher": "Smart Kids Press", "subject": "Children's Fiction", "level": "Primary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 60, "product_type": "physical", "category_idx": 3},
    {"name": "ABC Colouring Book", "slug": "abc-colouring", "price": "15.00", "author": None, "publisher": "EduMedia Ghana", "subject": "Early Learning", "level": "Pre-School / Nursery", "curriculum": None, "stock_status": "in_stock", "quantity_available": 250, "product_type": "physical", "category_idx": 3},
    {"name": "Numbers 1-100 Workbook", "slug": "numbers-workbook", "price": "18.00", "author": "M. Ani", "publisher": "EduMedia Ghana", "subject": "Mathematics", "level": "Primary", "curriculum": None, "stock_status": "out_of_stock", "quantity_available": 0, "product_type": "physical", "category_idx": 3},
    {"name": "Wild Animals of Ghana", "slug": "wild-animals-ghana", "price": "35.00", "author": "Dr. Yaw Osei", "publisher": "NatureWise Books", "subject": "Science", "level": "Primary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 45, "product_type": "physical", "category_idx": 3},
    {"name": "Mansa and the Magic Drum", "slug": "mansa-magic-drum", "price": "30.00", "author": "Adwoa B. Adjei", "publisher": "Smart Kids Press", "subject": "Children's Fiction", "level": "Primary", "curriculum": None, "stock_status": "in_stock", "quantity_available": 55, "product_type": "physical", "category_idx": 3},
    # Stationery (category 5) - first product already exists, add more
    {"name": "A4 Exercise Books (Pack of 5)", "slug": "a4-exercise-books-5pk", "price": "20.00", "author": None, "publisher": "OfficeMart Ghana", "subject": None, "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 500, "product_type": "physical", "category_idx": 4},
    {"name": "BIC Ballpoint Pens (Pack of 10)", "slug": "bic-pens-10pk", "price": "12.00", "author": None, "publisher": "BIC", "subject": None, "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 1000, "product_type": "physical", "category_idx": 4},
    {"name": "Pencil Set with Eraser (Pack of 12)", "slug": "pencil-set-12pk", "price": "15.00", "author": None, "publisher": "Staedtler", "subject": None, "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 600, "product_type": "physical", "category_idx": 4},
    {"name": "Highlighters (Assorted, Pack of 6)", "slug": "highlighters-6pk", "price": "18.00", "author": None, "publisher": "Sharpie", "subject": None, "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 300, "product_type": "physical", "category_idx": 4},
    {"name": "Glue Stick (Pack of 5)", "slug": "glue-stick-5pk", "price": "10.00", "author": None, "publisher": "Pritt", "subject": None, "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 400, "product_type": "physical", "category_idx": 4},
    {"name": "A4 Ruled Notebook (Hard Cover)", "slug": "a4-notebook-hardcover", "price": "28.00", "author": None, "publisher": "OfficeMart Ghana", "subject": None, "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 150, "product_type": "physical", "category_idx": 4},
    {"name": "Ruler Set (Geometry)", "slug": "ruler-set-geometry", "price": "8.00", "author": None, "publisher": "OfficeMart Ghana", "subject": "Mathematics", "level": "All Levels", "curriculum": None, "stock_status": "in_stock", "quantity_available": 350, "product_type": "physical", "category_idx": 4},
    # Professional Development (category 6)
    {"name": "The 7 Habits of Highly Effective People", "slug": "7-habits", "price": "75.00", "author": "Stephen R. Covey", "publisher": "FranklinCovey", "subject": "Self-Help", "level": "Adult", "curriculum": None, "stock_status": "in_stock", "quantity_available": 30, "product_type": "physical", "category_idx": 5},
    {"name": "How to Win Friends and Influence People", "slug": "win-friends", "price": "55.00", "author": "Dale Carnegie", "publisher": "Simon & Schuster", "subject": "Self-Help", "level": "Adult", "curriculum": None, "stock_status": "in_stock", "quantity_available": 45, "product_type": "physical", "category_idx": 5},
    {"name": "Lean Startup: How to Build a Business", "slug": "lean-startup", "price": "68.00", "author": "Eric Ries", "publisher": "Crown Business", "subject": "Business", "level": "Adult", "curriculum": None, "stock_status": "in_stock", "quantity_available": 22, "product_type": "physical", "category_idx": 5},
    {"name": "Public Speaking for Professionals", "slug": "public-speaking", "price": "48.00", "author": "Dr. Kwesi Anning", "publisher": "Accra Press", "subject": "Communication", "level": "Adult", "curriculum": None, "stock_status": "out_of_stock", "quantity_available": 0, "product_type": "physical", "category_idx": 5},
    {"name": "Project Management Fundamentals", "slug": "project-management", "price": "82.00", "author": "Harold Kerzner", "publisher": "Wiley", "subject": "Business", "level": "Adult", "curriculum": None, "stock_status": "in_stock", "quantity_available": 15, "product_type": "physical", "category_idx": 5},
    {"name": "Effective Classroom Management", "slug": "classroom-management", "price": "62.00", "author": "Prof. Ama Serwaa", "publisher": "Ghana Education Service", "subject": "Education", "level": "Adult", "curriculum": None, "stock_status": "in_stock", "quantity_available": 40, "product_type": "physical", "category_idx": 5},
]

def seed():
    with app.app_context():
        for key, value in CONTACT_SETTINGS.items():
            setting = SiteSetting.query.filter_by(key=key).first()
            if not setting:
                setting = SiteSetting(key=key)
                db.session.add(setting)
            setting.value = value
            setting.public = True

        # Create categories (skip "Stationery" since it already exists)
        existing_slugs = {c.slug for c in ProductCategory.query.all()}
        cat_map = {}
        for cat in ProductCategory.query.all():
            cat_map[cat.slug] = cat.id

        for cat_data in CATEGORIES:
            if cat_data["slug"] not in existing_slugs:
                cat = ProductCategory(**cat_data)
                db.session.add(cat)
                db.session.flush()
                cat_map[cat.slug] = cat.id
                print(f"  Created category: {cat.name}")
            else:
                print(f"  Category exists: {cat_data['name']}")

        # Track categories by index
        cat_slugs = [c["slug"] for c in CATEGORIES]
        cat_by_idx = {i: cat_map[slug] for i, slug in enumerate(cat_slugs)}

        existing_slugs = {p.slug for p in Product.query.all()}
        count = 0
        for prod in PRODUCTS:
            if prod["slug"] in existing_slugs:
                print(f"  Skipping existing product: {prod['name']}")
                continue
            category_id = cat_by_idx[prod["category_idx"]]
            p = Product(
                category_id=category_id,
                name=prod["name"],
                slug=prod["slug"],
                price=Decimal(prod["price"]),
                author=prod.get("author"),
                publisher=prod["publisher"],
                subject=prod.get("subject"),
                level=prod.get("level"),
                curriculum=prod.get("curriculum"),
                stock_status=prod["stock_status"],
                quantity_available=prod["quantity_available"],
                product_type=prod["product_type"],
                short_description=f"A quality {prod['name']} for students and educators.",
                is_active=True,
                tags=[],
            )
            db.session.add(p)
            count += 1

        db.session.commit()
        print(f"\nSeeded {count} new products.")
        total = Product.query.filter_by(is_active=True).count()
        print(f"Total active products in local DB: {total}")

if __name__ == "__main__":
    seed()
