from datetime import timezone

from .extensions import db
from .models import DeliveryOtp, UploadedFile
from .order_status import normalize_order_status
from .delivery_locations import delivery_zone_aliases
from .profile_completion import teacher_profile_completion
from .whatsapp_access import can_use_whatsapp_phone_verification


def user_json(user):
    direct_permissions = sorted({permission.key for permission in getattr(user, "direct_permissions", [])})
    role_permissions = sorted({permission.key for permission in user.role.permissions}) if user.role else []
    profile = getattr(user, "profile", None)
    picture = db.session.get(UploadedFile, profile.profile_picture_file_id) if profile and profile.profile_picture_file_id else None
    profile_completion, profile_missing_fields = teacher_profile_completion(user)
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name,
        "phone": user.phone,
        "phone_verified": user.phone_verified,
        "whatsapp_phone_verification_allowed": can_use_whatsapp_phone_verification(user),
        "teacher_service_enabled": user.teacher_service_enabled,
        "bookshop_service_enabled": user.bookshop_service_enabled,
        "sex": user.sex,
        "age_range": user.age_range,
        "role": user.role.name if user.role else None,
        "profile_picture_url": _upload_url(picture),
        "permissions": sorted(set(direct_permissions + role_permissions)),
        "direct_permissions": direct_permissions,
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "two_factor_enabled": user.two_factor_enabled,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "profile_completion": profile_completion,
        "profile_missing_fields": profile_missing_fields,
    }


def job_json(job):
    return {
        "id": job.id,
        "title": job.title,
        "organisation": job.organisation,
        "location": job.location,
        "delivery_zone_id": job.delivery_zone_id,
        "subject": job.subject,
        "level": job.level,
        "curriculum": job.curriculum,
        "employment_type": job.employment_type,
        "preferred_sex": job.preferred_sex,
        "preferred_age_range": job.preferred_age_range,
        "description": job.description,
        "requirements": job.requirements,
        "responsibilities": job.responsibilities,
        "deadline": job.deadline.isoformat() if job.deadline else None,
        "salary_min": float(job.salary_min) if job.salary_min is not None else None,
        "salary_max": float(job.salary_max) if job.salary_max is not None else None,
        "salary_currency": job.salary_currency,
        "status": job.status,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


def category_json(category):
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "bulk_discount_percent": float(category.bulk_discount_percent or 0),
        "bulk_min_qty": int(category.bulk_min_qty or 10),
    }


def _upload_url(uploaded_file):
    if not uploaded_file:
        return None
    return f"/uploads/{uploaded_file.visibility}/{uploaded_file.category}/{uploaded_file.stored_filename}"


def _product_rating(product):
    reviews = [
        review
        for review in getattr(product, "reviews", [])
        if getattr(review, "status", None) in {"approved", "published"}
    ]
    if not reviews:
        return 0, 0
    total = sum(int(review.rating or 0) for review in reviews)
    return round(total / len(reviews), 1), len(reviews)


def product_review_json(review):
    """Public review payload — deliberately excludes the reviewer's email."""
    return {
        "id": review.id,
        "customer_name": review.customer_name,
        "rating": int(review.rating or 0),
        "title": review.title,
        "comment": review.comment,
        "verified_purchase": review.order_id is not None,
        "created_at": review.created_at.isoformat() if review.created_at else None,
    }


def order_review_json(review):
    order = getattr(review, "order", None)
    return {
        "id": review.id,
        "order_id": review.order_id,
        "order_reference": order.order_reference if order else None,
        "customer_name": review.customer_name,
        "email": review.email,
        "score": int(review.score or 0),
        "comment": review.comment,
        "status": review.status,
        "source": review.source,
        "admin_notes": review.admin_notes,
        "created_at": review.created_at.isoformat() if review.created_at else None,
        "updated_at": review.updated_at.isoformat() if review.updated_at else None,
    }


