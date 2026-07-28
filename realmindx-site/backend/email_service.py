import base64
import smtplib
import uuid
from dataclasses import dataclass
from decimal import Decimal
from email.message import EmailMessage as SmtpEmailMessage
from html import escape
from urllib.parse import urlsplit

import requests
from flask import current_app

from .communications import (
    CommunicationResult,
    mask_destination,
    record_attempt,
    resolve_communication_mode,
)


@dataclass
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str = "application/octet-stream"


@dataclass
class OutboundEmail:
    to: str
    subject: str
    html: str
    text: str = ""
    from_email: str | None = None
    reply_to: str | None = None
    attachments: list[EmailAttachment] | None = None


def absolute_app_url(path_or_url):
    if not path_or_url:
        return ""
    value = str(path_or_url)
    if value.startswith(("http://", "https://")):
        return value
    base = current_app.config["BASE_URL"].rstrip("/")
    return f"{base}/{value.lstrip('/')}"


def _url_origin(url):
    parsed = urlsplit(str(url or "").strip())
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return ""


def _email_contact_settings(scope="main"):
    defaults = {
        "contact_email": "info@realmindxgh.com",
        "contact_phone_1": "+233 55 803 9190",
        "contact_address": "Dome Pillar 2, Accra, Ghana",
        "working_hours_weekday": "Monday - Friday: 8:00am - 5:00pm",
        "working_hours_saturday": "Saturday: 9:00am - 1:00pm",
        "primary_phone": "+233 55 803 9190",
        "address": "Dome Pillar 2, Accra, Ghana",
    }
    try:
        from .models import SiteSetting

        scoped_keys = [f"{scope}__{key}" for key in defaults]
        rows = SiteSetting.query.filter(SiteSetting.key.in_([*defaults.keys(), *scoped_keys])).all()
        stored = {row.key: row.value for row in rows}
        values = {
            key: stored[f"{scope}__{key}"] if f"{scope}__{key}" in stored else stored.get(key)
            for key in defaults
        }
    except Exception:
        values = defaults

    contact_email = str(values.get("contact_email") or "").strip()
    contact_phone = str(
        values.get("contact_phone_1")
        or values.get("primary_phone")
        or ""
    ).strip()
    contact_address = str(
        values.get("contact_address")
        or values.get("address")
        or ""
    ).strip()
    weekday_hours = str(values.get("working_hours_weekday") or "").strip()
    saturday_hours = str(values.get("working_hours_saturday") or "").strip()
    return {
        "email": contact_email,
        "phone": contact_phone,
        "address": contact_address,
        "weekday_hours": weekday_hours,
        "saturday_hours": saturday_hours,
    }


