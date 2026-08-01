import io
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image
from unittest.mock import patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import AuditLog, Product, ProductCategory, Role, UploadedFile, User


class ProductImageImportTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "admin-product-image-import-tests"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False


def _make_image_bytes(color=(20, 54, 112), size=(600, 800), fmt="PNG"):
    buffer = io.BytesIO()
    Image.new("RGB", size, color=color).save(buffer, format=fmt)
    return buffer.getvalue()


def _build_zip(entries):
    """Build a ZIP in memory. entries: iterable of (path_in_zip, bytes)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries:
            archive.writestr(name, data)
    buffer.seek(0)
    return buffer


class ProductImageImportTests(unittest.TestCase):
    def setUp(self):
        self.upload_root = Path(tempfile.mkdtemp(prefix="rmx-image-import-"))
        ProductImageImportTestConfig.UPLOAD_FOLDER = str(self.upload_root)
        self.app = create_app(ProductImageImportTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

        admin_role = Role(name="admin", description="Admin")
        admin = User(
            email="admin@realmindxgh.com",
            first_name="Admin",
            last_name="User",
            role=admin_role,
            is_active=True,
            is_verified=True,
        )
        admin.set_password("AdminPassword123!")
        db.session.add_all([admin_role, admin])
        db.session.commit()
        self.admin = admin
        self.client = self.app.test_client()
        response = self.client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"})
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()
        shutil.rmtree(self.upload_root, ignore_errors=True)

    def _write_upload(self, original_filename, data, color=None):
        image_dir = self.upload_root / "public" / "images"
        image_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"stored-{len(data)}.png"
        target = image_dir / stored_name
        target.write_bytes(data)
        uploaded = UploadedFile(
            owner_id=self.admin.id,
            original_filename=original_filename,
            stored_filename=stored_name,
            storage_path=str(target),
            mime_type="image/png",
            size_bytes=len(data),
            category="images",
            visibility="public",
        )
        db.session.add(uploaded)
        db.session.flush()
        return uploaded

    def _make_product(self, name, slug, price, uploaded, category_name="Maths"):
        category = ProductCategory.query.filter_by(name=category_name).first()
        if not category:
            category = ProductCategory(name=category_name, slug=category_name.lower())
            db.session.add(category)
            db.session.flush()
        product = Product(
            name=name,
            slug=slug,
            price=price,
            category=category,
            is_active=True,
            image_file=uploaded,
            stock_status="in_stock",
            quantity_available=10,
            publisher="Test Publisher",
        )
        db.session.add(product)
        db.session.flush()
        return product

    def test_preview_matches_filenames_case_insensitively(self):
        alpha = self._write_upload("alpha.jpg", _make_image_bytes((200, 30, 30)))
        beta = self._write_upload("beta_cover.png", _make_image_bytes((30, 200, 30)))
        product_a = self._make_product("Alpha Book", "alpha-book", 10, alpha)
        product_b = self._make_product("Beta Book", "beta-book", 12, beta)
        db.session.commit()

        zip_buffer = _build_zip([
            ("covers/ALPHA.JPG", _make_image_bytes((210, 30, 30))),
            ("covers/beta cover.png", _make_image_bytes((30, 210, 30))),
        ])
        response = self.client.post(
            "/api/admin/products/import/images/preview",
            data={"images_zip": (zip_buffer, "images.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["matched_count"], 2)
        self.assertEqual(data["unmatched_count"], 0)
        self.assertEqual(data["invalid_count"], 0)
        self.assertEqual(data["duplicate_count"], 0)

        matched_ids = {item["product_id"] for item in data["matched"]}
        self.assertEqual(matched_ids, {product_a.id, product_b.id})
        by_id = {item["product_id"]: item for item in data["matched"]}
        self.assertTrue(by_id[product_a.id]["existing_image_url"].startswith("/uploads/"))
        self.assertEqual(by_id[product_a.id]["current_image_filename"], "alpha.jpg")

    def test_preview_reports_unmatched_invalid_duplicates_and_traversal(self):
        self._write_upload("alpha.jpg", _make_image_bytes((200, 30, 30)))
        db.session.commit()
        self._make_product("Alpha Book", "alpha-book", 10, UploadedFile.query.filter_by(original_filename="alpha.jpg").first())
        db.session.commit()

        zip_buffer = _build_zip([
            ("images/alpha.jpg", _make_image_bytes((210, 30, 30))),
            ("images/alpha.jpg", _make_image_bytes((220, 30, 30))),
            ("images/unknown.png", _make_image_bytes((30, 30, 30))),
            ("images/notes.txt", b"not an image"),
            ("images/../../evil.jpg", _make_image_bytes((30, 30, 30))),
        ])
        response = self.client.post(
            "/api/admin/products/import/images/preview",
            data={"images_zip": (zip_buffer, "images.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["matched_count"], 1)
        self.assertEqual(data["unmatched_count"], 1)
        self.assertEqual(data["invalid_count"], 2)
        self.assertEqual(data["duplicate_count"], 1)
        invalid_names = {item["filename"] for item in data["invalid_files"]}
        self.assertIn("notes.txt", invalid_names)
        self.assertIn("images/../../evil.jpg", invalid_names)
        self.assertEqual(data["unmatched"][0]["filename"], "unknown.png")

    def test_preview_ambiguous_shared_filename_is_not_matched(self):
        self._write_upload("shared.jpg", _make_image_bytes((200, 30, 30)))
        self._write_upload("shared.jpg", _make_image_bytes((200, 30, 31)))
        self._make_product("First Book", "first-book", 10, UploadedFile.query.filter_by(original_filename="shared.jpg").first())
        second_upload = UploadedFile.query.filter_by(original_filename="shared.jpg").all()[1]
        self._make_product("Second Book", "second-book", 11, second_upload)
        db.session.commit()

        zip_buffer = _build_zip([("shared.jpg", _make_image_bytes((210, 30, 30)))])
        response = self.client.post(
            "/api/admin/products/import/images/preview",
            data={"images_zip": (zip_buffer, "images.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["matched_count"], 0)
        self.assertEqual(data["duplicate_count"], 1)

    def test_preview_rejects_corrupt_zip_and_missing_file(self):
        response = self.client.post(
            "/api/admin/products/import/images/preview",
            data={"images_zip": (io.BytesIO(b"this is not a zip"), "images.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/api/admin/products/import/images/preview",
            data={},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    def test_import_updates_selected_products_only_and_keeps_catalogue_fields(self):
        alpha = self._write_upload("alpha.jpg", _make_image_bytes((200, 30, 30)))
        beta = self._write_upload("beta.jpg", _make_image_bytes((30, 200, 30)))
        product_a = self._make_product("Alpha Book", "alpha-book", 10, alpha)
        product_b = self._make_product("Beta Book", "beta-book", 12, beta)
        db.session.commit()
        old_a_image_id = product_a.image_file_id
        old_b_image_id = product_b.image_file_id
        old_name = product_b.name
        old_price = product_b.price
        old_publisher = product_b.publisher

        zip_buffer = _build_zip([
            ("images/ALPHA.JPG", _make_image_bytes((250, 40, 40))),
            ("images/beta.jpg", _make_image_bytes((40, 250, 40))),
        ])
        response = self.client.post(
            "/api/admin/products/import/images",
            data={
                "images_zip": (zip_buffer, "images.zip"),
                "product_ids": json.dumps([product_a.id]),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["updated"], 1)

        db.session.refresh(product_a)
        db.session.refresh(product_b)
        self.assertNotEqual(product_a.image_file_id, old_a_image_id)
        self.assertEqual(product_b.image_file_id, old_b_image_id)
        self.assertEqual(product_b.name, old_name)
        self.assertEqual(product_b.price, old_price)
        self.assertEqual(product_b.publisher, old_publisher)
        self.assertEqual(product_a.name, "Alpha Book")
        self.assertEqual(product_a.price, 10)
        self.assertEqual(product_a.publisher, "Test Publisher")
        self.assertEqual(product_a.image_original_file_id, product_a.image_file_id)

        audit_row = AuditLog.query.filter_by(action="update_product_images").first()
        self.assertIsNotNone(audit_row)
        self.assertEqual(audit_row.details["updated"], 1)

        # Only the selected product's image should exist as a new upload
        # (variants are also UploadedFile rows, so match on the new filename).
        new_image_rows = UploadedFile.query.filter(UploadedFile.original_filename == "ALPHA.JPG").all()
        self.assertEqual(len(new_image_rows), 1)
        self.assertTrue(Path(new_image_rows[0].storage_path).exists())

    def test_import_replaces_images_for_many_products(self):
        products = []
        for index in range(20):
            upload = self._write_upload(f"book-{index}.png", _make_image_bytes((30, 30, 30)))
            products.append(self._make_product(f"Book {index}", f"book-{index}", 5 + index, upload))
        db.session.commit()
        old_ids = [product.image_file_id for product in products]

        zip_buffer = _build_zip([
            (f"images/book-{index}.png", _make_image_bytes((35, 35, 35))) for index in range(20)
        ])
        response = self.client.post(
            "/api/admin/products/import/images",
            data={
                "images_zip": (zip_buffer, "images.zip"),
                "product_ids": json.dumps([product.id for product in products]),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["updated"], 20)

        for product, old_id in zip(products, old_ids):
            db.session.refresh(product)
            self.assertNotEqual(product.image_file_id, old_id)

    def test_import_requires_selection_and_rejects_corrupt_zip(self):
        response = self.client.post(
            "/api/admin/products/import/images",
            data={"images_zip": (io.BytesIO(b"not a zip"), "images.zip"), "product_ids": json.dumps([1])},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

        zip_buffer = _build_zip([("alpha.jpg", _make_image_bytes((30, 30, 30)))])
        response = self.client.post(
            "/api/admin/products/import/images",
            data={"images_zip": (zip_buffer, "images.zip"), "product_ids": json.dumps([])},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    def test_import_failure_rolls_back_and_removes_saved_files(self):
        alpha = self._write_upload("alpha.jpg", _make_image_bytes((200, 30, 30)))
        beta = self._write_upload("beta.jpg", _make_image_bytes((30, 200, 30)))
        product_a = self._make_product("Alpha Book", "alpha-book", 10, alpha)
        product_b = self._make_product("Beta Book", "beta-book", 12, beta)
        db.session.commit()
        old_a_image_id = product_a.image_file_id
        old_b_image_id = product_b.image_file_id
        files_before = set(self.upload_root.rglob("*"))

        from backend.api import admin as admin_module

        real_ensure = admin_module.ensure_product_image_variants
        calls = {"count": 0}

        def flaky_ensure(product, **kwargs):
            calls["count"] += 1
            if calls["count"] > 1:
                raise RuntimeError("simulated variant failure")
            return real_ensure(product, **kwargs)

        zip_buffer = _build_zip([
            ("images/alpha.jpg", _make_image_bytes((250, 40, 40))),
            ("images/beta.jpg", _make_image_bytes((40, 250, 40))),
        ])
        with patch.object(admin_module, "ensure_product_image_variants", side_effect=flaky_ensure):
            response = self.client.post(
                "/api/admin/products/import/images",
                data={
                    "images_zip": (zip_buffer, "images.zip"),
                    "product_ids": json.dumps([product_a.id, product_b.id]),
                },
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 500)

        db.session.refresh(product_a)
        db.session.refresh(product_b)
        self.assertEqual(product_a.image_file_id, old_a_image_id)
        self.assertEqual(product_b.image_file_id, old_b_image_id)
        self.assertEqual(product_a.name, "Alpha Book")
        self.assertEqual(product_b.price, 12)

        files_after = set(self.upload_root.rglob("*"))
        new_files = files_after - files_before
        self.assertEqual(new_files, set(), "Failed import must not leave files behind")

    def test_import_does_not_create_new_products(self):
        alpha = self._write_upload("alpha.jpg", _make_image_bytes((200, 30, 30)))
        product_a = self._make_product("Alpha Book", "alpha-book", 10, alpha)
        db.session.commit()
        product_count_before = Product.query.count()

        zip_buffer = _build_zip([
            ("images/alpha.jpg", _make_image_bytes((250, 40, 40))),
            ("images/never-seen.jpg", _make_image_bytes((40, 40, 40))),
        ])
        response = self.client.post(
            "/api/admin/products/import/images",
            data={
                "images_zip": (zip_buffer, "images.zip"),
                "product_ids": json.dumps([product_a.id]),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Product.query.count(), product_count_before)

    def test_catalogue_import_still_works_with_normalised_image_keys(self):
        self._write_upload("alpha.jpg", _make_image_bytes((200, 30, 30)))
        db.session.commit()

        zip_buffer = _build_zip([("images/ALPHA.JPG", _make_image_bytes((250, 40, 40)))])
        response = self.client.post(
            "/api/admin/products/import",
            data={
                "catalog_file": (io.BytesIO(b"name,slug,price,image_filename\nImported Book,imported-book,15,alpha.jpg"), "catalogue.csv"),
                "images_zip": (zip_buffer, "images.zip"),
                "column_mapping": json.dumps({
                    "name": "name", "slug": "slug", "price": "price", "image_filename": "image_filename",
                }),
                "overwrite_slugs": json.dumps([]),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["imported"], 1)
        self.assertEqual(data["images_saved"], 1)

        imported = Product.query.filter_by(slug="imported-book").first()
        self.assertIsNotNone(imported)
        self.assertIsNotNone(imported.image_file_id)
        self.assertEqual(imported.image_file.original_filename, "ALPHA.JPG")


if __name__ == "__main__":
    unittest.main()
