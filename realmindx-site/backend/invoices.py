from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4
from xml.sax.saxutils import escape as xml_escape

from flask import current_app

from .models import CartInvoice, Order
from .order_status import normalize_order_status

MONEY_QUANT = Decimal("0.01")
BULK_DISCOUNT_NOTICE = "Buy 10+ copies of the same textbook, workbook or writing book and enjoy 10% off."


def money(value):
    return Decimal(str(value or 0)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def money_label(value):
    return f"GHS {money(value):,.2f}"


def new_invoice_id():
    return f"RMX-INV-{uuid4().hex[:24].upper()}"


def assign_invoice_id(order):
    if order.invoice_id:
        return order.invoice_id
    for _ in range(12):
        candidate = new_invoice_id()
        if not invoice_id_exists(candidate):
            order.invoice_id = candidate
            return candidate
    raise RuntimeError("Could not generate a unique invoice ID.")


def invoice_id_exists(invoice_id):
    return (
        Order.query.filter_by(invoice_id=invoice_id).first()
        or CartInvoice.query.filter_by(invoice_id=invoice_id).first()
    )


def assign_cart_invoice_id(cart_invoice):
    if cart_invoice.invoice_id:
        return cart_invoice.invoice_id
    for _ in range(12):
        candidate = new_invoice_id()
        if not invoice_id_exists(candidate):
            cart_invoice.invoice_id = candidate
            return candidate
    raise RuntimeError("Could not generate a unique invoice ID.")


def _iso(value):
    return value.isoformat() if value else None


def _line_total(item):
    return money(item.unit_price) * int(item.quantity or 1)


def invoice_json(order, document_type="invoice"):
    is_receipt = document_type == "receipt"
    document_id = order.order_reference if is_receipt else order.invoice_id
    pdf_url = f"/api/invoices/{quote(document_id or '')}/pdf"
    if is_receipt:
        pdf_url = f"{pdf_url}?document=receipt"

    subtotal = money(order.subtotal_amount)
    bulk_discount = money(getattr(order, "bulk_discount_amount", 0))
    promo_discount = money(getattr(order, "promo_discount_amount", 0))
    delivery_fee = money(order.delivery_fee)
    total = money(order.total_amount)
    issued_at = order.updated_at if is_receipt else order.created_at
    return {
        "invoice_id": order.invoice_id,
        "document_id": document_id,
        "document_type": document_type,
        "invoice_type": "order",
        "order_reference": order.order_reference,
        "created_at": _iso(order.created_at),
        "updated_at": _iso(order.updated_at),
        "issued_at": _iso(issued_at),
        "status": normalize_order_status(order.status),
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "customer_name": order.customer_name,
        "email": order.email,
        "phone": order.phone,
        "delivery_method": order.delivery_method,
        "delivery_zone_name": order.delivery_zone_name,
        "location": order.location,
        "subtotal_amount": float(subtotal),
        "bulk_discount_amount": float(bulk_discount),
        "promo_code": order.promo_code,
        "promo_applies_to": order.promo_applies_to,
        "promo_discount_amount": float(promo_discount),
        "delivery_fee": float(delivery_fee),
        "total_amount": float(total),
        "pdf_url": pdf_url if document_id else None,
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit_price": float(money(item.unit_price)),
                "quantity": item.quantity,
                "line_total": float(_line_total(item)),
            }
            for item in order.items
        ],
    }


