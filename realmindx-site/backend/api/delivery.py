from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user

from ..audit import audit
from ..delivery_service import (
    DeliveryError,
    ISSUE_REASONS,
    actor_from_user,
    assign_rider,
    authenticate_phone_user,
    company_accept_delivery,
    company_reject_delivery,
    complete_delivery_with_otp,
    create_rider,
    mark_picked_up,
    report_delivery_issue,
    reset_portal_password,
)
from ..extensions import db, limiter
from ..models import DeliveryCompanyUser, DeliveryRider, OrderDelivery
from ..serializers import delivery_json, delivery_rider_json, user_json
from ..sms_service import normalise_phone


delivery_bp = Blueprint("delivery", __name__, url_prefix="/delivery")


def _boolish(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on", "active"}


def _delivery_error_response(exc):
    return jsonify(error=exc.message, code=exc.code), exc.status_code


def _role_name(user):
    return getattr(getattr(user, "role", None), "name", None)


def _company_profile():
    if not current_user.is_authenticated or _role_name(current_user) != "delivery_company_user":
        raise DeliveryError("Company portal access required.", 403, "company_access_required")
    profile = DeliveryCompanyUser.query.filter_by(user_id=current_user.id).first()
    if not profile or not profile.is_active or not profile.user.is_active:
        raise DeliveryError("This company portal account is inactive.", 403, "inactive_account")
    if not profile.company or not profile.company.is_active:
        raise DeliveryError("This delivery company is inactive.", 403, "company_inactive")
    return profile


def _rider_profile():
    if not current_user.is_authenticated or _role_name(current_user) != "delivery_rider":
        raise DeliveryError("Rider portal access required.", 403, "rider_access_required")
    profile = DeliveryRider.query.filter_by(user_id=current_user.id).first()
    if not profile or not profile.is_active or not profile.user.is_active:
        raise DeliveryError("This rider account is inactive.", 403, "inactive_account")
    if not profile.company or not profile.company.is_active:
        raise DeliveryError("This delivery company is inactive.", 403, "company_inactive")
    return profile


def _company_delivery_or_404(delivery_id, profile):
    delivery = db.get_or_404(OrderDelivery, delivery_id)
    if delivery.company_id != profile.company_id:
        raise DeliveryError("Delivery not found for this company.", 404, "delivery_not_found")
    return delivery


def _rider_delivery_or_404(delivery_id, profile):
    delivery = db.get_or_404(OrderDelivery, delivery_id)
    if delivery.rider_id != profile.id:
        raise DeliveryError("Delivery not found for this rider.", 404, "delivery_not_found")
    return delivery


@delivery_bp.post("/company/login")
@limiter.limit("10/minute")
def company_login():
    payload = request.get_json(silent=True) or {}
    try:
        user, profile = authenticate_phone_user(payload.get("phone"), payload.get("password"), "delivery_company_user")
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    login_user(user, remember=bool(payload.get("remember")))
    audit("delivery_company_login", "delivery_company_user", profile.id, {"company_id": profile.company_id})
    db.session.commit()
    return jsonify(user=user_json(user), company_user={
        "id": profile.id,
        "company_id": profile.company_id,
        "company_name": profile.company.name,
        "name": profile.name,
        "phone": profile.phone,
    })


@delivery_bp.post("/rider/login")
@limiter.limit("10/minute")
def rider_login():
    payload = request.get_json(silent=True) or {}
    try:
        user, profile = authenticate_phone_user(payload.get("phone"), payload.get("password"), "delivery_rider")
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    login_user(user, remember=bool(payload.get("remember")))
    audit("delivery_rider_login", "delivery_rider", profile.id, {"company_id": profile.company_id})
    db.session.commit()
    return jsonify(user=user_json(user), rider=delivery_rider_json(profile))


@delivery_bp.post("/logout")
@login_required
def delivery_logout():
    actor = actor_from_user(current_user)
    audit("delivery_portal_logout", actor[0], actor[1])
    db.session.commit()
    logout_user()
    return jsonify(message="Signed out.")


@delivery_bp.get("/company/me")
@login_required
def company_me():
    try:
        profile = _company_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    return jsonify(user=user_json(current_user), company_user={
        "id": profile.id,
        "company_id": profile.company_id,
        "company_name": profile.company.name,
        "name": profile.name,
        "phone": profile.phone,
    })


@delivery_bp.get("/company/deliveries")
@login_required
def company_deliveries():
    try:
        profile = _company_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    scope = (request.args.get("scope") or "active").strip()
    query = OrderDelivery.query.filter_by(company_id=profile.company_id).order_by(OrderDelivery.updated_at.desc())
    if scope == "active":
        query = query.filter(OrderDelivery.status.notin_(["delivered", "failed", "returned", "cancelled"]))
    elif scope == "completed":
        query = query.filter(OrderDelivery.status.in_(["delivered", "failed", "returned", "cancelled"]))
    rows = query.limit(200).all()
    return jsonify(
        items=[delivery_json(delivery, include_events=True, rider_safe=True) for delivery in rows],
        issue_reasons=ISSUE_REASONS,
    )


@delivery_bp.post("/company/deliveries/<int:delivery_id>/accept")
@login_required
def company_accept(delivery_id):
    try:
        profile = _company_profile()
        delivery = _company_delivery_or_404(delivery_id, profile)
        company_accept_delivery(delivery, actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True, rider_safe=True))


