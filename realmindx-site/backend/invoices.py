from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4
from xml.sax.saxutils import escape as xml_escape

from flask import current_app

from .extensions import db
from .models import CartInvoice, Order
from .order_status import normalize_order_status

MONEY_QUANT = Decimal("0.01")


def money(value):
    return Decimal(str(value or 0)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def money_label(value):
    return f"GHS {money(value):,.2f}"


def new_invoice_id():
    return f"RMX-INV-{uuid4().hex[:10].upper()}"


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


def invoice_json(order):
    subtotal = money(order.subtotal_amount)
    bulk_discount = money(order.bulk_discount_amount)
    promo_discount = money(order.promo_discount_amount)
    delivery_fee = money(order.delivery_fee)
    total = money(order.total_amount)
    return {
        "invoice_id": order.invoice_id,
        "order_reference": order.order_reference,
        "created_at": order.created_at.isoformat() if order.created_at else None,
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
        "pdf_url": f"/api/invoices/{order.invoice_id}/pdf" if order.invoice_id else None,
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit_price": float(money(item.unit_price)),
                "quantity": item.quantity,
                "line_total": float(money(item.unit_price) * int(item.quantity or 1)),
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
        "invoice_type": "cart",
        "order_reference": None,
        "created_at": cart_invoice.created_at.isoformat() if cart_invoice.created_at else None,
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
        "pdf_url": f"/api/invoices/{cart_invoice.invoice_id}/pdf",
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit_price": float(money(item.unit_price)),
                "quantity": item.quantity,
                "line_total": float(money(item.unit_price) * int(item.quantity or 1)),
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


def _order_date(order):
    if not order.created_at:
        return ""
    return order.created_at.strftime("%d %b %Y")


def _invoice_verify_url(invoice_id):
    bookshop_url = (current_app.config.get("BOOKSHOP_URL") or "").rstrip("/")
    if not bookshop_url:
        base_url = (current_app.config.get("BASE_URL") or "http://127.0.0.1:5173").rstrip("/")
        bookshop_url = f"{base_url}/bookshop"
    return f"{bookshop_url}/invoice?invoice_id={quote(invoice_id or '')}"


def _safe_link(url):
    return xml_escape(url or "", {'"': "&quot;"})


def build_invoice_pdf(order):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    assign_invoice_id(order)
    stream = BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"Invoice {order.invoice_id}",
        author="RealMindX Bookshop",
    )

    styles = getSampleStyleSheet()
    navy = colors.HexColor("#143670")
    gold = colors.HexColor("#ffcc01")
    muted = colors.HexColor("#334155")
    body = colors.HexColor("#071a33")
    border = colors.HexColor("#c9d6e8")
    light = colors.HexColor("#f7faff")
    verify_bg = colors.HexColor("#fff8d4")

    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Title"],
        textColor=navy,
        fontName="Helvetica-Bold",
        fontSize=23,
        leading=28,
        alignment=TA_RIGHT,
        spaceAfter=4,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        textColor=navy,
        fontName="Helvetica-Bold",
        fontSize=8.8,
        leading=11,
        uppercase=True,
    )
    table_header_style = ParagraphStyle(
        "InvoiceTableHeader",
        parent=label_style,
        textColor=colors.white,
        fontSize=8.5,
        leading=10,
    )
    normal_style = ParagraphStyle(
        "NormalSmall",
        parent=styles["Normal"],
        textColor=body,
        fontName="Helvetica",
        fontSize=9.6,
        leading=13,
    )
    total_style = ParagraphStyle(
        "Total",
        parent=styles["Normal"],
        textColor=navy,
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14.5,
        alignment=TA_RIGHT,
    )
    verify_style = ParagraphStyle(
        "InvoiceVerify",
        parent=normal_style,
        textColor=body,
        fontSize=9.2,
        leading=13,
        splitLongWords=True,
    )

    logo = _logo_path()
    logo_cell = Paragraph("<b>RealMindX Bookshop</b>", normal_style)
    if logo:
        logo_cell = Image(str(logo), width=68 * mm, height=25 * mm, kind="proportional")

    header = Table(
        [
            [
                logo_cell,
                [
                    Paragraph("INVOICE", title_style),
                    Paragraph(f"<b>{order.invoice_id}</b>", normal_style),
                    Paragraph(f"Order: {order.order_reference}", normal_style),
                    Paragraph(f"Date: {_order_date(order)}", normal_style),
                ],
            ]
        ],
        colWidths=[92 * mm, 67 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))

    billing = Table(
        [
            [
                [
                    Paragraph("Billed To", label_style),
                    Paragraph(order.customer_name or "", normal_style),
                    Paragraph(order.email or "", normal_style),
                    Paragraph(order.phone or "", normal_style),
                ],
                [
                    Paragraph("Fulfilment", label_style),
                    Paragraph("Pickup" if order.delivery_method == "pickup" else "Delivery", normal_style),
                    Paragraph(order.location or order.delivery_zone_name or "Details on file", normal_style),
                ],
                [
                    Paragraph("Payment", label_style),
                    Paragraph((order.payment_status or "unpaid").title(), normal_style),
                    Paragraph((order.payment_method or "online").replace("_", " ").title(), normal_style),
                ],
            ]
        ],
        colWidths=[62 * mm, 62 * mm, 35 * mm],
    )
    billing.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 10),
    ]))

    rows = [[
        Paragraph("Item", table_header_style),
        Paragraph("Qty", table_header_style),
        Paragraph("Unit", table_header_style),
        Paragraph("Line Total", table_header_style),
    ]]
    for item in order.items:
        line_total = money(item.unit_price) * int(item.quantity or 1)
        rows.append([
            Paragraph(item.product_name or "Bookshop item", normal_style),
            Paragraph(str(item.quantity or 1), normal_style),
            Paragraph(money_label(item.unit_price), normal_style),
            Paragraph(money_label(line_total), normal_style),
        ])
    items_table = Table(rows, colWidths=[82 * mm, 18 * mm, 29 * mm, 30 * mm], repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.7, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))

    summary_rows = [
        ["Subtotal", money_label(order.subtotal_amount)],
    ]
    if money(order.bulk_discount_amount) > 0:
        summary_rows.append(["Bulk purchase discount", f"-{money_label(order.bulk_discount_amount)}"])
    if money(order.promo_discount_amount) > 0:
        promo_label = f"Promo discount ({order.promo_code})" if order.promo_code else "Promo discount"
        summary_rows.append([promo_label, f"-{money_label(order.promo_discount_amount)}"])
    summary_rows.append(["Delivery fee", money_label(order.delivery_fee)])
    summary_rows.append(["Total", money_label(order.total_amount)])

    summary = Table(summary_rows, colWidths=[64 * mm, 34 * mm], hAlign="RIGHT")
    summary.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (-1, -2), muted),
        ("TEXTCOLOR", (0, -1), (-1, -1), navy),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 12),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, gold),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))

    verify_url = _invoice_verify_url(order.invoice_id)
    verify_box = Table(
        [[Paragraph(
            f'<b>Verify this invoice:</b> <link href="{_safe_link(verify_url)}"><font color="#143670">{_safe_link(verify_url)}</font></link>',
            verify_style,
        )]],
        colWidths=[159 * mm],
    )
    verify_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), verify_bg),
        ("BOX", (0, 0), (-1, -1), 0.8, gold),
        ("PADDING", (0, 0), (-1, -1), 9),
    ]))

    footer = Paragraph(
        "Thank you for shopping with RealMindX Bookshop. Use the verification link above or search the invoice ID on the public invoice lookup page.",
        ParagraphStyle("Footer", parent=normal_style, textColor=muted, fontSize=8.8, leading=12),
    )

    story = [
        header,
        Spacer(1, 8),
        billing,
        Spacer(1, 18),
        items_table,
        Spacer(1, 14),
        summary,
        Spacer(1, 18),
        verify_box,
        Spacer(1, 18),
        footer,
    ]
    doc.build(story)
    stream.seek(0)
    return stream