def cart_invoice_json(cart_invoice):
    subtotal = money(cart_invoice.subtotal_amount)
    bulk_discount = money(cart_invoice.bulk_discount_amount)
    promo_discount = money(cart_invoice.promo_discount_amount)
    delivery_fee = money(cart_invoice.delivery_fee)
    total = money(cart_invoice.total_amount)
    return {
        "invoice_id": cart_invoice.invoice_id,
        "document_id": cart_invoice.invoice_id,
        "document_type": "invoice",
        "invoice_type": "cart",
        "order_reference": None,
        "created_at": _iso(cart_invoice.created_at),
        "updated_at": _iso(getattr(cart_invoice, "updated_at", None)),
        "issued_at": _iso(cart_invoice.created_at),
        "status": cart_invoice.status or "generated",
        "payment_status": "not_applicable",
        "payment_method": "not_applicable",
        "customer_name": "Cart invoice",
        "email": "",
        "phone": "",
        "delivery_method": "not selected",
        "delivery_zone_name": "",
        "location": "",
        "subtotal_amount": float(subtotal),
        "bulk_discount_amount": float(bulk_discount),
        "promo_code": cart_invoice.promo_code,
        "promo_applies_to": cart_invoice.promo_applies_to,
        "promo_discount_amount": float(promo_discount),
        "delivery_fee": float(delivery_fee),
        "total_amount": float(total),
        "pdf_url": f"/api/invoices/{quote(cart_invoice.invoice_id or '')}/pdf",
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit_price": float(money(item.unit_price)),
                "quantity": item.quantity,
                "line_total": float(_line_total(item)),
            }
            for item in cart_invoice.items
        ],
    }


def _logo_path():
    root = Path(current_app.root_path)
    candidates = [
        root.parents[1] / "public" / "bookshop-logo.png",
        root.parent / "public" / "bookshop-logo.png",
    ]
    return next((path for path in candidates if path.exists()), None)


def _font_dir():
    return Path(__file__).resolve().parent / "assets" / "fonts"


def _register_pdf_fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    registered = set(pdfmetrics.getRegisteredFontNames())
    if {"RMXHeading", "RMXHeadingBold", "RMXBody", "RMXBodyBold"}.issubset(registered):
        return {
            "heading": "RMXHeading",
            "heading_bold": "RMXHeadingBold",
            "body": "RMXBody",
            "body_bold": "RMXBodyBold",
        }

    font_dir = _font_dir()
    fonts = {
        "RMXHeading": font_dir / "Montserrat-Regular.ttf",
        "RMXHeadingBold": font_dir / "Montserrat-Bold.ttf",
        "RMXBody": font_dir / "Arimo-Regular.ttf",
        "RMXBodyBold": font_dir / "Arimo-Bold.ttf",
    }
    try:
        for name, path in fonts.items():
            pdfmetrics.registerFont(TTFont(name, str(path)))
        pdfmetrics.registerFontFamily(
            "RMXHeading",
            normal="RMXHeading",
            bold="RMXHeadingBold",
            italic="RMXHeading",
            boldItalic="RMXHeadingBold",
        )
        pdfmetrics.registerFontFamily(
            "RMXBody",
            normal="RMXBody",
            bold="RMXBodyBold",
            italic="RMXBody",
            boldItalic="RMXBodyBold",
        )
        return {
            "heading": "RMXHeading",
            "heading_bold": "RMXHeadingBold",
            "body": "RMXBody",
            "body_bold": "RMXBodyBold",
        }
    except Exception:
        current_app.logger.warning("PDF brand fonts could not be loaded.", exc_info=True)
        return {
            "heading": "Helvetica",
            "heading_bold": "Helvetica-Bold",
            "body": "Helvetica",
            "body_bold": "Helvetica-Bold",
        }


def _date_time_label(value):
    if not value:
        return ""
    return value.strftime("%d %b %Y, %H:%M")


def _invoice_verify_url(lookup_id):
    bookshop_url = (current_app.config.get("BOOKSHOP_URL") or "").rstrip("/")
    if not bookshop_url:
        base_url = (current_app.config.get("BASE_URL") or "http://127.0.0.1:5173").rstrip("/")
        bookshop_url = f"{base_url}/bookshop"
    return f"{bookshop_url}/invoice?invoice_id={quote(lookup_id or '')}"


def _safe_text(value):
    return xml_escape(str(value or ""))


def _safe_link(url):
    return xml_escape(url or "", {'"': "&quot;"})


