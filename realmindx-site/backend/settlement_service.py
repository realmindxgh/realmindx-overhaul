from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import secrets

from .extensions import db
from .models import DeliverySettlementBatch, DeliverySettlementEvent, DeliverySettlementLine


MONEY = Decimal("0.01")
SETTLEMENT_STATUSES = {"unsettled", "pending_review", "settled", "disputed", "cancelled", "withheld"}


class SettlementError(Exception):
    def __init__(self, message, status_code=400, code="settlement_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def money(value):
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


def payment_kind(value):
    raw = str(value or "unknown").strip().lower()
    if raw == "online": return "online"
    if raw in {"cash_on_delivery", "pay_on_delivery"}: return "pay_on_delivery"
    if raw == "manual": return "manual"
    return "unknown"


def log_settlement_event(batch, event_type, actor=("system", None), line=None, details=None):
    event = DeliverySettlementEvent(
        batch=batch, line_id=getattr(line, "id", None), event_type=event_type,
        actor_type=actor[0], actor_id=actor[1], details=details or {},
    )
    db.session.add(event)
    return event


def _batch_reference(company_id, settlement_date):
    return f"RMX-SET-{settlement_date:%Y%m%d}-{company_id}-{secrets.token_hex(2).upper()}"


def get_or_create_batch(company, settlement_date, actor=("system", None)):
    batch = DeliverySettlementBatch.query.filter_by(company_id=company.id, settlement_date=settlement_date).first()
    if batch: return batch
    batch = DeliverySettlementBatch(
        reference=_batch_reference(company.id, settlement_date), company=company,
        settlement_date=settlement_date, status="unsettled", prepared_by_id=actor[1] if actor[0] in {"admin", "staff"} else None,
    )
    db.session.add(batch); db.session.flush()
    log_settlement_event(batch, "daily_settlement_generated", actor)
    return batch


def create_settlement_line(delivery, actor=("system", None)):
    if delivery.status != "delivered" or not delivery.delivered_at:
        raise SettlementError("Only completed deliveries can be settled.", 409, "delivery_not_complete")
    existing = DeliverySettlementLine.query.filter_by(delivery_id=delivery.id).first()
    if existing: return existing, False
    order, company = delivery.order, delivery.company
    if not order or not company:
        raise SettlementError("Delivery order and company are required.", 409, "settlement_data_missing")

    subtotal = money(order.subtotal_amount or sum(money(item.unit_price) * int(item.quantity or 0) for item in order.items))
    customer_fee = money(order.delivery_fee)
    payable = money(delivery.company_payable_amount if delivery.company_payable_amount is not None else (
        company.default_delivery_payable if company.default_delivery_payable is not None else customer_fee
    ))
    total = money(order.total_amount if order.total_amount is not None else subtotal + customer_fee)
    promotion_amount = money(delivery.promotion_amount)
    promotion_payer = delivery.promotion_payer or ("realmindx" if payable > customer_fee else "none")
    kind = payment_kind(order.payment_method)
    online = kind in {"online", "manual"} and order.payment_status == "paid"
    collected_realmindx = total if online else money(0)
    collected_company = total if kind == "pay_on_delivery" else money(0)
    due_company = payable if online else money(0)
    due_realmindx = max(money(0), total - customer_fee) if kind == "pay_on_delivery" else money(0)
    net = money(due_realmindx - due_company)
    delivered_at = delivery.delivered_at
    settlement_date = delivered_at.date()
    batch = get_or_create_batch(company, settlement_date, actor)
    if batch.status == "settled":
        batch.status = "pending_review"
        log_settlement_event(
            batch, "late_settlement_line_added", actor,
            details={"order_reference": order.order_reference, "previous_payment_reference": batch.payment_reference},
        )
    line = DeliverySettlementLine(
        batch=batch, order=order, delivery=delivery, company=company, rider=delivery.rider,
        settlement_date=settlement_date, status="unsettled", order_reference=order.order_reference,
        company_name=company.name, rider_name=delivery.rider.name if delivery.rider else None,
        customer_name=order.customer_name, delivery_location=order.location or order.delivery_zone_name,
        payment_method=kind, book_subtotal=subtotal, customer_delivery_fee=customer_fee,
        company_payable=payable, promotion_amount=promotion_amount, promotion_payer=promotion_payer,
        amount_collected_realmindx=collected_realmindx, amount_collected_company=collected_company,
        amount_due_realmindx=due_realmindx, amount_due_company=due_company, net_balance=net,
        delivered_at=delivered_at,
    )
    db.session.add(line); db.session.flush()
    log_settlement_event(batch, "settlement_line_created", actor, line, {"order_reference": order.order_reference, "net_balance": str(net)})
    return line, True


def batch_totals(batch):
    lines = list(batch.lines or [])
    def total(field): return money(sum((money(getattr(line, field)) for line in lines), Decimal("0")))
    online = sum(1 for line in lines if line.payment_method in {"online", "manual"})
    pod = sum(1 for line in lines if line.payment_method == "pay_on_delivery")
    adjustment = money(batch.adjustment_amount)
    net = money(total("net_balance") + adjustment)
    return {
        "delivery_count": len(lines), "online_count": online, "pay_on_delivery_count": pod,
        "book_subtotal": total("book_subtotal"), "customer_delivery_fees": total("customer_delivery_fee"),
        "company_payable": total("company_payable"), "collected_realmindx": total("amount_collected_realmindx"),
        "collected_company": total("amount_collected_company"), "due_realmindx": total("amount_due_realmindx"),
        "due_company": total("amount_due_company"), "adjustment_amount": adjustment, "net_balance": net,
    }


def line_json(line):
    return {key: (float(value) if isinstance(value, Decimal) else value) for key, value in {
        "id": line.id, "batch_id": line.batch_id, "order_id": line.order_id, "delivery_id": line.delivery_id,
        "company_id": line.company_id, "rider_id": line.rider_id, "settlement_date": line.settlement_date.isoformat(),
        "status": line.status, "order_reference": line.order_reference, "company_name": line.company_name,
        "rider_name": line.rider_name, "customer_name": line.customer_name, "delivery_location": line.delivery_location,
        "payment_method": line.payment_method, "book_subtotal": line.book_subtotal,
        "customer_delivery_fee": line.customer_delivery_fee, "company_payable": line.company_payable,
        "promotion_amount": line.promotion_amount, "promotion_payer": line.promotion_payer,
        "amount_collected_realmindx": line.amount_collected_realmindx,
        "amount_collected_company": line.amount_collected_company, "amount_due_realmindx": line.amount_due_realmindx,
        "amount_due_company": line.amount_due_company, "net_balance": line.net_balance,
        "adjustment_amount": line.adjustment_amount, "adjustment_reason": line.adjustment_reason,
        "delivered_at": line.delivered_at.isoformat(), "created_at": line.created_at.isoformat() if line.created_at else None,
    }.items()}


def batch_json(batch, include_lines=False, include_events=False):
    totals = batch_totals(batch)
    payload = {
        "id": batch.id, "reference": batch.reference, "company_id": batch.company_id,
        "company_name": batch.company.name if batch.company else None, "settlement_date": batch.settlement_date.isoformat(),
        "status": batch.status, "payment_reference": batch.payment_reference,
        "payment_date": batch.payment_date.isoformat() if batch.payment_date else None,
        "payment_proof_url": batch.payment_proof_url, "adjustment_reason": batch.adjustment_reason,
        "dispute_status": batch.dispute_status, "dispute_notes": batch.dispute_notes,
        "resolution_notes": batch.resolution_notes, "settled_at": batch.settled_at.isoformat() if batch.settled_at else None,
        "balance_direction": "company_owes_realmindx" if totals["net_balance"] > 0 else "realmindx_owes_company" if totals["net_balance"] < 0 else "balanced",
        **{key: float(value) if isinstance(value, Decimal) else value for key, value in totals.items()},
    }
    if include_lines: payload["lines"] = [line_json(line) for line in sorted(batch.lines, key=lambda row: row.delivered_at)]
    if include_events: payload["events"] = [{"event_type": e.event_type, "actor_type": e.actor_type, "actor_id": e.actor_id, "details": e.details or {}, "created_at": e.created_at.isoformat()} for e in batch.events]
    return payload


def apply_adjustment(batch, amount, reason, actor):
    if batch.status == "settled": raise SettlementError("A settled batch cannot be adjusted.", 409, "already_settled")
    if not str(reason or "").strip(): raise SettlementError("Adjustment reason is required.")
    batch.adjustment_amount = money(amount); batch.adjustment_reason = str(reason).strip()
    log_settlement_event(batch, "settlement_adjusted", actor, details={"amount": str(batch.adjustment_amount), "reason": batch.adjustment_reason})
    return batch


def mark_settled(batch, payment_reference, payment_date, actor, proof_url=None):
    if batch.status == "settled": raise SettlementError("This settlement is already marked paid.", 409, "already_settled")
    if not str(payment_reference or "").strip(): raise SettlementError("Payment reference is required.")
    batch.status = "settled"; batch.payment_reference = str(payment_reference).strip()
    batch.payment_date = payment_date if isinstance(payment_date, date) else date.fromisoformat(str(payment_date))
    batch.payment_proof_url = str(proof_url or "").strip() or None
    batch.settled_at = datetime.now(timezone.utc); batch.settled_by_id = actor[1]
    for line in batch.lines: line.status = "settled"
    log_settlement_event(batch, "settlement_marked_paid", actor, details={"payment_reference": batch.payment_reference})
    if batch.payment_proof_url:
        log_settlement_event(batch, "payment_proof_linked", actor, details={"url": batch.payment_proof_url})
    return batch


def raise_dispute(batch, note, actor):
    if not str(note or "").strip(): raise SettlementError("Dispute details are required.")
    batch.status = "disputed"; batch.dispute_status = "open"; batch.dispute_notes = str(note).strip()
    log_settlement_event(batch, "settlement_disputed", actor, details={"note": batch.dispute_notes})
    return batch


def resolve_dispute(batch, note, actor):
    if batch.dispute_status != "open": raise SettlementError("This settlement has no open dispute.", 409, "no_open_dispute")
    if not str(note or "").strip(): raise SettlementError("Resolution notes are required.")
    batch.dispute_status = "resolved"; batch.resolution_notes = str(note).strip(); batch.status = "pending_review"
    log_settlement_event(batch, "settlement_dispute_resolved", actor, details={"note": batch.resolution_notes})
    return batch
