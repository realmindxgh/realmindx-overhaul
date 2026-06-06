from .extensions import db
from .models import UploadedFile


def user_json(user):
    direct_permissions = sorted({permission.key for permission in getattr(user, "direct_permissions", [])})
    role_permissions = sorted({permission.key for permission in user.role.permissions}) if user.role else []
    profile = getattr(user, "profile", None)
    picture = db.session.get(UploadedFile, profile.profile_picture_file_id) if profile and profile.profile_picture_file_id else None
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.name if user.role else None,
        "profile_picture_url": _upload_url(picture),
        "permissions": sorted(set(direct_permissions + role_permissions)),
        "direct_permissions": direct_permissions,
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def job_json(job):
    return {
        "id": job.id,
        "title": job.title,
        "organisation": job.organisation,
        "location": job.location,
        "subject": job.subject,
        "level": job.level,
        "employment_type": job.employment_type,
        "description": job.description,
        "requirements": job.requirements,
        "deadline": job.deadline.isoformat() if job.deadline else None,
        "status": job.status,
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


def product_json(product, include_private=False):
    rating_average, rating_count = _product_rating(product)
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
        "image_url": _upload_url(product.image_file) if hasattr(product, "image_file") else None,
        "image_file_id": product.image_file_id,
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
    }
    if include_private:
        payload["source"] = getattr(product, "source", None)
    return payload


def order_json(order):
    return {
        "id": order.id,
        "order_reference": order.order_reference,
        "payment_reference": order.payment_reference,
        "customer_name": order.customer_name,
        "email": order.email,
        "phone": order.phone,
        "delivery_method": order.delivery_method,
        "delivery_zone_id": order.delivery_zone_id,
        "delivery_zone_name": order.delivery_zone_name,
        "delivery_fee": float(order.delivery_fee or 0),
        "location": order.location,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_provider": order.payment_provider,
        "payment_authorization_url": order.payment_authorization_url,
        "subtotal_amount": float(order.subtotal_amount) if order.subtotal_amount is not None else None,
        "total_amount": float(order.total_amount) if order.total_amount else None,
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


def delivery_zone_json(zone):
    return {
        "id": zone.id,
        "name": zone.name,
        "fee": float(zone.fee or 0),
        "description": zone.description,
        "is_active": zone.is_active,
        "sort_order": zone.sort_order,
    }
