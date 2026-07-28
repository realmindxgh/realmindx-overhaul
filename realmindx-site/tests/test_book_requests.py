import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import AnalyticsEvent, AuditLog, BookRequest, Permission, Product, Role, User


class BookRequestTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "book-request-tests"
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


class BookRequestTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(BookRequestTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def _account(self, role_name="admin", email="admin@example.com", permissions=()):
        role = Role(name=role_name, description=role_name.title())
        user = User(email=email, first_name=role_name.title(), role=role, is_verified=True, is_active=True)
        user.set_password("AdminPassword123!")
        db.session.add_all([role, user])
        for key in permissions:
            permission = Permission(key=key, description=key)
            user.direct_permissions.append(permission)
            db.session.add(permission)
        db.session.commit()
        return user

    def _login(self, user):
        response = self.client.post("/api/auth/login", json={"email": user.email, "password": "AdminPassword123!"})
        self.assertEqual(response.status_code, 200)

    def _payload(self, **overrides):
        payload = {
            "requested_title": "Golden Mathematics Basic 6",
            "customer_name": "Ama Mensah",
            "email": "ama@example.com",
            "phone": "024 123 4567",
            "search_query": "golden maths basic 6",
            "browse_context": {"taxonomy": "subject", "context_label": "Mathematics"},
        }
        payload.update(overrides)
        return payload

    @patch("backend.book_requests.send_sms", return_value=Mock(status="accepted"))
    @patch("backend.book_requests.send_email", return_value={"status": "sent"})
    def test_submission_acknowledgement_deduplication_and_audit(self, _email, _sms):
        created = self.client.post("/api/bookshop/book-requests", json=self._payload())
        self.assertEqual(created.status_code, 201)
        body = created.get_json()
        self.assertRegex(body["request"]["reference"], r"^BRQ-[A-F0-9]{8}$")
        self.assertFalse(body["duplicate"])
        self.assertEqual(BookRequest.query.count(), 1)
        self.assertEqual(BookRequest.query.one().phone, "+233241234567")
        self.assertEqual(_email.call_count, 1)
        self.assertEqual(_sms.call_count, 0, "Acknowledgement must prefer email when email is supplied")

        duplicate = self.client.post("/api/bookshop/book-requests", json=self._payload(email="AMA@example.com", phone="+233241234567"))
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.get_json()["duplicate"])
        self.assertEqual(BookRequest.query.count(), 1)
        self.assertEqual(_email.call_count, 1, "Duplicate requests must not resend acknowledgements")
        actions = [row.action for row in AuditLog.query.order_by(AuditLog.id).all()]
        self.assertIn("book_request_created", actions)
        self.assertIn("book_request_acknowledgement", actions)
        self.assertIn("book_request_duplicate_reused", actions)
        self.assertEqual(AnalyticsEvent.query.filter_by(event_type="book_request_submitted").count(), 2)

    @patch("backend.book_requests.send_sms", return_value=Mock(status="accepted"))
    @patch("backend.book_requests.send_email", return_value={"status": "sent"})
    def test_validation_and_phone_only_acknowledgement(self, email_mock, sms_mock):
        missing = self.client.post("/api/bookshop/book-requests", json=self._payload(email="", phone=""))
        self.assertEqual(missing.status_code, 400)
        malformed = self.client.post("/api/bookshop/book-requests", json=self._payload(email="not-an-email", phone=""))
        self.assertEqual(malformed.status_code, 400)
        phone_only = self.client.post("/api/bookshop/book-requests", json=self._payload(email=""))
        self.assertEqual(phone_only.status_code, 201)
        self.assertEqual(sms_mock.call_count, 1)
        self.assertEqual(email_mock.call_count, 0)

    @patch("backend.book_requests.send_email", side_effect=RuntimeError("provider offline"))
    def test_notification_failure_does_not_lose_request(self, _email_mock):
        response = self.client.post("/api/bookshop/book-requests", json=self._payload(phone=""))
        self.assertEqual(response.status_code, 201)
        row = BookRequest.query.one()
        self.assertEqual(row.status, "pending")
        self.assertEqual(row.acknowledgement_email_status, "failed")
        self.assertTrue(AuditLog.query.filter_by(action="book_request_acknowledgement").first())

    @patch("backend.book_requests.send_sms", return_value=Mock(status="accepted"))
    @patch("backend.book_requests.send_email", return_value={"status": "sent"})
    def test_permissions_availability_notifications_and_readable_audit(self, email_mock, sms_mock):
        request_response = self.client.post("/api/bookshop/book-requests", json=self._payload())
        request_id = request_response.get_json()["request"]["id"]
        product = Product(name="Golden Mathematics Basic 6", slug="golden-mathematics-basic-6", price=45, stock_status="in_stock", is_active=True)
        db.session.add(product)
        db.session.commit()

        staff = self._account("staff", "staff@example.com")
        self._login(staff)
        self.assertEqual(self.client.get("/api/admin/book-requests").status_code, 403)
        self.client.post("/api/auth/logout")

        admin = self._account("admin", "admin@example.com")
        self._login(admin)
        listing = self.client.get("/api/admin/book-requests?page_size=5&status=pending")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.get_json()["pending_count"], 1)

        invalid = self.client.post(f"/api/admin/book-requests/{request_id}/available", json={"product_url": "https://example.com/products/golden-mathematics-basic-6"})
        self.assertEqual(invalid.status_code, 400)
        db.session.add(Product(name="Hidden Book", slug="hidden-book", price=20, stock_status="in_stock", is_active=False))
        db.session.commit()
        inactive = self.client.post(f"/api/admin/book-requests/{request_id}/available", json={"product_url": "https://bookshop.realmindxgh.com/products/hidden-book"})
        self.assertEqual(inactive.status_code, 400)
        available = self.client.post(f"/api/admin/book-requests/{request_id}/available", json={"product_url": "https://bookshop.realmindxgh.com/products/golden-mathematics-basic-6"})
        self.assertEqual(available.status_code, 200)
        row = db.session.get(BookRequest, request_id)
        self.assertEqual(row.status, "available")
        self.assertEqual(row.available_email_status, "sent")
        self.assertEqual(row.available_sms_status, "sent")
        self.assertEqual(email_mock.call_count, 2)
        self.assertEqual(sms_mock.call_count, 1)

        audit_response = self.client.get("/api/admin/audit-logs")
        self.assertEqual(audit_response.status_code, 200)
        available_event = next(item for item in audit_response.get_json()["items"] if item["raw_action"] == "book_request_marked_available")
        self.assertEqual(available_event["action"], "Marked a requested book as available")
        self.assertEqual(available_event["actor"], "Admin")
        self.assertEqual(available_event["entity_type"], "Book requests")

    @patch("backend.book_requests.send_sms", side_effect=[Mock(status="failed"), Mock(status="accepted")])
    @patch("backend.book_requests.send_email", return_value={"status": "sent"})
    def test_retry_only_retries_failed_channel(self, email_mock, _sms_mock):
        created = self.client.post("/api/bookshop/book-requests", json=self._payload())
        request_id = created.get_json()["request"]["id"]
        db.session.add(Product(name="Requested Book", slug="requested-book", price=30, stock_status="in_stock", is_active=True))
        db.session.commit()
        admin = self._account("admin", "retry-admin@example.com")
        self._login(admin)

        available = self.client.post(f"/api/admin/book-requests/{request_id}/available", json={"product_url": "https://bookshop.realmindxgh.com/products/requested-book"})
        self.assertEqual(available.status_code, 200)
        self.assertEqual(available.get_json()["notification"]["sms"], "failed")
        email_calls_before_retry = email_mock.call_count
        retried = self.client.post(f"/api/admin/book-requests/{request_id}/retry-notification")
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.get_json()["notification"]["sms"], "sent")
        self.assertEqual(email_mock.call_count, email_calls_before_retry, "A successful email must not be sent twice")
        self.assertTrue(AuditLog.query.filter_by(action="book_request_notification_retried").first())


if __name__ == "__main__":
    unittest.main()