def bookshop_order_summary_table(order):
    items = list(getattr(order, "items", None) or [])
    body_rows = []
    for item in items:
        quantity = max(int(getattr(item, "quantity", 0) or 0), 1)
        unit_price = Decimal(str(getattr(item, "unit_price", 0) or 0))
        line_total = unit_price * quantity
        body_rows.append(
            f"""
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #dce5f0;color:#1a2a40;">{escape(getattr(item, 'product_name', '') or 'Requested item')}</td>
              <td style="padding:12px 14px;border-bottom:1px solid #dce5f0;color:#1a2a40;text-align:center;">{quantity}</td>
              <td style="padding:12px 14px;border-bottom:1px solid #dce5f0;color:#1a2a40;text-align:right;">GH&#8373;{float(unit_price):,.2f}</td>
              <td style="padding:12px 14px;border-bottom:1px solid #dce5f0;color:#1a2a40;text-align:right;">GH&#8373;{float(line_total):,.2f}</td>
            </tr>
            """
        )

    if not body_rows:
        body_rows.append(
            """
            <tr>
              <td colspan="4" style="padding:14px;color:#53657d;text-align:center;">
                Order items will be confirmed by our team shortly.
              </td>
            </tr>
            """
        )

    subtotal = Decimal(str(getattr(order, "subtotal_amount", 0) or 0))
    bulk_discount_amount = Decimal(str(getattr(order, "bulk_discount_amount", 0) or 0))
    delivery_fee = Decimal(str(getattr(order, "delivery_fee", 0) or 0))
    promo_discount_amount = Decimal(str(getattr(order, "promo_discount_amount", 0) or 0))
    promo_code = (getattr(order, "promo_code", None) or "").strip().upper()
    promo_applies_to = (getattr(order, "promo_applies_to", None) or "").strip().lower()
    total_amount = Decimal(str(getattr(order, "total_amount", 0) or (subtotal + delivery_fee - bulk_discount_amount - promo_discount_amount)))

    discount_rows = []
    if bulk_discount_amount > 0:
        discount_rows.append(
            f"""
            <tr style="background:#fbfcfe;">
              <td colspan="3" style="padding:0 14px 12px;color:#1f7a37;font-weight:700;text-align:right;">Bulk purchase discount</td>
              <td style="padding:0 14px 12px;color:#1f7a37;font-weight:700;text-align:right;">-GH&#8373;{float(bulk_discount_amount):,.2f}</td>
            </tr>
            """
        )
    if promo_discount_amount > 0:
        promo_label = "Promo discount"
        if promo_code:
            if promo_applies_to == "delivery":
                promo_label = f"Delivery discount ({escape(promo_code)})"
            elif promo_applies_to == "all":
                promo_label = f"Promo ({escape(promo_code)}) on order"
            else:
                promo_label = f"Promo ({escape(promo_code)}) on products"
        discount_rows.append(
            f"""
            <tr style="background:#fbfcfe;">
              <td colspan="3" style="padding:0 14px 12px;color:#1f7a37;font-weight:700;text-align:right;">{promo_label}</td>
              <td style="padding:0 14px 12px;color:#1f7a37;font-weight:700;text-align:right;">-GH&#8373;{float(promo_discount_amount):,.2f}</td>
            </tr>
            """
        )

    return f"""
    <div style="margin:18px 0 22px;border:1px solid #dce5f0;border-radius:12px;overflow:hidden;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr style="background:#f5f8fc;">
          <th style="padding:12px 14px;color:#143670;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:left;">Item</th>
          <th style="padding:12px 14px;color:#143670;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:center;">Qty</th>
          <th style="padding:12px 14px;color:#143670;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:right;">Unit</th>
          <th style="padding:12px 14px;color:#143670;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:right;">Line total</th>
        </tr>
        {''.join(body_rows)}
        <tr style="background:#fbfcfe;">
          <td colspan="3" style="padding:12px 14px;color:#53657d;font-weight:700;text-align:right;">Subtotal</td>
          <td style="padding:12px 14px;color:#1a2a40;font-weight:700;text-align:right;">GH&#8373;{float(subtotal):,.2f}</td>
        </tr>
        {''.join(discount_rows)}
        <tr style="background:#fbfcfe;">
          <td colspan="3" style="padding:0 14px 12px;color:#53657d;font-weight:700;text-align:right;">Delivery fee</td>
          <td style="padding:0 14px 12px;color:#1a2a40;font-weight:700;text-align:right;">GH&#8373;{float(delivery_fee):,.2f}</td>
        </tr>
        <tr style="background:#fff7d1;">
          <td colspan="3" style="padding:12px 14px;color:#143670;font-weight:900;text-align:right;">Total</td>
          <td style="padding:12px 14px;color:#143670;font-weight:900;text-align:right;">GH&#8373;{float(total_amount):,.2f}</td>
        </tr>
      </table>
    </div>
    """


