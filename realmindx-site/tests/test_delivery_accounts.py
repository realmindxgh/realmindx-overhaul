import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from werkzeug.security import generate_password_hash


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.api.bookshop import order_tracking_json
from backend.analytics import build_analytics_dashboard
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
from backend.models import AuditLog, DeliverySettlementLine, Order, PlatformTermsAcceptance, Product, ProductCategory, Resource, Role, UploadedFile, User
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

    def _complete_delivery(self, order, company, rider, otp_value="654321", **assignment):
        delivery = assign_order_to_company(order, company, ("admin", 1), **assignment)
        company_accept_delivery(delivery, ("company_user", 2))
        assign_rider(delivery, rider, ("company_user", 2))
        mark_picked_up(delivery, ("rider", rider.user_id))
        active_otp(delivery).token_hash = generate_password_hash(otp_value)
        complete_delivery_with_otp(delivery, otp_value, ("rider", rider.user_id))
        return delivery

    def _accept_company_terms(self, client, current_password=DEFAULT_TEMPORARY_PASSWORD):
        changed = client.post("/api/auth/change-password", json={
            "current_password": current_password,
            "new_password": "ChangedPassword123!",
        })
        self.assertEqual(changed.status_code, 200)
        terms = client.get("/api/delivery/company/terms/current")
        self.assertEqual(terms.status_code, 200)
        payload = terms.get_json()["terms"]
        accepted = client.post("/api/delivery/company/terms/accept", json={
            "version": payload["version"],
            "hash": payload["hash"],
        })
        self.assertEqual(accepted.status_code, 200)
        return accepted.get_json()

    def _accept_rider_terms(self, client, current_password=DEFAULT_TEMPORARY_PASSWORD):
        changed = client.post("/api/auth/change-password", json={
            "current_password": current_password,
            "new_password": "ChangedRiderPassword123!",
        })
        self.assertEqual(changed.status_code, 200)
        terms = client.get("/api/delivery/rider/terms/current")
        self.assertEqual(terms.status_code, 200)
        payload = terms.get_json()["terms"]
        accepted = client.post("/api/delivery/rider/terms/accept", json={
            "version": payload["version"],
            "hash": payload["hash"],
        })
        self.assertEqual(accepted.status_code, 200)
        return accepted.get_json()

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
    def test_online_delivery_creates_snapshot_settlement_once(self, _sms, _email):
        company, _ = create_company({"name": "Online Settlement", "default_delivery_payable": 25})
        self.assertEqual(float(company.default_delivery_payable), 25)
        rider = create_rider(company, {"name": "Online Rider", "phone": "0240101010"})
        order = self._order("RMX-SET-ONLINE")
        order.subtotal_amount = 200
        order.delivery_fee = 25
        order.total_amount = 225
        delivery = self._complete_delivery(order, company, rider)
        db.session.commit()

        line = DeliverySettlementLine.query.filter_by(delivery_id=delivery.id).one()
        self.assertEqual(float(line.book_subtotal), 200)
        self.assertEqual(float(line.customer_delivery_fee), 25)
        self.assertEqual(float(line.company_payable), 25)
        self.assertEqual(float(line.amount_collected_realmindx), 225)
        self.assertEqual(float(line.amount_due_company), 25)
        self.assertEqual(float(line.net_balance), -25)
        self.assertEqual(DeliverySettlementLine.query.filter_by(delivery_id=delivery.id).count(), 1)
        order.subtotal_amount = 999
        order.delivery_fee = 99
        company.default_delivery_payable = 88
        db.session.commit()
        db.session.refresh(line)
        self.assertEqual(float(line.book_subtotal), 200)
        self.assertEqual(float(line.customer_delivery_fee), 25)
        self.assertEqual(float(line.company_payable), 25)

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
    def test_admin_settlement_exports_adjustment_and_payment_controls(self, _sms, _email):
        admin_role = Role(name="admin", description="Admin")
        admin = User(email="settlement-admin@example.com", first_name="Admin", role=admin_role, is_verified=True, is_active=True)
        admin.set_password("AdminPassword123!")
        db.session.add_all([admin_role, admin])
        company, _ = create_company({"name": "Admin Settlement", "default_delivery_payable": 15})
        rider = create_rider(company, {"name": "Admin Settlement Rider", "phone": "0240505050"})
        delivery = self._complete_delivery(self._order("RMX-SET-ADMIN"), company, rider)
        db.session.commit()
        batch_id = DeliverySettlementLine.query.filter_by(delivery_id=delivery.id).one().batch_id

        client = self.app.test_client()
        self.assertEqual(client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"}).status_code, 200)
        self.assertEqual(client.get("/api/admin/delivery-settlements").status_code, 200)
        adjusted = client.post(f"/api/admin/delivery-settlements/{batch_id}/adjust", json={"amount": 5, "reason": "Route surcharge correction"})
        self.assertEqual(adjusted.status_code, 200)
        for export_format, content_type in [("csv", "text/csv"), ("xlsx", "spreadsheetml"), ("pdf", "application/pdf")]:
            response = client.get(f"/api/admin/delivery-settlements/{batch_id}/export/{export_format}")
            self.assertEqual(response.status_code, 200, export_format)
            self.assertIn(content_type, response.content_type, export_format)
        settled = client.post(f"/api/admin/delivery-settlements/{batch_id}/mark-paid", json={"payment_reference": "PAY-001", "payment_date": "2026-07-10"})
        self.assertEqual(settled.status_code, 200)
        self.assertEqual(settled.get_json()["settlement"]["status"], "settled")
        self.assertEqual(client.post(f"/api/admin/delivery-settlements/{batch_id}/mark-paid", json={"payment_reference": "PAY-002", "payment_date": "2026-07-10"}).status_code, 409)

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
    def test_pay_on_delivery_and_free_delivery_settlement_math(self, _sms, _email):
        company, _ = create_company({"name": "COD Settlement", "default_delivery_payable": 25})
        rider = create_rider(company, {"name": "COD Rider", "phone": "0240202020"})
        cod = self._order("RMX-SET-COD")
        cod.payment_method = "cash_on_delivery"
        cod.payment_status = "unpaid"
        cod.subtotal_amount = 200
        cod.delivery_fee = 25
        cod.total_amount = 225
        cod_delivery = self._complete_delivery(cod, company, rider)

        free = self._order("RMX-SET-FREE")
        free.subtotal_amount = 200
        free.delivery_fee = 0
        free.total_amount = 200
        free_delivery = self._complete_delivery(
            free, company, rider, company_payable_amount=25,
            promotion_payer="realmindx", promotion_amount=25,
        )
        db.session.commit()

        cod_line = DeliverySettlementLine.query.filter_by(delivery_id=cod_delivery.id).one()
        self.assertEqual(float(cod_line.amount_collected_company), 225)
        self.assertEqual(float(cod_line.amount_due_realmindx), 200)
        self.assertEqual(float(cod_line.net_balance), 200)
        free_line = DeliverySettlementLine.query.filter_by(delivery_id=free_delivery.id).one()
        self.assertEqual(float(free_line.customer_delivery_fee), 0)
        self.assertEqual(float(free_line.company_payable), 25)
        self.assertEqual(float(free_line.amount_due_company), 25)
        self.assertEqual(free_line.promotion_payer, "realmindx")

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
    def test_company_cannot_read_another_company_settlement(self, _sms, _email):
        company_one, _ = create_company({"name": "Settlement One"})
        company_two, manager_two = create_company({"name": "Settlement Two", "manager_name": "Second Manager", "manager_phone": "0240303030"})
        rider = create_rider(company_one, {"name": "Scoped Rider", "phone": "0240404040"})
        delivery = self._complete_delivery(self._order("RMX-SET-SCOPE"), company_one, rider)
        db.session.commit()

        client = self.app.test_client()
        login = client.post("/api/delivery/company/login", json={"phone": manager_two.phone, "password": DEFAULT_TEMPORARY_PASSWORD})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(client.get("/api/delivery/company/settlements").status_code, 428)
        self._accept_company_terms(client)
        listing = client.get("/api/delivery/company/settlements")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.get_json()["items"], [])
        batch_id = DeliverySettlementLine.query.filter_by(delivery_id=delivery.id).one().batch_id
        self.assertEqual(client.get(f"/api/delivery/company/settlements/{batch_id}").status_code, 404)

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="failed"))
    def test_external_delivery_status_is_system_managed(self, _sms, _email):
        admin_role = Role(name="admin", description="Admin")
        admin = User(email="status-admin@example.com", first_name="Admin", role=admin_role, is_verified=True, is_active=True)
        admin.set_password("AdminPassword123!")
        db.session.add_all([admin_role, admin])
        company, _ = create_company({"name": "Managed Status"})
        order = self._order("RMX-MANAGED-STATUS")
        db.session.flush()
        assign_order_to_company(order, company, ("admin", admin.id))
        db.session.commit()

        client = self.app.test_client()
        self.assertEqual(client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"}).status_code, 200)
        response = client.put(f"/api/admin/orders/{order.id}/status", json={"status": "complete"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["code"], "external_delivery_status_managed")

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
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

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
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
        self.assertGreaterEqual(otp.expires_at - otp.created_at, timedelta(hours=47, minutes=59))
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
        blocked = client.post("/api/delivery/company/riders", json={"name": "Blocked Rider", "phone": "0247777777"})
        self.assertEqual(blocked.status_code, 428)
        self.assertEqual(blocked.get_json()["code"], "terms_acceptance_required")

        accepted = self._accept_company_terms(client)
        self.assertTrue(accepted["terms"]["accepted"])
        self.assertEqual(PlatformTermsAcceptance.query.filter_by(user_id=manager_one.user_id).count(), 1)
        self.assertEqual(client.get(f"/api/delivery/company/riders/{rider_one.id}").status_code, 200)
        self.assertEqual(client.get(f"/api/delivery/company/riders/{rider_two.id}").status_code, 404)
        created = client.post("/api/delivery/company/riders", json={"name": "New Rider", "phone": "0247777777"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json()["temporary_password"], DEFAULT_TEMPORARY_PASSWORD)

        reset = client.post(f"/api/delivery/company/riders/{rider_one.id}/reset-password")
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.get_json()["temporary_password"], DEFAULT_TEMPORARY_PASSWORD)
        self.assertTrue(rider_one.user.must_change_password)

    @patch("backend.delivery_service.send_email", return_value=Mock(status="failed"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="failed"))
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

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
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

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="accepted"))
    def test_rider_terms_gate_scope_and_otp_resend(self, _sms, _email):
        company, _ = create_company({"name": "Rider Terms Company"})
        rider = create_rider(company, {"name": "Terms Rider", "phone": "0207654321"})
        other_rider = create_rider(company, {"name": "Other Rider", "phone": "0207654322"})
        delivery = assign_order_to_company(self._order("RMX-RIDER-TERMS"), company, ("admin", 1))
        company_accept_delivery(delivery, ("company_user", 2))
        assign_rider(delivery, rider, ("company_user", 2))
        mark_picked_up(delivery, ("rider", rider.user_id))
        other_delivery = assign_order_to_company(self._order("RMX-RIDER-OTHER"), company, ("admin", 1))
        company_accept_delivery(other_delivery, ("company_user", 2))
        assign_rider(other_delivery, other_rider, ("company_user", 2))
        db.session.commit()

        client = self.app.test_client()
        login = client.post("/api/delivery/rider/login", json={"phone": rider.phone, "password": DEFAULT_TEMPORARY_PASSWORD})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(client.get("/api/delivery/rider/deliveries").status_code, 428)
        self.assertEqual(client.post("/api/delivery/company/terms/accept", json={}).status_code, 403)
        accepted = self._accept_rider_terms(client)
        self.assertTrue(accepted["terms"]["accepted"])
        items = client.get("/api/delivery/rider/deliveries").get_json()["items"]
        self.assertEqual([item["id"] for item in items], [delivery.id])

        old_otp = active_otp(delivery)
        old_otp.last_sent_at = datetime.now(timezone.utc) - timedelta(minutes=3)
        db.session.commit()
        resent = client.post(f"/api/delivery/rider/deliveries/{delivery.id}/resend-otp")
        self.assertEqual(resent.status_code, 200)
        self.assertIsNotNone(old_otp.replaced_at)
        self.assertEqual(active_otp(delivery).resend_count, 1)
        self.assertEqual(client.post(f"/api/delivery/rider/deliveries/{other_delivery.id}/resend-otp").status_code, 404)

    @patch("backend.cli.send_email", return_value=Mock(status="sent"))
    def test_annual_teacher_reminder_includes_never_reminded_accounts(self, email_mock):
        role = Role(name="user", description="Teacher")
        teacher = User(email="teacher-reminder@example.com", first_name="Ama", role=role, is_active=True, is_verified=True)
        teacher.set_password("TeacherPassword123!")
        db.session.add_all([role, teacher])
        db.session.commit()

        result = self.app.test_cli_runner().invoke(args=["send-teacher-profile-reminders", "--force"])
        self.assertEqual(result.exit_code, 0, result.output)
        self.assertEqual(email_mock.call_count, 1)
        self.assertEqual(teacher.profile_reminder_sent_year, date.today().year)

    def test_demographic_analytics_use_order_and_account_snapshots(self):
        role = Role(name="user", description="Public account")
        user = User(email="demographics@example.com", first_name="Kojo", role=role, sex="male", age_range="25_34")
        user.set_password("Password123!")
        order = self._order("RMX-DEMOGRAPHICS")
        order.customer_sex = "female"
        order.customer_age_range = "35_44"
        db.session.add_all([role, user])
        db.session.commit()
        now = datetime.now(timezone.utc)
        payload = build_analytics_dashboard({
            "start": now - timedelta(days=1), "end": now + timedelta(days=1),
            "compare_start": now - timedelta(days=3), "compare_end": now - timedelta(days=1),
            "preset": "custom", "label": "Test", "start_date": date.today().isoformat(),
            "end_date": date.today().isoformat(), "compare_start_date": date.today().isoformat(),
            "compare_end_date": date.today().isoformat(),
        })
        self.assertEqual(payload["bookshop"]["customer_demographics"]["sex"][0]["label"], "Female")
        self.assertEqual(payload["registered_user_demographics"]["age_ranges"][0]["label"], "25-34")

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="failed"))
    def test_tracking_uses_delivery_milestone_times(self, _sms, _email):
        company, _ = create_company({"name": "Timeline Company"})
        order = self._order("RMX-TEST-TIMELINE")
        delivery = assign_order_to_company(order, company, ("admin", 1))
        preparing_at = datetime(2026, 7, 9, 9, 15, tzinfo=timezone.utc)
        assigned_at = datetime(2026, 7, 10, 1, 30, tzinfo=timezone.utc)
        delivery.assigned_at = assigned_at
        db.session.add(AuditLog(
            action="update_order_status",
            entity_type="order",
            entity_id=str(order.id),
            details={"status": "confirmed", "prev": "new"},
            created_at=preparing_at,
        ))
        db.session.commit()

        payload = order_tracking_json(order)
        self.assertTrue(payload["status_times"]["preparing_at"].startswith("2026-07-09T09:15:00"))
        self.assertTrue(payload["delivery_tracking"]["assigned_at"].startswith("2026-07-10T01:30:00"))

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="failed"))
    def test_partner_assignment_email_uses_company_portal_cta(self, _sms, email_mock):
        company, _ = create_company({"name": "CTA Company", "contact_email": "dispatch@example.com"})
        order = self._order("RMX-TEST-CTA")
        assign_order_to_company(order, company, ("admin", 1))

        partner_email = next(
            call.args[0]
            for call in email_mock.call_args_list
            if call.args and call.args[0].subject.startswith("New delivery assigned:")
        )
        self.assertIn("Open delivery company portal", partner_email.html)
        self.assertIn("https://delivery.realmindxgh.com/manager/", partner_email.html)
        self.assertNotIn("Track your order", partner_email.html)

    @patch("backend.delivery_service.send_email", return_value=Mock(status="accepted"))
    @patch("backend.delivery_service.send_sms", return_value=Mock(status="failed"))
    def test_admin_can_open_company_detail_with_delivery(self, _sms, _email):
        admin_role = Role(name="admin", description="Admin")
        admin = User(email="detail-admin@example.com", first_name="Admin", role=admin_role, is_verified=True, is_active=True)
        admin.set_password("AdminPassword123!")
        db.session.add_all([admin_role, admin])
        db.session.flush()
        company, _ = create_company({"name": "Detail Company"})
        order = self._order("RMX-TEST-DETAIL")
        assign_order_to_company(order, company, ("admin", admin.id))
        db.session.commit()

        client = self.app.test_client()
        login = client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"})
        self.assertEqual(login.status_code, 200)
        response = client.get(f"/api/admin/delivery-companies/{company.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["deliveries"][0]["order_reference"], order.order_reference)

    def test_public_bookshop_pages_are_indexable_and_in_sitemap(self):
        category = ProductCategory(name="Mathematics", slug="mathematics", is_active=True)
        product = Product(
            name="Mathematics Practice Book",
            slug="mathematics-practice-book",
            category=category,
            price=45,
            stock_status="in_stock",
            quantity_available=10,
            subject="Mathematics",
            level="JHS",
            is_active=True,
        )
        db.session.add_all([category, product])
        db.session.commit()
        client = self.app.test_client()

        for path in [
            "/products/mathematics-practice-book",
            "/categories/mathematics",
            "/subjects/mathematics",
            "/track",
            "/invoice",
        ]:
            response = client.get(path, headers={"Host": "bookshop.realmindxgh.com"})
            self.assertEqual(response.status_code, 200, path)
            document = response.get_data(as_text=True)
            self.assertIn('content="index, follow"', document, path)
            self.assertIn(f'href="https://bookshop.realmindxgh.com{path}"', document, path)

        sitemap = client.get("/sitemap.xml", headers={"Host": "bookshop.realmindxgh.com"}).get_data(as_text=True)
        self.assertIn("/products/mathematics-practice-book", sitemap)
        self.assertIn("/categories/mathematics", sitemap)
        self.assertIn("/subjects/mathematics", sitemap)
        self.assertIn("/track", sitemap)
        self.assertIn("/invoice", sitemap)

    def test_only_published_public_resources_have_indexable_detail_pages(self):
        resource_file = UploadedFile(
            original_filename="inclusive-education-guide.pdf",
            stored_filename="inclusive-education-guide.pdf",
            storage_path="public/resources/inclusive-education-guide.pdf",
            mime_type="application/pdf",
            size_bytes=1024,
            category="resources",
            visibility="public",
        )
        published = Resource(
            title="Inclusive Education Guide Ghana",
            category="Inclusive Education",
            description="A practical guide for inclusive education in Ghanaian schools.",
            subject="General",
            document_type="Guide",
            copyright_status="Official public document",
            is_published=True,
            resource_file=resource_file,
        )
        private = Resource(
            title="Internal School Notes",
            category="School Management",
            copyright_status="Internal/private",
            is_published=True,
        )
        db.session.add_all([resource_file, published, private])
        db.session.commit()
        client = self.app.test_client()

        public_path = f"/documents/{published.id}-inclusive-education-guide-ghana"
        response = client.get(public_path, headers={"Host": "bookshop.realmindxgh.com"})
        self.assertEqual(response.status_code, 200)
        document = response.get_data(as_text=True)
        self.assertIn("Inclusive Education Guide Ghana | RealMindX Education Resource Library", document)
        self.assertIn('content="index, follow"', document)
        self.assertIn(f'href="https://bookshop.realmindxgh.com{public_path}"', document)
        self.assertIn('"@type": "DigitalDocument"', document)

        detail_api = client.get(f"/api/resources/{published.id}")
        self.assertEqual(detail_api.status_code, 200)
        self.assertEqual(detail_api.get_json()["item"]["detail_url"], public_path)
        self.assertEqual(client.get(f"/api/resources/{private.id}").status_code, 404)

        private_page = client.get(f"/documents/{private.id}-internal-school-notes", headers={"Host": "bookshop.realmindxgh.com"})
        self.assertEqual(private_page.status_code, 404)
        self.assertIn('content="noindex, follow"', private_page.get_data(as_text=True))

        sitemap = client.get("/sitemap.xml", headers={"Host": "bookshop.realmindxgh.com"}).get_data(as_text=True)
        self.assertIn(public_path, sitemap)
        self.assertNotIn(f"/documents/{private.id}-", sitemap)

    def test_private_portal_shells_are_noindex(self):
        client = self.app.test_client()
        for path in ["/admin/dashboard", "/staff/dashboard", "/delivery-company/", "/delivery/", "/manager/", "/rider/"]:
            response = client.get(path, headers={"Host": "realmindxgh.com"})
            self.assertEqual(response.status_code, 200, path)
            self.assertIsNone(response.headers.get("Location"), path)
            self.assertEqual(response.headers.get("X-Robots-Tag"), "noindex, nofollow", path)
            document = response.get_data(as_text=True)
            self.assertIn('content="noindex, nofollow"', document, path)
            self.assertIn(f'href="https://realmindxgh.com{path.rstrip("/")}"', document, path)

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
