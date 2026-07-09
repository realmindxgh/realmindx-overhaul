from datetime import datetime, timedelta, timezone
import secrets

from markupsafe import escape
from werkzeug.security import check_password_hash, generate_password_hash

from .email_service import OutboundEmail, bookshop_email_shell, send_email
from .extensions import db
from .models import (
    DeliveryCompany,
    DeliveryCompanyUser,
    DeliveryEvent,
    DeliveryOtp,
    DeliveryRider,
    Order,
    OrderDelivery,
    Role,
    User,
)
from .order_status import normalize_order_status
from .sms_service import normalise_phone, send_sms


DELIVERY_STATUSES = {
    "assigned_to_company",
    "accepted_by_company",
    "rejected_by_company",
    "assigned_to_rider",
    "picked_up",
    "delivered",
    "issue_reported",
    "failed",
    "returned",
    "cancelled",
}

ISSUE_REASONS = {
    "customer_unavailable": "Customer unavailable",
    "wrong_address": "Wrong address",
    "customer_unreachable": "Customer unreachable",
    "customer_refused_delivery": "Customer refused delivery",
    "package_damaged": "Package damaged",
    "vehicle_or_route_delay": "Vehicle or route delay",
    "payment_issue": "Payment issue",
    "returned_to_office": "Returned to office",
    "other": "Other",
}

OTP_OVERRIDE_REASONS = {
    "customer_phone_unreachable_confirmed": "Customer phone unreachable but delivery confirmed",
    "authorized_person_received": "Package received by authorized person",
    "sms_failed": "SMS failed",
    "customer_unable_to_provide_otp": "Customer unable to provide OTP",
    "manual_realmindx_confirmation": "Manual confirmation by RealMindX staff",
    "other": "Other",
}

OTP_EXPIRY_HOURS = 24
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 120


