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
from backend.models import BookshopPaymentIntent, CartInvoice, Contact, Order, Product, Role, User


class AdminSalesInvoiceConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "admin-sales-invoice-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    BOOKSHOP_FROM_EMAIL = "bookshop@example.com"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False
    PAYSTACK_SECRET_KEY = "test-paystack-secret"
    COMMUNICATION_MODE = "mock"


class AdminSalesInvoiceTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(AdminSalesInvoiceConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()
        role = Role(name="admin", description="Administrator")
        admin = User(
            email="admin@example.com",
            first_name="Admin",
            last_name="User",
            role=role,
            is_active=True,
            is_verified=True,
        )
        admin.set_password("StrongPassword123!")
        db.session.add_all([role, admin])
        db.session.commit()
        response = self.client.post(
            "/api/auth/login",
            json={"email": admin.email, "password": "StrongPassword123!", "surface": "admin"},
        )
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    @staticmethod
    def invoice_payload(**overrides):
        payload = {
            "customer_name": "Ama Mensah",
            "email": "ama@example.com",
            "phone": "+233201234567",
            "delivery_method": "pickup",
            "delivery_fee": 0,
            "send_email": False,
            "items": [
                {
                    "product_name": "Special Mathematics Workbook",
                    "description": "2026 edition, not in the public catalogue",
                    "quantity": 2,
                    "unit_price": "75.50",
                }
            ],
        }
        payload.update(overrides)
        return payload

    def create_invoice(self, **overrides):
        response = self.client.post("/api/admin/invoices", json=self.invoice_payload(**overrides))
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()["invoice"]

    def test_admin_can_create_payable_invoice_with_custom_line(self):
        invoice_json = self.create_invoice()
        self.assertEqual(invoice_json["invoice_type"], "sales")
        self.assertEqual(invoice_json["payment_status"], "unpaid")
        self.assertTrue(invoice_json["can_pay_online"])
        self.assertEqual(invoice_json["subtotal_amount"], 151.0)
        self.assertEqual(invoice_json["total_amount"], 151.0)
        self.assertIsNone(invoice_json["items"][0]["product_id"])
        self.assertEqual(invoice_json["items"][0]["product_name"], "Special Mathematics Workbook")

        public_lookup = self.client.get(f"/api/invoices/{invoice_json['invoice_id']}")
        self.assertEqual(public_lookup.status_code, 200)
        self.assertEqual(public_lookup.get_json()["invoice"]["invoice_type"], "sales")
        self.assertTrue(public_lookup.get_json()["invoice"]["can_pay_online"])
        pdf = self.client.get(f"/api/invoices/{invoice_json['invoice_id']}/pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.mimetype, "application/pdf")

        invoice = CartInvoice.query.filter_by(invoice_id=invoice_json["invoice_id"]).one()
        self.assertEqual(invoice.source, "admin")
        self.assertEqual(invoice.created_by.email, "admin@example.com")
        contact = Contact.query.filter_by(email="ama@example.com").one()
        self.assertEqual(contact.full_name, "Ama Mensah")
        self.assertEqual(contact.phone, "+233201234567")

    def test_admin_invoice_applies_ten_percent_bulk_discount_at_ten_copies(self):
        invoice_json = self.create_invoice(items=[{
            "product_name": "Bulk Special-order Book",
            "quantity": 10,
            "unit_price": "50.00",
        }])
        self.assertEqual(invoice_json["subtotal_amount"], 500.0)
        self.assertEqual(invoice_json["bulk_discount_amount"], 50.0)
        self.assertEqual(invoice_json["total_amount"], 450.0)

    def test_admin_invoice_cannot_be_linked_through_ordinary_cart_checkout(self):
        invoice_json = self.create_invoice()
        product = Product(
            name="Published Book",
            slug="published-book",
            price="10.00",
            stock_status="in_stock",
            is_active=True,
        )
        db.session.add(product)
        db.session.commit()
        response = self.client.post("/api/orders", json={
            "customer_name": "Different Customer",
            "email": "different@example.com",
            "phone": "+233209999999",
            "delivery_method": "pickup",
            "payment_method": "cash_on_delivery",
            "cart_invoice_id": invoice_json["invoice_id"],
            "items": [{"product_id": product.id, "quantity": 1}],
        })
        self.assertEqual(response.status_code, 409, response.get_json())
        self.assertIn("invoice page", response.get_json()["error"])
        invoice = CartInvoice.query.filter_by(invoice_id=invoice_json["invoice_id"]).one()
        self.assertIsNone(invoice.converted_order_id)

    @patch("backend.api.bookshop.requests.post")
    def test_online_payment_converts_custom_invoice_to_paid_order(self, mock_post):
        mock_post.return_value = Mock(
            raise_for_status=Mock(),
            json=Mock(return_value={"data": {
                "authorization_url": "https://checkout.paystack.test/invoice",
                "access_code": "access-code",
            }}),
        )
        invoice_json = self.create_invoice()
        start = self.client.post(f"/api/invoices/{invoice_json['invoice_id']}/paystack/initialize", json={})
        self.assertEqual(start.status_code, 201, start.get_json())
        self.assertTrue(start.get_json()["payment_intent"]["invoice_payment"])
        intent_reference = start.get_json()["payment_intent"]["reference"]
        intent = BookshopPaymentIntent.query.filter_by(reference=intent_reference).one()
        self.assertEqual(intent.cart_invoice.invoice_id, invoice_json["invoice_id"])
        self.assertIsNone(intent.checkout_data["order_items"][0]["product_id"])
        active_ledger = self.client.get("/api/admin/receipts-invoices").get_json()["items"]
        active_row = next(row for row in active_ledger if row["document_id"] == invoice_json["invoice_id"])
        self.assertTrue(active_row["has_active_online_payment"])
        self.assertFalse(active_row["can_record_payment"])

        paystack_data = {
            "status": "success",
            "reference": intent.reference,
            "amount": 15100,
            "currency": "GHS",
            "metadata": {"payment_intent_id": intent.id},
        }
        with patch("backend.api.bookshop.requests.get") as mock_get:
            mock_get.return_value = Mock(
                raise_for_status=Mock(),
                json=Mock(return_value={"data": paystack_data}),
            )
            verified = self.client.post(
                "/api/orders/paystack/verify",
                json={"payment_intent_reference": intent.reference},
            )
        self.assertEqual(verified.status_code, 200, verified.get_json())
        order_reference = verified.get_json()["order"]["order_reference"]
        order = Order.query.filter_by(order_reference=order_reference).one()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(order.items[0].product_name, "Special Mathematics Workbook")
        self.assertIsNone(order.items[0].product_id)

        invoice = CartInvoice.query.filter_by(invoice_id=invoice_json["invoice_id"]).one()
        self.assertEqual(invoice.payment_status, "paid")
        self.assertEqual(invoice.status, "converted")
        self.assertEqual(invoice.converted_order_id, order.id)

        duplicate_intent = BookshopPaymentIntent(
            reference="RMX-INV-DUPLICATE-PAYMENT",
            cart_invoice_id=invoice.id,
            customer_name=invoice.customer_name,
            email=invoice.customer_email,
            phone=invoice.customer_phone,
            amount=invoice.total_amount,
            currency=invoice.currency,
            status="initialized",
            checkout_data=intent.checkout_data,
        )
        db.session.add(duplicate_intent)
        db.session.commit()
        duplicate_data = {
            **paystack_data,
            "reference": duplicate_intent.reference,
            "metadata": {"payment_intent_id": duplicate_intent.id},
        }
        with patch("backend.api.bookshop.requests.get") as mock_get:
            mock_get.return_value = Mock(
                raise_for_status=Mock(),
                json=Mock(return_value={"data": duplicate_data}),
            )
            duplicate = self.client.post(
                "/api/orders/paystack/verify",
                json={"payment_intent_reference": duplicate_intent.reference},
            )
        self.assertEqual(duplicate.status_code, 200, duplicate.get_json())
        self.assertEqual(duplicate.get_json()["order"]["order_reference"], order.order_reference)
        self.assertEqual(duplicate_intent.status, "duplicate_paid")
        self.assertIsNone(duplicate_intent.order_id)

    @patch("backend.api.bookshop._send_order_placed_notifications_safely")
    def test_admin_can_record_offline_payment_and_ledger_shows_paid_receipt(self, _mock_notify):
        invoice_json = self.create_invoice()
        invoice = CartInvoice.query.filter_by(invoice_id=invoice_json["invoice_id"]).one()
        recorded = self.client.post(
            f"/api/admin/invoices/{invoice.id}/record-payment",
            json={"payment_method": "mobile_money", "payment_reference": "MOMO-12345"},
        )
        self.assertEqual(recorded.status_code, 200, recorded.get_json())
        self.assertEqual(recorded.get_json()["invoice"]["payment_status"], "paid")
        self.assertEqual(recorded.get_json()["order"]["payment_method"], "manual")

        ledger = self.client.get("/api/admin/receipts-invoices")
        self.assertEqual(ledger.status_code, 200)
        rows = ledger.get_json()["items"]
        self.assertTrue(any(row["document_type"] == "receipt" for row in rows))
        self.assertTrue(any(row["document_type"] == "sales_invoice" for row in rows))
        self.assertEqual(ledger.get_json()["summary"]["receipts"], 1)

    def test_admin_can_void_unpaid_invoice_but_not_paid_invoice(self):
        first_json = self.create_invoice()
        first = CartInvoice.query.filter_by(invoice_id=first_json["invoice_id"]).one()
        voided = self.client.post(f"/api/admin/invoices/{first.id}/void", json={"reason": "Customer cancelled"})
        self.assertEqual(voided.status_code, 200)
        self.assertEqual(voided.get_json()["invoice"]["status"], "voided")
        self.assertFalse(voided.get_json()["invoice"]["can_pay_online"])

        second_json = self.create_invoice(customer_name="Kojo Owusu", email="kojo@example.com")
        second = CartInvoice.query.filter_by(invoice_id=second_json["invoice_id"]).one()
        with patch("backend.api.bookshop._send_order_placed_notifications_safely"):
            paid = self.client.post(
                f"/api/admin/invoices/{second.id}/record-payment",
                json={"payment_method": "cash", "payment_reference": ""},
            )
        self.assertEqual(paid.status_code, 200)
        rejected = self.client.post(f"/api/admin/invoices/{second.id}/void", json={"reason": "Should fail"})
        self.assertEqual(rejected.status_code, 409)


if __name__ == "__main__":
    unittest.main()
