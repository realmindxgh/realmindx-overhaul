from decimal import Decimal
from datetime import datetime, timezone
import hashlib
import hmac
import re
from uuid import uuid4

from email_validator import EmailNotValidError, validate_email
from flask import Blueprint, current_app, jsonify, request, send_file
from flask_login import current_user, login_required
from markupsafe import escape
import requests
from sqlalchemy import or_

from ..analytics import queue_analytics_event
from ..audit import audit
from ..bookshop_search import product_search_filter, taxonomy_filter_terms
from ..checkout_details import upsert_checkout_detail
from ..email_service import (
    OutboundEmail,
    bookshop_email_shell,
    bookshop_order_summary_table,
    send_email,
)
from ..delivery_locations import delivery_zone_matches
from ..location_data import GHANA_REGIONS
from ..order_pricing import calculate_order_pricing, validate_promo_code_record
from ..order_status import ORDER_STATUS_ALIASES, normalize_order_status
from ..sms_service import send_sms
from ..extensions import csrf, db, limiter
from ..invoices import (
    assign_cart_invoice_id,
    assign_invoice_id,
    build_cart_invoice_pdf,
    build_invoice_pdf,
    build_receipt_pdf,
    cart_invoice_json,
    invoice_json,
)
from ..models import (
    BookshopPaymentIntent,
    CartInvoice,
    CartInvoiceItem,
    DeliveryZone,
    Order,
    OrderItem,
    OrderReview,
    Product,
    ProductCategory,
    ProductReview,
    PromoCode,
)
from ..security import require_turnstile
from ..serializers import category_json, delivery_zone_json, order_json, order_review_json, product_json, product_review_json

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
        if (
            zone
            and zone.is_active
            and getattr(zone, "is_delivery_area", True)
            and not getattr(zone, "is_search_alias_only", False)
        ):
            return zone
    zone_name = (payload.get("delivery_zone") or payload.get("delivery_zone_name") or payload.get("location") or "").strip()
    if zone_name:
        zones = DeliveryZone.query.filter(
            DeliveryZone.is_active.is_(True),
            DeliveryZone.is_delivery_area.is_(True),
            DeliveryZone.is_search_alias_only.is_(False),
        ).all()
        return next((zone for zone in zones if delivery_zone_matches(zone, zone_name)), None)
    return None