def product_json(product, include_private=False):
    rating_average, rating_count = _product_rating(product)
    image_url = _upload_url(product.image_file) if hasattr(product, "image_file") else None
    image_url_original = _upload_url(getattr(product, "image_original_file", None)) or image_url
    image_url_medium = _upload_url(getattr(product, "image_medium_file", None)) or image_url_original
    image_url_thumb = _upload_url(getattr(product, "image_thumb_file", None)) or image_url_medium
    payload = {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "category": product.category.name if product.category else None,
        "category_id": product.category_id,
        "category_slug": product.category.slug if product.category else None,
        "category_bulk_discount_percent": float(product.category.bulk_discount_percent or 0) if product.category else 0,
        "bulk_min_qty": int(product.category.bulk_min_qty or 10) if product.category else 10,
        "price": float(product.price),
        "old_price": float(product.old_price) if product.old_price else None,
        "short_description": product.short_description,
        "full_description": product.full_description,
        "image_url": image_url,
        "image_url_original": image_url_original,
        "image_url_medium": image_url_medium,
        "image_url_thumb": image_url_thumb,
        "image_file_id": product.image_file_id,
        "image_original_file_id": getattr(product, "image_original_file_id", None),
        "image_medium_file_id": getattr(product, "image_medium_file_id", None),
        "image_thumb_file_id": getattr(product, "image_thumb_file_id", None),
        "stock_status": product.stock_status,
        "quantity_available": product.quantity_available,
        "subject": product.subject,
        "level": product.level,
        "curriculum": getattr(product, "curriculum", None),
        "author": getattr(product, "author", None),
        "publisher": getattr(product, "publisher", None),
        "product_type": product.product_type,
        "featured": product.featured,
        "delivery_note": product.delivery_note,
        "tags": product.tags or [],
        "rating_average": rating_average,
        "rating_count": rating_count,
        "is_active": product.is_active,
        "status": "published" if product.is_active else "draft",
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }
    if include_private:
        payload["source"] = getattr(product, "source", None)
    return payload


def order_json(order, include_delivery=True):
    status = normalize_order_status(order.status)
    payload = {
        "id": order.id,
        "order_reference": order.order_reference,
        "invoice_id": getattr(order, "invoice_id", None),
        "payment_reference": order.payment_reference,
        "customer_name": order.customer_name,
        "customer_sex": order.customer_sex,
        "customer_age_range": order.customer_age_range,
        "email": order.email,
        "phone": order.phone,
        "delivery_method": order.delivery_method,
        "delivery_zone_id": order.delivery_zone_id,
        "delivery_zone_name": order.delivery_zone_name,
        "delivery_fee": float(order.delivery_fee or 0),
        "location": order.location,
        "delivery_region": order.delivery_region,
        "status": status,
        "raw_status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "payment_provider": order.payment_provider,
        "payment_authorization_url": order.payment_authorization_url,
        "subtotal_amount": float(order.subtotal_amount) if order.subtotal_amount is not None else None,
        "bulk_discount_amount": float(order.bulk_discount_amount or 0),
        "promo_code": order.promo_code,
        "promo_applies_to": order.promo_applies_to,
        "promo_discount_amount": float(order.promo_discount_amount or 0),
        "total_amount": float(order.total_amount) if order.total_amount else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit_price": float(item.unit_price),
                "quantity": item.quantity,
            }
            for item in order.items
        ],
    }
    delivery = getattr(order, "delivery", None)
    if include_delivery and delivery:
        payload["delivery"] = delivery_json(delivery)
    return payload


DELIVERY_TRACKING_LABELS = {
    "assigned_to_company": "Assigned to delivery partner",
    "accepted_by_company": "Assigned to delivery partner",
    "rejected_by_company": "Delivery issue, our team will contact you",
    "assigned_to_rider": "Ready for delivery",
    "picked_up": "Out for delivery",
    "delivered": "Delivered",
    "issue_reported": "Delivery issue, our team will contact you",
    "failed": "Delivery issue, our team will contact you",
    "returned": "Delivery issue, our team will contact you",
    "cancelled": "Delivery issue, our team will contact you",
}


def delivery_company_json(company):
    if not company:
        return None
    deliveries = list(getattr(company, "deliveries", []) or [])
    completed = [delivery for delivery in deliveries if delivery.status == "delivered"]
    active = [
        delivery
        for delivery in deliveries
        if delivery.status not in {"delivered", "failed", "returned", "cancelled"}
    ]
    return {
        "id": company.id,
        "name": company.name,
        "contact_name": company.contact_name,
        "contact_phone": company.contact_phone,
        "contact_email": company.contact_email,
        "notes": company.notes,
        "status": company.status,
        "is_active": company.is_active,
        "default_delivery_payable": float(company.default_delivery_payable) if company.default_delivery_payable is not None else None,
        "active_deliveries": len(active),
        "completed_deliveries": len(completed),
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "updated_at": company.updated_at.isoformat() if company.updated_at else None,
    }