@delivery_bp.post("/company/deliveries/<int:delivery_id>/reject")
@login_required
def company_reject(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
        delivery = _company_delivery_or_404(delivery_id, profile)
        company_reject_delivery(delivery, actor_from_user(current_user), payload.get("reason"), note=payload.get("note"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True, rider_safe=True))


@delivery_bp.get("/company/riders")
@login_required
def company_riders():
    try:
        profile = _company_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    rows = DeliveryRider.query.filter_by(company_id=profile.company_id).order_by(DeliveryRider.name.asc()).all()
    return jsonify(items=[delivery_rider_json(rider) for rider in rows])


@delivery_bp.post("/company/riders")
@login_required
def company_create_rider():
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
        rider = create_rider(profile.company, payload, actor=actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    audit("delivery_company_create_rider", "delivery_rider", rider.id, {"company_id": rider.company_id})
    db.session.commit()
    return jsonify(rider=delivery_rider_json(rider)), 201


@delivery_bp.put("/company/riders/<int:rider_id>")
@login_required
def company_update_rider(rider_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    rider = db.get_or_404(DeliveryRider, rider_id)
    if rider.company_id != profile.company_id:
        return jsonify(error="Rider not found for this company."), 404
    if "name" in payload:
        rider.name = (payload.get("name") or rider.name).strip()
        first, _, last = rider.name.partition(" ")
        rider.user.first_name = first or rider.user.first_name
        rider.user.last_name = last
    if "phone" in payload:
        phone = normalise_phone(payload.get("phone") or "")
        if not phone:
            return jsonify(error="Enter a valid Ghana phone number."), 400
        duplicate = DeliveryRider.query.filter(DeliveryRider.phone == phone, DeliveryRider.id != rider.id).first()
        if duplicate:
            return jsonify(error="A rider already exists for this phone number."), 409
        rider.phone = phone
        rider.user.phone = phone
    if "is_active" in payload:
        rider.is_active = _boolish(payload.get("is_active"))
        rider.status = "active" if rider.is_active else "inactive"
        rider.user.is_active = rider.is_active
    audit("delivery_company_update_rider", "delivery_rider", rider.id, {"company_id": rider.company_id})
    db.session.commit()
    return jsonify(rider=delivery_rider_json(rider))


@delivery_bp.post("/company/riders/<int:rider_id>/reset-password")
@login_required
def company_reset_rider_password(rider_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    rider = db.get_or_404(DeliveryRider, rider_id)
    if rider.company_id != profile.company_id:
        return jsonify(error="Rider not found for this company."), 404
    try:
        reset_portal_password(rider.user, payload.get("password") or "")
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    audit("delivery_company_reset_rider_password", "delivery_rider", rider.id, {"company_id": rider.company_id})
    db.session.commit()
    return jsonify(message="Rider password reset. They must change it on next login.")


@delivery_bp.post("/company/deliveries/<int:delivery_id>/assign-rider")
@login_required
def company_assign_rider(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
        delivery = _company_delivery_or_404(delivery_id, profile)
        rider = db.session.get(DeliveryRider, payload.get("rider_id"))
        if not rider or rider.company_id != profile.company_id:
            raise DeliveryError("Choose one of your riders.", 400, "rider_required")
        assign_rider(delivery, rider, actor_from_user(current_user), reason=payload.get("reason"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True, rider_safe=True))


@delivery_bp.post("/company/deliveries/<int:delivery_id>/issue")
@login_required
def company_report_issue(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
        delivery = _company_delivery_or_404(delivery_id, profile)
        report_delivery_issue(delivery, actor_from_user(current_user), payload.get("reason"), note=payload.get("note"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True, rider_safe=True))


@delivery_bp.get("/rider/me")
@login_required
def rider_me():
    try:
        rider = _rider_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    return jsonify(user=user_json(current_user), rider=delivery_rider_json(rider))


@delivery_bp.get("/rider/deliveries")
@login_required
def rider_deliveries():
    try:
        rider = _rider_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    scope = (request.args.get("scope") or "active").strip()
    query = OrderDelivery.query.filter_by(rider_id=rider.id).order_by(OrderDelivery.updated_at.desc())
    if scope == "active":
        query = query.filter(OrderDelivery.status.in_(["assigned_to_rider", "picked_up", "issue_reported"]))
    elif scope == "history":
        query = query.filter(OrderDelivery.status.in_(["delivered", "failed", "returned", "cancelled"]))
    rows = query.limit(100).all()
    return jsonify(items=[delivery_json(delivery, include_events=False, rider_safe=True) for delivery in rows], issue_reasons=ISSUE_REASONS)


@delivery_bp.post("/rider/deliveries/<int:delivery_id>/pickup")
@login_required
def rider_pickup(delivery_id):
    try:
        rider = _rider_profile()
        delivery = _rider_delivery_or_404(delivery_id, rider)
        mark_picked_up(delivery, actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, rider_safe=True))


@delivery_bp.post("/rider/deliveries/<int:delivery_id>/deliver")
@login_required
def rider_deliver(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        rider = _rider_profile()
        delivery = _rider_delivery_or_404(delivery_id, rider)
        complete_delivery_with_otp(delivery, payload.get("otp"), actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, rider_safe=True))


@delivery_bp.post("/rider/deliveries/<int:delivery_id>/issue")
@login_required
def rider_report_issue(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        rider = _rider_profile()
        delivery = _rider_delivery_or_404(delivery_id, rider)
        report_delivery_issue(delivery, actor_from_user(current_user), payload.get("reason"), note=payload.get("note"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, rider_safe=True))
