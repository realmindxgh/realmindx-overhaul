import io
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from werkzeug.datastructures import FileStorage


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.analytics import _remote_ip, _request_host
from backend.api.oauth import OAuthAccountLinkRequired, _get_or_create_user
from backend.audit import _get_ip
from backend.config import Config
from backend.extensions import db
from backend.models import AuthIdentity, Order, Role, UploadedFile, User
from backend.rich_text import _safe_href
from backend.security import generate_temporary_password
from backend.upload_utils import allowed_file, save_upload


class SecurityTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "security-hardening-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False


class CsrfTestConfig(SecurityTestConfig):
    TESTING = False
    WTF_CSRF_ENABLED = True
    WTF_CSRF_CHECK_DEFAULT = True


class SecurityHardeningTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        SecurityTestConfig.UPLOAD_FOLDER = self.temp_dir.name
        self.app = create_app(SecurityTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()
        self.temp_dir.cleanup()

    def _user(self, email, role_name="user", *, must_change_password=False):
        role = Role.query.filter_by(name=role_name).first()
        if not role:
            role = Role(name=role_name, description=role_name.title())
            db.session.add(role)
        user = User(
            email=email,
            first_name="Security",
            role=role,
            is_active=True,
            is_verified=True,
            must_change_password=must_change_password,
        )
        user.set_password("StrongPassword123!")
        db.session.add(user)
        db.session.commit()
        return user

    def _login(self, email):
        response = self.client.post(
            "/api/auth/login",
            json={"email": email, "password": "StrongPassword123!", "surface": "teacher"},
        )
        self.assertEqual(response.status_code, 200)

    def test_temporary_passwords_are_unique_and_high_entropy(self):
        first = generate_temporary_password()
        second = generate_temporary_password()
        self.assertNotEqual(first, second)
        self.assertGreaterEqual(len(first), 20)
        self.assertNotEqual(first, "12345678")

    def test_rich_text_links_reject_protocol_relative_urls(self):
        self.assertEqual(_safe_href("//attacker.example/path"), "")
        self.assertEqual(_safe_href("/safe/local/path"), "/safe/local/path")

    def test_client_ip_helpers_ignore_untrusted_forwarding_headers(self):
        with self.app.test_request_context(
            "/",
            environ_base={"REMOTE_ADDR": "198.51.100.20"},
            headers={
                "X-Forwarded-For": "203.0.113.99",
                "X-Real-IP": "203.0.113.98",
                "CF-Connecting-IP": "203.0.113.97",
                "X-Forwarded-Host": "attacker.example",
            },
        ):
            self.assertEqual(_get_ip(), "198.51.100.20")
            self.assertEqual(_remote_ip(), "198.51.100.20")
            self.assertEqual(_request_host(), "localhost")

    def test_uploads_reject_unsafe_destinations_and_spoofed_content(self):
        self.assertFalse(allowed_file("legacy-resume.doc", "documents"))
        with self.assertRaisesRegex(ValueError, "visibility"):
            save_upload(
                FileStorage(stream=io.BytesIO(b"fake"), filename="photo.jpg"),
                category="images",
                visibility="../../outside",
            )
        with self.assertRaisesRegex(ValueError, "valid image"):
            save_upload(
                FileStorage(stream=io.BytesIO(b"not-an-image"), filename="photo.jpg"),
                category="images",
                visibility="public",
            )

    def test_admin_with_temporary_password_cannot_call_privileged_api(self):
        admin = self._user("rotation-admin@example.com", "admin", must_change_password=True)
        self._login(admin.email)
        response = self.client.get("/api/admin/staff")
        self.assertEqual(response.status_code, 428)
        self.assertEqual(response.get_json()["code"], "password_change_required")

    def test_readiness_checks_database_and_shared_rate_limit_storage(self):
        response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

        self.app.config["REQUIRE_SHARED_RATE_LIMIT_STORAGE"] = True
        self.app.config["RATELIMIT_STORAGE_URI"] = "memory://"
        response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), {"service": "realmindx-api", "status": "unavailable"})

    def test_upload_scanning_fails_safely_and_removes_the_file(self):
        self.app.config["UPLOAD_MALWARE_SCANNING_ENABLED"] = True
        self.app.config["UPLOAD_MALWARE_SCANNER_PATH"] = "clamdscan"

        with patch("backend.upload_utils.shutil.which", return_value="/usr/bin/clamdscan"), patch(
            "backend.upload_utils.subprocess.run",
            return_value=SimpleNamespace(returncode=1),
        ):
            with self.assertRaisesRegex(ValueError, "malware scanner"):
                save_upload(
                    FileStorage(stream=io.BytesIO(b"%PDF-test"), filename="document.pdf"),
                    category="documents",
                )

        self.assertEqual(list(Path(self.temp_dir.name).rglob("*.pdf")), [])

    def test_upload_scanner_outage_is_retryable_and_readiness_blocking(self):
        admin = self._user("scanner-admin@example.com", "admin")
        self._login(admin.email)
        self.app.config["UPLOAD_MALWARE_SCANNING_ENABLED"] = True
        self.app.config["UPLOAD_MALWARE_SCANNER_PATH"] = "missing-clamdscan"

        with patch("backend.upload_utils.shutil.which", return_value=None):
            self.assertEqual(self.client.get("/health/ready").status_code, 503)
            response = self.client.post(
                "/api/admin/uploads",
                data={
                    "category": "documents",
                    "visibility": "protected",
                    "file": (io.BytesIO(b"%PDF-test"), "document.pdf"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["code"], "upload_security_unavailable")
        self.assertIn("try again later", response.get_json()["error"].lower())
        self.assertEqual(list(Path(self.temp_dir.name).rglob("*.pdf")), [])

    def test_privileged_mfa_rollout_is_visible_without_locking_out_admins(self):
        admin = self._user("mfa-admin@example.com", "admin")
        self._login(admin.email)

        status = self.client.get("/api/auth/security-status")
        self.assertEqual(status.status_code, 200)
        self.assertTrue(status.get_json()["privileged_account"])
        self.assertEqual(status.get_json()["privileged_mfa_mode"], "prompt")
        self.assertTrue(status.get_json()["mfa_recommended"])

        me = self.client.get("/api/auth/me").get_json()["user"]
        self.assertTrue(me["mfa_recommended"])
        self.assertFalse(me["two_factor_enabled"])
        self.assertEqual(self.client.get("/api/admin/staff").status_code, 200)

    def test_protected_upload_requires_owner_or_authorised_internal_user(self):
        owner = self._user("owner@example.com")
        stranger = self._user("stranger@example.com")
        folder = Path(self.temp_dir.name) / "protected" / "documents"
        folder.mkdir(parents=True)
        stored_name = "private-document.pdf"
        target = folder / stored_name
        target.write_bytes(b"%PDF-private-test")
        uploaded = UploadedFile(
            owner_id=owner.id,
            original_filename="private.pdf",
            stored_filename=stored_name,
            storage_path=str(target),
            mime_type="application/pdf",
            size_bytes=target.stat().st_size,
            category="documents",
            visibility="protected",
        )
        db.session.add(uploaded)
        db.session.commit()
        url = f"/uploads/protected/documents/{stored_name}"

        self.assertEqual(self.client.get(url).status_code, 401)
        self._login(stranger.email)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.post("/api/auth/logout")
        self._login(owner.email)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        response.close()

    def test_order_tracking_rejects_email_and_omits_customer_pii(self):
        order = Order(
            order_reference="RMX-0123456789ABCDEF0123",
            invoice_id="RMX-INV-0123456789ABCDEF01234567",
            customer_name="Private Customer",
            email="private-customer@example.com",
            phone="0240000000",
            delivery_method="delivery",
            delivery_zone_name="Accra",
            location="A private street address",
            status="confirmed",
            payment_status="paid",
            payment_method="online",
            payment_reference="PRIVATE-PAYMENT-REF",
            payment_authorization_url="https://example.invalid/private-payment",
            total_amount=100,
        )
        db.session.add(order)
        db.session.commit()

        email_lookup = self.client.get("/api/orders/track?q=private-customer@example.com")
        self.assertEqual(email_lookup.status_code, 400)
        response = self.client.get(f"/api/orders/track?q={order.order_reference}")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()["items"][0]
        for field in (
            "id", "invoice_id", "customer_name", "email", "phone", "location",
            "payment_reference", "payment_authorization_url",
        ):
            self.assertNotIn(field, payload)

        self.assertEqual(self.client.get(f"/api/invoices/{order.order_reference}").status_code, 404)
        paid_verification = self.client.post(
            "/api/orders/paystack/verify",
            json={"order_reference": order.order_reference},
        )
        self.assertEqual(paid_verification.status_code, 200)
        verified_order = paid_verification.get_json()["order"]
        self.assertNotIn("email", verified_order)
        self.assertNotIn("phone", verified_order)
        self.assertEqual(verified_order["invoice_id"], order.invoice_id)

    def test_legacy_numeric_order_payment_endpoint_is_disabled(self):
        response = self.client.post("/api/orders/123/paystack/initialize", json={})
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.get_json()["code"], "legacy_payment_endpoint_disabled")

    def test_oauth_identity_is_not_linked_by_email_claim_alone(self):
        self._user("existing@example.com")
        with self.app.test_request_context("/"):
            with self.assertRaises(OAuthAccountLinkRequired):
                _get_or_create_user(
                    provider="google",
                    provider_user_id="new-google-identity",
                    email="existing@example.com",
                    first_name="Claimed",
                    last_name="Identity",
                )
        self.assertEqual(AuthIdentity.query.count(), 0)

    def test_csrf_is_required_for_mutating_api_requests(self):
        csrf_app = create_app(CsrfTestConfig)
        with csrf_app.app_context():
            db.create_all()
            client = csrf_app.test_client()
            blocked = client.post(
                "/api/auth/login",
                json={"email": "nobody@example.com", "password": "WrongPassword123!"},
            )
            self.assertEqual(blocked.status_code, 400)
            self.assertIn("Security token", blocked.get_json()["error"])

            token = client.get("/api/auth/csrf-token").get_json()["csrf_token"]
            allowed_through_csrf = client.post(
                "/api/auth/login",
                headers={"X-CSRFToken": token},
                json={"email": "nobody@example.com", "password": "WrongPassword123!"},
            )
            self.assertEqual(allowed_through_csrf.status_code, 401)

            whatsapp_webhook = client.post(
                "/api/webhooks/whatsapp",
                data=b"{}",
                content_type="application/json",
            )
            self.assertEqual(whatsapp_webhook.status_code, 403)
            self.assertEqual(whatsapp_webhook.get_json()["error"], "Invalid signature.")

            analytics = client.post("/api/analytics/events", json={"events": []})
            self.assertEqual(analytics.status_code, 202)
            db.drop_all()

    def _csrf_client(self):
        csrf_app = create_app(CsrfTestConfig)
        ctx = csrf_app.app_context()
        ctx.push()
        db.create_all()
        return ctx, csrf_app.test_client()

    def _close_csrf_client(self, ctx):
        db.session.remove()
        db.drop_all()
        ctx.pop()

    def test_csrf_allows_trusted_subdomain_origin(self):
        ctx, client = self._csrf_client()
        try:
            token = client.get("/api/auth/csrf-token").get_json()["csrf_token"]
            response = client.post(
                "/api/auth/login",
                headers={"X-CSRFToken": token, "Origin": "http://bookshop.localhost"},
                json={"email": "nobody@example.com", "password": "WrongPassword123!"},
            )
            self.assertEqual(response.status_code, 401)
        finally:
            self._close_csrf_client(ctx)

    def test_csrf_allows_trusted_subdomain_referer(self):
        ctx, client = self._csrf_client()
        try:
            token = client.get("/api/auth/csrf-token").get_json()["csrf_token"]
            response = client.post(
                "/api/auth/login",
                headers={"X-CSRFToken": token, "Referer": "http://bookshop.localhost/login"},
                json={"email": "nobody@example.com", "password": "WrongPassword123!"},
            )
            self.assertEqual(response.status_code, 401)
        finally:
            self._close_csrf_client(ctx)

    def test_csrf_rejects_foreign_origin_with_valid_token(self):
        ctx, client = self._csrf_client()
        try:
            token = client.get("/api/auth/csrf-token").get_json()["csrf_token"]
            response = client.post(
                "/api/auth/login",
                headers={"X-CSRFToken": token, "Origin": "https://evil.example.com"},
                json={"email": "nobody@example.com", "password": "WrongPassword123!"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("Security token", response.get_json()["error"])
        finally:
            self._close_csrf_client(ctx)

    def test_csrf_rejects_cross_site_referer_with_valid_token(self):
        ctx, client = self._csrf_client()
        try:
            token = client.get("/api/auth/csrf-token").get_json()["csrf_token"]
            response = client.post(
                "/api/auth/login",
                headers={"X-CSRFToken": token, "Referer": "https://evil.example.com/login"},
                json={"email": "nobody@example.com", "password": "WrongPassword123!"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("Security token", response.get_json()["error"])
        finally:
            self._close_csrf_client(ctx)


class ProductionConfigValidationTests(unittest.TestCase):
    def test_deployment_is_serialized_pinned_and_health_gated(self):
        workflow = (SITE_ROOT.parent / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
        self.assertIn("group: realmindx-production", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("DEPLOY_COMMIT: ${{ github.sha }}", workflow)
        self.assertIn('git reset --hard "$DEPLOY_COMMIT"', workflow)
        self.assertNotIn("git reset --hard origin/main", workflow)
        self.assertIn('wait_for_api "/health/ready"', workflow)
        self.assertIn("Publishing the frontend atomically", workflow)
        self.assertIn("rollback_release", workflow)

    def test_delivery_nginx_site_inherits_global_server_token_policy(self):
        project_root = SITE_ROOT.parent
        global_config = (project_root / "deployment" / "nginx.conf").read_text(encoding="utf-8")
        delivery_config = (project_root / "deployment" / "delivery.realmindxgh.com.conf").read_text(encoding="utf-8")

        self.assertIn("server_tokens off;", global_config)
        self.assertNotIn("server_tokens", delivery_config)

    def test_production_rejects_weak_signing_key(self):
        class WeakProductionConfig(SecurityTestConfig):
            TESTING = False
            ENV = "production"
            SECRET_KEY = "dev-only-change-me"
            SESSION_COOKIE_SECURE = True
            TURNSTILE_SECRET_KEY = "configured"
            CORS_ORIGINS = ["https://realmindxgh.com"]

        with self.assertRaisesRegex(RuntimeError, "SECRET_KEY"):
            create_app(WeakProductionConfig)

    def test_production_rejects_missing_turnstile_secret(self):
        class MissingTurnstileConfig(SecurityTestConfig):
            TESTING = False
            ENV = "production"
            SECRET_KEY = "a-strong-production-only-signing-key-value"
            SESSION_COOKIE_SECURE = True
            TURNSTILE_SECRET_KEY = ""
            CORS_ORIGINS = ["https://realmindxgh.com"]

        with self.assertRaisesRegex(RuntimeError, "TURNSTILE_SECRET_KEY"):
            create_app(MissingTurnstileConfig)


if __name__ == "__main__":
    unittest.main()