def build_cart_invoice_pdf(cart_invoice):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    assign_cart_invoice_id(cart_invoice)
    stream = BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"Invoice {cart_invoice.invoice_id}",
        author="RealMindX Bookshop",
    )

    styles = getSampleStyleSheet()
    navy = colors.HexColor("#143670")
    gold = colors.HexColor("#ffcc01")
    muted = colors.HexColor("#334155")
    body = colors.HexColor("#071a33")
    border = colors.HexColor("#c9d6e8")
    light = colors.HexColor("#f7faff")
    verify_bg = colors.HexColor("#fff8d4")

    title_style = ParagraphStyle(
        "CartInvoiceTitle",
        parent=styles["Title"],
        textColor=navy,
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=27,
        alignment=TA_RIGHT,
        spaceAfter=4,
    )
    label_style = ParagraphStyle(
        "CartInvoiceLabel",
        parent=styles["Normal"],
        textColor=navy,
        fontName="Helvetica-Bold",
        fontSize=8.8,
        leading=11,
    )
    table_header_style = ParagraphStyle(
        "CartInvoiceTableHeader",
        parent=label_style,
        textColor=colors.white,
        fontSize=8.5,
        leading=10,
    )
    normal_style = ParagraphStyle(
        "CartInvoiceNormalSmall",
        parent=styles["Normal"],
        textColor=body,
        fontName="Helvetica",
        fontSize=9.6,
        leading=13,
    )
    total_style = ParagraphStyle(
        "CartInvoiceTotal",
        parent=styles["Normal"],
        textColor=navy,
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14.5,
        alignment=TA_RIGHT,
    )
    verify_style = ParagraphStyle(
        "CartInvoiceVerify",
        parent=normal_style,
        textColor=body,
        fontSize=9.2,
        leading=13,
        splitLongWords=True,
    )

    logo = _logo_path()
    logo_cell = Paragraph("<b>RealMindX Bookshop</b>", normal_style)
    if logo:
        logo_cell = Image(str(logo), width=68 * mm, height=25 * mm, kind="proportional")

    created_date = cart_invoice.created_at.strftime("%d %b %Y") if cart_invoice.created_at else ""
    header = Table(
        [
            [
                logo_cell,
                [
                    Paragraph("CART INVOICE", title_style),
                    Paragraph(f"<b>{cart_invoice.invoice_id}</b>", normal_style),
                    Paragraph(f"Date: {created_date}", normal_style),
                ],
            ]
        ],
        colWidths=[92 * mm, 67 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))

    summary = Table(
        [
            [
                [
                    Paragraph("Generated From Cart", label_style),
                    Paragraph("Selected RealMindX Bookshop cart items", normal_style),
                ],
                [
                    Paragraph("Delivery", label_style),
                    Paragraph("Calculated at checkout", normal_style),
                ],
                [
                    Paragraph("Payment", label_style),
                    Paragraph("Not paid yet", normal_style),
                ],
            ]
        ],
        colWidths=[62 * mm, 62 * mm, 35 * mm],
    )
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 10),
    ]))

    rows = [[
        Paragraph("Item", table_header_style),
        Paragraph("Qty", table_header_style),
        Paragraph("Unit", table_header_style),
        Paragraph("Line Total", table_header_style),
    ]]
    for item in cart_invoice.items:
        rows.append([
            Paragraph(item.product_name, normal_style),
            Paragraph(str(item.quantity), normal_style),
            Paragraph(money_label(item.unit_price), normal_style),
            Paragraph(money_label(money(item.unit_price) * int(item.quantity or 1)), normal_style),
        ])

    items_table = Table(rows, colWidths=[82 * mm, 18 * mm, 28 * mm, 31 * mm], repeatRows=1)
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))

    totals = [
        ["Subtotal", money_label(cart_invoice.subtotal_amount)],
    ]
    if money(cart_invoice.bulk_discount_amount) > 0:
        totals.append(["Bulk Purchase Discount", f"-{money_label(cart_invoice.bulk_discount_amount)}"])
    if money(cart_invoice.promo_discount_amount) > 0:
        totals.append(["Promo Discount", f"-{money_label(cart_invoice.promo_discount_amount)}"])
    totals.extend([
        ["Delivery", "Calculated at checkout"],
        ["Total Before Delivery", money_label(cart_invoice.total_amount)],
    ])
    totals_table = Table(
        [[Paragraph(label, normal_style), Paragraph(value, total_style)] for label, value in totals],
        colWidths=[92 * mm, 67 * mm],
        hAlign="RIGHT",
    )
    totals_table.setStyle(TableStyle([
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, gold),
        ("PADDING", (0, 0), (-1, -1), 7),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))

    verify_url = _invoice_verify_url(cart_invoice.invoice_id)
    verify_box = Table(
        [[Paragraph(
            f'<b>Verify this invoice:</b> <link href="{_safe_link(verify_url)}"><font color="#143670">{_safe_link(verify_url)}</font></link>',
            verify_style,
        )]],
        colWidths=[159 * mm],
    )
    verify_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), verify_bg),
        ("BOX", (0, 0), (-1, -1), 0.8, gold),
        ("PADDING", (0, 0), (-1, -1), 9),
    ]))

    note_style = ParagraphStyle(
        "CartInvoiceNote",
        parent=normal_style,
        textColor=muted,
        fontSize=8.8,
        leading=12,
    )

    story = [
        header,
        Spacer(1, 8 * mm),
        summary,
        Spacer(1, 9 * mm),
        items_table,
        Spacer(1, 7 * mm),
        totals_table,
        Spacer(1, 7 * mm),
        verify_box,
        Spacer(1, 7 * mm),
        Paragraph("This cart invoice reflects selected cart items only. Delivery, payment, and stock are confirmed at checkout.", note_style),
    ]

    doc.build(story)
    stream.seek(0)
    return stream
