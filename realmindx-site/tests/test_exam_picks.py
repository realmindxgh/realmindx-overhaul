import sys
import unittest
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import Product, ProductCategory


class ExamPicksTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "exam-picks-tests"
    BASE_URL = "https://realmindxgh.com"
    BOOKSHOP_URL = "https://bookshop.realmindxgh.com"
    CORS_ORIGINS = ["https://realmindxgh.com"]
    RATELIMIT_ENABLED = False
    TURNSTILE_SECRET_KEY = ""
    RESEND_API_KEY = ""
    MAIL_SERVER = ""
    MAIL_USERNAME = ""
    MAIL_PASSWORD = ""
    ARKESEL_API_KEY = ""


def _product(name, curriculum, level, category_id=None, is_active=True):
    return Product(
        name=name,
        slug=name.lower().replace(" ", "-"),
        price=10.00,
        curriculum=curriculum,
        level=level,
        category_id=category_id,
        is_active=is_active,
    )


class ExamPicksEndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(ExamPicksTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()

        cat = ProductCategory(name="Books", slug="books", is_active=True)
        db.session.add(cat)
        db.session.flush()
        self.category_id = cat.id

        products = [
            _product("JHS Maths",       "GES / NaCCA Curriculum", "Junior High / Lower Secondary", self.category_id),
            _product("JHS English",     "GES / NaCCA Curriculum", "Junior High / Lower Secondary", self.category_id),
            _product("SHS Core Maths",  "GES / NaCCA Curriculum", "Senior High / Upper Secondary", self.category_id),
            _product("SHS Elective Maths", "GES / NaCCA Curriculum", "Senior High / Upper Secondary", self.category_id),
            _product("Legacy JHS Science", "GES Standard", "JHS", self.category_id),
            _product("Legacy SHS Physics", "GES Standard", "SHS", self.category_id),
            _product("Primary Maths",   "GES / NaCCA Curriculum", "Upper Primary", self.category_id),
            _product("KG Workbook",     "GES / NaCCA Curriculum", "Kindergarten", self.category_id),
            _product("Sixth Form Physics", "GES / NaCCA Curriculum", "Sixth Form / Pre-University", self.category_id),
            _product("Cambridge JHS Science", "Cambridge International Curriculum", "Junior High / Lower Secondary", self.category_id),
            _product("Cambridge SHS Biology", "Cambridge International Curriculum", "Senior High / Upper Secondary", self.category_id),
            _product("All Curricula JHS Book", "All Curricula", "Junior High / Lower Secondary", self.category_id),
            _product("GES All Levels Book", "GES / NaCCA Curriculum", "All Levels", self.category_id),
            _product("All Curricula All Levels", "All Curricula", "All Levels", self.category_id),
            _product("No Curriculum JHS", "", "Junior High / Lower Secondary", self.category_id),
            _product("GES No Level",    "GES / NaCCA Curriculum", "", self.category_id),
            _product("Inactive JHS Book", "GES / NaCCA Curriculum", "Junior High / Lower Secondary", self.category_id, is_active=False),
            _product("Foolscap Notebook", "GES / NaCCA Curriculum", "Stationery", self.category_id),
        ]
        for p in products:
            db.session.add(p)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def _exam_picks(self, qs=""):
        return self.client.get(f"/api/products?exam_picks=1&page=1&per_page=50{qs}")

    def _titles(self, resp):
        return {item["name"] for item in resp.get_json()["items"]}

    def test_includes_bece_products(self):
        resp = self._exam_picks()
        self.assertEqual(resp.status_code, 200)
        titles = self._titles(resp)
        self.assertIn("JHS Maths", titles)
        self.assertIn("JHS English", titles)

    def test_includes_wassce_products(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertIn("SHS Core Maths", titles)
        self.assertIn("SHS Elective Maths", titles)

    def test_includes_documented_local_legacy_taxonomy_values(self):
        titles = self._titles(self._exam_picks())
        self.assertIn("Legacy JHS Science", titles)
        self.assertIn("Legacy SHS Physics", titles)

    def test_excludes_ges_primary(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("Primary Maths", titles)
        self.assertNotIn("KG Workbook", titles)

    def test_excludes_sixth_form(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("Sixth Form Physics", titles)

    def test_excludes_cambridge(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("Cambridge JHS Science", titles)
        self.assertNotIn("Cambridge SHS Biology", titles)

    def test_excludes_all_curricula(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("All Curricula JHS Book", titles)

    def test_excludes_all_levels(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("GES All Levels Book", titles)
        self.assertNotIn("All Curricula All Levels", titles)

    def test_excludes_blank_values(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("No Curriculum JHS", titles)
        self.assertNotIn("GES No Level", titles)

    def test_excludes_stationery(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("Foolscap Notebook", titles)

    def test_excludes_inactive(self):
        resp = self._exam_picks()
        titles = self._titles(resp)
        self.assertNotIn("Inactive JHS Book", titles)

    def test_total_count(self):
        resp = self._exam_picks()
        data = resp.get_json()
        self.assertEqual(data["total"], 6)

    def test_products_endpoint_without_exam_picks_returns_all(self):
        resp = self.client.get("/api/products?page=1&per_page=50")
        data = resp.get_json()
        self.assertGreater(len(data["items"]), 4)

    def test_products_search_matches_canonical_slug(self):
        product = Product.query.filter_by(name="SHS Core Maths").one()
        product.slug = "maths-shs-1"
        db.session.commit()

        resp = self.client.get("/api/products?q=maths-shs-1&page=1&per_page=5")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("SHS Core Maths", self._titles(resp))

    def test_old_individual_picks_return_zero(self):
        """The old slug-based approach should now work because the taxonomy_filter_terms fix
        ensures canonical values are never deduplicated."""
        resp = self.client.get(
            "/api/products?curriculum=ges-nacca-curriculum&level=junior-high-lower-secondary&page=1&per_page=5"
        )
        data = resp.get_json()
        self.assertGreater(len(data["items"]), 0, "BECE picks via slug should work now")

        resp2 = self.client.get(
            "/api/products?curriculum=ges-nacca-curriculum&level=senior-high-upper-secondary&page=1&per_page=5"
        )
        data2 = resp2.get_json()
        self.assertGreater(len(data2["items"]), 0, "WASSCE picks via slug should work now")


if __name__ == "__main__":
    unittest.main()