def _payment_label(value):
    label = (value or "not provided").replace("_", " ").strip()
    return label.title() if label else "Not Provided"


def _status_label(value):
    return normalize_order_status(value).replace("_", " ").title()


def _delivery_label(record):
    if getattr(record, "delivery_method", "") == "pickup":
        return "Pickup at Dome Pillar 2"
    return getattr(record, "location", "") or getattr(record, "delivery_zone_name", "") or "Delivery details on file"


def _build_bookshop_pdf(payload):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    fonts = _register_pdf_fonts()
    stream = BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"{payload['title']} {payload['document_id']}",
        author="RealMindX Bookshop",
    )

    styles = getSampleStyleSheet()
    navy = colors.HexColor("#143670")
    gold = colors.HexColor("#ffcc01")
    gold_dark = colors.HexColor("#9b6a00")
    muted = colors.HexColor("#465a75")
    body = colors.HexColor("#071a33")
    border = colors.HexColor("#c9d6e8")
    light = colors.HexColor("#f6f9fe")
    verify_bg = colors.HexColor("#fff8d4")

    title_style = ParagraphStyle(
        "RMXDocumentTitle",
        parent=styles["Title"],
        textColor=navy,
        fontName=fonts["heading_bold"],
        fontSize=24,
        leading=28,
        alignment=TA_RIGHT,
        spaceAfter=5,
    )
    eyebrow_style = ParagraphStyle(
        "RMXEyebrow",
        parent=styles["Normal"],
        textColor=gold_dark,
        fontName=fonts["heading_bold"],
        fontSize=8.2,
        leading=10,
        uppercase=True,
        spaceAfter=4,
    )
    normal_style = ParagraphStyle(
        "RMXBody",
        parent=styles["Normal"],
        textColor=body,
        fontName=fonts["body"],
        fontSize=9.3,
        leading=12.6,
    )
    strong_style = ParagraphStyle(
        "RMXStrong",
        parent=normal_style,
        textColor=navy,
        fontName=fonts["body_bold"],
    )
    mono_style = ParagraphStyle(
        "RMXMono",
        parent=normal_style,
        textColor=navy,
        fontName="Courier-Bold",
        fontSize=8.8,
        leading=11.5,
    )
    header_meta_style = ParagraphStyle(
        "RMXHeaderMeta",
        parent=normal_style,
        textColor=body,
        alignment=TA_RIGHT,
    )
    header_mono_style = ParagraphStyle(
        "RMXHeaderMono",
        parent=mono_style,
        alignment=TA_RIGHT,
    )
    header_style = ParagraphStyle(
        "RMXTableHeader",
        parent=normal_style,
        textColor=colors.white,
        fontName=fonts["heading_bold"],
        fontSize=8,
        leading=10,
    )
    total_style = ParagraphStyle(
        "RMXTotal",
        parent=normal_style,
        textColor=navy,
        fontName=fonts["heading_bold"],
        fontSize=12,
        leading=14,
        alignment=TA_RIGHT,
    )
    amount_style = ParagraphStyle(
        "RMXAmount",
        parent=normal_style,
        textColor=navy,
        fontName=fonts["body_bold"],
        alignment=TA_RIGHT,
    )
    verify_style = ParagraphStyle(
        "RMXVerify",
        parent=normal_style,
        fontSize=8.5,
        leading=11.4,
        splitLongWords=True,
    )

    logo = _logo_path()
    logo_cell = Paragraph("<b>RealMindX Bookshop</b>", strong_style)
    if logo:
        logo_cell = Image(str(logo), width=70 * mm, height=25 * mm, kind="proportional")

    header_meta = [
        Paragraph(_safe_text(payload["title"].upper()), title_style),
        Paragraph(_safe_text(payload["document_id"]), header_mono_style),
    ]
    if payload.get("order_reference") and payload.get("order_reference") != payload.get("document_id"):
        header_meta.append(Paragraph(f"Order: {_safe_text(payload['order_reference'])}", header_meta_style))
    header_meta.append(Paragraph(f"{_safe_text(payload['issued_label'])}: {_safe_text(payload['issued_at'])}", header_meta_style))

    header = Table([[logo_cell, header_meta]], colWidths=[82 * mm, 77 * mm], hAlign="CENTER")
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
    ]))

    card_cells = []
    for card in payload["cards"]:
        label, lines = card
        card_cells.append([
            Paragraph(_safe_text(label), eyebrow_style),
            *[Paragraph(_safe_text(line), normal_style) for line in lines if line],
        ])
    card_count = max(len(card_cells), 1)
    card_width = 159 * mm / card_count
    card_table = Table([card_cells], colWidths=[card_width] * card_count, hAlign="CENTER")
    card_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 9),
    ]))

    rows = [[
        Paragraph("Item", header_style),
        Paragraph("Qty", header_style),
        Paragraph("Unit", header_style),
        Paragraph("Line Total", header_style),
    ]]
    for item in payload["items"]:
        rows.append([
            Paragraph(_safe_text(item["name"]), normal_style),
            Paragraph(str(item["quantity"]), normal_style),
            Paragraph(money_label(item["unit_price"]), amount_style),
            Paragraph(money_label(money(item["unit_price"]) * int(item["quantity"] or 1)), amount_style),
        ])

    items_table = Table(rows, colWidths=[82 * mm, 17 * mm, 29 * mm, 31 * mm], repeatRows=1, hAlign="CENTER")
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.7, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))

    summary_rows = []
    for index, row in enumerate(payload["totals"]):
        label, value, is_total = row
        value_style = total_style if is_total else amount_style
        summary_rows.append([
            Paragraph(_safe_text(label), strong_style if is_total else normal_style),
            Paragraph(_safe_text(value), value_style),
        ])
    summary = Table(summary_rows, colWidths=[68 * mm, 41 * mm], hAlign="RIGHT")
    summary_styles = [
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]
    total_index = len(summary_rows) - 1
    if total_index >= 0:
        summary_styles.append(("LINEABOVE", (0, total_index), (-1, total_index), 1.2, gold))
    summary.setStyle(TableStyle(summary_styles))

    verify_url = _invoice_verify_url(payload["verify_lookup_id"])
    verify_box = Table(
        [[Paragraph(
            f'<b>{_safe_text(payload["verify_label"])}:</b> '
            f'<link href="{_safe_link(verify_url)}"><font color="#143670">{_safe_link(verify_url)}</font></link>',
            verify_style,
        )]],
        colWidths=[159 * mm],
        hAlign="CENTER",
    )
    verify_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), verify_bg),
        ("BOX", (0, 0), (-1, -1), 0.8, gold),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))

    footer = Table(
        [[Paragraph(
            _safe_text(payload["footer"]),
            ParagraphStyle("RMXFooter", parent=normal_style, textColor=muted, fontSize=8.1, leading=11),
        )]],
        colWidths=[159 * mm],
        hAlign="CENTER",
    )
    footer.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    bulk_notice = Table(
        [[Paragraph(
            f"<b>{_safe_text(BULK_DISCOUNT_NOTICE)}</b>",
            ParagraphStyle("RMXBulkNotice", parent=normal_style, textColor=navy, fontSize=8.7, leading=12),
        )]],
        colWidths=[159 * mm],
        hAlign="CENTER",
    )
    bulk_notice.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF8D9")),
        ("BOX", (0, 0), (-1, -1), 0.8, gold),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))

    story = [
        header,
        Spacer(1, 7 * mm),
        card_table,
        Spacer(1, 9 * mm),
        items_table,
        Spacer(1, 7 * mm),
        summary,
        Spacer(1, 7 * mm),
        bulk_notice,
        Spacer(1, 5 * mm),
        verify_box,
        Spacer(1, 6 * mm),
        footer,
    ]
    doc.build(story)
    stream.seek(0)
    return stream


