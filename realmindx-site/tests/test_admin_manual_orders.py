import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import Contact, DeliveryZone, Order, Product, Role, User


class AdminManualOrderConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "admin-manual-order-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    BOOKSHOP_FROM_EMAIL = "bookshop@example.com"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False
    COMMUNICATION_MODE = "mock"


class AdminManualOrderTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(AdminManualOrderConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()
        role = Role(name="admin", description="Administrator")
        self.admin = User(
            email="admin@example.com",
            first_name="Admin",
            last_name="User",
            role=role,
            is_active=True,
            is_verified=True,
        )
        self.admin.set_password("StrongPassword123!")
        self.zone = DeliveryZone(
            name="Adenta",
            fee="25.00",
            region="Greater Accra",
            is_delivery_area=True,
            is_search_alias_only=False,
            is_active=True,
        )
        db.session.add_all([role, self.admin, self.zone])
        db.session.commit()
        response = self.client.post(
            "/api/auth/login",
            json={"email": self.admin.email, "password": "StrongPassword123!", "surface": "admin"},
        )
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def payload(self, **overrides):
        payload = {
            "customer_name": "Ama Mensah",
            "email": "AMA@EXAMPLE.COM",
            "phone": "+233201234567",
            "delivery_method": "delivery",
            "delivery_zone_id": self.zone.id,
            "delivery_fee": "25.00",
            "location": "Adenta New Site, House 12",
            "delivery_region": "Greater Accra",
            "notes": "Call before delivery",
            "payment_option": "partially_paid",
            "payment_method": "mobile_money",
            "payment_reference": "MOMO-MANUAL-1001",
            "amount_paid": "100.00",
            "items": [{
                "product_name": "Special Mathematics Workbook",
                "quantity": 10,
                "unit_price": "50.00",
            }],
        }
        payload.update(overrides)
        return payload

    @patch("backend.api.bookshop._send_order_placed_notifications_safely")
    def test_partial_order_tracks_bulk_discount_balance_contact_and_notifications(self, notify):
        response = self.client.post("/api/admin/orders", json=self.payload())
        self.assertEqual(response.status_code, 201, response.get_json())
        result = response.get_json()["order"]

        self.assertEqual(result["source"], "admin")
        self.assertEqual(result["payment_option"], "partially_paid")
        self.assertEqual(result["payment_status"], "partially_paid")
        self.assertEqual(result["subtotal_amount"], 500.0)
        self.assertEqual(result["bulk_discount_amount"], 50.0)
        self.assertEqual(result["delivery_fee"], 25.0)
        self.assertEqual(result["total_amount"], 475.0)
        self.assertEqual(result["amount_paid"], 100.0)
        self.assertEqual(result["balance_due"], 375.0)
        self.assertEqual(result["created_by"], "Admin User")
        self.assertIsNone(result["items"][0]["product_id"])
        notify.assert_called_once()

        order = Order.query.filter_by(order_reference=result["order_reference"]).one()
        self.assertEqual(order.location, "Adenta New Site, House 12")
        self.assertEqual(order.created_by_id, self.admin.id)
        contact = Contact.query.filter_by(email="ama@example.com").one()
        self.assertEqual(contact.full_name, "Ama Mensah")
        self.assertEqual(contact.phone, "+233201234567")
        self.assertEqual(len(contact.sources), 1)
        self.assertEqual(contact.sources[0].source, "bookshop")
        self.assertEqual(contact.sources[0].details["interaction"], "admin_manual_order")

        tracked = self.client.get(f"/api/orders/track?q={result['order_reference']}")
        self.assertEqual(tracked.status_code, 200)
        tracked_order = tracked.get_json()["items"][0]
        self.assertEqual(tracked_order["payment_option"], "partially_paid")
        self.assertEqual(tracked_order["amount_paid"], 100.0)
        self.assertEqual(tracked_order["balance_due"], 375.0)

    @patch("backend.api.bookshop._send_order_placed_notifications_safely")
    def test_fully_paid_order_creates_receipt(self, _notify):
        response = self.client.post("/api/admin/orders", json=self.payload(
            payment_option="fully_paid",
            payment_method="cash",
            payment_reference="",
            amount_paid="",
            delivery_method="pickup",
            delivery_zone_id="",
            delivery_fee=0,
            location="",
            items=[{"product_name": "Off-catalogue Reader", "quantity": 2, "unit_price": "75.50"}],
        ))
        self.assertEqual(response.status_code, 201, response.get_json())
        order = response.get_json()["order"]
        self.assertEqual(order["payment_status"], "paid")
        self.assertEqual(order["amount_paid"], 151.0)
        self.assertEqual(order["balance_due"], 0.0)
        self.assertTrue(order["payment_reference"].startswith("RMX-MAN-"))

        ledger = self.client.get("/api/admin/receipts-invoices")
        row = next(item for item in ledger.get_json()["items"] if item["order_reference"] == order["order_reference"])
        self.assertEqual(row["document_type"], "receipt")
        self.assertEqual(row["source"], "admin_order")
        self.assertEqual(row["amount_paid"], 151.0)

    @patch("backend.api.bookshop._send_order_placed_notifications_safely")
    def test_payment_on_delivery_order_keeps_full_balance(self, _notify):
        response = self.client.post("/api/admin/orders", json=self.payload(
            payment_option="payment_on_delivery",
            payment_method="mobile_money",
            payment_reference="ignored-by-server",
            amount_paid="100.00",
            delivery_method="pickup",
            delivery_zone_id="",
            delivery_fee=0,
            location="",
            items=[{"product_name": "Requested Story Book", "quantity": 1, "unit_price": "60.00"}],
        ))
        self.assertEqual(response.status_code, 201, response.get_json())
        order = response.get_json()["order"]
        self.assertEqual(order["status"], "new")
        self.assertEqual(order["payment_status"], "unpaid")
        self.assertEqual(order["payment_method"], "cash_on_delivery")
        self.assertEqual(order["amount_paid"], 0.0)
        self.assertEqual(order["balance_due"], 60.0)
        self.assertIsNone(order["payment_reference"])

    def test_partial_payment_must_be_less_than_total(self):
        response = self.client.post("/api/admin/orders", json=self.payload(amount_paid="475.00"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("less than the order total", response.get_json()["error"])
        self.assertEqual(Order.query.count(), 0)

    @patch("backend.api.bookshop._send_order_placed_notifications_safely")
    def test_public_checkout_cannot_set_admin_payment_option(self, _notify):
        product = Product(
            name="Published Reader",
            slug="published-reader",
            price="40.00",
            stock_status="in_stock",
            is_active=True,
        )
        db.session.add(product)
        db.session.commit()
        response = self.client.post("/api/orders", json={
            "customer_name": "Public Customer",
            "email": "public@example.com",
            "phone": "+233209999999",
            "delivery_method": "pickup",
            "payment_method": "cash_on_delivery",
            "payment_option": "fully_paid",
            "amount_paid": "999.00",
            "items": [{"product_id": product.id, "quantity": 1}],
        })
        self.assertEqual(response.status_code, 201, response.get_json())
        order = Order.query.filter_by(order_reference=response.get_json()["order"]["order_reference"]).one()
        self.assertEqual(order.source, "bookshop")
        self.assertIsNone(order.payment_option)
        self.assertEqual(float(order.amount_paid), 0.0)
        self.assertEqual(float(order.balance_due), 40.0)


if __name__ == "__main__":
    unittest.main()
