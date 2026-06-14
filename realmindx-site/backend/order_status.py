ORDER_STATUS_ALIASES = {
    "received": "confirmed",
    "processing": "confirmed",
    "packed": "shipped",
    "ready": "shipped",
    "out_for_delivery": "shipped",
    "dispatched": "shipped",
    "delivered": "complete",
    "completed": "complete",
}

CANONICAL_ORDER_STATUSES = {
    "new",
    "confirmed",
    "shipped",
    "complete",
    "cancelled",
    "archived",
}


def normalize_order_status(status, default="new"):
    value = str(status or "").strip().lower()
    if not value:
        return default
    return ORDER_STATUS_ALIASES.get(value, value if value in CANONICAL_ORDER_STATUSES else default)