def _order_items(order):
    return [
        {
            "name": item.product_name or "Bookshop item",
            "quantity": int(item.quantity or 1),
            "unit_price": money(item.unit_price),
        }
        for item in order.items
    ]


def _order_totals(order, include_delivery=True, cart_invoice=False):
    rows = [["Subtotal", money_label(order.subtotal_amount), False]]
    if money(getattr(order, "bulk_discount_amount", 0)) > 0:
        rows.append(["Bulk purchase discount", f"-{money_label(order.bulk_discount_amount)}", False])
    if money(getattr(order, "promo_discount_amount", 0)) > 0:
        label = f"Promo discount ({order.promo_code})" if getattr(order, "promo_code", None) else "Promo discount"
        rows.append([label, f"-{money_label(order.promo_discount_amount)}", False])
    if cart_invoice:
        rows.append(["Delivery", "Calculated at checkout", False])
        rows.append(["Total before delivery", money_label(order.total_amount), True])
        return rows
    if include_delivery:
        rows.append(["Delivery", money_label(order.delivery_fee), False])
    rows.append(["Total", money_label(order.total_amount), True])
    return rows


def build_invoice_pdf(order):
    assign_invoice_id(order)
    return _build_bookshop_pdf({
        "title": "Invoice",
        "document_id": order.invoice_id,
        "order_reference": order.order_reference,
        "issued_label": "Generated",
        "issued_at": _date_time_label(order.created_at),
        "verify_label": "Verify this invoice",
        "verify_lookup_id": order.invoice_id,
        "cards": [
            ("Billed To", [order.customer_name or "Customer", order.email or "", order.phone or ""]),
            ("Fulfilment", ["Pickup" if order.delivery_method == "pickup" else "Delivery", _delivery_label(order)]),
            ("Payment", [_payment_label(order.payment_status), _payment_label(order.payment_method)]),
        ],
        "items": _order_items(order),
        "totals": _order_totals(order),
        "footer": "Thank you for shopping with RealMindX Bookshop. Enter the invoice ID on the public Receipt/Invoice Verification page to verify this document.",
    })


