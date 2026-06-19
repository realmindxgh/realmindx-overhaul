from datetime import datetime, timezone
import hashlib
import re

from sqlalchemy import or_

from .extensions import db
from .models import CheckoutDetail, DeliveryZone, Order


def _clean(value, limit=None):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit] if limit else text


def _normalise(value):
    return re.sub(r"[^a-z0-9]+", " ", _clean(value).lower()).strip()


def checkout_detail_fingerprint(payload):
    parts = [
        payload.get("customer_name"),
        payload.get("email"),
        payload.get("phone"),
        payload.get("delivery_zone_id"),
        payload.get("delivery_zone_name"),
        payload.get("address"),
        payload.get("city"),
        payload.get("region"),
    ]
    source = "|".join(_normalise(value) for value in parts)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _detail_values(payload):
    zone_id = payload.get("delivery_zone_id")
    try:
        zone_id = int(zone_id) if zone_id not in {None, ""} else None
    except (TypeError, ValueError):
        zone_id = None
    zone = db.session.get(DeliveryZone, zone_id) if zone_id else None
    values = {
        "label": _clean(payload.get("label"), 120) or None,
        "customer_name": _clean(payload.get("customer_name") or payload.get("name"), 160),
        "email": _clean(payload.get("email"), 255).lower(),
        "phone": _clean(payload.get("phone"), 40),
        "delivery_zone_id": zone.id if zone else None,
        "delivery_zone_name": _clean(
            zone.name if zone else payload.get("delivery_zone_name") or payload.get("delivery_zone"),
            160,
        ) or None,
        "address": _clean(payload.get("address") or payload.get("delivery_address"), 255) or None,
        "city": _clean(payload.get("city") or payload.get("delivery_city"), 160) or None,
        "region": _clean(zone.region if zone and zone.region else payload.get("region") or payload.get("delivery_region"), 80) or None,
        "is_default": bool(payload.get("is_default")),
    }
    if not values["customer_name"] or not values["email"] or not values["phone"]:
        raise ValueError("Name, email, and phone are required to save checkout details.")
    if not values["label"]:
        place = values["delivery_zone_name"] or values["city"] or values["region"]
        values["label"] = f"{place} delivery" if place else "Saved checkout details"
    values["fingerprint"] = checkout_detail_fingerprint(values)
    return values


def checkout_detail_json(detail, source="saved"):
    return {
        "id": detail.id,
        "source": source,
        "label": detail.label,
        "customer_name": detail.customer_name,
        "email": detail.email,
        "phone": detail.phone,
        "delivery_zone_id": detail.delivery_zone_id,
        "delivery_zone_name": detail.delivery_zone_name,
        "address": detail.address or "",
        "city": detail.city or "",
        "region": detail.region or "",
        "is_default": bool(detail.is_default),
        "can_delete": source == "saved",
        "last_used_at": detail.last_used_at.isoformat() if detail.last_used_at else None,
    }


def upsert_checkout_detail(user_id, payload):
    values = _detail_values(payload)
    detail = CheckoutDetail.query.filter_by(
        user_id=user_id,
        fingerprint=values["fingerprint"],
    ).first()
    if values["is_default"]:
        CheckoutDetail.query.filter_by(user_id=user_id, is_default=True).update({"is_default": False})
    if detail:
        for field, value in values.items():
            setattr(detail, field, value)
    else:
        detail = CheckoutDetail(user_id=user_id, **values)
        db.session.add(detail)
    detail.last_used_at = datetime.now(timezone.utc)
    db.session.flush()
    return detail


def _order_detail(order):
    parts = [_clean(part) for part in str(order.location or "").split(",") if _clean(part)]
    region = _clean(order.delivery_region)
    zone_name = _clean(order.delivery_zone_name)
    city = zone_name if zone_name and zone_name.lower() != "other" else ""
    if parts and zone_name and _normalise(parts[0]) == _normalise(zone_name):
        parts.pop(0)
    elif parts and zone_name.lower() == "other":
        city = parts.pop(0)
    if parts and region and _normalise(parts[-1]) == _normalise(region):
        parts.pop()
    address = ", ".join(parts)
    payload = {
        "customer_name": order.customer_name,
        "email": order.email,
        "phone": order.phone,
        "delivery_zone_id": order.delivery_zone_id,
        "delivery_zone_name": zone_name or city,
        "address": address,
        "city": city,
        "region": region,
    }
    payload["fingerprint"] = checkout_detail_fingerprint(payload)
    place = zone_name if zone_name and zone_name.lower() != "other" else city or region
    return {
        "id": f"order-{order.id}",
        "source": "order",
        "label": f"{place} delivery" if place else "Previous checkout details",
        **{key: payload[key] for key in [
            "customer_name", "email", "phone", "delivery_zone_id",
            "delivery_zone_name", "address", "city", "region",
        ]},
        "is_default": False,
        "can_delete": False,
        "last_used_at": order.created_at.isoformat() if order.created_at else None,
        "_fingerprint": payload["fingerprint"],
    }


def list_checkout_details(user):
    saved = (
        CheckoutDetail.query
        .filter_by(user_id=user.id)
        .order_by(CheckoutDetail.is_default.desc(), CheckoutDetail.last_used_at.desc())
        .limit(12)
        .all()
    )
    items = [checkout_detail_json(detail) for detail in saved]
    fingerprints = {detail.fingerprint for detail in saved}
    orders = (
        Order.query
        .filter(
            or_(Order.user_id == user.id, Order.email == user.email),
            Order.delivery_method == "delivery",
        )
        .order_by(Order.created_at.desc())
        .limit(30)
        .all()
    )
    for order in orders:
        item = _order_detail(order)
        fingerprint = item.pop("_fingerprint")
        if fingerprint in fingerprints:
            continue
        fingerprints.add(fingerprint)
        items.append(item)
        if len(items) >= 12:
            break
    return items