class DeliveryError(Exception):
    def __init__(self, message, status_code=400, code="delivery_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def now_utc():
    return datetime.now(timezone.utc)


def aware(value):
    if value and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def normalize_delivery_phone(value):
    phone = normalise_phone(value or "")
    if not phone:
        raise DeliveryError("Enter a valid Ghana phone number.", 400, "invalid_phone")
    return phone


def actor_from_user(user):
    role_name = getattr(getattr(user, "role", None), "name", None)
    if role_name == "admin":
        return "admin", user.id
    if role_name == "staff":
        return "staff", user.id
    if role_name == "delivery_company_user":
        return "company_user", user.id
    if role_name == "delivery_rider":
        return "rider", user.id
    return "system", getattr(user, "id", None)


def ensure_role(name, description):
    role = Role.query.filter_by(name=name).first()
    if not role:
        role = Role(name=name, description=description)
        db.session.add(role)
        db.session.flush()
    return role


def synthetic_delivery_email(kind, phone):
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return f"{kind}-{digits}@delivery.realmindx.local"


def split_name(name):
    parts = [part for part in str(name or "").strip().split() if part]
    if not parts:
        return "Delivery", "User"
    return parts[0], " ".join(parts[1:]) or ""


def create_portal_user(kind, name, phone, password, role_name, must_change_password=True):
    phone = normalize_delivery_phone(phone)
    if len(password or "") < 8:
        raise DeliveryError("Password must be at least 8 characters.", 400, "weak_password")
    email = synthetic_delivery_email(kind, phone)
    if User.query.filter_by(email=email).first():
        raise DeliveryError("An account already exists for this phone number.", 409, "duplicate_phone")
    role = ensure_role(role_name, f"{role_name.replace('_', ' ').title()} portal account.")
    first_name, last_name = split_name(name)
    user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        phone_verified=True,
        role=role,
        is_verified=True,
        is_active=True,
        must_change_password=must_change_password,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    return user, phone


def create_company(payload, actor=None):
    name = (payload.get("name") or "").strip()
    if not name:
        raise DeliveryError("Delivery company name is required.", 400, "company_name_required")
    if DeliveryCompany.query.filter(DeliveryCompany.name.ilike(name)).first():
        raise DeliveryError("A delivery company with this name already exists.", 409, "duplicate_company")
    company = DeliveryCompany(
        name=name,
        contact_name=(payload.get("contact_name") or "").strip() or None,
        contact_phone=normalise_phone(payload.get("contact_phone") or "") if payload.get("contact_phone") else None,
        contact_email=(payload.get("contact_email") or "").strip().lower() or None,
        notes=(payload.get("notes") or "").strip() or None,
        status="active" if payload.get("is_active", True) else "inactive",
        is_active=bool(payload.get("is_active", True)),
    )
    db.session.add(company)
    db.session.flush()
    manager = None
    manager_phone = payload.get("manager_phone")
    manager_password = payload.get("manager_password") or payload.get("password")
    if manager_phone and manager_password:
        manager = create_company_user(
            company,
            {
                "name": payload.get("manager_name") or company.contact_name or f"{company.name} Manager",
                "phone": manager_phone,
                "password": manager_password,
                "title": payload.get("manager_title") or "Manager",
            },
            actor=actor,
        )
    return company, manager


def create_company_user(company, payload, actor=None):
    if not company or not company.id:
        raise DeliveryError("Delivery company is required.", 400, "company_required")
    phone = normalize_delivery_phone(payload.get("phone"))
    if DeliveryCompanyUser.query.filter_by(phone=phone).first():
        raise DeliveryError("A company user already exists for this phone number.", 409, "duplicate_phone")
    user, phone = create_portal_user(
        "company",
        payload.get("name") or "Company Manager",
        phone,
        payload.get("password") or "",
        "delivery_company_user",
        must_change_password=True,
    )
    company_user = DeliveryCompanyUser(
        company=company,
        user=user,
        phone=phone,
        name=(payload.get("name") or user.full_name).strip(),
        title=(payload.get("title") or "").strip() or None,
        is_manager=bool(payload.get("is_manager", True)),
        is_active=True,
    )
    db.session.add(company_user)
    db.session.flush()
    return company_user


def create_rider(company, payload, actor=None):
    if not company or not company.id:
        raise DeliveryError("Delivery company is required.", 400, "company_required")
    if not company.is_active:
        raise DeliveryError("This delivery company is inactive.", 403, "company_inactive")
    phone = normalize_delivery_phone(payload.get("phone"))
    if DeliveryRider.query.filter_by(phone=phone).first():
        raise DeliveryError("A rider already exists for this phone number.", 409, "duplicate_phone")
    user, phone = create_portal_user(
        "rider",
        payload.get("name") or "Delivery Rider",
        phone,
        payload.get("password") or "",
        "delivery_rider",
        must_change_password=True,
    )
    rider = DeliveryRider(
        company=company,
        user=user,
        phone=phone,
        name=(payload.get("name") or user.full_name).strip(),
        is_active=True,
        status="active",
    )
    db.session.add(rider)
    db.session.flush()
    return rider


def reset_portal_password(user, password):
    if len(password or "") < 8:
        raise DeliveryError("Password must be at least 8 characters.", 400, "weak_password")
    user.set_password(password)
    user.must_change_password = True
    user.failed_login_count = 0
    user.locked_until = None


def log_delivery_event(delivery, event_type, actor_type, actor_id=None, from_status=None, to_status=None, reason=None, note=None, details=None):
    event = DeliveryEvent(
        delivery=delivery,
        order_id=delivery.order_id,
        event_type=event_type,
        actor_type=actor_type,
        actor_id=actor_id,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        note=note,
        details=details or {},
    )
    db.session.add(event)
    return event


def transition_delivery(delivery, status, actor, event_type, reason=None, note=None, details=None):
    if status not in DELIVERY_STATUSES:
        raise DeliveryError("Unsupported delivery status.", 400, "invalid_status")
    actor_type, actor_id = actor
    previous = delivery.status
    current_time = now_utc()
    delivery.status = status
    if status in {"assigned_to_company", "assigned_to_rider"} and not delivery.assigned_at:
        delivery.assigned_at = current_time
    elif status == "accepted_by_company":
        delivery.accepted_at = current_time
    elif status == "rejected_by_company":
        delivery.rejected_at = current_time
    elif status == "picked_up":
        delivery.picked_up_at = current_time
        delivery.order.status = normalize_order_status("shipped")
    elif status == "delivered":
        delivery.delivered_at = current_time
        delivery.order.status = normalize_order_status("complete")
    elif status == "issue_reported":
        delivery.issue_reported_at = current_time
    elif status == "failed":
        delivery.failed_at = current_time
    elif status == "returned":
        delivery.returned_at = current_time
    elif status == "cancelled":
        delivery.cancelled_at = current_time
    log_delivery_event(
        delivery,
        event_type,
        actor_type,
        actor_id,
        from_status=previous,
        to_status=status,
        reason=reason,
        note=note,
        details=details,
    )
    return delivery


def ensure_order_delivery(order):
    delivery = getattr(order, "delivery", None)
    if delivery:
        return delivery
    delivery = OrderDelivery(order=order, status="assigned_to_company", otp_required=True)
    db.session.add(delivery)
    db.session.flush()
    return delivery


def customer_contact_available(order):
    return bool(normalise_phone(getattr(order, "phone", "") or "") or (getattr(order, "email", "") or "").strip())


def assign_order_to_company(order, company, actor, note=None):
    if not company or not company.is_active:
        raise DeliveryError("Delivery company is inactive or unavailable.", 400, "company_inactive")
    if normalize_order_status(order.status) in {"cancelled", "archived", "complete"}:
        raise DeliveryError("This order cannot be assigned for delivery in its current state.", 409, "order_not_assignable")
    delivery = ensure_order_delivery(order)
    previous_company_id = delivery.company_id
    delivery.company = company
    delivery.company_id = company.id
    delivery.rider = None
    delivery.rider_id = None
    delivery.assigned_by_id = actor[1]
    delivery.otp_blocked = False
    transition_delivery(
        delivery,
        "assigned_to_company",
        actor,
        "assigned_to_company",
        note=note,
        details={"previous_company_id": previous_company_id, "company_id": company.id},
    )
    return delivery


def company_accept_delivery(delivery, actor):
    if delivery.status != "assigned_to_company":
        raise DeliveryError("This delivery is not waiting for company acceptance.", 409, "invalid_transition")
    return transition_delivery(delivery, "accepted_by_company", actor, "company_accepted")


def company_reject_delivery(delivery, actor, reason, note=None):
    reason = (reason or "").strip()
    if not reason:
        raise DeliveryError("Rejection reason is required.", 400, "reason_required")
    if delivery.status not in {"assigned_to_company", "accepted_by_company"}:
        raise DeliveryError("This delivery cannot be rejected now.", 409, "invalid_transition")
    delivery.rider = None
    delivery.rider_id = None
    return transition_delivery(delivery, "rejected_by_company", actor, "company_rejected", reason=reason, note=note)


def assign_rider(delivery, rider, actor, reason=None):
    if not rider or not rider.is_active or not rider.user.is_active:
        raise DeliveryError("Rider is inactive or unavailable.", 400, "rider_inactive")
    if delivery.company_id != rider.company_id:
        raise DeliveryError("Rider does not belong to this delivery company.", 403, "rider_company_mismatch")
    if delivery.status == "picked_up" and not (reason or "").strip():
        raise DeliveryError("A reason is required to reassign after pickup.", 400, "reason_required")
    if delivery.status in {"delivered", "cancelled", "returned"}:
        raise DeliveryError("This delivery can no longer be reassigned.", 409, "invalid_transition")
    previous_rider_id = delivery.rider_id
    delivery.rider = rider
    delivery.rider_id = rider.id
    event_type = "reassigned_to_rider" if previous_rider_id else "assigned_to_rider"
    next_status = "picked_up" if delivery.status == "picked_up" else "assigned_to_rider"
    transition_delivery(
        delivery,
        next_status,
        actor,
        event_type,
        reason=reason,
        details={"previous_rider_id": previous_rider_id, "new_rider_id": rider.id},
    )
    return delivery


def active_otp(delivery):
    return (
        DeliveryOtp.query
        .filter_by(delivery_id=delivery.id, used_at=None, replaced_at=None)
        .order_by(DeliveryOtp.created_at.desc())
        .first()
    )


def send_delivery_otp(delivery, otp, code):
    order = delivery.order
    phone = normalise_phone(getattr(order, "phone", "") or "")
    email = (getattr(order, "email", "") or "").strip().lower()
    order_reference = order.order_reference
    text = (
        f"Your RealMindX delivery OTP for {order_reference} is {code}. "
        f"It expires in {OTP_EXPIRY_HOURS} hours. Share it only after receiving your package."
    )
    current_time = now_utc()

    if phone and send_sms(phone, text):
        otp.sent_at = current_time
        otp.last_sent_at = current_time
        otp.send_channel = "sms"
        otp.send_status = "sent"
        log_delivery_event(delivery, "otp_sent", "system", to_status=delivery.status, details={"channel": "sms"})
        return True

    if email:
        body = (
            f"<p>Hello {escape(order.customer_name or 'there')},</p>"
            f"<p>Your RealMindX Bookshop order <strong>{escape(order_reference)}</strong> is out for delivery.</p>"
            '<div style="text-align:center;margin:28px 0;">'
            '<div style="display:inline-block;background:#f5f8fc;border:2px dashed #c8d5e8;'
            'border-radius:12px;padding:18px 36px;">'
            '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;'
            'text-transform:uppercase;color:#6b80a0;">Delivery OTP</p>'
            f'<p style="margin:0;font-size:38px;font-weight:900;letter-spacing:.22em;color:#143670;">{escape(code)}</p>'
            "</div></div>"
            f"<p>This code expires in {OTP_EXPIRY_HOURS} hours. Share it with the rider only after receiving your package.</p>"
        )
        result = send_email(
            OutboundEmail(
                to=email,
                subject=f"Your RealMindX delivery OTP: {code}",
                html=bookshop_email_shell(
                    "Your delivery OTP",
                    body,
                    eyebrow="RealMindX Bookshop Delivery",
                    preheader=f"Your delivery OTP for {order_reference} is {code}.",
                ),
                text=text,
            )
        )
        if result.get("status") == "sent":
            otp.sent_at = current_time
            otp.last_sent_at = current_time
            otp.send_channel = "email"
            otp.send_status = "sent"
            log_delivery_event(delivery, "otp_sent", "system", to_status=delivery.status, details={"channel": "email"})
            return True

    otp.send_status = "failed"
    otp.last_sent_at = current_time
    log_delivery_event(
        delivery,
        "notification_failed",
        "system",
        to_status=delivery.status,
        details={"has_phone": bool(phone), "has_email": bool(email)},
    )
    return False


def generate_delivery_otp(delivery, actor, event_type="otp_generated"):
    if not customer_contact_available(delivery.order):
        raise DeliveryError(
            "This order has no usable customer phone number or email for OTP delivery.",
            400,
            "missing_customer_contact",
        )
    current_time = now_utc()
    DeliveryOtp.query.filter_by(delivery_id=delivery.id, used_at=None, replaced_at=None).update({"replaced_at": current_time})
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = DeliveryOtp(
        delivery=delivery,
        order_id=delivery.order_id,
        token_hash=generate_password_hash(code),
        expires_at=current_time + timedelta(hours=OTP_EXPIRY_HOURS),
        attempts_count=0,
        max_attempts=OTP_MAX_ATTEMPTS,
        send_status="pending",
    )
    db.session.add(otp)
    db.session.flush()
    actor_type, actor_id = actor
    log_delivery_event(delivery, event_type, actor_type, actor_id, to_status=delivery.status)
    send_delivery_otp(delivery, otp, code)
    return otp


def resend_delivery_otp(delivery, actor):
    if delivery.status != "picked_up":
        raise DeliveryError("OTP can only be resent after pickup.", 409, "invalid_transition")
    existing = active_otp(delivery)
    if existing and existing.last_sent_at:
        elapsed = (now_utc() - aware(existing.last_sent_at)).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            raise DeliveryError("Wait a little before resending this OTP.", 429, "otp_resend_cooldown")
    otp = generate_delivery_otp(delivery, actor, event_type="otp_resent")
    if existing:
        otp.resend_count = int(existing.resend_count or 0) + 1
    return otp


def mark_picked_up(delivery, actor):
    if delivery.status not in {"assigned_to_rider", "accepted_by_company"}:
        raise DeliveryError("This delivery is not assigned for pickup.", 409, "invalid_transition")
    if not delivery.rider_id:
        raise DeliveryError("Assign a rider before pickup.", 400, "rider_required")
    if not customer_contact_available(delivery.order):
        raise DeliveryError(
            "This order has no usable customer phone number or email for OTP delivery.",
            400,
            "missing_customer_contact",
        )
    transition_delivery(delivery, "picked_up", actor, "picked_up")
    generate_delivery_otp(delivery, actor)
    return delivery


def verify_delivery_otp(delivery, code, actor):
    value = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(value) != 6:
        raise DeliveryError("Enter the 6-digit customer OTP.", 400, "invalid_otp_format")
    if delivery.otp_blocked:
        raise DeliveryError("OTP attempts are blocked. RealMindX staff review is required.", 403, "otp_blocked")
    otp = active_otp(delivery)
    current_time = now_utc()
    if not otp:
        raise DeliveryError("No active OTP exists for this delivery. Resend the OTP.", 400, "otp_missing")
    if aware(otp.expires_at) < current_time:
        log_delivery_event(delivery, "otp_expired", actor[0], actor[1], to_status=delivery.status)
        raise DeliveryError("This OTP has expired. Resend a new OTP.", 400, "otp_expired")
    if otp.attempts_count >= otp.max_attempts:
        delivery.otp_blocked = True
        raise DeliveryError("Too many wrong OTP attempts. RealMindX staff review is required.", 403, "otp_blocked")
    if not check_password_hash(otp.token_hash, value):
        otp.attempts_count += 1
        log_delivery_event(
            delivery,
            "wrong_otp_attempt",
            actor[0],
            actor[1],
            to_status=delivery.status,
            details={"attempts_count": otp.attempts_count, "max_attempts": otp.max_attempts},
        )
        if otp.attempts_count >= otp.max_attempts:
            delivery.otp_blocked = True
            log_delivery_event(delivery, "otp_attempts_exceeded", "system", to_status=delivery.status)
        raise DeliveryError("That OTP is incorrect.", 400, "otp_incorrect")
    otp.used_at = current_time
    log_delivery_event(delivery, "otp_verified", actor[0], actor[1], to_status=delivery.status)
    return otp


def complete_delivery_with_otp(delivery, code, actor):
    if delivery.status != "picked_up":
        raise DeliveryError("This delivery is not out for delivery.", 409, "invalid_transition")
    verify_delivery_otp(delivery, code, actor)
    return transition_delivery(delivery, "delivered", actor, "delivered")


def staff_override_otp(delivery, actor, reason, note=None):
    reason = (reason or "").strip()
    if reason not in OTP_OVERRIDE_REASONS:
        raise DeliveryError("Choose a valid OTP override reason.", 400, "invalid_override_reason")
    if delivery.status not in {"picked_up", "issue_reported"}:
        raise DeliveryError("OTP override is only available for active deliveries.", 409, "invalid_transition")
    log_delivery_event(
        delivery,
        "otp_override",
        actor[0],
        actor[1],
        to_status=delivery.status,
        reason=reason,
        note=note,
        details={"reason_label": OTP_OVERRIDE_REASONS.get(reason)},
    )
    return transition_delivery(delivery, "delivered", actor, "delivered", reason=reason, note=note)


def report_delivery_issue(delivery, actor, reason, note=None):
    reason = (reason or "").strip()
    if reason not in ISSUE_REASONS:
        raise DeliveryError("Choose a valid delivery issue reason.", 400, "invalid_issue_reason")
    if delivery.status in {"delivered", "cancelled", "returned"}:
        raise DeliveryError("This delivery is already closed.", 409, "invalid_transition")
    delivery.issue_reason = reason
    delivery.issue_note = (note or "").strip() or None
    return transition_delivery(
        delivery,
        "issue_reported",
        actor,
        "issue_reported",
        reason=reason,
        note=note,
        details={"reason_label": ISSUE_REASONS.get(reason)},
    )


def fail_delivery(delivery, actor, reason, note=None):
    reason = (reason or "").strip()
    if not reason:
        raise DeliveryError("Failure reason is required.", 400, "reason_required")
    delivery.failed_reason = reason
    return transition_delivery(delivery, "failed", actor, "failed_delivery", reason=reason, note=note)


def return_delivery(delivery, actor, reason, note=None):
    reason = (reason or "").strip()
    if not reason:
        raise DeliveryError("Return reason is required.", 400, "reason_required")
    return transition_delivery(delivery, "returned", actor, "returned", reason=reason, note=note)


def cancel_delivery(delivery, actor, reason=None, note=None):
    if delivery.status in {"delivered", "cancelled"}:
        return delivery
    return transition_delivery(delivery, "cancelled", actor, "cancelled", reason=reason, note=note)


def authenticate_phone_user(phone, password, role_name):
    phone = normalize_delivery_phone(phone)
    user_model = DeliveryCompanyUser if role_name == "delivery_company_user" else DeliveryRider
    profile = user_model.query.filter_by(phone=phone).first()
    user = profile.user if profile else None
    company = profile.company if profile else None
    if not profile or not user or not company:
        raise DeliveryError("Invalid phone number or password.", 401, "invalid_credentials")
    if not profile.is_active or not company.is_active or not user.is_active:
        raise DeliveryError("This delivery portal account is inactive.", 403, "inactive_account")
    if not user.check_password(password or ""):
        raise DeliveryError("Invalid phone number or password.", 401, "invalid_credentials")
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now_utc()
    if isinstance(profile, DeliveryRider):
        profile.last_seen_at = now_utc()
    return user, profile


def staff_delivery_contact_warning(order):
    if customer_contact_available(order):
        return None
    return "This order has no usable customer phone number or email. OTP delivery will fail until contact details are fixed."