def build_receipt_pdf(order):
    return _build_bookshop_pdf({
        "title": "Order Receipt",
        "document_id": order.order_reference,
        "order_reference": order.order_reference,
        "issued_label": "Issued",
        "issued_at": _date_time_label(order.updated_at or order.created_at),
        "verify_label": "Verify this receipt",
        "verify_lookup_id": order.invoice_id,
        "cards": [
            ("Customer", [order.customer_name or "Customer", order.email or "", order.phone or ""]),
            ("Order", [_status_label(order.status), f"Placed: {_date_time_label(order.created_at)}"]),
            ("Payment", [_payment_label(order.payment_status), _payment_label(order.payment_method)]),
        ],
        "items": _order_items(order),
        "totals": _order_totals(order),
        "footer": "This receipt confirms the order record shown above. Enter the invoice ID on the public Receipt/Invoice Verification page to verify it.",
    })


def build_cart_invoice_pdf(cart_invoice):
    assign_cart_invoice_id(cart_invoice)
    return _build_bookshop_pdf({
        "title": "Cart Invoice",
        "document_id": cart_invoice.invoice_id,
        "order_reference": None,
        "issued_label": "Generated",
        "issued_at": _date_time_label(cart_invoice.created_at),
        "verify_label": "Verify this invoice",
        "verify_lookup_id": cart_invoice.invoice_id,
        "cards": [
            ("Delivery", ["Calculated at checkout"]),
            ("Payment", ["Not paid yet"]),
        ],
        "items": _order_items(cart_invoice),
        "totals": _order_totals(cart_invoice, cart_invoice=True),
        "footer": "This cart invoice reflects selected cart items only. Delivery, payment, and stock are confirmed at checkout.",
    })
