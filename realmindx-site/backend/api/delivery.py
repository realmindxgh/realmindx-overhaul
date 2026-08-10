import csv
import io
import zipfile
from datetime import date
from html import escape
from flask import Blueprint, Response, current_app, jsonify, request, send_file, session
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
    resend_delivery_otp,
    reset_portal_password,
    send_portal_access_notification,
)
from ..extensions import db, limiter
from ..email_service import OutboundEmail, app_email_shell, send_email
from ..models import DeliveryCompanyUser, DeliveryRider, DeliverySettlementBatch, OrderDelivery
from ..platform_terms import accept_current_terms, has_accepted_current_terms, terms_payload
from ..settlement_service import SettlementError, batch_json, line_json, log_settlement_event, raise_dispute
from ..serializers import delivery_company_user_json, delivery_json, delivery_rider_json, user_json
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


def _company_profile(require_terms=True):
    if not current_user.is_authenticated or _role_name(current_user) != "delivery_company_user":
        raise DeliveryError("Company portal access required.", 403, "company_access_required")
    profile = DeliveryCompanyUser.query.filter_by(user_id=current_user.id).first()
    if not profile or not profile.is_active or not profile.user.is_active:
        raise DeliveryError("This company portal account is inactive.", 403, "inactive_account")
    if not profile.company or not profile.company.is_active:
        raise DeliveryError("This delivery company is inactive.", 403, "company_inactive")
    if require_terms and not has_accepted_current_terms(current_user.id, "delivery_company_terms"):
        raise DeliveryError("Accept the current Delivery Company Platform Terms to continue.", 428, "terms_acceptance_required")
    return profile


def _rider_profile(require_terms=True):
    if not current_user.is_authenticated or _role_name(current_user) != "delivery_rider":
        raise DeliveryError("Rider portal access required.", 403, "rider_access_required")
    profile = DeliveryRider.query.filter_by(user_id=current_user.id).first()
    if not profile or not profile.is_active or not profile.user.is_active:
        raise DeliveryError("This rider account is inactive.", 403, "inactive_account")
    if not profile.company or not profile.company.is_active:
        raise DeliveryError("This delivery company is inactive.", 403, "company_inactive")
    if require_terms and not has_accepted_current_terms(current_user.id, "rider_terms"):
        raise DeliveryError("Accept the current Rider Platform Terms to continue.", 428, "terms_acceptance_required")
    return profile


def _client_ip():
    return request.remote_addr or None


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


def _require_password_changed():
    if current_user.must_change_password:
        raise DeliveryError(
            "Change your temporary password before using delivery actions.",
            428,
            "password_change_required",
        )


@delivery_bp.post("/company/login")
@limiter.limit("10/minute")
def company_login():
    payload = request.get_json(silent=True) or {}
    try:
        user, profile = authenticate_phone_user(payload.get("phone"), payload.get("password"), "delivery_company_user")
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    remember = bool(payload.get("remember"))
    session.permanent = remember
    login_user(user, remember=remember)
    audit("delivery_company_login", "delivery_company_user", profile.id, {"company_id": profile.company_id})
    db.session.commit()
    company_user = delivery_company_user_json(profile)
    company_user["company_name"] = profile.company.name
    return jsonify(user=user_json(user), company_user=company_user)


@delivery_bp.post("/rider/login")
@limiter.limit("10/minute")
def rider_login():
    payload = request.get_json(silent=True) or {}
    try:
        user, profile = authenticate_phone_user(payload.get("phone"), payload.get("password"), "delivery_rider")
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    remember = bool(payload.get("remember"))
    session.permanent = remember
    login_user(user, remember=remember)
    audit("delivery_rider_login", "delivery_rider", profile.id, {"company_id": profile.company_id})
    db.session.commit()
    return jsonify(user=user_json(user), rider=delivery_rider_json(profile))


@delivery_bp.get("/company/terms/current")
def company_terms_current():
    user_id = current_user.id if current_user.is_authenticated and _role_name(current_user) == "delivery_company_user" else None
    if user_id:
        audit("platform_terms_viewed", "platform_terms", "delivery_company_terms", {"version": terms_payload("delivery_company_terms")["version"]})
        db.session.commit()
    return jsonify(terms=terms_payload("delivery_company_terms", user_id))