class CheckoutValidationError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _prepare_checkout(payload, *, payment_method=None):
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        raise CheckoutValidationError(str(exc)) from exc

    customer_name = (payload.get("customer_name") or payload.get("name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    if not customer_name or not phone:
        raise CheckoutValidationError("Customer name and phone are required.")

    requested_payment_method = (payment_method or payload.get("payment_method") or "online").strip().lower()
    if requested_payment_method not in {"online", "cash_on_delivery"}:
        raise CheckoutValidationError("Choose online payment or payment on delivery.")

    items = payload.get("items") or []
    if not items:
        raise CheckoutValidationError("At least one order item is required.")

    delivery_method = payload.get("delivery_method") or payload.get("delivery") or "delivery"
    if delivery_method not in {"delivery", "pickup"}:
        raise CheckoutValidationError("Choose home delivery or pickup.")
    delivery_zone = find_delivery_zone(payload)
    delivery_fee = Decimal("0") if delivery_method == "pickup" else Decimal(str(delivery_zone.fee if delivery_zone else 0))
    delivery_address = (payload.get("delivery_address") or "").strip()
    delivery_city = (payload.get("delivery_city") or "").strip()
    delivery_region = (payload.get("delivery_region") or "").strip() or None
    custom_delivery_area = bool(payload.get("custom_delivery_area"))
    location_parts = [
        delivery_city if custom_delivery_area else delivery_zone.name if delivery_zone else "",
        delivery_address,
        delivery_region,
    ]
    location = (payload.get("location") or "").strip() or ", ".join(filter(None, location_parts)) or None
    if delivery_method == "delivery" and not delivery_zone and not (custom_delivery_area and delivery_city):
        raise CheckoutValidationError("Choose a delivery area.")
    if delivery_method == "delivery" and custom_delivery_area and delivery_region not in GHANA_REGIONS:
        raise CheckoutValidationError("Select a valid Ghana region for the custom delivery area.")

    order_items = []
    for item in items:
        try:
            product_id = int(item.get("product_id"))
            quantity = max(int(item.get("quantity") or 1), 1)
        except (TypeError, ValueError) as exc:
            raise CheckoutValidationError("Every checkout item must match a published product.") from exc
        product = db.session.get(Product, product_id)
        if not product or not product.is_active:
            raise CheckoutValidationError("One of the selected products is no longer available.", 409)
        if (product.stock_status or "").lower() != "in_stock":
            raise CheckoutValidationError(f"{product.name} is currently out of stock.", 409)
        if product.quantity_available is not None and quantity > product.quantity_available:
            raise CheckoutValidationError(
                f"Only {product.quantity_available} cop{'y' if product.quantity_available == 1 else 'ies'} of {product.name} are available.",
                409,
            )
        order_items.append({
            "product_id": product.id,
            "name": product.name,
            "unit_price": Decimal(str(product.price or 0)),
            "quantity": quantity,
            "bulk_discount_percent": Decimal(str(product.category.bulk_discount_percent or 0)) if product.category else Decimal("0"),
            "bulk_min_qty": int(product.category.bulk_min_qty or 10) if product.category else 10,
        })

    pricing_preview = calculate_order_pricing(order_items, delivery_fee=delivery_fee, promo=None)
    promo_code_value = (payload.get("promo_code") or "").strip().upper() or None
    promo_row = None
    if promo_code_value:
        promo_row, error, status = validate_promo_code_record(
            promo_code_value,
            pricing_preview["goods_total_amount"] + pricing_preview["delivery_fee_amount"],
        )
        if error:
            raise CheckoutValidationError(error, status)
    pricing = calculate_order_pricing(order_items, delivery_fee=delivery_fee, promo=promo_row)

    return {
        "user_id": current_user.id if current_user.is_authenticated else None,
        "customer_name": customer_name,
        "email": email,
        "phone": phone,
        "delivery_method": delivery_method,
        "delivery_zone_id": delivery_zone.id if delivery_zone else None,
        "delivery_zone_name": delivery_zone.name if delivery_zone else ("Other" if custom_delivery_area else None),
        "delivery_fee": delivery_fee,
        "delivery_address": delivery_address,
        "delivery_city": delivery_city,
        "delivery_region": delivery_region,
        "location": location,
        "notes": (payload.get("notes") or "").strip() or None,
        "payment_method": requested_payment_method,
        "order_items": order_items,
        "pricing": pricing,
        "analytics_session_key": (request.cookies.get("rmx_analytics_session") or "").strip() or None,
        "analytics_visitor_key": (request.cookies.get("rmx_analytics_visitor") or "").strip() or None,
    }


def _checkout_snapshot(checkout):
    return {
        key: checkout.get(key)
        for key in (
            "user_id",
            "customer_name",
            "email",
            "phone",
            "delivery_method",
            "delivery_zone_id",
            "delivery_zone_name",
            "delivery_address",
            "delivery_city",
            "delivery_region",
            "location",
            "notes",
            "payment_method",
            "analytics_session_key",
            "analytics_visitor_key",
        )
    } | {
        "delivery_fee": str(checkout["delivery_fee"]),
        "order_items": [
            {
                **item,
                "unit_price": str(item["unit_price"]),
                "bulk_discount_percent": str(item["bulk_discount_percent"]),
                "bulk_min_qty": int(item.get("bulk_min_qty") or 10),
            }
            for item in checkout["order_items"]
        ],
        "pricing": {
            key: str(value) if isinstance(value, Decimal) else value
            for key, value in checkout["pricing"].items()
        },
    }


def _checkout_from_snapshot(snapshot):
    checkout = dict(snapshot or {})
    checkout["delivery_fee"] = Decimal(str(checkout.get("delivery_fee") or 0))
    checkout["order_items"] = [
        {
            **item,
            "unit_price": Decimal(str(item.get("unit_price") or 0)),
            "bulk_discount_percent": Decimal(str(item.get("bulk_discount_percent") or 0)),
            "bulk_min_qty": int(item.get("bulk_min_qty") or 10),
            "quantity": max(int(item.get("quantity") or 1), 1),
        }
        for item in checkout.get("order_items") or []
    ]
    checkout["pricing"] = {
        key: Decimal(str(value or 0)) if key.endswith("_amount") else value
        for key, value in (checkout.get("pricing") or {}).items()
    }
    return checkout


def _create_order_from_checkout(
    checkout,
    *,
    status,
    payment_status,
    payment_provider,
    payment_reference=None,
    payment_access_code=None,
    payment_authorization_url=None,
    paid_at=None,
):
    pricing = checkout["pricing"]
    order = Order(
        order_reference=new_order_reference(),
        payment_reference=payment_reference,
        user_id=checkout.get("user_id"),
        customer_name=checkout["customer_name"],
        email=checkout["email"],
        phone=checkout["phone"],
        delivery_method=checkout["delivery_method"],
        delivery_zone_id=checkout.get("delivery_zone_id"),
        delivery_zone_name=checkout.get("delivery_zone_name"),
        delivery_fee=checkout["delivery_fee"],
        location=checkout.get("location"),
        delivery_region=checkout.get("delivery_region"),
        notes=checkout.get("notes"),
        status=status,
        payment_status=payment_status,
        payment_method=checkout["payment_method"],
        payment_provider=payment_provider,
        payment_access_code=payment_access_code,
        payment_authorization_url=payment_authorization_url,
        subtotal_amount=pricing["subtotal_amount"],
        bulk_discount_amount=pricing["bulk_discount_amount"],
        promo_code=pricing.get("promo_code"),
        promo_applies_to=pricing.get("promo_applies_to"),
        promo_discount_amount=pricing["promo_discount_amount"],
        total_amount=pricing["total_amount"],
        paid_at=paid_at,
        analytics_session_key=checkout.get("analytics_session_key"),
        analytics_visitor_key=checkout.get("analytics_visitor_key"),
    )
    assign_invoice_id(order)
    db.session.add(order)
    db.session.flush()
    for item in checkout["order_items"]:
        db.session.add(OrderItem(
            order_id=order.id,
            product_id=item["product_id"],
            product_name=item["name"],
            unit_price=item["unit_price"],
            quantity=item["quantity"],
        ))
    if order.promo_code:
        promo = PromoCode.query.filter_by(code=order.promo_code).first()
        if promo:
            promo.uses_count = int(promo.uses_count or 0) + 1
    if checkout.get("user_id") and checkout["delivery_method"] == "delivery":
        upsert_checkout_detail(checkout["user_id"], {
            "customer_name": order.customer_name,
            "email": order.email,
            "phone": order.phone,
            "delivery_zone_id": order.delivery_zone_id,
            "delivery_zone_name": order.delivery_zone_name,
            "delivery_address": checkout.get("delivery_address"),
            "delivery_city": checkout.get("delivery_city") or order.delivery_zone_name or "",
            "delivery_region": order.delivery_region,
        })
    return order


def _placed_orders(query):
    return query.filter(
        or_(
            Order.payment_method.is_(None),
            Order.payment_method != "online",
            Order.payment_status == "paid",
        )
    )


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
        search_filter = product_search_filter(q)
        if search_filter is not None:
            query = query.outerjoin(ProductCategory).filter(search_filter)
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
        query = query.filter(or_(*(Product.subject.ilike(term) for term in taxonomy_filter_terms("subject", subject))))
    if level:
        query = query.filter(or_(*(Product.level.ilike(term) for term in taxonomy_filter_terms("level", level))))
    if curriculum:
        query = query.filter(or_(*(Product.curriculum.ilike(term) for term in taxonomy_filter_terms("curriculum", curriculum))))
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


def _product_review_eligibility(product_id, user_id):
    orders = (
        Order.query
        .join(OrderItem, OrderItem.order_id == Order.id)
        .filter(
            Order.user_id == user_id,
            OrderItem.product_id == product_id,
        )
        .order_by(Order.created_at.desc())
        .all()
    )
    completed_orders = [
        order for order in orders
        if normalize_order_status(order.status) == "complete"
    ]
    if not completed_orders:
        return None, False

    reviewed_order_ids = {
        row.order_id
        for row in ProductReview.query.filter(
            ProductReview.product_id == product_id,
            ProductReview.order_id.in_([order.id for order in completed_orders]),
        ).all()
    }
    eligible_order = next(
        (order for order in completed_orders if order.id not in reviewed_order_ids),
        None,
    )
    return eligible_order, bool(reviewed_order_ids)


@bookshop_bp.get("/products/<int:product_id>/review-eligibility")
@login_required
def product_review_eligibility(product_id):
    product = db.get_or_404(Product, product_id)
    if not product.is_active:
        return jsonify(error="Product not available."), 404

    order, already_reviewed = _product_review_eligibility(product.id, current_user.id)
    return jsonify(
        eligible=bool(order),
        already_reviewed=already_reviewed and not order,
        order_reference=order.order_reference if order else None,
    )


@bookshop_bp.post("/products/<int:product_id>/reviews")
@login_required
@limiter.limit("10/hour")
def create_product_review(product_id):
    product = db.get_or_404(Product, product_id)
    if not product.is_active:
        return jsonify(error="Product not available."), 404
    payload = request.get_json(silent=True) or {}
    try:
        rating = int(payload.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        return jsonify(error="Rating must be between 1 and 5."), 400

    order, already_reviewed = _product_review_eligibility(product.id, current_user.id)
    if not order:
        if already_reviewed:
            return jsonify(error="You have already reviewed this product purchase."), 409
        return jsonify(error="Only customers with a completed order for this product can leave a review."), 403

    review = ProductReview(
        product=product,
        order=order,
        customer_name=current_user.full_name,
        email=current_user.email,
        rating=rating,
        title=(payload.get("title") or "").strip() or None,
        comment=(payload.get("comment") or "").strip() or None,
        status="pending",
    )
    db.session.add(review)
    db.session.commit()
    return jsonify(message="Review received. It will appear after moderation.", review={"id": review.id, "status": review.status}), 201


@bookshop_bp.post("/orders/reviews")
@limiter.limit("10/hour")
def create_order_review():
    payload = request.get_json(silent=True) or {}
    order_reference = (payload.get("order_reference") or "").strip().upper()
    if not order_reference:
        return jsonify(error="Order reference is required."), 400
    try:
        email = clean_email(payload.get("email"))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    try:
        score = int(payload.get("score"))
    except (TypeError, ValueError):
        return jsonify(error="Choose a recommendation score between 1 and 10."), 400
    if score < 1 or score > 10:
        return jsonify(error="Recommendation score must be between 1 and 10."), 400

    order = Order.query.filter_by(order_reference=order_reference, email=email).first()
    if not order:
        return jsonify(error="We could not match that order reference to the email address provided."), 404
    if normalize_order_status(order.status) != "complete":
        return jsonify(error="Order reviews can only be submitted after delivery is marked complete."), 400
    if order.review:
        return jsonify(error="This order has already been reviewed."), 409

    review = OrderReview(
        order=order,
        customer_name=order.customer_name,
        email=email,
        score=score,
        comment=(payload.get("comment") or "").strip() or None,
        status="new",
        source=(payload.get("source") or "email").strip() or "email",
    )
    db.session.add(review)
    db.session.commit()
    return jsonify(
        message="Thank you for rating your RealMindX Bookshop order.",
        review=order_review_json(review),
    ), 201


@bookshop_bp.get("/delivery-zones")
def list_delivery_zones():
    zones = (
        DeliveryZone.query
        .filter(
            DeliveryZone.is_active.is_(True),
            DeliveryZone.is_delivery_area.is_(True),
            DeliveryZone.is_search_alias_only.is_(False),
        )
        .order_by(DeliveryZone.sort_order.asc(), DeliveryZone.name.asc())
        .all()
    )
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

    orders_query = _placed_orders(Order.query)
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


def _prepare_cart_invoice_items(payload_items):
    if not payload_items:
        raise CheckoutValidationError("Select at least one cart item to generate an invoice.")

    prepared = []
    for raw in payload_items:
        try:
            product_id = int(raw.get("product_id") or raw.get("id"))
            quantity = max(int(raw.get("quantity") or raw.get("qty") or 1), 1)
        except (TypeError, ValueError) as exc:
            raise CheckoutValidationError("Every invoice item must include a valid product and quantity.") from exc

        product = db.session.get(Product, product_id)
        if not product or not product.is_active:
            raise CheckoutValidationError("One of the selected products is no longer available.", 409)
        if product.stock_status == "out_of_stock":
            raise CheckoutValidationError(f"{product.name} is out of stock and cannot be added to an invoice.", 409)

        category = product.category
        prepared.append({
            "product_id": product.id,
            "name": product.name,
            "unit_price": Decimal(str(product.price or 0)),
            "quantity": quantity,
            "bulk_discount_percent": Decimal(str(getattr(category, "bulk_discount_percent", 0) or 0)),
            "bulk_min_qty": int(getattr(category, "bulk_min_qty", 10) or 10),
        })
    return prepared


@bookshop_bp.post("/cart-invoices")
@limiter.limit("20/hour")
def create_cart_invoice():
    payload = request.get_json(silent=True) or {}
    try:
        items = _prepare_cart_invoice_items(payload.get("items") or [])
    except CheckoutValidationError as exc:
        return jsonify(error=str(exc)), exc.status

    pricing = calculate_order_pricing(items, delivery_fee=0, promo=None)
    invoice = CartInvoice(
        subtotal_amount=pricing["subtotal_amount"],
        bulk_discount_amount=pricing["bulk_discount_amount"],
        promo_code=pricing.get("promo_code"),
        promo_applies_to=pricing.get("promo_applies_to"),
        promo_discount_amount=pricing["promo_discount_amount"],
        delivery_fee=Decimal("0.00"),
        total_amount=pricing["total_amount"],
        status="generated",
    )
    assign_cart_invoice_id(invoice)
    db.session.add(invoice)
    db.session.flush()

    for item in items:
        db.session.add(CartInvoiceItem(
            cart_invoice_id=invoice.id,
            product_id=item["product_id"],
            product_name=item["name"],
            unit_price=item["unit_price"],
            quantity=item["quantity"],
        ))

    db.session.commit()
    response = jsonify(invoice=cart_invoice_json(invoice))
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["Cache-Control"] = "private, no-store"
    return response, 201


@bookshop_bp.get("/invoices/<string:invoice_id>")
@limiter.limit("20/minute")
def lookup_invoice(invoice_id):
    lookup_id = (invoice_id or "").strip().upper()
    if not lookup_id:
        response = jsonify(error="Enter a valid receipt or invoice ID.")
        response.status_code = 400
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    order = _placed_orders(Order.query).filter(
        or_(Order.invoice_id == lookup_id, Order.order_reference == lookup_id)
    ).first()
    if order:
        document_type = "receipt" if (order.order_reference or "").upper() == lookup_id else "invoice"
        response = jsonify(invoice=invoice_json(order, document_type=document_type))
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["Cache-Control"] = "private, no-store"
        return response

    cart_invoice = CartInvoice.query.filter_by(invoice_id=lookup_id).first()
    if not cart_invoice:
        response = jsonify(error="No matching receipt or invoice was found.")
        response.status_code = 404
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    response = jsonify(invoice=cart_invoice_json(cart_invoice))
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bookshop_bp.get("/invoices/<string:invoice_id>/pdf")
@limiter.limit("30/minute")
def invoice_pdf(invoice_id):
    lookup_id = (invoice_id or "").strip().upper()
    order = _placed_orders(Order.query).filter(
        or_(Order.invoice_id == lookup_id, Order.order_reference == lookup_id)
    ).first()
    cart_invoice = None
    if not order:
        cart_invoice = CartInvoice.query.filter_by(invoice_id=lookup_id).first()
    if not order and not cart_invoice:
        response = jsonify(error="No matching receipt or invoice was found.")
        response.status_code = 404
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response

    receipt_requested = request.args.get("document") == "receipt"
    is_receipt = bool(order and (receipt_requested or (order.order_reference or "").upper() == lookup_id))
    if order and is_receipt:
        stream = build_receipt_pdf(order)
    else:
        stream = build_invoice_pdf(order) if order else build_cart_invoice_pdf(cart_invoice)
    if order and db.session.is_modified(order):
        db.session.commit()
    download = request.args.get("download") in {"1", "true", "yes"}
    download_name = (
        f"{order.order_reference}-receipt.pdf"
        if is_receipt
        else f"{(order.invoice_id if order else cart_invoice.invoice_id)}.pdf"
    )
    response = send_file(
        stream,
        mimetype="application/pdf",
        as_attachment=download,
        download_name=download_name,
    )
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["Cache-Control"] = "private, no-store"
    return response


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
    query = _placed_orders(Order.query).filter(
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
        normalized = normalize_order_status(status_filter, default="")
        accepted_statuses = [normalized] if normalized else [status_filter]
        accepted_statuses.extend(
            raw_status
            for raw_status, mapped_status in ORDER_STATUS_ALIASES.items()
            if mapped_status == normalized
        )
        query = query.filter(Order.status.in_(sorted(set(filter(None, accepted_statuses)))))
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


def _send_order_placed_notifications(order):
    paid_online = (
        order.payment_method == "online"
        and (order.payment_status or "").lower() == "paid"
    )
    first_name = (order.customer_name or "").split()[0] or "there"
    delivery_info = (
        "Pickup from our Dome Pillar 2 shop"
        if order.delivery_method == "pickup"
        else f"Delivery to {order.location or 'the address on file'}"
    )
    payment_info = (
        "Payment on delivery"
        if order.payment_method == "cash_on_delivery"
        else "Online payment confirmed via Paystack"
    )

    if order.phone:
        payment_sentence = (
            "Your Paystack payment has been confirmed. "
            if paid_online
            else "Payment is due on delivery. "
        )
        send_sms(
            order.phone,
            f"Hi {first_name}, your RealMindX Bookshop order {order.order_reference} "
            f"has been placed. {payment_sentence}"
            f"Our team will contact you within 1 business day to arrange receipt of your package. "
            f"Reply STOP to opt out."
        )

    order_summary_html = bookshop_order_summary_table(order)
    customer_order_meta_html = f"""
    <div style="background:#f5f8fc;border:1px solid #dce5f0;border-radius:12px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0 0 6px;"><strong>Reference:</strong> {escape(order.order_reference)}</p>
      <p style="margin:0 0 6px;"><strong>Invoice ID:</strong> {escape(order.invoice_id or "")}</p>
      <p style="margin:0 0 6px;"><strong>Fulfilment:</strong> {escape(delivery_info)}</p>
      <p style="margin:0 0 6px;"><strong>Payment:</strong> {escape(payment_info)}</p>
      <p style="margin:0;"><strong>Contact number:</strong> {escape(order.phone or "not provided")}</p>
    </div>
    """
    staff_order_meta_html = f"""
    <div style="background:#f5f8fc;border:1px solid #dce5f0;border-radius:12px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0 0 6px;"><strong>Reference:</strong> {escape(order.order_reference)}</p>
      <p style="margin:0 0 6px;"><strong>Invoice ID:</strong> {escape(order.invoice_id or "")}</p>
      <p style="margin:0 0 6px;"><strong>Customer:</strong> {escape(order.customer_name)}</p>
      <p style="margin:0 0 6px;"><strong>Email:</strong>
        <a href="mailto:{escape(order.email)}" style="color:#143670;text-decoration:none;">{escape(order.email)}</a>
      </p>
      <p style="margin:0 0 6px;"><strong>Phone:</strong> {escape(order.phone or "not provided")}</p>
      <p style="margin:0 0 6px;"><strong>Fulfilment:</strong> {escape(delivery_info)}</p>
      <p style="margin:0 0 6px;"><strong>Payment:</strong> {escape(payment_info)}</p>
      <p style="margin:0;font-weight:800;"><strong>Total:</strong> GH&#8373;{float(order.total_amount):,.2f}</p>
    </div>
    """
    payment_confirmation = (
        "<p>Your Paystack payment has been confirmed, so your order is now placed and ready for our team to process.</p>"
        if paid_online
        else "<p>Your order is now placed. Payment will be collected when your order is delivered or collected.</p>"
    )

    send_email(OutboundEmail(
        to=order.email,
        from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
        subject=f"Your RealMindX Bookshop order has been placed: {order.order_reference}",
        html=bookshop_email_shell(
            "Your order has been placed!",
            f"""
            <p>Hello {escape(first_name)},</p>
            {payment_confirmation}

            {customer_order_meta_html}
            {order_summary_html}

            <p>Our team will contact you within <strong>1 business day</strong> with the next fulfilment update.</p>
            <p>If you need anything sooner, contact us on any of the channels below and we&rsquo;ll help right away.</p>
            <p>We appreciate your trust in RealMindX and look forward to fulfilling your order.</p>
            """,
            cta_label="Visit the Bookshop",
            cta_url=current_app.config.get("BOOKSHOP_URL", ""),
            eyebrow="RealMindX Bookshop",
            preheader=f"Order {order.order_reference} placed. We will be in touch within 1 business day.",
        ),
    ))

    staff_subject_prefix = "Paid bookshop order" if paid_online else "New bookshop order"
    send_email(OutboundEmail(
        to=current_app.config["DEFAULT_REPLY_TO_EMAIL"],
        from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
        subject=f"{staff_subject_prefix} {order.order_reference} from {order.customer_name}",
        html=bookshop_email_shell(
            f"New order from {escape(order.customer_name)}",
            f"""
            <p>A new order has been placed via the RealMindX Bookshop.</p>
            {staff_order_meta_html}
            {order_summary_html}
            """,
            cta_label="View in Admin Dashboard",
            cta_url=f"{current_app.config['BASE_URL']}/admin/dashboard",
            eyebrow="RealMindX Internal: New Order Alert",
        ),
    ))


def _send_order_placed_notifications_safely(order):
    try:
        _send_order_placed_notifications(order)
    except Exception:
        current_app.logger.exception(
            "Order %s was placed, but one or more notifications could not be delivered.",
            order.order_reference,
        )


def _validate_paystack_confirmation(order, data):
    if (data.get("status") or "").lower() != "success":
        return False, "Paystack has not confirmed a successful payment."
    reference = str(data.get("reference") or "").strip()
    if not reference or reference != str(order.payment_reference or "").strip():
        return False, "The Paystack reference does not match this order."
    try:
        paid_amount = int(data.get("amount"))
    except (TypeError, ValueError):
        return False, "Paystack did not return a valid payment amount."
    expected_amount = int(Decimal(str(order.total_amount or 0)) * 100)
    if paid_amount != expected_amount:
        return False, "The confirmed Paystack amount does not match the order total."
    currency = str(data.get("currency") or "").strip().upper()
    if currency and currency != "GHS":
        return False, "The confirmed Paystack currency does not match the order currency."
    metadata = data.get("metadata") or {}
    metadata_order_id = metadata.get("order_id")
    if metadata_order_id not in {None, "", order.id, str(order.id)}:
        return False, "The Paystack transaction metadata does not match this order."
    return True, ""


def _confirm_paystack_order(order, data, source):
    if (order.payment_status or "").lower() == "paid":
        return False
    valid, error = _validate_paystack_confirmation(order, data)
    if not valid:
        raise ValueError(error)

    order.payment_provider = "paystack"
    order.payment_status = "paid"
    order.paid_at = datetime.now(timezone.utc)
    order.status = "confirmed"
    audit("paystack_payment_confirmed", "order", order.id, {
        "order_reference": order.order_reference,
        "reference": order.payment_reference,
        "amount": float(order.total_amount or 0),
        "source": source,
    }, actor_email=order.email)
    db.session.commit()
    _send_order_placed_notifications_safely(order)
    return True


@bookshop_bp.post("/orders")
@limiter.limit("8/hour")
def create_order():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    try:
        checkout = _prepare_checkout(payload)
    except CheckoutValidationError as exc:
        return jsonify(error=str(exc)), exc.status
    if checkout["payment_method"] != "cash_on_delivery":
        return jsonify(error="Online payment must be confirmed through Paystack before an order is placed."), 400

    order = _create_order_from_checkout(
        checkout,
        status="new",
        payment_status="unpaid",
        payment_provider="cash_on_delivery",
    )
    pricing = checkout["pricing"]
    audit("order_placed", "order", order.id, {
        "order_reference": order.order_reference,
        "customer_email": order.email,
        "total": float(pricing["total_amount"]),
        "subtotal": float(pricing["subtotal_amount"]),
        "bulk_discount": float(pricing["bulk_discount_amount"]),
        "promo_code": order.promo_code,
        "promo_discount": float(pricing["promo_discount_amount"]),
        "delivery_method": order.delivery_method,
        "payment_method": order.payment_method,
        "delivery_region": order.delivery_region,
        "items": len(checkout["order_items"]),
    })
    db.session.commit()
    _send_order_placed_notifications_safely(order)
    return jsonify(order=order_json(order)), 201


def _payment_intent_json(intent):
    return {
        "reference": intent.reference,
        "status": intent.status,
        "amount": float(intent.amount or 0),
        "currency": intent.currency,
        "order_reference": intent.order.order_reference if intent.order else None,
    }


def _validate_paystack_intent_confirmation(intent, data):
    if (data.get("status") or "").lower() != "success":
        return False, "Paystack has not confirmed a successful payment."
    reference = str(data.get("reference") or "").strip()
    if not reference or reference != intent.reference:
        return False, "The Paystack reference does not match this payment."
    try:
        paid_amount = int(data.get("amount"))
    except (TypeError, ValueError):
        return False, "Paystack did not return a valid payment amount."
    expected_amount = int(Decimal(str(intent.amount or 0)) * 100)
    if paid_amount != expected_amount:
        return False, "The confirmed Paystack amount does not match the checkout total."
    currency = str(data.get("currency") or "").strip().upper()
    if currency and currency != str(intent.currency or "GHS").upper():
        return False, "The confirmed Paystack currency does not match the checkout currency."
    metadata = data.get("metadata") or {}
    metadata_intent_id = metadata.get("payment_intent_id")
    if metadata_intent_id not in {None, "", intent.id, str(intent.id)}:
        return False, "The Paystack transaction metadata does not match this checkout."
    return True, ""


def _confirm_paystack_intent(intent, data, source):
    if intent.order_id:
        return intent.order, False
    valid, error = _validate_paystack_intent_confirmation(intent, data)
    if not valid:
        raise ValueError(error)

    paid_at = datetime.now(timezone.utc)
    checkout = _checkout_from_snapshot(intent.checkout_data)
    checkout["payment_method"] = "online"
    order = _create_order_from_checkout(
        checkout,
        status="confirmed",
        payment_status="paid",
        payment_provider="paystack",
        payment_reference=intent.reference,
        payment_access_code=intent.access_code,
        payment_authorization_url=intent.authorization_url,
        paid_at=paid_at,
    )
    intent.order_id = order.id
    intent.status = "converted"
    intent.paid_at = paid_at
    audit("paystack_payment_confirmed", "order", order.id, {
        "order_reference": order.order_reference,
        "payment_intent_id": intent.id,
        "reference": intent.reference,
        "amount": float(intent.amount or 0),
        "source": source,
    }, actor_email=intent.email)
    db.session.commit()
    _send_order_placed_notifications_safely(order)
    return order, True


@bookshop_bp.post("/orders/paystack/initialize")
@limiter.limit("8/hour")
def initialize_paystack_checkout():
    payload = request.get_json(silent=True) or {}
    require_turnstile(payload)
    secret_key = current_app.config.get("PAYSTACK_SECRET_KEY")
    if not secret_key:
        return jsonify(error="Paystack is not configured for this environment."), 503
    try:
        checkout = _prepare_checkout(payload, payment_method="online")
    except CheckoutValidationError as exc:
        return jsonify(error=str(exc)), exc.status
    if checkout["pricing"]["total_amount"] <= 0:
        return jsonify(error="Checkout total must be greater than zero before payment."), 400

    intent = BookshopPaymentIntent(
        reference=new_payment_reference(),
        user_id=checkout.get("user_id"),
        customer_name=checkout["customer_name"],
        email=checkout["email"],
        phone=checkout["phone"],
        amount=checkout["pricing"]["total_amount"],
        currency="GHS",
        status="initialized",
        provider="paystack",
        checkout_data=_checkout_snapshot(checkout),
    )
    db.session.add(intent)
    db.session.flush()
    amount_pesewas = int(Decimal(str(intent.amount)) * 100)
    callback_url = (
        f"{current_app.config['BOOKSHOP_URL'].rstrip('/')}/"
        f"?payment_intent={intent.reference}&status=paid"
    )
    try:
        response = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"},
            json={
                "email": intent.email,
                "amount": amount_pesewas,
                "reference": intent.reference,
                "callback_url": callback_url,
                "metadata": {
                    "payment_intent_id": intent.id,
                    "delivery_fee": float(checkout["delivery_fee"] or 0),
                },
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json().get("data") or {}
    except (requests.RequestException, ValueError):
        db.session.rollback()
        current_app.logger.exception("Paystack transaction initialization failed for payment intent %s", intent.reference)
        return jsonify(error="Payment initialization failed. Please try again or contact RealMindX Bookshop."), 502
    if not data.get("authorization_url"):
        db.session.rollback()
        return jsonify(error="Paystack did not return a payment page. Please try again."), 502

    intent.access_code = data.get("access_code")
    intent.authorization_url = data.get("authorization_url")
    audit("order_payment_started", "bookshop_payment_intent", intent.id, {
        "reference": intent.reference,
        "customer_email": intent.email,
        "total": float(intent.amount),
        "delivery_method": checkout["delivery_method"],
        "items": len(checkout["order_items"]),
    }, actor_email=intent.email)
    db.session.commit()
    return jsonify(payment_intent=_payment_intent_json(intent), payment=data), 201


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


@bookshop_bp.post("/orders/paystack/verify")
@limiter.limit("15/hour")
def verify_paystack_payment():
    payload = request.get_json(silent=True) or {}
    payment_intent_reference = str(payload.get("payment_intent_reference") or "").strip().upper()
    if payment_intent_reference:
        intent = BookshopPaymentIntent.query.filter_by(reference=payment_intent_reference).first()
        if not intent:
            return jsonify(error="Payment attempt not found."), 404
        if intent.order_id:
            return jsonify(
                order=order_json(intent.order),
                payment_intent=_payment_intent_json(intent),
                message="Payment is already confirmed.",
            )
        secret_key = current_app.config.get("PAYSTACK_SECRET_KEY")
        if not secret_key:
            return jsonify(error="Paystack is not configured for this environment."), 503
        try:
            response = requests.get(
                f"https://api.paystack.co/transaction/verify/{intent.reference}",
                headers={"Authorization": f"Bearer {secret_key}"},
                timeout=15,
            )
            response.raise_for_status()
            data = response.json().get("data") or {}
        except (requests.RequestException, ValueError):
            current_app.logger.exception("Paystack verification failed for payment intent %s", intent.reference)
            return jsonify(error="Payment confirmation is temporarily unavailable. Please try again."), 502

        db.session.rollback()
        intent = (
            BookshopPaymentIntent.query
            .filter_by(reference=payment_intent_reference)
            .with_for_update()
            .first()
        )
        if not intent:
            return jsonify(error="Payment attempt not found."), 404
        try:
            order, newly_confirmed = _confirm_paystack_intent(intent, data, "callback_verification")
        except ValueError as exc:
            return jsonify(error=str(exc), payment_intent=_payment_intent_json(intent)), 409
        return jsonify(
            order=order_json(order),
            payment_intent=_payment_intent_json(intent),
            message="Payment confirmed and order placed." if newly_confirmed else "Payment was already confirmed.",
        )

    order_reference = str(payload.get("order_reference") or "").strip().upper()
    if not order_reference:
        return jsonify(error="Payment reference is required."), 400

    order = Order.query.filter_by(order_reference=order_reference).first()
    if not order:
        return jsonify(error="Order not found."), 404
    if order.payment_method != "online":
        return jsonify(error="This order is not awaiting an online payment."), 400
    if order.payment_status == "paid":
        return jsonify(order=order_json(order), message="Payment is already confirmed.")
    if not order.payment_reference:
        return jsonify(error="Paystack payment has not been initialized for this order."), 409

    secret_key = current_app.config.get("PAYSTACK_SECRET_KEY")
    if not secret_key:
        return jsonify(error="Paystack is not configured for this environment."), 503

    try:
        response = requests.get(
            f"https://api.paystack.co/transaction/verify/{order.payment_reference}",
            headers={"Authorization": f"Bearer {secret_key}"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json().get("data") or {}
    except requests.RequestException:
        current_app.logger.exception("Paystack verification failed for order %s", order.order_reference)
        return jsonify(error="Payment confirmation is temporarily unavailable. Please try again."), 502

    try:
        newly_confirmed = _confirm_paystack_order(order, data, "callback_verification")
    except ValueError as exc:
        return jsonify(error=str(exc), order=order_json(order)), 409
    return jsonify(
        order=order_json(order),
        message="Payment confirmed and order placed." if newly_confirmed else "Payment was already confirmed.",
    )


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
        intent = (
            BookshopPaymentIntent.query
            .filter_by(reference=reference)
            .with_for_update()
            .first()
        )
        if intent:
            try:
                _confirm_paystack_intent(intent, data, "webhook")
            except ValueError as exc:
                audit("paystack_payment_rejected", "bookshop_payment_intent", intent.id, {
                    "reference": reference,
                    "reason": str(exc),
                }, actor_email=intent.email)
                db.session.commit()
                return jsonify(error=str(exc)), 400
            return jsonify(message="Webhook processed.")

        order = Order.query.filter_by(payment_reference=reference).first()
        if order:
            try:
                _confirm_paystack_order(order, data, "webhook")
            except ValueError as exc:
                audit("paystack_payment_rejected", "order", order.id, {
                    "order_reference": order.order_reference,
                    "reference": reference,
                    "reason": str(exc),
                }, actor_email=order.email)
                db.session.commit()
                return jsonify(error=str(exc)), 400
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
    queue_analytics_event(
        "bulk_order_enquiry",
        path="/bookshop/contact",
        page_type="bookshop",
        details={"lead_type": "bulk_order", "channel": "bookshop_contact"},
    )
    db.session.commit()
    return jsonify(message="Bulk order request received. We will respond with a quote."), 201
