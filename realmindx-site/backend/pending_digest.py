from datetime import datetime, timedelta, timezone
from html import escape

from flask import current_app

from .email_service import app_email_shell, send_admin_alert


def _stale_cutoff(hours=48):
    return datetime.now(timezone.utc) - timedelta(hours=hours)


def collect_stale_items():
    from .extensions import db
    from .models import BookRequest, Order, User, UserProfile

    cutoff_48 = _stale_cutoff(48)
    cutoff_7d = _stale_cutoff(24 * 7)

    stale_teachers = (
        db.session.query(User, UserProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .filter(UserProfile.profile_status.in_(["submitted", "under_review"]))
        .filter(UserProfile.submitted_at.isnot(None))
        .filter(UserProfile.submitted_at < cutoff_48)
        .order_by(UserProfile.submitted_at.asc())
        .limit(50)
        .all()
    )

    # Also catch revision_required lingering >7 days
    stale_revisions = (
        db.session.query(User, UserProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .filter(UserProfile.profile_status == "revision_required")
        .filter(UserProfile.updated_at < cutoff_7d)
        .order_by(UserProfile.updated_at.asc())
        .limit(50)
        .all()
    )

    stale_book_requests = (
        BookRequest.query.filter(BookRequest.status == "pending")
        .filter(BookRequest.created_at < cutoff_48)
        .order_by(BookRequest.created_at.asc())
        .limit(50)
        .all()
    )

    stale_orders = (
        Order.query.filter(Order.status.in_(["new", "confirmed", "shipped"]))
        .filter(Order.created_at < cutoff_48)
        .order_by(Order.created_at.asc())
        .limit(50)
        .all()
    )

    return {
        "teachers": stale_teachers,
        "revisions": stale_revisions,
        "book_requests": stale_book_requests,
        "orders": stale_orders,
    }


def send_stale_pending_digest(dry_run=False):
    items = collect_stale_items()
    total = sum(len(v) for v in items.values())
    if total == 0:
        current_app.logger.info("Stale pending digest: nothing to report.")
        return {"sent": False, "reason": "no stale items", "counts": {k: len(v) for k, v in items.items()}}

    base_url = current_app.config["BASE_URL"].rstrip("/")

    sections: list[str] = []

    if items["teachers"]:
        rows = "".join(
            f"<tr><td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(u.application_id or str(u.id))}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(u.full_name or u.email)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(p.profile_status)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{p.submitted_at.strftime('%Y-%m-%d %H:%M UTC') if p.submitted_at else 'N/A'}</td></tr>"
            for u, p in items["teachers"]
        )
        sections.append(
            f"<h3 style='margin:18px 0 8px;color:#143670;'>Teacher applications awaiting review ({len(items['teachers'])})</h3>"
            f"<table style='width:100%;border-collapse:collapse;font-size:13px;'>"
            f"<tr style='background:#f5f8fc;text-align:left;'><th style='padding:8px 10px;'>App ID</th><th style='padding:8px 10px;'>Teacher</th><th style='padding:8px 10px;'>Status</th><th style='padding:8px 10px;'>Submitted</th></tr>"
            f"{rows}</table>"
        )

    if items["revisions"]:
        rows = "".join(
            f"<tr><td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(u.application_id or str(u.id))}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(u.full_name or u.email)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{p.updated_at.strftime('%Y-%m-%d %H:%M UTC') if p.updated_at else 'N/A'}</td></tr>"
            for u, p in items["revisions"]
        )
        sections.append(
            f"<h3 style='margin:18px 0 8px;color:#143670;'>Revisions not resubmitted &gt;7 days ({len(items['revisions'])})</h3>"
            f"<table style='width:100%;border-collapse:collapse;font-size:13px;'>"
            f"<tr style='background:#f5f8fc;text-align:left;'><th style='padding:8px 10px;'>App ID</th><th style='padding:8px 10px;'>Teacher</th><th style='padding:8px 10px;'>Last update</th></tr>"
            f"{rows}</table>"
        )

    if items["book_requests"]:
        rows = "".join(
            f"<tr><td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(r.reference)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(r.requested_title[:40])}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(r.customer_name)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{r.created_at.strftime('%Y-%m-%d %H:%M UTC') if r.created_at else 'N/A'}</td></tr>"
            for r in items["book_requests"]
        )
        sections.append(
            f"<h3 style='margin:18px 0 8px;color:#143670;'>Book requests pending &gt;48h ({len(items['book_requests'])})</h3>"
            f"<table style='width:100%;border-collapse:collapse;font-size:13px;'>"
            f"<tr style='background:#f5f8fc;text-align:left;'><th style='padding:8px 10px;'>Ref</th><th style='padding:8px 10px;'>Title</th><th style='padding:8px 10px;'>Customer</th><th style='padding:8px 10px;'>Created</th></tr>"
            f"{rows}</table>"
        )

    if items["orders"]:
        rows = "".join(
            f"<tr><td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(o.order_reference)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(o.customer_name)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{escape(o.status)}/{escape(o.payment_status)}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>GH&#8373;{float(o.total_amount or 0):,.2f}</td>"
            f"<td style='padding:8px 10px;border-bottom:1px solid #e5e7eb;'>{o.created_at.strftime('%Y-%m-%d %H:%M UTC') if o.created_at else 'N/A'}</td></tr>"
            for o in items["orders"]
        )
        sections.append(
            f"<h3 style='margin:18px 0 8px;color:#143670;'>Bookshop orders still open &gt;48h ({len(items['orders'])})</h3>"
            f"<table style='width:100%;border-collapse:collapse;font-size:13px;'>"
            f"<tr style='background:#f5f8fc;text-align:left;'><th style='padding:8px 10px;'>Ref</th><th style='padding:8px 10px;'>Customer</th><th style='padding:8px 10px;'>Status</th><th style='padding:8px 10px;'>Total</th><th style='padding:8px 10px;'>Created</th></tr>"
            f"{rows}</table>"
        )

    html = (
        "<p>The following items have been pending longer than expected and may need attention.</p>"
        + "".join(sections)
        + f"<p style='margin-top:18px;'><a href='{base_url}/admin/dashboard' style='color:#143670;'>Open Admin Dashboard</a></p>"
    )

    if dry_run:
        return {"sent": False, "dry_run": True, "counts": {k: len(v) for k, v in items.items()}, "total": total}

    send_admin_alert(
        subject=f"RealMindX stale pending digest: {total} item(s) need attention",
        html=app_email_shell(
            "Stale items need attention",
            html,
            cta_label="Open Admin Dashboard",
            cta_url=f"{base_url}/admin/dashboard",
            eyebrow="RealMindX Internal: Daily Digest",
            preheader=f"{total} stale items need attention.",
        ),
        text=f"Stale pending digest: {total} items. Open {base_url}/admin/dashboard",
        template_name="stale_pending_digest",
    )
    current_app.logger.info("Stale pending digest sent: %s items.", total)
    return {"sent": True, "counts": {k: len(v) for k, v in items.items()}, "total": total}