@delivery_bp.post("/company/terms/accept")
@login_required
def company_terms_accept():
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile(require_terms=False)
        _require_password_changed()
        accept_current_terms(current_user, profile, "delivery_company_terms", payload.get("version"), payload.get("hash"), _client_ip(), request.headers.get("User-Agent"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    except ValueError as exc:
        return jsonify(error=str(exc), code="terms_version_mismatch"), 409
    db.session.commit()
    return jsonify(terms=terms_payload("delivery_company_terms", current_user.id), company_user=delivery_company_user_json(profile))


@delivery_bp.get("/rider/terms/current")
def rider_terms_current():
    user_id = current_user.id if current_user.is_authenticated and _role_name(current_user) == "delivery_rider" else None
    if user_id:
        audit("platform_terms_viewed", "platform_terms", "rider_terms", {"version": terms_payload("rider_terms")["version"]})
        db.session.commit()
    return jsonify(terms=terms_payload("rider_terms", user_id))


@delivery_bp.post("/rider/terms/accept")
@login_required
def rider_terms_accept():
    payload = request.get_json(silent=True) or {}
    try:
        profile = _rider_profile(require_terms=False)
        _require_password_changed()
        accept_current_terms(current_user, profile, "rider_terms", payload.get("version"), payload.get("hash"), _client_ip(), request.headers.get("User-Agent"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    except ValueError as exc:
        return jsonify(error=str(exc), code="terms_version_mismatch"), 409
    db.session.commit()
    return jsonify(terms=terms_payload("rider_terms", current_user.id), rider=delivery_rider_json(profile))


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
        profile = _company_profile(require_terms=False)
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    company_user = delivery_company_user_json(profile)
    company_user["company_name"] = profile.company.name
    return jsonify(user=user_json(current_user), company_user=company_user)


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
        _require_password_changed()
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
        _require_password_changed()
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
        _require_password_changed()
        rider = create_rider(profile.company, payload, actor=actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    audit("delivery_company_create_rider", "delivery_rider", rider.id, {"company_id": rider.company_id})
    temporary_password = getattr(rider, "_temporary_password", None)
    notification = send_portal_access_notification(rider, "rider", temporary_password)
    db.session.commit()
    return jsonify(
        rider=delivery_rider_json(rider),
        temporary_password=temporary_password,
        notification=notification,
    ), 201


@delivery_bp.get("/company/riders/<int:rider_id>")
@login_required
def company_rider_detail(rider_id):
    try:
        profile = _company_profile()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    rider = db.get_or_404(DeliveryRider, rider_id)
    if rider.company_id != profile.company_id:
        return jsonify(error="Rider not found for this company."), 404
    scope = (request.args.get("scope") or "all").strip().lower()
    query = OrderDelivery.query.filter_by(rider_id=rider.id).order_by(OrderDelivery.updated_at.desc())
    if scope == "active":
        query = query.filter(OrderDelivery.status.in_(["assigned_to_rider", "picked_up", "issue_reported"]))
    elif scope in {"completed", "history"}:
        query = query.filter(OrderDelivery.status.in_(["delivered", "failed", "returned", "cancelled"]))
    rows = query.limit(200).all()
    return jsonify(
        rider=delivery_rider_json(rider),
        deliveries=[delivery_json(delivery, include_events=True, rider_safe=True) for delivery in rows],
    )


@delivery_bp.put("/company/riders/<int:rider_id>")
@login_required
def company_update_rider(rider_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
        _require_password_changed()
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
    try:
        profile = _company_profile()
        _require_password_changed()
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    rider = db.get_or_404(DeliveryRider, rider_id)
    if rider.company_id != profile.company_id:
        return jsonify(error="Rider not found for this company."), 404
    try:
        temporary_password = reset_portal_password(rider.user)
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    audit("delivery_company_reset_rider_password", "delivery_rider", rider.id, {"company_id": rider.company_id})
    notification = send_portal_access_notification(rider, "rider", temporary_password)
    db.session.commit()
    return jsonify(
        message="Rider password reset. They must change it on next login.",
        temporary_password=temporary_password,
        notification=notification,
    )


@delivery_bp.post("/company/deliveries/<int:delivery_id>/assign-rider")
@login_required
def company_assign_rider(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile()
        _require_password_changed()
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
        _require_password_changed()
        delivery = _company_delivery_or_404(delivery_id, profile)
        report_delivery_issue(delivery, actor_from_user(current_user), payload.get("reason"), note=payload.get("note"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True, rider_safe=True))


@delivery_bp.post("/company/deliveries/<int:delivery_id>/resend-otp")
@login_required
def company_resend_otp(delivery_id):
    try:
        profile = _company_profile()
        _require_password_changed()
        delivery = _company_delivery_or_404(delivery_id, profile)
        otp = resend_delivery_otp(delivery, actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    audit("delivery_company_resend_otp", "order_delivery", delivery.id, {"otp_id": otp.id, "company_id": profile.company_id})
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, include_events=True, rider_safe=True), message="A fresh OTP was sent to the customer.")


@delivery_bp.get("/company/settlements")
@login_required
def company_settlements():
    try: profile = _company_profile()
    except DeliveryError as exc: return _delivery_error_response(exc)
    query = DeliverySettlementBatch.query.filter_by(company_id=profile.company_id).order_by(DeliverySettlementBatch.settlement_date.desc())
    start = (request.args.get("start_date") or "").strip(); end = (request.args.get("end_date") or "").strip()
    if start: query = query.filter(DeliverySettlementBatch.settlement_date >= date.fromisoformat(start))
    if end: query = query.filter(DeliverySettlementBatch.settlement_date <= date.fromisoformat(end))
    return jsonify(items=[batch_json(batch) for batch in query.all()])


def _company_settlement_or_404(batch_id, profile):
    batch = db.get_or_404(DeliverySettlementBatch, batch_id)
    if batch.company_id != profile.company_id:
        raise DeliveryError("Settlement not found for this company.", 404, "settlement_not_found")
    return batch


@delivery_bp.get("/company/settlements/<int:batch_id>")
@login_required
def company_settlement_detail(batch_id):
    try:
        profile = _company_profile(); batch = _company_settlement_or_404(batch_id, profile)
    except DeliveryError as exc: return _delivery_error_response(exc)
    return jsonify(settlement=batch_json(batch, include_lines=True, include_events=True))


@delivery_bp.post("/company/settlements/<int:batch_id>/dispute")
@login_required
def company_settlement_dispute(batch_id):
    payload = request.get_json(silent=True) or {}
    try:
        profile = _company_profile(); _require_password_changed(); batch = _company_settlement_or_404(batch_id, profile)
        raise_dispute(batch, payload.get("note"), actor_from_user(current_user))
    except DeliveryError as exc: return _delivery_error_response(exc)
    except SettlementError as exc: return jsonify(error=exc.message, code=exc.code), exc.status_code
    db.session.commit()
    admin_email = (current_app.config.get("ADMIN_EMAIL") or "").strip()
    if admin_email:
        admin_url = f"{current_app.config['BASE_URL'].rstrip('/')}/admin/dashboard"
        try:
            send_email(
                OutboundEmail(
                    to=admin_email,
                    subject=f"Delivery settlement dispute: {batch.reference}",
                    html=app_email_shell(
                        "Delivery settlement disputed",
                        f"<p>{escape(batch.company.name)} raised a dispute for settlement <strong>{escape(batch.reference)}</strong>.</p><p>{escape(batch.dispute_notes or '')}</p>",
                        cta_label="Review settlement", cta_url=admin_url,
                    ),
                    text=f"{batch.company.name} disputed {batch.reference}: {batch.dispute_notes}. {admin_url}",
                ),
                purpose="admin_alert",
                recipient_user_id=None,
                template_name="delivery_settlement_dispute",
            )
        except Exception:
            current_app.logger.exception("Could not send settlement dispute notification for %s", batch.reference)
    return jsonify(settlement=batch_json(batch, include_lines=True, include_events=True))


@delivery_bp.get("/company/settlements/<int:batch_id>/export/<string:export_format>")
@login_required
def company_settlement_export(batch_id, export_format):
    try:
        profile = _company_profile(); batch = _company_settlement_or_404(batch_id, profile)
    except DeliveryError as exc: return _delivery_error_response(exc)
    rows = [line_json(line) for line in batch.lines]
    for row in rows:
        row.update(payment_reference=batch.payment_reference, dispute_status=batch.dispute_status)
    headers = ["settlement_date", "order_reference", "rider_name", "delivery_location", "payment_method", "book_subtotal", "customer_delivery_fee", "company_payable", "amount_due_realmindx", "amount_due_company", "net_balance", "status", "delivered_at", "payment_reference", "dispute_status"]
    if export_format not in {"csv", "xlsx", "pdf", "zip"}:
        return jsonify(error="Use csv, xlsx, pdf, or zip."), 400
    log_settlement_event(batch, "settlement_exported", actor_from_user(current_user), details={"format": export_format})
    db.session.commit()
    if export_format == "csv":
        output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=headers); writer.writeheader(); writer.writerows([{key: row.get(key) for key in headers} for row in rows])
        return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={batch.reference}.csv"})
    if export_format == "xlsx":
        try: from openpyxl import Workbook
        except ImportError: return jsonify(error="XLSX export requires openpyxl."), 501
        workbook = Workbook(); sheet = workbook.active; sheet.title = "Settlement"; sheet.append(headers)
        for row in rows: sheet.append([row.get(key) for key in headers])
        stream = io.BytesIO(); workbook.save(stream); stream.seek(0)
        return send_file(stream, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name=f"{batch.reference}.xlsx")
    if export_format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError: return jsonify(error="PDF export requires reportlab."), 501
        stream = io.BytesIO(); pdf = rl_canvas.Canvas(stream, pagesize=A4); _, height = A4; y = height - 42
        pdf.setFont("Helvetica-Bold", 15); pdf.drawString(36, y, "RealMindX Delivery Settlement")
        y -= 20; pdf.setFont("Helvetica", 9); pdf.drawString(36, y, f"{batch.reference} | {batch.company.name} | {batch.settlement_date} | {batch.status}")
        for row in rows:
            y -= 16
            if y < 40: pdf.showPage(); y = height - 42; pdf.setFont("Helvetica", 8)
            pdf.drawString(36, y, f"{row['order_reference']} | {row['rider_name'] or '-'} | {row['payment_method']} | Due RMX {row['amount_due_realmindx']:.2f} | Due Company {row['amount_due_company']:.2f} | Net {row['net_balance']:.2f}")
        pdf.save(); stream.seek(0)
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name=f"{batch.reference}.pdf")
    if export_format == "zip":
        try: from openpyxl import Workbook
        except ImportError: return jsonify(error="ZIP export requires openpyxl."), 501
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as rl_canvas
        except ImportError: return jsonify(error="ZIP export requires reportlab."), 501
        zip_stream = io.BytesIO()
        with zipfile.ZipFile(zip_stream, "w", zipfile.ZIP_DEFLATED) as zf:
            output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=headers); writer.writeheader(); writer.writerows([{key: row.get(key) for key in headers} for row in rows])
            zf.writestr(f"{batch.reference}.csv", output.getvalue())
            workbook = Workbook(); sheet = workbook.active; sheet.title = "Settlement"; sheet.append(headers)
            for row in rows: sheet.append([row.get(key) for key in headers])
            xlsx_stream = io.BytesIO(); workbook.save(xlsx_stream); xlsx_stream.seek(0); zf.writestr(f"{batch.reference}.xlsx", xlsx_stream.getvalue())
            pdf_stream = io.BytesIO(); pdf = rl_canvas.Canvas(pdf_stream, pagesize=A4); _, height = A4; y = height - 42
            pdf.setFont("Helvetica-Bold", 15); pdf.drawString(36, y, "RealMindX Delivery Settlement")
            y -= 20; pdf.setFont("Helvetica", 9); pdf.drawString(36, y, f"{batch.reference} | {batch.company.name} | {batch.settlement_date} | {batch.status}")
            for row in rows:
                y -= 16
                if y < 40: pdf.showPage(); y = height - 42; pdf.setFont("Helvetica", 8)
                pdf.drawString(36, y, f"{row['order_reference']} | {row['rider_name'] or '-'} | {row['payment_method']} | Due RMX {row['amount_due_realmindx']:.2f} | Due Company {row['amount_due_company']:.2f} | Net {row['net_balance']:.2f}")
            pdf.save(); pdf_stream.seek(0); zf.writestr(f"{batch.reference}.pdf", pdf_stream.getvalue())
        zip_stream.seek(0)
        return send_file(zip_stream, mimetype="application/zip", as_attachment=True, download_name=f"{batch.reference}.zip")
    return jsonify(error="Use csv, xlsx, pdf, or zip."), 400


@delivery_bp.get("/rider/me")
@login_required
def rider_me():
    try:
        rider = _rider_profile(require_terms=False)
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
        _require_password_changed()
        delivery = _rider_delivery_or_404(delivery_id, rider)
        mark_picked_up(delivery, actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, rider_safe=True))


@delivery_bp.post("/rider/deliveries/<int:delivery_id>/resend-otp")
@login_required
def rider_resend_otp(delivery_id):
    try:
        rider = _rider_profile()
        _require_password_changed()
        delivery = _rider_delivery_or_404(delivery_id, rider)
        otp = resend_delivery_otp(delivery, actor_from_user(current_user))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    audit("delivery_rider_resend_otp", "order_delivery", delivery.id, {"otp_id": otp.id})
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, rider_safe=True), message="A fresh OTP was sent to the customer.")


@delivery_bp.post("/rider/deliveries/<int:delivery_id>/deliver")
@login_required
def rider_deliver(delivery_id):
    payload = request.get_json(silent=True) or {}
    try:
        rider = _rider_profile()
        _require_password_changed()
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
        _require_password_changed()
        delivery = _rider_delivery_or_404(delivery_id, rider)
        report_delivery_issue(delivery, actor_from_user(current_user), payload.get("reason"), note=payload.get("note"))
    except DeliveryError as exc:
        return _delivery_error_response(exc)
    db.session.commit()
    return jsonify(delivery=delivery_json(delivery, rider_safe=True))