def app_email_shell(
    title,
    body_html,
    cta_label=None,
    cta_url=None,
    *,
    eyebrow="RealMindX Education",
    preheader="",
    hero_image_url=None,
    footer_note=None,
):
    """
    Responsive, branded email shell for RealMindX main site and teacher/jobs emails.
    Navy #143670 header with RealMindX logo, gold #ffcc01 accent.
    """
    base_url = current_app.config["BASE_URL"].rstrip("/")
    bookshop_url = current_app.config.get("BOOKSHOP_URL", f"{base_url}/bookshop").rstrip("/")
    asset_origin = current_app.config.get("EMAIL_ASSET_BASE_URL", "https://realmindxgh.com").rstrip("/")
    logo_url = f"{asset_origin}/logo-white.png"
    contact = _email_contact_settings("main")

    if cta_url and not cta_url.startswith(("http://", "https://")):
        cta_url = f"{base_url}/{cta_url.lstrip('/')}"

    hero = ""
    if hero_image_url:
        abs_hero = absolute_app_url(hero_image_url)
        hero = f"""
        <tr>
          <td style="padding:0;">
            <img src="{escape(abs_hero, quote=True)}" alt="" width="640"
                 style="display:block;width:100%;max-height:280px;object-fit:cover;" />
          </td>
        </tr>"""

    cta = ""
    if cta_label and cta_url:
        cta = f"""
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 8px;">
          <tr>
            <td class="email-cta-cell" bgcolor="#ffcc01"
                style="border-radius:8px;background:#ffcc01;border:1px solid #e2b600;">
              <a href="{escape(cta_url, quote=True)}"
                 class="email-cta"
                 style="display:inline-block;padding:14px 32px;background:#ffcc01;color:#143670!important;
                        -webkit-text-fill-color:#143670!important;font-weight:800;
                        font-family:Arial,Helvetica,sans-serif;font-size:15px;
                        text-decoration:none;letter-spacing:.02em;border-radius:8px;">
                <span style="color:#143670!important;-webkit-text-fill-color:#143670!important;">{escape(cta_label)}</span>
              </a>
            </td>
          </tr>
        </table>"""

    preheader_block = (
        f'<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#ffffff;'
        f'line-height:1px;max-height:0px;opacity:0;">{escape(preheader)}&nbsp;</div>'
        if preheader else ""
    )

    footer_note_html = (
        f'<p style="margin:14px 0 0;color:#93a8c8;font-size:12px;">{footer_note}</p>'
        if footer_note else ""
    )

    safe_eyebrow = escape(eyebrow)
    safe_title = escape(title)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>{safe_title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:600px){{
      .email-wrapper{{padding:12px 8px!important}}
      .email-card{{border-radius:12px!important}}
      .email-header{{padding:24px 20px!important}}
      .email-body{{padding:24px 20px 20px!important;font-size:15px!important}}
      .email-footer{{padding:20px!important}}
      .email-cta{{padding:13px 24px!important}}
    }}
    :root{{color-scheme:light only;supported-color-schemes:light}}
    .email-cta-cell,.email-cta{{background:#ffcc01!important}}
    .email-cta,.email-cta span{{color:#143670!important;-webkit-text-fill-color:#143670!important}}
    [data-ogsc] .email-cta-cell,[data-ogsb] .email-cta-cell{{background:#ffcc01!important}}
    [data-ogsc] .email-cta,[data-ogsc] .email-cta span{{color:#143670!important;-webkit-text-fill-color:#143670!important}}
  </style>
</head>
<body style="margin:0;padding:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color-scheme:light only;">
  {preheader_block}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td class="email-wrapper" style="padding:32px 16px;background:#eef2f8;">
        <table role="presentation" class="email-card" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;
                      overflow:hidden;border:1px solid #c8d5e8;">

          <!-- HEADER: navy with centered logo -->
          <tr>
            <td class="email-header"
                style="background:#143670;padding:28px 32px 24px;border-bottom:4px solid #ffcc01;text-align:center;">
              <img src="{logo_url}" alt="RealMindX Education" height="44"
                   style="display:block;height:44px;max-width:240px;width:auto;margin:0 auto 18px;
                          border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 6px;color:#ffcc01;font-family:Arial,Helvetica,sans-serif;
                         font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;text-align:center;">
                {safe_eyebrow}
              </p>
              <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                          font-size:26px;line-height:1.2;font-weight:900;text-align:center;">
                {safe_title}
              </h1>
            </td>
          </tr>

          {hero}

          <!-- BODY -->
          <tr>
            <td class="email-body"
                style="padding:32px 32px 28px;color:#1a2a40;font-family:Arial,Helvetica,sans-serif;
                       font-size:16px;line-height:1.75;">
              {body_html}
              {cta}
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #dce5f0;margin:0;" />
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="email-footer"
                style="background:#143670;padding:24px 32px;font-family:Arial,Helvetica,sans-serif;
                       font-size:13px;color:#93a8c8;line-height:1.7;text-align:center;">
              <img src="{logo_url}" alt="RealMindX Education" height="34"
                   style="display:block;height:34px;max-width:200px;width:auto;margin:0 auto 14px;
                          border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 6px;font-weight:800;color:#ffffff;font-size:14px;text-align:center;">
                RealMindX Education Limited
              </p>
              <p style="margin:0 0 8px;text-align:center;">{escape(contact["address"])}</p>
              <p style="margin:0 0 8px;text-align:center;">
                <a href="mailto:{escape(contact["email"], quote=True)}"
                   style="color:#ffcc01;text-decoration:none;">{escape(contact["email"])}</a>
                &nbsp;&bull;&nbsp;
                <a href="tel:{escape(contact["phone"].replace(' ', ''), quote=True)}" style="color:#93a8c8;text-decoration:none;">
                  {escape(contact["phone"])}
                </a>
              </p>
              <p style="margin:0 0 12px;text-align:center;">
                {escape(contact["weekday_hours"])}<br/>
                {escape(contact["saturday_hours"])}
              </p>
              <p style="margin:0;text-align:center;">
                <a href="{base_url}" style="color:#c8d5e8;text-decoration:none;">Website</a>
                &nbsp;&middot;&nbsp;
                <a href="{bookshop_url}" style="color:#c8d5e8;text-decoration:none;">Bookshop</a>
                &nbsp;&middot;&nbsp;
                <a href="https://schoolms.realmindxgh.com/" style="color:#c8d5e8;text-decoration:none;">SchoolMS</a>
                &nbsp;&middot;&nbsp;
                <a href="https://web.facebook.com/profile.php?id=61566941171883" style="color:#c8d5e8;text-decoration:none;">Facebook</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.instagram.com/realmindxgh/" style="color:#c8d5e8;text-decoration:none;">Instagram</a>
              </p>
              {footer_note_html}
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <p style="text-align:center;margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;
                   font-size:11px;color:#7a8fa8;">
          &copy; {__import__('datetime').date.today().year} RealMindX Education Limited. All rights reserved.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>"""


def bookshop_email_shell(
    title,
    body_html,
    cta_label=None,
    cta_url=None,
    *,
    eyebrow="RealMindX Bookshop",
    preheader="",
    hero_image_url=None,
    footer_note=None,
):
    """
    Responsive, branded email shell for RealMindX Bookshop emails.
    White logo band at top (bookshop-logo.png renders without blend-mode issues),
    navy #143670 title band, gold #ffcc01 accent — works in all email clients.
    """
    base_url = current_app.config["BASE_URL"].rstrip("/")
    bookshop_url = current_app.config.get("BOOKSHOP_URL", f"{base_url}/bookshop").rstrip("/")
    bookshop_origin = current_app.config.get(
        "BOOKSHOP_EMAIL_ASSET_BASE_URL",
        "https://bookshop.realmindxgh.com",
    ).rstrip("/")
    logo_url = f"{bookshop_origin}/bookshop-logo.png"
    email_icon_base = f"{bookshop_origin}/email-icons"
    contact = _email_contact_settings("bookshop")

    if cta_url and not cta_url.startswith(("http://", "https://")):
        cta_url = f"{bookshop_url}/{cta_url.lstrip('/')}"

    hero = ""
    if hero_image_url:
        abs_hero = absolute_app_url(hero_image_url)
        hero = f"""
        <tr>
          <td style="padding:0;">
            <img src="{escape(abs_hero, quote=True)}" alt="" width="640"
                 style="display:block;width:100%;max-height:280px;object-fit:cover;" />
          </td>
        </tr>"""

    cta = ""
    if cta_label and cta_url:
        cta = f"""
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 8px;">
          <tr>
            <td class="email-cta-cell" bgcolor="#ffcc01"
                style="border-radius:8px;background:#ffcc01;border:1px solid #e2b600;">
              <a href="{escape(cta_url, quote=True)}"
                 class="email-cta"
                 style="display:inline-block;padding:14px 32px;background:#ffcc01;color:#143670!important;
                        -webkit-text-fill-color:#143670!important;font-weight:800;
                        font-family:Arial,Helvetica,sans-serif;font-size:15px;
                        text-decoration:none;letter-spacing:.02em;border-radius:8px;">
                <span style="color:#143670!important;-webkit-text-fill-color:#143670!important;">{escape(cta_label)}</span>
              </a>
            </td>
          </tr>
        </table>"""

    preheader_block = (
        f'<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#ffffff;'
        f'line-height:1px;max-height:0px;opacity:0;">{escape(preheader)}&nbsp;</div>'
        if preheader else ""
    )

    footer_note_html = (
        f'<p style="margin:14px 0 0;color:#53657d;font-size:12px;text-align:center;">{footer_note}</p>'
        if footer_note else ""
    )

    safe_eyebrow = escape(eyebrow)
    safe_title = escape(title)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>{safe_title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:600px){{
      .email-wrapper{{padding:12px 8px!important}}
      .email-card{{border-radius:12px!important}}
      .email-header{{padding:24px 20px!important}}
      .email-header img{{max-width:260px!important}}
      .email-body{{padding:24px 20px 20px!important;font-size:15px!important}}
      .email-footer{{padding:20px!important}}
      .email-cta{{padding:13px 24px!important}}
    }}
    :root{{color-scheme:light only;supported-color-schemes:light}}
    .email-cta-cell,.email-cta{{background:#ffcc01!important}}
    .email-cta,.email-cta span{{color:#143670!important;-webkit-text-fill-color:#143670!important}}
    [data-ogsc] .email-cta-cell,[data-ogsb] .email-cta-cell{{background:#ffcc01!important}}
    [data-ogsc] .email-cta,[data-ogsc] .email-cta span{{color:#143670!important;-webkit-text-fill-color:#143670!important}}
  </style>
</head>
<body class="email-body-root" style="margin:0;padding:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color-scheme:light only;">
  {preheader_block}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td class="email-wrapper" style="padding:32px 16px;background:#eef2f8;">
        <table role="presentation" class="email-card" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;
                      overflow:hidden;border:1px solid #c8d5e8;">

          <!-- HEADER -->
          <tr>
            <td class="email-header"
                style="background:#ffffff;padding:28px 32px 24px;border-bottom:4px solid #ffcc01;text-align:center;">
              <img src="{logo_url}" alt="RealMindX Bookshop" width="320"
                   style="display:block;width:100%;max-width:320px;height:auto;margin:0 auto 18px;
                          border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 6px;color:#143670;font-family:Arial,Helvetica,sans-serif;
                         font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;text-align:center;">
                {safe_eyebrow}
              </p>
              <h1 style="margin:0;color:#143670;font-family:Arial,Helvetica,sans-serif;
                          font-size:24px;line-height:1.25;font-weight:900;text-align:center;">
                {safe_title}
              </h1>
            </td>
          </tr>

          {hero}

          <!-- BODY -->
          <tr>
            <td class="email-body"
                style="padding:32px 32px 28px;color:#1a2a40;font-family:Arial,Helvetica,sans-serif;
                       font-size:16px;line-height:1.75;">
              {body_html}
              {cta}
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #dce5f0;margin:0;" />
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="email-footer"
                style="background:#f7f9fc;padding:24px 32px;font-family:Arial,Helvetica,sans-serif;
                       font-size:13px;color:#53657d;line-height:1.7;text-align:center;">
              <img src="{logo_url}" alt="RealMindX Bookshop" width="220"
                   style="display:block;width:100%;max-width:220px;height:auto;margin:0 auto 16px;
                          border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 6px;font-weight:800;color:#143670;font-size:14px;text-align:center;">
                RealMindX Education Limited
              </p>
              <p style="margin:0 0 8px;text-align:center;">{escape(contact["address"])}</p>
              <p style="margin:0 0 8px;text-align:center;">
                <a href="mailto:{escape(contact["email"], quote=True)}"
                   style="color:#143670;text-decoration:none;font-weight:700;">{escape(contact["email"])}</a>
                &nbsp;&bull;&nbsp;
                <a href="tel:{escape(contact["phone"].replace(' ', ''), quote=True)}"
                   style="color:#53657d;text-decoration:none;">
                  {escape(contact["phone"])}
                </a>
              </p>
              <p style="margin:0 0 12px;text-align:center;">
                {escape(contact["weekday_hours"])}<br/>
                {escape(contact["saturday_hours"])}
              </p>
              <p style="margin:0 0 14px;text-align:center;white-space:nowrap;">
                <a href="https://schoolms.realmindxgh.com/" style="color:#143670;text-decoration:none;">SchoolMS</a>
                &nbsp;&middot;&nbsp;
                <a href="{bookshop_url}" style="color:#143670;text-decoration:none;">Bookshop</a>
                &nbsp;&middot;&nbsp;
                <a href="{base_url}" style="color:#143670;text-decoration:none;">Our Website</a>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 5px;">
                    <a href="https://wa.link/q5rjtp" aria-label="WhatsApp" style="display:block;text-decoration:none;">
                      <img src="{email_icon_base}/whatsapp.png" alt="WhatsApp" width="34" height="34" style="display:block;border:0;width:34px;height:34px;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://web.facebook.com/profile.php?id=61566941171883" aria-label="Facebook" style="display:block;text-decoration:none;">
                      <img src="{email_icon_base}/facebook.png" alt="Facebook" width="34" height="34" style="display:block;border:0;width:34px;height:34px;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://www.instagram.com/realmindxgh/" aria-label="Instagram" style="display:block;text-decoration:none;">
                      <img src="{email_icon_base}/instagram.png" alt="Instagram" width="34" height="34" style="display:block;border:0;width:34px;height:34px;" />
                    </a>
                  </td>
                  <td style="padding:0 5px;">
                    <a href="https://x.com/realmindxgh" aria-label="X" style="display:block;text-decoration:none;">
                      <img src="{email_icon_base}/x.png" alt="X" width="34" height="34" style="display:block;border:0;width:34px;height:34px;" />
                    </a>
                  </td>
                </tr>
              </table>
              {footer_note_html}
            </td>
          </tr>

        </table>

        <!-- Sub-footer -->
        <p style="text-align:center;margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;
                   font-size:11px;color:#7a8fa8;">
          &copy; {__import__('datetime').date.today().year} RealMindX Education Limited. All rights reserved.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>"""


def _email_attempt(
    channel: str,
    purpose: str,
    recipient_user_id: int | None,
    masked_dst: str | None,
    template_name: str | None,
    provider: str,
    mode: str,
    status: str,
    provider_message_id: str | None = None,
    error_code: str | None = None,
):
    record_attempt(
        channel=channel,
        purpose=purpose,
        recipient_user_id=recipient_user_id,
        masked_destination=masked_dst,
        template_name=template_name,
        provider=provider,
        mode=mode,
        status=status,
        provider_message_id=provider_message_id,
        error_code=error_code,
    )


def send_email(
    message: OutboundEmail,
    *,
    purpose: str = "transactional",
    recipient_user_id: int | None = None,
    template_name: str | None = None,
) -> CommunicationResult:
    mode = resolve_communication_mode()
    masked_dst = mask_destination("email", message.to)

    purpose = purpose or "transactional"

    if mode == "disabled":
        _email_attempt("email", purpose, recipient_user_id, masked_dst, template_name, "none", mode, "disabled")
        return CommunicationResult(
            channel="email", purpose=purpose, provider="none", mode=mode,
            status="disabled",
            error_code="mode_disabled",
            error_message="Email delivery is disabled in this environment.",
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    if mode == "mock":
        mock_id = f"mock-{uuid.uuid4().hex}"
        _email_attempt("email", purpose, recipient_user_id, masked_dst, template_name, "mock", mode, "mocked", provider_message_id=mock_id)
        current_app.logger.info("[email mock] %s -> %s (subject=%s)", purpose, masked_dst, message.subject)
        return CommunicationResult(
            channel="email", purpose=purpose, provider="mock", mode=mode,
            status="mocked",
            provider_message_id=mock_id,
            error_message="Mock mode — no real email was sent.",
            recipient_user_id=recipient_user_id,
            masked_destination=masked_dst,
            template_name=template_name,
        )

    from_email = message.from_email or current_app.config["DEFAULT_FROM_EMAIL"]
    reply_to = message.reply_to or current_app.config["DEFAULT_REPLY_TO_EMAIL"]
    resend_key = current_app.config.get("RESEND_API_KEY")
    attachments = message.attachments or []
    primary_error = None
    final_result = None

    # --- Resend API ---
    if resend_key:
        try:
            payload = {
                "from": from_email,
                "to": [message.to],
                "subject": message.subject,
                "html": message.html,
                "text": message.text or message.subject,
                "reply_to": reply_to,
            }
            if attachments:
                payload["attachments"] = [
                    {
                        "filename": attachment.filename,
                        "content": base64.b64encode(attachment.content).decode("ascii"),
                    }
                    for attachment in attachments
                ]
            response = requests.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=15,
            )
            response.raise_for_status()
            provider_id = response.json().get("id")
            _email_attempt("email", purpose, recipient_user_id, masked_dst, template_name, "resend", mode, "accepted", provider_message_id=provider_id)
            current_app.logger.info("[email resend] %s accepted for %s", purpose, masked_dst)
            return CommunicationResult(
                channel="email", purpose=purpose, provider="resend", mode=mode,
                status="accepted",
                provider_message_id=provider_id,
                recipient_user_id=recipient_user_id,
                masked_destination=masked_dst,
                template_name=template_name,
            )
        except requests.RequestException as exc:
            primary_error = "provider_rejected"
            error_msg = str(exc)
            status_code = getattr(exc.response, "status_code", None) if hasattr(exc, "response") else None
            if status_code == 401:
                error_msg = "Resend API key rejected (unauthorized). Check RESEND_API_KEY."
                primary_error = "invalid_credentials"
            elif status_code == 422:
                error_msg = "Resend rejected the email content (422)."
            elif isinstance(exc, requests.Timeout):
                error_msg = "Resend request timed out."
                primary_error = "timeout"
            current_app.logger.warning("[email resend] %s: %s", primary_error, masked_dst)
        except Exception as exc:
            primary_error = "provider_error"
            error_msg = str(exc)[:200]
            current_app.logger.warning("[email resend] unexpected error: %s", error_msg)
    else:
        primary_error = "missing_credentials"
        error_msg = "RESEND_API_KEY is not configured."

    # --- SMTP fallback ---
    mail_server = current_app.config.get("MAIL_SERVER")
    mail_username = current_app.config.get("MAIL_USERNAME")
    mail_password = current_app.config.get("MAIL_PASSWORD")
    smtp_configured = bool(mail_server and mail_username and mail_password)

    if smtp_configured:
        try:
            smtp_message = SmtpEmailMessage()
            smtp_message["From"] = from_email
            smtp_message["To"] = message.to
            smtp_message["Subject"] = message.subject
            smtp_message["Reply-To"] = reply_to
            smtp_message.set_content(message.text or message.subject)
            smtp_message.add_alternative(message.html, subtype="html")
            for attachment in attachments:
                maintype, _, subtype = (attachment.content_type or "application/octet-stream").partition("/")
                smtp_message.add_attachment(
                    attachment.content,
                    maintype=maintype or "application",
                    subtype=subtype or "octet-stream",
                    filename=attachment.filename,
                )

            with smtplib.SMTP(mail_server, current_app.config["MAIL_PORT"], timeout=15) as smtp:
                if current_app.config.get("MAIL_USE_TLS"):
                    smtp.starttls()
                smtp.login(mail_username, mail_password)
                smtp.send_message(smtp_message)
            _email_attempt("email", purpose, recipient_user_id, masked_dst, template_name, "smtp", mode, "accepted")
            current_app.logger.info("[email smtp] %s accepted for %s", purpose, masked_dst)
            return CommunicationResult(
                channel="email", purpose=purpose, provider="smtp", mode=mode,
                status="accepted",
                recipient_user_id=recipient_user_id,
                masked_destination=masked_dst,
                template_name=template_name,
            )
        except smtplib.SMTPAuthenticationError:
            primary_error = "invalid_credentials"
            error_msg = "SMTP authentication failed. Check MAIL_USERNAME and MAIL_PASSWORD."
            current_app.logger.warning("[email smtp] authentication failed")
        except smtplib.SMTPException as exc:
            primary_error = "provider_error"
            error_msg = str(exc)[:200]
            current_app.logger.warning("[email smtp] delivery failed: %s", error_msg)
        except Exception as exc:
            primary_error = "provider_error"
            error_msg = str(exc)[:200]
            current_app.logger.warning("[email smtp] unexpected error: %s", error_msg)

    if not smtp_configured and not resend_key:
        primary_error = "missing_credentials"
        error_msg = "No email provider is configured. Set RESEND_API_KEY or SMTP settings."

    if not primary_error:
        primary_error = "provider_error"
        error_msg = "Email delivery failed — all providers attempted."

    _email_attempt("email", purpose, recipient_user_id, masked_dst, template_name, "none", mode, "failed", error_code=primary_error)
    return CommunicationResult(
        channel="email", purpose=purpose, provider="none", mode=mode,
        status="failed",
        error_code=primary_error,
        error_message=error_msg,
        retryable=True,
        recipient_user_id=recipient_user_id,
        masked_destination=masked_dst,
        template_name=template_name,
    )
