from decimal import Decimal
from datetime import datetime, timezone
import hashlib
import hmac
import re
from uuid import uuid4

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from markupsafe import escape
import requests
from sqlalchemy import or_

from ..audit import audit
from ..email_service import OutboundEmail, bookshop_email_shell, send_email
from ..location_data import GHANA_REGIONS
from ..sms_service import send_sms
from ..extensions import csrf, db, limiter
from ..models import DeliveryZone, Order, OrderItem, Product, ProductCategory, ProductReview
from ..security import require_turnstile
from ..serializers import category_json, delivery_zone_json, order_json, product_json, product_review_json

bookshop_bp = Blueprint("bookshop", __name__)


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "item"


def clean_email(email):
    try:
        return validate_email(email or "", check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc


def new_order_reference():
    return f"RMX-{uuid4().hex[:8].upper()}"


def new_payment_reference():
    return f"RMX-PAY-{uuid4().hex[:12].upper()}"


def find_delivery_zone(payload):
    if (payload.get("delivery_method") or payload.get("delivery") or "delivery") == "pickup":
        return None
    zone_id = payload.get("delivery_zone_id")
    if zone_id:
        zone = db.session.get(DeliveryZone, zone_id)
        if zone and zone.is_active:
            return zone
    zone_name = (payload.get("delivery_zone") or payload.get("delivery_zone_name") or payload.get("location") or "").strip()
    if zone_name:
        return DeliveryZone.query.filter(DeliveryZone.name.ilike(zone_name), DeliveryZone.is_active.is_(True)).first()
    return None


@bookshop_bp.get("/products/categories")
def list_product_categories():
    categories = (
        ProductCategory.query
        .join(Product, Product.category_id == ProductCategory.id)
        .filter(ProductCategory.is_active.is_(True), Product.is_active.is_(True))
        .distinct()
        .order_by(ProductCategory.sort_order.asc(), ProductCategory.name.asc())
        .all()
    )
    return jsonify(items=[category_json(category) | {"type": "category"} for category in categories])


@bookshop_bp.get("/products")
def list_products():
    query = Product.query.filter_by(is_active=True)
    q = request.args.get("q")
    category = request.args.get("category")
    subject = request.args.get("subject")
    level = request.args.get("level")
    curriculum = request.args.get("curriculum")
    publisher = request.args.get("publisher")
    if q:
        like = f"%{q}%"
        query = query.outerjoin(ProductCategory).filter(
            or_(
                Product.name.ilike(like),
                Product.short_description.ilike(like),
                Product.full_description.ilike(like),
                Product.subject.ilike(like),
                Product.level.ilike(like),
                Product.curriculum.ilike(like),
                Product.author.ilike(like),
                Product.publisher.ilike(like),
                ProductCategory.name.ilike(like),
            )
        )
    if category:
        if category == "curriculum":
            query = query.filter(Product.curriculum.isnot(None), Product.curriculum != "")
        elif category.startswith("curriculum-"):
            matching = [
                name
                for (name,) in db.session.query(Product.curriculum).filter(Product.curriculum.isnot(None)).distinct().all()
                if f"curriculum-{slugify(name)}" == category
            ]
            query = query.filter(Product.curriculum.in_(matching or ["__none__"]))
        else:
            query = query.filter(Product.category.has(ProductCategory.slug == category))
    if subject:
        query = query.filter(Product.subject == subject)
    if level:
        query = query.filter(Product.level == level)
    if curriculum:
        query = query.filter(Product.curriculum == curriculum)
    if publisher:
        query = query.filter(Product.publisher == publisher)
    products = query.order_by(Product.featured.desc(), Product.created_at.desc()).limit(100).all()
    return jsonify(items=[product_json(product) for product in products])


@bookshop_bp.get("/products/<int:product_id>")
def get_product(product_id):
    product = db.get_or_404(Product, product_id)
    if not product.is_active:
        return jsonify(error="Product not available."), 404
    return jsonify(product=product_json(product))


@bookshop_bp.get("/products/<int:product_id>/reviews")
def list_product_reviews(product_id):
    """Public, moderated reviews for a product — the statuses here must stay
    in sync with serializers._product_rating so the list matches the
    rating_average/rating_count aggregates shown on cards."""
    product = db.get_or_404(Product, product_id)
    if not product.is_active:
        return jsonify(error="Product not available."), 404
    reviews = (
        ProductReview.query.filter(
            ProductReview.product_id == product.id,
            ProductReview.status.in_(["approved", "published"]),
        )
        .order_by(ProductReview.created_at.desc())
        .all()
    )
    return jsonify(items=[product_review_json(review) for review in reviews])


@bookshop_bp.post("/products/<int:product_id>/reviews")
@limiter.limit("10/hour")
def create_product_review(product_id):
    product = db.get_or_404(Product, product_id)
    if not product.is_active:
        return jsonify(error="Product not available."), 404
    payload = request.get_json(silent=True) or {}
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    customer_name = (payload.get("customer_name") or payload.get("name") or "").strip()
    if not customer_name:
        return jsonify(error="Name is required."), 400
    try:
        rating = int(payload.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        return jsonify(error="Rating must be between 1 and 5."), 400

    order = None
    order_reference = (payload.get("order_reference") or "").strip()
    if order_reference:
        order = Order.query.filter_by(order_reference=order_reference, email=email).first()

    review = ProductReview(
        product=product,
        order=order,
        customer_name=customer_name,
        email=email,
        rating=rating,
        title=(payload.get("title") or "").strip() or None,
        comment=(payload.get("comment") or "").strip() or None,
        status="pending",
    )
    db.session.add(review)
    db.session.commit()
    return jsonify(message="Review received. It will appear after moderation.", review={"id": review.id, "status": review.status}), 201


@bookshop_bp.get("/delivery-zones")
def list_delivery_zones():
    zones = DeliveryZone.query.filter_by(is_active=True).order_by(DeliveryZone.sort_order.asc(), DeliveryZone.name.asc()).all()
    return jsonify(items=[delivery_zone_json(zone) for zone in zones])


def order_tracking_json(order):
    payload = order_json(order)
    payload["created_at"] = order.created_at.isoformat() if order.created_at else None
    payload["updated_at"] = order.updated_at.isoformat() if order.updated_at else None
    payload["paid_at"] = order.paid_at.isoformat() if order.paid_at else None
    return payload


@bookshop_bp.get("/orders/track")
@limiter.limit("20/minute")
def track_orders():
    query = (request.args.get("q") or request.args.get("query") or "").strip()
    if not query:
        return jsonify(error="Enter your order reference or checkout email."), 400

    orders_query = Order.query
    if re.fullmatch(r"RMX-[A-Za-z0-9-]+", query):
        orders_query = orders_query.filter(Order.order_reference.ilike(query.upper()))
    elif "@" in query:
        try:
            email = clean_email(query)
        except ValueError:
            return jsonify(error="Enter a valid order reference or checkout email."), 400
        orders_query = orders_query.filter_by(email=email)
    else:
        return jsonify(error="Enter a valid RMX order reference or checkout email."), 400

    orders = orders_query.order_by(Order.created_at.desc()).limit(5).all()
    return jsonify(items=[order_tracking_json(order) for order in orders])


@bookshop_bp.get("/orders/mine")
@login_required
@limiter.limit("60/minute")
def my_orders():
    """Return the authenticated user's order history.
    Matches by email (orders placed as guest with same email are included).
    Supports: page, per_page (max 40), q (order ref search), sort, status.
    """
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(max(1, int(request.args.get("per_page", 40))), 40)
    except (TypeError, ValueError):
        page, per_page = 1, 40
    q = (request.args.get("q") or "").strip()
    sort = request.args.get("sort", "newest")
    status_filter = (request.args.get("status") or "").strip()

    # Match by user_id where set (logged-in checkout) OR by email (guest checkout)
    query = Order.query.filter(
        or_(Order.email == current_user.email, Order.user_id == current_user.id)
    )
    if q:
        like = f"%{q}%"
        item_match = db.session.query(OrderItem.order_id).filter(OrderItem.product_name.ilike(like))
        query = query.filter(
            or_(
                Order.order_reference.ilike(like),
                Order.id.in_(item_match),
            )
        )
    if status_filter:
        query = query.filter(Order.status == status_filter)
    if sort == "oldest":
        query = query.order_by(Order.created_at.asc())
    else:
        query = query.order_by(Order.created_at.desc())

    total = query.count()
    orders = query.offset((page - 1) * per_page).limit(per_page).all()
    return jsonify(
        items=[order_tracking_json(order) for order in orders],
        total=total,
        page=page,
        per_page=per_page,
        pages=max(1, (total + per_page - 1) // per_page),
    )


@bookshop_bp.post("/orders")
@limiter.limit("8/hour")
def create_order():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    items = payload.get("items") or []
    if not items:
        return jsonify(error="At least one order item is required."), 400

    delivery_method = payload.get("delivery_method") or payload.get("delivery") or "delivery"
    if delivery_method not in {"delivery", "pickup"}:
        return jsonify(error="Choose home delivery or pickup."), 400
    payment_method = (payload.get("payment_method") or "online").strip().lower()
    if payment_method not in {"online", "cash_on_delivery"}:
        return jsonify(error="Choose online payment or payment on delivery."), 400
    delivery_zone = find_delivery_zone(payload)
    delivery_fee = Decimal("0") if delivery_method == "pickup" else Decimal(str(delivery_zone.fee if delivery_zone else 0))
    location = (payload.get("location") or "").strip() or None
    delivery_region = (payload.get("delivery_region") or "").strip() or None
    custom_delivery_area = bool(payload.get("custom_delivery_area"))
    if delivery_method == "delivery" and not location:
        return jsonify(error="Delivery address is required."), 400
    if delivery_method == "delivery" and custom_delivery_area and delivery_region not in GHANA_REGIONS:
        return jsonify(error="Select a valid Ghana region for the custom delivery area."), 400

    order = Order(
        order_reference=new_order_reference(),
        customer_name=(payload.get("customer_name") or payload.get("name") or "").strip(),
        email=email,
        phone=(payload.get("phone") or "").strip(),
        delivery_method=delivery_method,
        delivery_zone_id=delivery_zone.id if delivery_zone else None,
        delivery_zone_name=delivery_zone.name if delivery_zone else ("Other" if custom_delivery_area else None),
        delivery_fee=delivery_fee,
        location=location,
        delivery_region=delivery_region,
        notes=(payload.get("notes") or "").strip() or None,
        status="received",
        payment_status="unpaid" if payment_method == "cash_on_delivery" else "pending",
        payment_method=payment_method,
        payment_provider="cash_on_delivery" if payment_method == "cash_on_delivery" else None,
    )
    if not order.customer_name or not order.phone:
        return jsonify(error="Customer name and phone are required."), 400

    total = Decimal("0")
    db.session.add(order)
    db.session.flush()
    for item in items:
        product = db.session.get(Product, item.get("product_id")) if item.get("product_id") else None
        quantity = max(int(item.get("quantity") or 1), 1)
        name = product.name if product else (item.get("product_name") or "Requested item")
        unit_price = Decimal(str(product.price if product else item.get("unit_price") or 0))
        total += unit_price * quantity
        db.session.add(OrderItem(order_id=order.id, product_id=product.id if product else None, product_name=name, unit_price=unit_price, quantity=quantity))
    order.subtotal_amount = total
    order.total_amount = total + delivery_fee
    audit("order_placed", "order", order.id, {
        "order_reference": order.order_reference,
        "customer_email": email,
        "total": float(total + delivery_fee),
        "delivery_method": order.delivery_method,
        "payment_method": order.payment_method,
        "delivery_region": order.delivery_region,
        "items": len(items),
    })
    db.session.commit()

    # SMS confirmation — sent immediately after order is placed
    if order.phone:
        first = (order.customer_name or "").split()[0] or "there"
        send_sms(
            order.phone,
            f"Hi {first}, your RealMindX Bookshop order {order.order_reference} "
            f"has been received! "
            f"{'Payment is due on delivery. ' if order.payment_method == 'cash_on_delivery' else 'Online payment is pending. '}"
            f"We'll contact you within 24 hrs to confirm. "
            f"Reply STOP to opt out."
        )

    first_name = (order.customer_name or "").split()[0] or "there"
    delivery_info = (
        "Pickup at our Dome Pillar 2 shop"
        if order.delivery_method == "pickup"
        else f"Delivery to: {order.location or 'address on file'}"
    )
    payment_info = (
        "Payment on delivery"
        if order.payment_method == "cash_on_delivery"
        else "Online payment via Paystack"
    )
    items_list_html = "".join(
        f"<p style='margin:4px 0;'>&bull; {escape(i.product_name)} x{i.quantity} @ GH&#8373;{float(i.unit_price):,.2f}</p>"
        for i in order.items
    )

    # Customer confirmation — warm, detailed, professional
    send_email(OutboundEmail(
        to=email,
        from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
        subject=f"Your RealMindX Bookshop order is in: {order.order_reference}",
        html=bookshop_email_shell(
            "Your order has been placed!",
            f"""
            <p>Hello {escape(first_name)},</p>
            <p>Thank you for shopping with <strong>RealMindX Bookshop</strong>! We&rsquo;ve received your
            order and our team will have it ready for you shortly.</p>

            <div style="background:#f5f8fc;border-left:4px solid #f2bd00;border-radius:6px;
                         padding:16px 20px;margin:20px 0;">
              <p style="margin:0 0 8px;font-weight:800;color:#0b1d38;">Order summary</p>
              <p style="margin:0 0 4px;"><strong>Reference:</strong> {escape(order.order_reference)}</p>
              {items_list_html}
              <p style="margin:10px 0 0;font-weight:800;">
                Total: GH&#8373;{float(order.total_amount):,.2f}
              </p>
            </div>

            <p style="margin:0 0 6px;">
              <strong>Delivery:</strong> {escape(delivery_info)}<br/>
              <strong>Payment:</strong> {escape(payment_info)}<br/>
              <strong>Contact number:</strong> {escape(order.phone or "not provided")}
            </p>

            <p>Our team will reach out to you within <strong>24 hours</strong> to confirm availability
            and arrange delivery or pickup. If you&rsquo;d prefer to speak with us right away, simply
            reply to this email or give us a call.</p>
            <p>We appreciate your trust in RealMindX and look forward to getting your books to you!</p>
            """,
            cta_label="Visit the Bookshop",
            cta_url=current_app.config.get("BOOKSHOP_URL", ""),
            eyebrow="RealMindX Bookshop",
            preheader=f"Order {order.order_reference} received. We will be in touch within 24 hours.",
        ),
    ))

    # Internal staff notification
    send_email(OutboundEmail(
        to=current_app.config["DEFAULT_REPLY_TO_EMAIL"],
        from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
        subject=f"New bookshop order {order.order_reference} from {order.customer_name}",
        html=bookshop_email_shell(
            f"New order from {escape(order.customer_name)}",
            f"""
            <p>A new order has been placed via the RealMindX Bookshop.</p>
            <div style="background:#f5f8fc;border-radius:8px;padding:16px 20px;margin:16px 0;">
              <p style="margin:0 0 6px;"><strong>Reference:</strong> {escape(order.order_reference)}</p>
              <p style="margin:0 0 6px;"><strong>Customer:</strong> {escape(order.customer_name)}</p>
              <p style="margin:0 0 6px;"><strong>Email:</strong>
                <a href="mailto:{escape(email)}" style="color:#0b1d38;">{escape(email)}</a></p>
              <p style="margin:0 0 6px;"><strong>Phone:</strong> {escape(order.phone or "not provided")}</p>
              <p style="margin:0 0 6px;"><strong>Delivery:</strong> {escape(delivery_info)}</p>
              <p style="margin:0 0 6px;"><strong>Payment:</strong> {escape(payment_info)}</p>
              <p style="margin:10px 0 0;font-weight:800;">Total: GH&#8373;{float(order.total_amount):,.2f}</p>
            </div>
            {items_list_html}
            """,
            cta_label="View in Admin Dashboard",
            cta_url=f"{current_app.config['BASE_URL']}/admin/dashboard",
            eyebrow="RealMindX Internal: New Order Alert",
        ),
    ))
    return jsonify(order=order_json(order)), 201


@bookshop_bp.post("/orders/<int:order_id>/paystack/initialize")
@limiter.limit("8/hour")
def initialize_paystack_payment(order_id):
    order = db.get_or_404(Order, order_id)
    if order.payment_method != "online":
        return jsonify(error="This order is set for payment on delivery."), 400
    secret_key = current_app.config.get("PAYSTACK_SECRET_KEY")
    if not secret_key:
        return jsonify(error="Paystack is not configured for this environment."), 503
    if order.payment_status == "paid":
        return jsonify(order=order_json(order), message="Order is already paid.")
    if not order.total_amount or order.total_amount <= 0:
        return jsonify(error="Order total must be greater than zero before payment."), 400

    payload = request.get_json(silent=True) or {}
    order.payment_reference = order.payment_reference or new_payment_reference()
    amount_pesewas = int(Decimal(str(order.total_amount)) * 100)
    callback_url = payload.get("callback_url") or f"{current_app.config['BOOKSHOP_URL'].rstrip('/')}/order-success?ref={order.order_reference}"
    try:
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"},
            json={
                "email": order.email,
                "amount": amount_pesewas,
                "reference": order.payment_reference,
                "callback_url": callback_url,
                "metadata": {
                    "order_id": order.id,
                    "order_reference": order.order_reference,
                    "delivery_fee": float(order.delivery_fee or 0),
                },
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json().get("data") or {}
    except requests.RequestException:
        current_app.logger.exception("Paystack transaction initialization failed for order %s", order.order_reference)
        return jsonify(error="Payment initialization failed. Please try again or contact RealMindX Bookshop."), 502
    order.payment_provider = "paystack"
    order.payment_status = "pending"
    order.payment_access_code = data.get("access_code")
    order.payment_authorization_url = data.get("authorization_url")
    db.session.commit()
    return jsonify(order=order_json(order), payment=data)


@bookshop_bp.post("/paystack/webhook")
@csrf.exempt
def paystack_webhook():
    secret_key = current_app.config.get("PAYSTACK_SECRET_KEY")
    if not secret_key:
        return jsonify(error="Paystack is not configured."), 503
    raw_body = request.get_data()
    signature = request.headers.get("x-paystack-signature", "")
    digest = hmac.new(secret_key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(digest, signature):
        return jsonify(error="Invalid Paystack signature."), 401
    event = request.get_json(silent=True) or {}
    data = event.get("data") or {}
    reference = data.get("reference")
    if event.get("event") == "charge.success" and reference:
        order = Order.query.filter_by(payment_reference=reference).first()
        if order:
            order.payment_provider = "paystack"
            order.payment_status = "paid"
            order.paid_at = datetime.now(timezone.utc)
            if order.status in {"new", "received"}:
                order.status = "confirmed"
            audit("paystack_payment_confirmed", "order", order.id, {
                "order_reference": order.order_reference,
                "reference": reference,
                "amount": float(order.total_amount or 0),
            }, actor_email=order.email)
            db.session.commit()
    return jsonify(message="Webhook processed.")


@bookshop_bp.post("/bulk-orders")
@limiter.limit("5/hour")
def bulk_order():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    name = (payload.get("name") or payload.get("organisation") or "").strip()
    details = (payload.get("details") or payload.get("message") or "").strip()
    if not name or not details:
        return jsonify(error="Name and order details are required."), 400
    send_email(
        OutboundEmail(
            to=current_app.config["DEFAULT_REPLY_TO_EMAIL"],
            from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
            subject="New RealMindX bulk order enquiry",
            html=bookshop_email_shell("Bulk order enquiry", f"<p><strong>{name}</strong> ({email}) requested:</p><p>{details}</p>"),
        )
    )
    audit("bulk_order_enquiry", "bulk_order", None, {"name": name, "email": email}, actor_email=email)
    db.session.commit()
    return jsonify(message="Bulk order request received. We will respond with a quote."), 201
