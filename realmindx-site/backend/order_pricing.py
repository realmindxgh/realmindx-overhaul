from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from .models import PromoCode

MONEY_QUANT = Decimal("0.01")


def money(value):
    return Decimal(str(value or 0)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _discount_amount(base_amount, discount_type, discount_value):
    base = money(base_amount)
    if base <= 0:
        return Decimal("0.00")

    discount_type = (discount_type or "percentage").strip().lower()
    if discount_type == "fixed":
        amount = money(discount_value)
    else:
        amount = (base * money(discount_value) / Decimal("100")).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    return min(amount, base)


def validate_promo_code_record(code, order_total):
    code = (code or "").strip().upper()
    if not code:
        return None, "No code provided.", 400

    row = PromoCode.query.filter_by(code=code, is_active=True).first()
    if not row:
        return None, "This code is not valid or has expired.", 404

    today = date.today()
    if row.valid_from and today < row.valid_from:
        return None, "This code is not yet active.", 400
    if row.valid_until and today > row.valid_until:
        return None, "This code has expired.", 400
    if row.max_uses and row.uses_count >= row.max_uses:
        return None, "This code has reached its usage limit.", 400
    if money(order_total) < money(row.min_order_amount):
        return None, f"Minimum order of GH {float(row.min_order_amount or 0):.2f} required for this code.", 400
    return row, None, 200


def calculate_order_pricing(items, delivery_fee=0, promo=None):
    subtotal_amount = Decimal("0.00")
    bulk_discount_amount = Decimal("0.00")

    for item in items:
        unit_price = money(item.get("unit_price"))
        quantity = max(int(item.get("quantity") or 1), 1)
        line_subtotal = unit_price * quantity
        subtotal_amount += line_subtotal

        bulk_discount_percent = money(item.get("bulk_discount_percent") or 0)
        bulk_min_qty = int(item.get("bulk_min_qty") or 10)
        if quantity >= bulk_min_qty and bulk_discount_percent > 0:
            line_discount = (line_subtotal * bulk_discount_percent / Decimal("100")).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
            bulk_discount_amount += min(line_discount, line_subtotal)

    subtotal_amount = money(subtotal_amount)
    bulk_discount_amount = money(bulk_discount_amount)
    goods_total_amount = max(subtotal_amount - bulk_discount_amount, Decimal("0.00"))
    delivery_fee_amount = money(delivery_fee)

    promo_code = None
    promo_applies_to = None
    promo_discount_amount = Decimal("0.00")
    promo_base_amount = Decimal("0.00")

    if promo:
        promo_code = (getattr(promo, "code", None) or "").strip().upper() or None
        promo_applies_to = (getattr(promo, "applies_to", None) or "products").strip().lower()
        if promo_applies_to not in {"products", "delivery", "all"}:
            promo_applies_to = "products"

        if promo_applies_to == "delivery":
            promo_base_amount = delivery_fee_amount
        elif promo_applies_to == "all":
            promo_base_amount = goods_total_amount + delivery_fee_amount
        else:
            promo_base_amount = goods_total_amount

        promo_discount_amount = _discount_amount(promo_base_amount, getattr(promo, "discount_type", "percentage"), getattr(promo, "discount_value", 0))

    total_amount = max(goods_total_amount + delivery_fee_amount - promo_discount_amount, Decimal("0.00"))
    return {
        "subtotal_amount": subtotal_amount,
        "bulk_discount_amount": bulk_discount_amount,
        "goods_total_amount": goods_total_amount,
        "delivery_fee_amount": delivery_fee_amount,
        "promo_code": promo_code,
        "promo_applies_to": promo_applies_to,
        "promo_discount_amount": money(promo_discount_amount),
        "promo_base_amount": money(promo_base_amount),
        "total_amount": money(total_amount),
    }
