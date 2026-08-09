import sys
import unittest
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.contacts import remove_contact_source, upsert_contact, upsert_newsletter_subscription
from backend.extensions import db
from backend.models import Contact, ContactSource, NewsletterSubscriber


class ContactTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "contact-tests"
    RATELIMIT_ENABLED = False
    COMMUNICATION_MODE = "mock"
    MAIL_SERVER = ""
    RESEND_API_KEY = ""


class ContactLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(ContactTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_sources_deduplicate_by_normalized_email(self):
        teacher = upsert_contact(" PERSON@Example.com ", source="teacher", source_record_id=10)
        customer = upsert_contact("person@example.com", source="bookshop", source_record_id=20)
        db.session.commit()
        self.assertEqual(teacher.id, customer.id)
        self.assertEqual(Contact.query.count(), 1)
        self.assertEqual({row.source for row in ContactSource.query.all()}, {"teacher", "bookshop"})

    def test_repeated_source_is_idempotent(self):
        first = upsert_contact("person@example.com", source="teacher", source_record_id=10)
        second = upsert_contact("person@example.com", source="teacher", source_record_id=10)
        db.session.commit()
        self.assertEqual(first.id, second.id)
        self.assertEqual(ContactSource.query.count(), 1)

    def test_newsletter_subscription_links_to_contact(self):
        subscriber, contact = upsert_newsletter_subscription("person@example.com", source="site")
        db.session.commit()
        self.assertEqual(subscriber.contact_id, contact.id)
        self.assertTrue(subscriber.is_active)

    def test_contact_survives_until_last_source_removed(self):
        contact = upsert_contact("person@example.com", source="teacher", source_record_id=10)
        upsert_contact("person@example.com", source="bookshop", source_record_id=20)
        db.session.commit()
        self.assertFalse(remove_contact_source(contact, "teacher"))
        self.assertTrue(remove_contact_source(contact, "bookshop"))
        db.session.commit()
        self.assertEqual(Contact.query.count(), 0)


if __name__ == "__main__":
    unittest.main()
