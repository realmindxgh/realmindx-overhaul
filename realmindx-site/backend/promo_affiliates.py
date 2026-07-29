from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from html import escape

from flask import current_app

from .email_service import OutboundEmail, bookshop_email_shell, send_email
from .extensions import db
from .models import PromoCode, PromoCodeUsage
from .order_status import normalize_order_status

MONEY_QUANT = Decimal("0.01")


def money(value):
    return Decimal(str(value or 0)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _money_label(value):
    return f"GH&#8373;{float(money(value)):,.2f}"


def _commission_percent(promo):
    percent = money(getattr(promo, "affiliate_commission_percent", 0))
    if percent < 0:
        return Decimal("0.00")
    if percent > 100:
        return Decimal("100.00")
    return percent


def commission_merchandise_amount(order):
    subtotal = money(order.subtotal_amount)
    if subtotal <= 0:
        subtotal = sum((money(item.unit_price) * int(item.quantity or 1)) for item in order.items)
        subtotal = money(subtotal)

    goods_amount = max(subtotal - money(order.bulk_discount_amount), Decimal("0.00"))
    promo_discount = money(order.promo_discount_amount)
    applies_to = (order.promo_applies_to or "").strip().lower()
    if promo_discount <= 0:
        return goods_amount
    if applies_to == "products":
        return max(goods_amount - promo_discount, Decimal("0.00"))
    if applies_to == "all":
        delivery_fee = money(order.delivery_fee)
        base = goods_amount + delivery_fee
        if base <= 0:
            return goods_amount
        goods_discount = (promo_discount * goods_amount / base).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
        return max(goods_amount - goods_discount, Decimal("0.00"))
    return goods_amount


@dataclass
class PromoUsageSnapshot:
    usage_id: int
    code: str
    affiliate_name: str
    affiliate_email: str
    order_reference: str
    customer_name: str
    merchandise_amount: Decimal
    commission_percent: Decimal
    commission_amount: Decimal
    completed_at: datetime


def record_completed_order_promo_usage(order):
    if normalize_order_status(order.status) != "complete":
        return None, False
    code = (order.promo_code or "").strip().upper()
    if not code:
        return None, False

    promo = PromoCode.query.filter_by(code=code).first()
    if not promo:
        return None, False
    commission_percent = _commission_percent(promo)
    if commission_percent <= 0:
        return None, False

    existing = PromoCodeUsage.query.filter_by(order_id=order.id, promo_code_id=promo.id).first()
    if existing:
        return existing, False

    merchandise_amount = commission_merchandise_amount(order)
    commission_amount = (merchandise_amount * commission_percent / Decimal("100")).quantize(
        MONEY_QUANT,
        rounding=ROUND_HALF_UP,
    )
    usage = PromoCodeUsage(
        promo_code_id=promo.id,
        order_id=order.id,
        code=promo.code,
        affiliate_name=(promo.affiliate_name or "").strip() or None,
        affiliate_email=(promo.affiliate_email or "").strip().lower() or None,
        commission_percent=commission_percent,
        merchandise_amount=merchandise_amount,
        commission_amount=commission_amount,
        status="earned",
        completed_at=datetime.now(timezone.utc),
    )
    db.session.add(usage)
    db.session.flush()
    return usage, True


def usage_snapshot(usage):
    order = usage.order
    return PromoUsageSnapshot(
        usage_id=usage.id,
        code=usage.code,
        affiliate_name=usage.affiliate_name or "there",
        affiliate_email=usage.affiliate_email or "",
        order_reference=order.order_reference if order else "",
        customer_name=order.customer_name if order else "",
        merchandise_amount=money(usage.merchandise_amount),
        commission_percent=money(usage.commission_percent),
        commission_amount=money(usage.commission_amount),
        completed_at=usage.completed_at or datetime.now(timezone.utc),
    )


def send_promo_usage_notification(snapshot):
    if not snapshot.affiliate_email:
        return "unavailable"
    body = f"""
    <p>Hello {escape(snapshot.affiliate_name)},</p>
    <p>Your promo code <strong>{escape(snapshot.code)}</strong> was used on an order that has now been marked complete.</p>
    <div style="background:#f5f8fc;border:1px solid #dce5f0;border-radius:12px;padding:16px 20px;margin:18px 0;">
      <p style="margin:0 0 6px;"><strong>Order:</strong> {escape(snapshot.order_reference)}</p>
      <p style="margin:0 0 6px;"><strong>Merchandise value:</strong> {_money_label(snapshot.merchandise_amount)}</p>
      <p style="margin:0 0 6px;"><strong>Commission rate:</strong> {float(snapshot.commission_percent):.2f}%</p>
      <p style="margin:0;font-weight:800;"><strong>Commission earned:</strong> {_money_label(snapshot.commission_amount)}</p>
    </div>
    <p>Delivery fees are not included in commission calculations.</p>
    """
    result = send_email(
        OutboundEmail(
            to=snapshot.affiliate_email,
            from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
            subject=f"Promo code sale completed: {snapshot.code}",
            html=bookshop_email_shell(
                "Promo code sale completed",
                body,
                preheader=f"{snapshot.code} earned {_money_label(snapshot.commission_amount).replace('&#8373;', '')}",
            ),
        ),
        purpose="transactional",
        recipient_user_id=None,
        template_name="promo_usage_completed",
    )
    if result.status in ("queued", "accepted", "sent", "delivered"):
        usage = db.session.get(PromoCodeUsage, snapshot.usage_id)
        if usage and not usage.notified_at:
            usage.notified_at = datetime.now(timezone.utc)
    db.session.commit()
    return result.status


def send_monthly_promo_statements(year, month):
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    rows = (
        PromoCodeUsage.query
        .filter(
            PromoCodeUsage.status == "earned",
            PromoCodeUsage.affiliate_email.isnot(None),
            PromoCodeUsage.completed_at >= start,
            PromoCodeUsage.completed_at < end,
            PromoCodeUsage.statement_sent_at.is_(None),
        )
        .order_by(PromoCodeUsage.affiliate_email.asc(), PromoCodeUsage.completed_at.asc())
        .all()
    )
    grouped = defaultdict(list)
    for row in rows:
        grouped[row.affiliate_email].append(row)

    sent = 0
    mocked = 0
    failed = 0
    sent_usage_count = 0
    now = datetime.now(timezone.utc)
    for email, usages in grouped.items():
        name = usages[0].affiliate_name or "there"
        total_merchandise = sum((money(row.merchandise_amount) for row in usages), Decimal("0.00"))
        total_commission = sum((money(row.commission_amount) for row in usages), Decimal("0.00"))
        detail_rows = "".join(
            f"""
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #dce5f0;">{escape(row.code)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dce5f0;">{escape(row.order.order_reference if row.order else '')}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dce5f0;text-align:right;">{_money_label(row.merchandise_amount)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dce5f0;text-align:right;">{float(money(row.commission_percent)):.2f}%</td>
              <td style="padding:10px 12px;border-bottom:1px solid #dce5f0;text-align:right;font-weight:800;">{_money_label(row.commission_amount)}</td>
            </tr>
            """
            for row in usages
        )
        body = f"""
        <p>Hello {escape(name)},</p>
        <p>Here is your RealMindX Bookshop promo code commission statement for {start.strftime('%B %Y')}.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;border:1px solid #dce5f0;border-radius:12px;overflow:hidden;">
          <tr style="background:#143670;color:#fff;">
            <th style="padding:10px 12px;text-align:left;">Code</th>
            <th style="padding:10px 12px;text-align:left;">Order</th>
            <th style="padding:10px 12px;text-align:right;">Merchandise</th>
            <th style="padding:10px 12px;text-align:right;">Rate</th>
            <th style="padding:10px 12px;text-align:right;">Commission</th>
          </tr>
          {detail_rows}
          <tr style="background:#fff7d1;">
            <td colspan="2" style="padding:12px;font-weight:900;color:#143670;">Total</td>
            <td style="padding:12px;text-align:right;font-weight:900;color:#143670;">{_money_label(total_merchandise)}</td>
            <td style="padding:12px;"></td>
            <td style="padding:12px;text-align:right;font-weight:900;color:#143670;">{_money_label(total_commission)}</td>
          </tr>
        </table>
        <p style="margin-top:18px;">Delivery fees are excluded from this statement.</p>
        """
        result = send_email(
            OutboundEmail(
                to=email,
                from_email=current_app.config["BOOKSHOP_FROM_EMAIL"],
                subject=f"RealMindX Bookshop promo statement - {start.strftime('%B %Y')}",
                html=bookshop_email_shell(
                    "Monthly promo statement",
                    body,
                    preheader=f"{len(usages)} completed promo sale{'s' if len(usages) != 1 else ''}",
                ),
            ),
            purpose="transactional",
            recipient_user_id=None,
            template_name="monthly_promo_statement",
        )
        if result.status == "mocked":
            mocked += 1
        elif result.status in ("queued", "accepted", "sent", "delivered"):
            for row in usages:
                row.statement_sent_at = now
            sent += 1
            sent_usage_count += len(usages)
        else:
            failed += 1
    if grouped:
        db.session.commit()
    return {
        "affiliate_count": sent,
        "usage_count": sent_usage_count,
        "mocked": mocked,
        "failed": failed,
    }
