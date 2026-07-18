import shutil
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.image_variants import ensure_product_image_variants, resolve_uploaded_path
from backend.models import Product, UploadedFile


class ProductImageVariantTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "product-image-variant-tests"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False


class ProductImageVariantTests(unittest.TestCase):
    def setUp(self):
        self.upload_root = Path(tempfile.mkdtemp(prefix="rmx-product-images-"))
        ProductImageVariantTestConfig.UPLOAD_FOLDER = str(self.upload_root)
        self.app = create_app(ProductImageVariantTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()
        shutil.rmtree(self.upload_root, ignore_errors=True)

    def test_generates_webp_thumb_and_medium_without_replacing_original(self):
        image_dir = self.upload_root / "public" / "images"
        image_dir.mkdir(parents=True, exist_ok=True)
        original_path = image_dir / "maths-book-original.jpg"
        Image.new("RGB", (1800, 2400), color=(20, 54, 112)).save(original_path, format="JPEG", quality=95)

        original = UploadedFile(
            original_filename="maths-book-original.jpg",
            stored_filename="maths-book-original.jpg",
            storage_path=str(original_path),
            mime_type="image/jpeg",
            size_bytes=original_path.stat().st_size,
            category="images",
            visibility="public",
        )
        product = Product(
            name="Maths Book",
            slug="maths-book",
            price=10,
            image_file=original,
            is_active=True,
        )
        db.session.add_all([original, product])
        db.session.commit()

        result = ensure_product_image_variants(product)
        db.session.commit()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(product.image_original_file_id, original.id)
        self.assertEqual(product.image_file_id, original.id)
        self.assertIsNotNone(product.image_thumb_file_id)
        self.assertIsNotNone(product.image_medium_file_id)
        self.assertNotEqual(product.image_thumb_file_id, original.id)
        self.assertNotEqual(product.image_medium_file_id, original.id)

        thumb_path = resolve_uploaded_path(product.image_thumb_file)
        medium_path = resolve_uploaded_path(product.image_medium_file)
        self.assertEqual(thumb_path.suffix.lower(), ".webp")
        self.assertEqual(medium_path.suffix.lower(), ".webp")
        with Image.open(thumb_path) as thumb:
            self.assertLessEqual(thumb.width, 400)
        with Image.open(medium_path) as medium:
            self.assertLessEqual(medium.width, 1200)
        self.assertLess(thumb_path.stat().st_size, original_path.stat().st_size)
