from datetime import datetime, timezone

from flask_login import UserMixin
from sqlalchemy import UniqueConstraint
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


role_permissions = db.Table(
    "role_permissions",
    db.Column("role_id", db.Integer, db.ForeignKey("roles.id"), primary_key=True),
    db.Column("permission_id", db.Integer, db.ForeignKey("permissions.id"), primary_key=True),
)

staff_permissions = db.Table(
    "staff_permissions",
    db.Column("user_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
    db.Column("permission_id", db.Integer, db.ForeignKey("permissions.id"), primary_key=True),
)


class TimestampMixin:
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Role(TimestampMixin, db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)
    permissions = db.relationship("Permission", secondary=role_permissions, back_populates="roles")


class Permission(TimestampMixin, db.Model):
    __tablename__ = "permissions"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)
    roles = db.relationship("Role", secondary=role_permissions, back_populates="permissions")


class User(UserMixin, TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(120), nullable=False)
    last_name = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(40), nullable=True)
    phone_verified = db.Column(db.Boolean, default=False, nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    must_change_password = db.Column(db.Boolean, default=False, nullable=False)
    two_factor_enabled = db.Column(db.Boolean, default=False, nullable=False)
    failed_login_count = db.Column(db.Integer, default=0, nullable=False)
    locked_until = db.Column(db.DateTime(timezone=True), nullable=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    role = db.relationship("Role")
    profile = db.relationship("UserProfile", uselist=False, back_populates="user", cascade="all, delete-orphan")
    direct_permissions = db.relationship("Permission", secondary=staff_permissions)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def full_name(self):
        return " ".join(part for part in [self.first_name, self.last_name] if part)

    def has_permission(self, permission_key):
        if self.role and self.role.name == "admin":
            return True
        role_keys = {p.key for p in self.role.permissions} if self.role else set()
        direct_keys = {p.key for p in self.direct_permissions}
        return permission_key in role_keys or permission_key in direct_keys


class AuthIdentity(TimestampMixin, db.Model):
    __tablename__ = "auth_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id", name="uq_auth_provider_user"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    provider = db.Column(db.String(50), nullable=False)
    provider_user_id = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    user = db.relationship("User", backref="auth_identities")


class UserProfile(TimestampMixin, db.Model):
    __tablename__ = "user_profiles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    location = db.Column(db.String(160), nullable=True)
    # Multi-select fields store a comma-joined list of values (e.g.
    # "Mathematics, Physics, Chemistry"). Text (no length cap) because the
    # official option lists are long and growing, teachers can pick many at
    # once, and "Other" lets them append arbitrary custom entries — a fixed
    # String(N) would silently truncate (or error on some drivers) the moment
    # a handful of longer option names were combined.
    teaching_subject = db.Column(db.Text, nullable=True)
    preferred_level = db.Column(db.Text, nullable=True)
    preferred_employment_type = db.Column(db.Text, nullable=True)
    available_from = db.Column(db.String(80), nullable=True)
    curriculum_experience = db.Column(db.Text, nullable=True)
    preferred_locations = db.Column(db.Text, nullable=True)
    preferred_location_ids = db.Column(db.Text, nullable=True)
    bio = db.Column(db.Text, nullable=True)
    profile_picture_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    cv_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    certificate_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    next_of_kin_name = db.Column(db.String(160), nullable=True)
    next_of_kin_phone = db.Column(db.String(40), nullable=True)
    next_of_kin_relationship = db.Column(db.String(80), nullable=True)
    next_of_kin_email = db.Column(db.String(255), nullable=True)
    years_of_experience = db.Column(db.Integer, nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    payout_method = db.Column(db.String(40), nullable=True)
    payout_momo_network = db.Column(db.String(80), nullable=True)
    payout_momo_number = db.Column(db.String(40), nullable=True)
    payout_bank_name = db.Column(db.String(160), nullable=True)
    payout_bank_account_name = db.Column(db.String(160), nullable=True)
    payout_bank_account_number = db.Column(db.String(80), nullable=True)
    payout_notes = db.Column(db.Text, nullable=True)

    user = db.relationship("User", back_populates="profile")


class UploadedFile(TimestampMixin, db.Model):
    __tablename__ = "uploaded_files"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    original_filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    mime_type = db.Column(db.String(120), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(60), nullable=False)
    visibility = db.Column(db.String(20), default="protected", nullable=False)


class Job(TimestampMixin, db.Model):
    __tablename__ = "jobs"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False, index=True)
    organisation = db.Column(db.String(180), nullable=True)
    location = db.Column(db.String(160), nullable=False, index=True)
    delivery_zone_id = db.Column(db.Integer, db.ForeignKey("delivery_zones.id"), nullable=True, index=True)
    subject = db.Column(db.String(160), nullable=True, index=True)
    level = db.Column(db.String(120), nullable=True, index=True)
    curriculum = db.Column(db.String(180), nullable=True, index=True)
    employment_type = db.Column(db.String(80), nullable=True, index=True)
    description = db.Column(db.Text, nullable=False)
    requirements = db.Column(db.Text, nullable=True)
    responsibilities = db.Column(db.Text, nullable=True)
    deadline = db.Column(db.Date, nullable=True)
    salary_min = db.Column(db.Numeric(12, 2), nullable=True)
    salary_max = db.Column(db.Numeric(12, 2), nullable=True)
    salary_currency = db.Column(db.String(10), default="GHS", nullable=False)
    status = db.Column(db.String(30), default="draft", nullable=False, index=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    delivery_zone = db.relationship("DeliveryZone")


class JobApplication(TimestampMixin, db.Model):
    __tablename__ = "job_applications"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job_application"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False, index=True)
    status = db.Column(db.String(30), default="pending", nullable=False, index=True)
    cover_note = db.Column(db.Text, nullable=True)
    cv_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    certificate_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)

    user = db.relationship("User", backref="job_applications")
    job = db.relationship("Job", backref="applications")


class TeacherPlacement(TimestampMixin, db.Model):
    __tablename__ = "teacher_placements"
    __table_args__ = (UniqueConstraint("application_id", name="uq_teacher_placement_application"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    application_id = db.Column(db.Integer, db.ForeignKey("job_applications.id"), nullable=False, index=True)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=True, index=True)
    school_name = db.Column(db.String(180), nullable=False)
    job_title = db.Column(db.String(180), nullable=True)
    status = db.Column(db.String(40), default="accepted", nullable=False, index=True)
    accepted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    started_at = db.Column(db.Date, nullable=True)
    ended_at = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    user = db.relationship("User", backref=db.backref("teacher_placements", cascade="all, delete-orphan"))
    application = db.relationship("JobApplication", backref=db.backref("placement", uselist=False, cascade="all, delete-orphan"))
    job = db.relationship("Job")


class JobAlertPreference(TimestampMixin, db.Model):
    __tablename__ = "job_alert_preferences"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    # Text, not String(160): _sync_profile_to_alert_preference() seeds this
    # directly from UserProfile.teaching_subject, which is now a comma-joined
    # multi-select value — it must be able to hold whatever that column holds.
    subject = db.Column(db.Text, nullable=True)
    location = db.Column(db.Text, nullable=True)
    location_ids = db.Column(db.Text, nullable=True)
    preferred_level = db.Column(db.Text, nullable=True)
    curriculum = db.Column(db.Text, nullable=True)
    employment_type = db.Column(db.Text, nullable=True)
    alert_by_email = db.Column(db.Boolean, default=True, nullable=False)
    frequency = db.Column(db.String(30), default="instant", nullable=False)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    last_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)


class ProductCategory(TimestampMixin, db.Model):
    __tablename__ = "product_categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    slug = db.Column(db.String(140), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    # Bulk discount: if qty >= bulk_min_qty, apply bulk_discount_percent% off that line
    bulk_discount_percent = db.Column(db.Numeric(5, 2), default=0, nullable=False)
    bulk_min_qty = db.Column(db.Integer, default=10, nullable=False)


class Product(TimestampMixin, db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey("product_categories.id"), nullable=True, index=True)
    name = db.Column(db.String(180), nullable=False, index=True)
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    price = db.Column(db.Numeric(12, 2), nullable=False)
    old_price = db.Column(db.Numeric(12, 2), nullable=True)
    short_description = db.Column(db.String(300), nullable=True)
    full_description = db.Column(db.Text, nullable=True)
    image_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    stock_status = db.Column(db.String(30), default="in_stock", nullable=False, index=True)
    quantity_available = db.Column(db.Integer, nullable=True)
    subject = db.Column(db.String(160), nullable=True, index=True)
    level = db.Column(db.String(120), nullable=True, index=True)
    curriculum = db.Column(db.String(160), nullable=True, index=True)
    author = db.Column(db.String(180), nullable=True, index=True)
    publisher = db.Column(db.String(180), nullable=True, index=True)
    product_type = db.Column(db.String(120), nullable=True)
    source = db.Column(db.String(180), nullable=True)
    featured = db.Column(db.Boolean, default=False, nullable=False)
    delivery_note = db.Column(db.String(255), nullable=True)
    tags = db.Column(db.JSON, default=list, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    category = db.relationship("ProductCategory", backref="products")
    image_file = db.relationship("UploadedFile", foreign_keys=[image_file_id])


class Order(TimestampMixin, db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    order_reference = db.Column(db.String(40), unique=True, nullable=False, index=True)
    invoice_id = db.Column(db.String(40), unique=True, nullable=True, index=True)
    payment_reference = db.Column(db.String(80), unique=True, nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    customer_name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    delivery_method = db.Column(db.String(30), nullable=False)
    delivery_zone_id = db.Column(db.Integer, db.ForeignKey("delivery_zones.id"), nullable=True, index=True)
    delivery_zone_name = db.Column(db.String(160), nullable=True)
    delivery_fee = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    location = db.Column(db.String(255), nullable=True)
    delivery_region = db.Column(db.String(80), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default="new", nullable=False, index=True)
    payment_status = db.Column(db.String(30), default="unpaid", nullable=False, index=True)
    payment_method = db.Column(db.String(40), default="online", nullable=False, index=True)
    payment_provider = db.Column(db.String(40), nullable=True)
    payment_access_code = db.Column(db.String(120), nullable=True)
    payment_authorization_url = db.Column(db.String(500), nullable=True)
    subtotal_amount = db.Column(db.Numeric(12, 2), nullable=True)
    bulk_discount_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    promo_code = db.Column(db.String(40), nullable=True, index=True)
    promo_applies_to = db.Column(db.String(20), nullable=True)
    promo_discount_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    total_amount = db.Column(db.Numeric(12, 2), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    analytics_session_key = db.Column(db.String(80), nullable=True, index=True)
    analytics_visitor_key = db.Column(db.String(80), nullable=True, index=True)
    cart_invoice_id = db.Column(db.Integer, db.ForeignKey("cart_invoices.id"), nullable=True, index=True)

    delivery_zone = db.relationship("DeliveryZone")
    cart_invoice = db.relationship("CartInvoice", foreign_keys=[cart_invoice_id])


class BookshopPaymentIntent(TimestampMixin, db.Model):
    __tablename__ = "bookshop_payment_intents"

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(80), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), unique=True, nullable=True, index=True)
    customer_name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    phone = db.Column(db.String(40), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    currency = db.Column(db.String(8), default="GHS", nullable=False)
    status = db.Column(db.String(30), default="initialized", nullable=False, index=True)
    provider = db.Column(db.String(40), default="paystack", nullable=False)
    access_code = db.Column(db.String(120), nullable=True)
    authorization_url = db.Column(db.String(500), nullable=True)
    checkout_data = db.Column(db.JSON, default=dict, nullable=False)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)

    order = db.relationship("Order", foreign_keys=[order_id])


class DeliveryZone(TimestampMixin, db.Model):
    __tablename__ = "delivery_zones"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), unique=True, nullable=False, index=True)
    fee = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    description = db.Column(db.Text, nullable=True)
    aliases = db.Column(db.Text, nullable=True)
    region = db.Column(db.String(80), nullable=True)
    district_or_municipality = db.Column(db.String(140), nullable=True)
    nearby_major_town = db.Column(db.String(120), nullable=True)
    delivery_zone_label = db.Column(db.String(120), nullable=True)
    is_delivery_area = db.Column(db.Boolean, default=True, nullable=False)
    is_search_alias_only = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    sort_order = db.Column(db.Integer, default=0, nullable=False)


class CheckoutDetail(TimestampMixin, db.Model):
    __tablename__ = "checkout_details"
    __table_args__ = (
        UniqueConstraint("user_id", "fingerprint", name="uq_checkout_detail_user_fingerprint"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    label = db.Column(db.String(120), nullable=True)
    customer_name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    delivery_zone_id = db.Column(db.Integer, db.ForeignKey("delivery_zones.id"), nullable=True, index=True)
    delivery_zone_name = db.Column(db.String(160), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(160), nullable=True)
    region = db.Column(db.String(80), nullable=True)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    last_used_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
    fingerprint = db.Column(db.String(64), nullable=False)

    delivery_zone = db.relationship("DeliveryZone")


class OrderItem(TimestampMixin, db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True, index=True)
    product_name = db.Column(db.String(180), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    order = db.relationship("Order", backref=db.backref("items", cascade="all, delete-orphan"))
    product = db.relationship("Product")


class CartInvoice(TimestampMixin, db.Model):
    __tablename__ = "cart_invoices"

    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.String(40), unique=True, nullable=False, index=True)
    subtotal_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    bulk_discount_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    promo_code = db.Column(db.String(40), nullable=True)
    promo_applies_to = db.Column(db.String(20), nullable=True)
    promo_discount_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    delivery_fee = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    total_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    status = db.Column(db.String(30), default="generated", nullable=False, index=True)
    emailed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    viewed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    converted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    converted_order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True, index=True)
    reminder_3d_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    reminder_10d_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    recipients = db.Column(db.JSON, default=list, nullable=False)

    converted_order = db.relationship("Order", foreign_keys=[converted_order_id], post_update=True)


class CartInvoiceItem(TimestampMixin, db.Model):
    __tablename__ = "cart_invoice_items"

    id = db.Column(db.Integer, primary_key=True)
    cart_invoice_id = db.Column(db.Integer, db.ForeignKey("cart_invoices.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True, index=True)
    product_name = db.Column(db.String(180), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    cart_invoice = db.relationship("CartInvoice", backref=db.backref("items", cascade="all, delete-orphan"))
    product = db.relationship("Product")


class ProductReview(TimestampMixin, db.Model):
    __tablename__ = "product_reviews"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True, index=True)
    customer_name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    rating = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(160), nullable=True)
    comment = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default="pending", nullable=False, index=True)

    product = db.relationship("Product", backref=db.backref("reviews", cascade="all, delete-orphan"))
    order = db.relationship("Order")


class OrderReview(TimestampMixin, db.Model):
    __tablename__ = "order_reviews"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, unique=True, index=True)
    customer_name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    score = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default="new", nullable=False, index=True)
    source = db.Column(db.String(30), default="email", nullable=False)
    admin_notes = db.Column(db.Text, nullable=True)

    order = db.relationship("Order", backref=db.backref("review", uselist=False, cascade="all, delete-orphan"))


class AnalyticsEvent(TimestampMixin, db.Model):
    __tablename__ = "analytics_events"

    id = db.Column(db.Integer, primary_key=True)
    event_type = db.Column(db.String(60), nullable=False, index=True)
    session_key = db.Column(db.String(80), nullable=True, index=True)
    visitor_key = db.Column(db.String(80), nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    host = db.Column(db.String(160), nullable=True, index=True)
    path = db.Column(db.String(255), nullable=True, index=True)
    full_path = db.Column(db.String(500), nullable=True)
    page_title = db.Column(db.String(255), nullable=True)
    page_type = db.Column(db.String(80), nullable=True, index=True)
    referrer = db.Column(db.String(500), nullable=True)
    referrer_host = db.Column(db.String(160), nullable=True, index=True)
    traffic_source = db.Column(db.String(120), nullable=True, index=True)
    traffic_medium = db.Column(db.String(120), nullable=True, index=True)
    campaign = db.Column(db.String(160), nullable=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True, index=True)
    news_id = db.Column(db.Integer, db.ForeignKey("news.id"), nullable=True, index=True)
    service_id = db.Column(db.String(120), nullable=True, index=True)
    search_term = db.Column(db.String(255), nullable=True, index=True)
    search_scope = db.Column(db.String(40), nullable=True, index=True)
    results_count = db.Column(db.Integer, nullable=True)
    had_results = db.Column(db.Boolean, nullable=True)
    device_type = db.Column(db.String(40), nullable=True, index=True)
    browser = db.Column(db.String(80), nullable=True, index=True)
    operating_system = db.Column(db.String(80), nullable=True)
    country = db.Column(db.String(80), nullable=True, index=True)
    region = db.Column(db.String(80), nullable=True, index=True)
    city = db.Column(db.String(120), nullable=True, index=True)
    ip_hash = db.Column(db.String(64), nullable=True, index=True)
    ip_prefix = db.Column(db.String(80), nullable=True)
    quantity = db.Column(db.Integer, nullable=True)
    value_amount = db.Column(db.Numeric(12, 2), nullable=True)
    details = db.Column("metadata", db.JSON, default=dict, nullable=False)

    user = db.relationship("User")
    product = db.relationship("Product")
    news = db.relationship("News")


class NewsletterSubscriber(TimestampMixin, db.Model):
    __tablename__ = "newsletter_subscribers"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    source = db.Column(db.String(80), default="site", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    confirmed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    unsubscribe_token = db.Column(db.String(64), unique=True, nullable=True, index=True)
    communication_status = db.Column(db.String(40), default="marketing_active", nullable=False, index=True)
    sources = db.Column(db.JSON, default=list, nullable=False)
    tags = db.Column(db.JSON, default=list, nullable=False)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_invoice_generated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_invoice_used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_order_at = db.Column(db.DateTime(timezone=True), nullable=True)
    notes = db.Column(db.Text, nullable=True)


class News(TimestampMixin, db.Model):
    __tablename__ = "news"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    category = db.Column(db.String(80), nullable=True)
    summary = db.Column(db.String(300), nullable=True)
    body = db.Column(db.Text, nullable=False)
    sections = db.Column(db.JSON, default=list, nullable=False)
    image_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    status = db.Column(db.String(30), default="draft", nullable=False)
    published_at = db.Column(db.DateTime(timezone=True), nullable=True)
    # Editor-controlled "Display Date" shown with the post (distinct from published_at,
    # which is an automatic system stamp set the moment status flips to "published").
    display_date = db.Column(db.Date, nullable=True)
    image_file = db.relationship("UploadedFile", foreign_keys=[image_file_id])


class GalleryItem(TimestampMixin, db.Model):
    __tablename__ = "gallery_items"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=True)
    image_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    is_published = db.Column(db.Boolean, default=False, nullable=False)
    image_file = db.relationship("UploadedFile", foreign_keys=[image_file_id])


class Flyer(TimestampMixin, db.Model):
    """Hero flyers shown in the bookshop homepage slideshow."""
    __tablename__ = "flyers"

    id = db.Column(db.Integer, primary_key=True)
    headline = db.Column(db.String(160), nullable=True)
    accent = db.Column(db.String(160), nullable=True)     # gold-highlighted line
    subline = db.Column(db.String(300), nullable=True)
    badge = db.Column(db.String(60), nullable=True)        # CTA pill text
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    image_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    show_overlay = db.Column(db.Boolean, default=True, nullable=False)
    image_fit = db.Column(db.String(20), default="cover", nullable=False)
    image_position = db.Column(db.String(40), default="center", nullable=False)
    status = db.Column(db.String(20), default="published", nullable=False)
    is_focus = db.Column(db.Boolean, default=False, nullable=False)

    image_file = db.relationship("UploadedFile", foreign_keys=[image_file_id])


class Resource(TimestampMixin, db.Model):
    __tablename__ = "resources"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(160), nullable=True)
    resource_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id"), nullable=True)
    external_url = db.Column(db.String(500), nullable=True)
    is_published = db.Column(db.Boolean, default=False, nullable=False)
    resource_file = db.relationship("UploadedFile", foreign_keys=[resource_file_id])


class PromoCode(TimestampMixin, db.Model):
    """Promotional codes for product and/or delivery discounts."""
    __tablename__ = "promo_codes"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)
    discount_type = db.Column(db.String(20), default="percentage", nullable=False)   # percentage | fixed
    discount_value = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    applies_to = db.Column(db.String(20), default="products", nullable=False)        # products | delivery | all
    min_order_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)       # 0 = no minimum
    max_uses = db.Column(db.Integer, nullable=True)                                   # null = unlimited
    uses_count = db.Column(db.Integer, default=0, nullable=False)
    valid_from = db.Column(db.Date, nullable=True)
    valid_until = db.Column(db.Date, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    affiliate_name = db.Column(db.String(160), nullable=True)
    affiliate_email = db.Column(db.String(255), nullable=True)
    affiliate_phone = db.Column(db.String(40), nullable=True)
    affiliate_commission_percent = db.Column(db.Numeric(5, 2), default=0, nullable=False)
    affiliate_notify_on_use = db.Column(db.Boolean, default=True, nullable=False)


class PromoCodeUsage(TimestampMixin, db.Model):
    """Commission ledger entry created when an affiliate promo order completes."""
    __tablename__ = "promo_code_usages"
    __table_args__ = (UniqueConstraint("order_id", "promo_code_id", name="uq_promo_usage_order_code"),)

    id = db.Column(db.Integer, primary_key=True)
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    code = db.Column(db.String(40), nullable=False, index=True)
    affiliate_name = db.Column(db.String(160), nullable=True)
    affiliate_email = db.Column(db.String(255), nullable=True, index=True)
    commission_percent = db.Column(db.Numeric(5, 2), default=0, nullable=False)
    merchandise_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    commission_amount = db.Column(db.Numeric(12, 2), default=0, nullable=False)
    status = db.Column(db.String(30), default="earned", nullable=False, index=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    notified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    statement_sent_at = db.Column(db.DateTime(timezone=True), nullable=True)

    promo_code = db.relationship("PromoCode", backref=db.backref("usages", cascade="all, delete-orphan"))
    order = db.relationship("Order", backref=db.backref("promo_usage", uselist=False, cascade="all, delete-orphan"))


class ContactMessage(TimestampMixin, db.Model):
    __tablename__ = "contact_messages"

    id = db.Column(db.Integer, primary_key=True)
    ticket_reference = db.Column(db.String(20), nullable=True, unique=True, index=True)
    name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(40), nullable=True)
    subject = db.Column(db.String(180), nullable=False)
    message = db.Column(db.Text, nullable=False)
    source = db.Column(db.String(80), default="site", nullable=False)
    status = db.Column(db.String(30), default="new", nullable=False, index=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    notes = db.Column(db.Text, nullable=True)


class SiteSetting(TimestampMixin, db.Model):
    __tablename__ = "site_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(120), unique=True, nullable=False, index=True)
    value = db.Column(db.JSON, nullable=True)
    public = db.Column(db.Boolean, default=False, nullable=False)


class AuditLog(TimestampMixin, db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    action = db.Column(db.String(120), nullable=False)
    entity_type = db.Column(db.String(120), nullable=True)
    entity_id = db.Column(db.String(80), nullable=True)
    details = db.Column("metadata", db.JSON, default=dict, nullable=False)
    ip_address = db.Column(db.String(80), nullable=True)


class EmailVerificationToken(TimestampMixin, db.Model):
    __tablename__ = "email_verification_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(255), nullable=False, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)


class AccountSecurityCode(TimestampMixin, db.Model):
    __tablename__ = "account_security_codes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    purpose = db.Column(db.String(40), nullable=False, index=True)
    token_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)


class ContactChangeToken(TimestampMixin, db.Model):
    __tablename__ = "contact_change_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    field = db.Column(db.String(20), nullable=False, index=True)
    target_value = db.Column(db.String(255), nullable=False)
    token_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)


class PasswordResetToken(TimestampMixin, db.Model):
    __tablename__ = "password_reset_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(255), nullable=False, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