def delivery_company_user_json(company_user):
    if not company_user:
        return None
    from .platform_terms import acceptance_status
    result = {
        "id": company_user.id,
        "company_id": company_user.company_id,
        "user_id": company_user.user_id,
        "name": company_user.name,
        "phone": company_user.phone,
        "title": company_user.title,
        "is_manager": company_user.is_manager,
        "is_active": company_user.is_active,
        "must_change_password": bool(getattr(company_user.user, "must_change_password", False)),
        "created_at": company_user.created_at.isoformat() if company_user.created_at else None,
    }
    result["terms"] = acceptance_status(company_user.user_id, "delivery_company_terms")
    return result


def delivery_rider_json(rider):
    if not rider:
        return None
    active = [
        delivery
        for delivery in (getattr(rider, "deliveries", []) or [])
        if delivery.status in {"assigned_to_rider", "picked_up", "issue_reported"}
    ]
    completed = [delivery for delivery in (getattr(rider, "deliveries", []) or []) if delivery.status == "delivered"]
    from .platform_terms import acceptance_status
    result = {
        "id": rider.id,
        "company_id": rider.company_id,
        "user_id": rider.user_id,
        "name": rider.name,
        "phone": rider.phone,
        "status": rider.status,
        "is_active": rider.is_active,
        "active_deliveries": len(active),
        "completed_deliveries": len(completed),
        "last_seen_at": rider.last_seen_at.isoformat() if rider.last_seen_at else None,
        "must_change_password": bool(getattr(rider.user, "must_change_password", False)),
        "created_at": rider.created_at.isoformat() if rider.created_at else None,
    }
    result["terms"] = acceptance_status(rider.user_id, "rider_terms")
    return result


