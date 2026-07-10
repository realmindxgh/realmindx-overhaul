import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from werkzeug.security import generate_password_hash


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.delivery_service import (
    DeliveryError,
    active_otp,
    assign_order_to_company,
    assign_rider,
    company_accept_delivery,
    complete_delivery_with_otp,
    create_company,
    create_rider,
    mark_picked_up,
    verify_delivery_otp,
)
from backend.extensions import db
from backend.models import Order, Role, User
from backend.security import DEFAULT_TEMPORARY_PASSWORD


class DeliveryTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "delivery-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://localhost/bookshop"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False
    RESEND_API_KEY = ""
    MAIL_SERVER = ""
    MAIL_USERNAME = ""
    MAIL_PASSWORD = ""
    ARKESEL_API_KEY = ""


class DeliveryAccountTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(DeliveryTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def _order(self, reference="RMX-TEST-001"):
        order = Order(
            order_reference=reference,
            customer_name="Test Customer",
            email="customer@example.com",
            phone="0241234567",
            delivery_method="delivery",
            delivery_zone_name="Accra",
            location="Dome, Accra",
            status="confirmed",
            payment_status="paid",
            payment_method="online",
            total_amount=100,
        )
        db.session.add(order)
        db.session.flush()
        return order

    @patch("backend.delivery_service.send_email", return_value={"status": "sent"})
    @patch("backend.delivery_service.send_sms", return_value=True)
    def test_delivery_accounts_use_default_temporary_password(self, _sms, _email):
        company, manager = create_company({
            "name": "Fast Delivery",
            "contact_email": "dispatch@example.com",
            "manager_name": "First Manager",
            "manager_phone": "0241111111",
        })
        rider = create_rider(company, {"name": "First Rider", "phone": "+233242222222"})
        db.session.commit()

        self.assertTrue(manager.user.check_password(DEFAULT_TEMPORARY_PASSWORD))
        self.assertTrue(rider.user.check_password(DEFAULT_TEMPORARY_PASSWORD))
        self.assertTrue(manager.user.must_change_password)
        self.assertTrue(rider.user.must_change_password)

        with self.assertRaises(DeliveryError) as duplicate:
            create_rider(company, {"name": "Duplicate Rider", "phone": "233 24 222 2222"})
        self.assertEqual(duplicate.exception.code, "duplicate_phone")

    @patch("backend.delivery_service.send_email", return_value={"status": "sent"})
    @patch("backend.delivery_service.send_sms", return_value=True)
    def test_pickup_sends_otp_through_sms_and_email(self, _sms, _email):
        company, _ = create_company({"name": "OTP Delivery", "contact_email": "dispatch@example.com"})
        rider = create_rider(company, {"name": "OTP Rider", "phone": "0243333333"})
        order = self._order()
        delivery = assign_order_to_company(order, company, ("admin", 1))
        company_accept_delivery(delivery, ("company_user", 2))
        assign_rider(delivery, rider, ("company_user", 2))
        mark_picked_up(delivery, ("rider", rider.user_id))
        db.session.commit()

        otp = active_otp(delivery)
        self.assertIsNotNone(otp)
        self.assertEqual(otp.send_status, "sent")
        self.assertEqual(otp.send_channel, "sms+email")
        self.assertTrue(any(event.event_type == "otp_sent" for event in delivery.events))

    @patch("backend.api.delivery.send_portal_access_notification", return_value={"sms": "sent", "email": "sent"})
    def test_company_scope_and_first_login_action_gate(self, _notify):
        company_one, manager_one = create_company({
            "name": "Company One",
            "contact_email": "one@example.com",
            "manager_name": "Manager One",
            "manager_phone": "0244444444",
        })
        company_two, _ = create_company({"name": "Company Two"})
        rider_one = create_rider(company_one, {"name": "Rider One", "phone": "0245555555"})
        rider_two = create_rider(company_two, {"name": "Rider Two", "phone": "0246666666"})
        db.session.commit()

        client = self.app.test_client()
        login = client.post("/api/delivery/company/login", json={
            "phone": manager_one.phone,
            "password": DEFAULT_TEMPORARY_PASSWORD,
        })
        self.assertEqual(login.status_code, 200)
        self.assertEqual(client.get(f"/api/delivery/company/riders/{rider_one.id}").status_code, 200)
        self.assertEqual(client.get(f"/api/delivery/company/riders/{rider_two.id}").status_code, 404)

        blocked = client.post("/api/delivery/company/riders", json={"name": "Blocked Rider", "phone": "0247777777"})
        self.assertEqual(blocked.status_code, 428)
        self.assertEqual(blocked.get_json()["code"], "password_change_required")

        changed = client.post("/api/auth/change-password", json={
            "current_password": DEFAULT_TEMPORARY_PASSWORD,
            "new_password": "ChangedPassword123!",
        })
        self.assertEqual(changed.status_code, 200)
        created = client.post("/api/delivery/company/riders", json={"name": "New Rider", "phone": "0247777777"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json()["temporary_password"], DEFAULT_TEMPORARY_PASSWORD)

        reset = client.post(f"/api/delivery/company/riders/{rider_one.id}/reset-password")
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.get_json()["temporary_password"], DEFAULT_TEMPORARY_PASSWORD)
        self.assertTrue(rider_one.user.must_change_password)

    @patch("backend.delivery_service.send_email", return_value={"status": "failed"})
    @patch("backend.delivery_service.send_sms", return_value=False)
    def test_notification_failure_keeps_delivery_out_for_delivery(self, _sms, _email):
        company, _ = create_company({"name": "Offline Notifications"})
        rider = create_rider(company, {"name": "Offline Rider", "phone": "0248888888"})
        order = self._order("RMX-TEST-NOTIFY")
        delivery = assign_order_to_company(order, company, ("admin", 1))
        company_accept_delivery(delivery, ("company_user", 2))
        assign_rider(delivery, rider, ("company_user", 2))
        mark_picked_up(delivery, ("rider", rider.user_id))
        db.session.commit()

        otp = active_otp(delivery)
        self.assertEqual(delivery.status, "picked_up")
        self.assertEqual(order.status, "shipped")
        self.assertEqual(otp.send_status, "failed")
        self.assertTrue(any(event.event_type == "notification_failed" for event in delivery.events))

    @patch("backend.delivery_service.send_email", return_value={"status": "sent"})
    @patch("backend.delivery_service.send_sms", return_value=True)
    def test_wrong_and_expired_otp_protection(self, _sms, _email):
        company, _ = create_company({"name": "Protected OTP"})
        rider = create_rider(company, {"name": "Protected Rider", "phone": "0249999999"})
        order = self._order("RMX-TEST-WRONG-OTP")
        delivery = assign_order_to_company(order, company, ("admin", 1))
        company_accept_delivery(delivery, ("company_user", 2))
        assign_rider(delivery, rider, ("company_user", 2))
        mark_picked_up(delivery, ("rider", rider.user_id))
        otp = active_otp(delivery)
        otp.token_hash = generate_password_hash("654321")

        for expected_attempts in range(1, 6):
            with self.assertRaises(DeliveryError) as wrong:
                verify_delivery_otp(delivery, "111111", ("rider", rider.user_id))
            self.assertEqual(wrong.exception.code, "otp_incorrect")
            self.assertEqual(otp.attempts_count, expected_attempts)

        self.assertTrue(delivery.otp_blocked)
        with self.assertRaises(DeliveryError) as blocked:
            complete_delivery_with_otp(delivery, "654321", ("rider", rider.user_id))
        self.assertEqual(blocked.exception.code, "otp_blocked")
        self.assertEqual(delivery.status, "picked_up")

        second_order = self._order("RMX-TEST-EXPIRED-OTP")
        second_delivery = assign_order_to_company(second_order, company, ("admin", 1))
        company_accept_delivery(second_delivery, ("company_user", 2))
        assign_rider(second_delivery, rider, ("company_user", 2))
        mark_picked_up(second_delivery, ("rider", rider.user_id))
        expired = active_otp(second_delivery)
        expired.token_hash = generate_password_hash("123456")
        expired.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        with self.assertRaises(DeliveryError) as expired_error:
            complete_delivery_with_otp(second_delivery, "123456", ("rider", rider.user_id))
        self.assertEqual(expired_error.exception.code, "otp_expired")
        self.assertEqual(second_delivery.status, "picked_up")

    def test_deactivated_rider_cannot_log_in(self):
        company, _ = create_company({"name": "Inactive Rider Company"})
        rider = create_rider(company, {"name": "Inactive Rider", "phone": "0201234567"})
        rider.is_active = False
        rider.status = "inactive"
        rider.user.is_active = False
        db.session.commit()

        response = self.app.test_client().post("/api/delivery/rider/login", json={
            "phone": "233201234567",
            "password": DEFAULT_TEMPORARY_PASSWORD,
        })
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()["code"], "inactive_account")

    @patch("backend.api.admin._send_internal_account_access_email", return_value="sent")
    def test_admin_created_staff_gets_default_password(self, _notify):
        admin_role = Role(name="admin", description="Admin")
        admin = User(
            email="admin@example.com",
            first_name="Admin",
            role=admin_role,
            is_verified=True,
            is_active=True,
        )
        admin.set_password("AdminPassword123!")
        db.session.add_all([admin_role, admin])
        db.session.commit()

        client = self.app.test_client()
        login = client.post("/api/auth/login", json={
            "email": admin.email,
            "password": "AdminPassword123!",
        })
        self.assertEqual(login.status_code, 200)

        response = client.post("/api/admin/staff", json={
            "email": "staff@example.com",
            "first_name": "New",
            "last_name": "Staff",
            "permissions": [],
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["temporary_password"], DEFAULT_TEMPORARY_PASSWORD)
        staff = User.query.filter_by(email="staff@example.com").one()
        self.assertTrue(staff.check_password(DEFAULT_TEMPORARY_PASSWORD))
        self.assertTrue(staff.must_change_password)


if __name__ == "__main__":
    unittest.main()
