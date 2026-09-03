import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.communications import CommunicationResult
from backend.config import Config
from backend.extensions import db
from backend.models import CartInvoice, Product


class CartInvoiceRecipientConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "cart-invoice-recipient-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    BOOKSHOP_FROM_EMAIL = "bookshop@example.com"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False
    COMMUNICATION_MODE = "mock"


class CartInvoiceRecipientTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CartInvoiceRecipientConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()
        self.product = Product(
            name="Integrated Science Workbook",
            slug="integrated-science-workbook",
            price="48.50",
            stock_status="in_stock",
            is_active=True,
        )
        db.session.add(self.product)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def payload(self, **overrides):
        payload = {
            "customer_name": "Ama Mensah",
            "emails": ["ama@example.com", "bursar@example.com"],
            "items": [{"product_id": self.product.id, "quantity": 2}],
        }
        payload.update(overrides)
        return payload

    def test_receiving_name_is_required(self):
        response = self.client.post(
            "/api/cart-invoices/email",
            json=self.payload(customer_name=""),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("receiving individual", response.get_json()["error"].lower())
        self.assertEqual(CartInvoice.query.count(), 0)

    @patch("backend.api.bookshop._send_cart_invoice_email")
    def test_receiving_name_is_saved_and_returned_on_emailed_invoice(self, mock_send):
        mock_send.return_value = CommunicationResult(
            channel="email",
            purpose="transactional",
            provider="test",
            mode="live",
            status="accepted",
            template_name="cart_invoice",
        )
        response = self.client.post("/api/cart-invoices/email", json=self.payload())
        self.assertEqual(response.status_code, 201, response.get_json())
        invoice_json = response.get_json()["invoice"]
        self.assertEqual(invoice_json["customer_name"], "Ama Mensah")
        self.assertEqual(invoice_json["email"], "ama@example.com")

        invoice = CartInvoice.query.filter_by(invoice_id=invoice_json["invoice_id"]).one()
        self.assertEqual(invoice.customer_name, "Ama Mensah")
        self.assertEqual(invoice.customer_email, "ama@example.com")
        self.assertEqual(invoice.recipients, ["ama@example.com", "bursar@example.com"])
        self.assertEqual(mock_send.call_count, 2)

        lookup = self.client.get(f"/api/invoices/{invoice.invoice_id}")
        self.assertEqual(lookup.status_code, 200)
        self.assertEqual(lookup.get_json()["invoice"]["customer_name"], "Ama Mensah")
        pdf = self.client.get(f"/api/invoices/{invoice.invoice_id}/pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.mimetype, "application/pdf")


if __name__ == "__main__":
    unittest.main()