def delivery_event_json(event):
    return {
        "id": event.id,
        "event_type": event.event_type,
        "actor_type": event.actor_type,
        "actor_id": event.actor_id,
        "from_status": event.from_status,
        "to_status": event.to_status,
        "reason": event.reason,
        "note": event.note,
        "details": event.details or {},
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def delivery_otp_summary(delivery):
    otp = (
        DeliveryOtp.query
        .filter_by(delivery_id=delivery.id, replaced_at=None)
        .order_by(DeliveryOtp.created_at.desc())
        .first()
    )
    if not otp:
        return {
            "required": bool(delivery.otp_required),
            "status": "not_generated",
            "attempts_count": 0,
            "max_attempts": 5,
            "blocked": bool(delivery.otp_blocked),
        }
    return {
        "required": bool(delivery.otp_required),
        "status": "used" if otp.used_at else otp.send_status,
        "attempts_count": int(otp.attempts_count or 0),
        "max_attempts": int(otp.max_attempts or 5),
        "blocked": bool(delivery.otp_blocked),
        "sent_at": otp.sent_at.isoformat() if otp.sent_at else None,
        "expires_at": otp.expires_at.isoformat() if otp.expires_at else None,
        "used_at": otp.used_at.isoformat() if otp.used_at else None,
        "send_channel": otp.send_channel,
    }


def delivery_json(delivery, include_events=False, rider_safe=False):
    if not delivery:
        return None
    order = delivery.order
    payload = {
        "id": delivery.id,
        "order_id": delivery.order_id,
        "order_reference": order.order_reference if order else None,
        "company_id": delivery.company_id,
        "company_name": delivery.company.name if delivery.company else None,
        "rider_id": delivery.rider_id,
        "rider_name": delivery.rider.name if delivery.rider else None,
        "status": delivery.status,
        "company_payable_amount": float(delivery.company_payable_amount) if delivery.company_payable_amount is not None else None,
        "promotion_payer": delivery.promotion_payer,
        "promotion_amount": float(delivery.promotion_amount or 0),
        "tracking_label": DELIVERY_TRACKING_LABELS.get(delivery.status, "Preparing order"),
        "assigned_at": delivery.assigned_at.isoformat() if delivery.assigned_at else None,
        "accepted_at": delivery.accepted_at.isoformat() if delivery.accepted_at else None,
        "rejected_at": delivery.rejected_at.isoformat() if delivery.rejected_at else None,
        "picked_up_at": delivery.picked_up_at.isoformat() if delivery.picked_up_at else None,
        "delivered_at": delivery.delivered_at.isoformat() if delivery.delivered_at else None,
        "issue_reported_at": delivery.issue_reported_at.isoformat() if delivery.issue_reported_at else None,
        "issue_reason": delivery.issue_reason,
        "issue_note": delivery.issue_note,
        "failed_reason": delivery.failed_reason,
        "otp": delivery_otp_summary(delivery),
        "created_at": delivery.created_at.isoformat() if delivery.created_at else None,
        "updated_at": delivery.updated_at.isoformat() if delivery.updated_at else None,
    }
    if order:
        payload["customer_name"] = order.customer_name
        payload["customer_phone"] = order.phone
        payload["delivery_location"] = order.location or order.delivery_zone_name
        payload["delivery_notes"] = order.notes
        if not rider_safe:
            payload.update({
                "customer_email": order.email,
                "payment_status": order.payment_status,
                "total_amount": float(order.total_amount) if order.total_amount else None,
            })
    if include_events:
        payload["events"] = [
            delivery_event_json(event)
            for event in sorted(
                getattr(delivery, "events", []) or [],
                key=lambda item: (item.created_at.isoformat() if item.created_at else "", int(item.id or 0)),
            )
        ]
    return payload


def delivery_tracking_json(delivery):
    if not delivery:
        return {
            "status": "preparing",
            "label": "Preparing order",
            "otp_required": False,
        }
    events = sorted(
        getattr(delivery, "events", []) or [],
        key=lambda item: (item.created_at.isoformat() if item.created_at else "", int(item.id or 0)),
    )

    def latest_event_time(*event_types, predicate=None):
        event = next((
            item for item in reversed(events)
            if item.event_type in event_types
            and item.created_at
            and (predicate is None or predicate(item))
        ), None)
        return event.created_at if event else None

    def latest_milestone(field_value, *event_types, predicate=None):
        candidates = [value for value in (field_value, latest_event_time(*event_types, predicate=predicate)) if value]
        if not candidates:
            return None
        def utc_value(value):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return max(candidates, key=utc_value).isoformat()

    return {
        "status": delivery.status,
        "label": DELIVERY_TRACKING_LABELS.get(delivery.status, "Preparing order"),
        "otp_required": bool(delivery.otp_required and delivery.status == "picked_up"),
        "issue": delivery.status in {"rejected_by_company", "issue_reported", "failed", "returned", "cancelled"},
        "assigned_at": latest_milestone(
            delivery.assigned_at,
            "assigned_to_company",
            predicate=lambda event: (event.details or {}).get("previous_company_id") is not None,
        ),
        "accepted_at": delivery.accepted_at.isoformat() if delivery.accepted_at else None,
        "rejected_at": delivery.rejected_at.isoformat() if delivery.rejected_at else None,
        "picked_up_at": latest_milestone(delivery.picked_up_at, "picked_up"),
        "delivered_at": latest_milestone(delivery.delivered_at, "delivered", "otp_verified", "otp_override"),
        "issue_reported_at": delivery.issue_reported_at.isoformat() if delivery.issue_reported_at else None,
        "failed_at": delivery.failed_at.isoformat() if delivery.failed_at else None,
        "returned_at": delivery.returned_at.isoformat() if delivery.returned_at else None,
        "cancelled_at": delivery.cancelled_at.isoformat() if delivery.cancelled_at else None,
    }


def delivery_zone_json(zone):
    return {
        "id": zone.id,
        "name": zone.name,
        "fee": float(zone.fee or 0),
        "description": zone.description,
        "aliases": delivery_zone_aliases(zone),
        "aliases_text": getattr(zone, "aliases", None) or "",
        "region": getattr(zone, "region", None),
        "district_or_municipality": getattr(zone, "district_or_municipality", None),
        "nearby_major_town": getattr(zone, "nearby_major_town", None),
        "delivery_zone_label": getattr(zone, "delivery_zone_label", None),
        "is_delivery_area": getattr(zone, "is_delivery_area", True),
        "is_search_alias_only": getattr(zone, "is_search_alias_only", False),
        "is_active": zone.is_active,
        "sort_order": zone.sort_order,
    }
