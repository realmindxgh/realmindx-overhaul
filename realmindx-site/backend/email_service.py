import smtplib
from dataclasses import dataclass
from decimal import Decimal
from email.message import EmailMessage as SmtpEmailMessage
from html import escape
from urllib.parse import urlsplit

import requests
from flask import current_app


@dataclass
class OutboundEmail:
    to: str
    subject: str
    html: str
    text: str = ""
    from_email: str | None = None
    reply_to: str | None = None


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


def _email_contact_settings():
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

        rows = SiteSetting.query.filter(
            SiteSetting.key.in_(list(defaults.keys()))
        ).all()
        values = {row.key: row.value for row in rows}
    except Exception:
        values = {}

    contact_email = str(values.get("contact_email") or defaults["contact_email"]).strip()
    contact_phone = str(
        values.get("contact_phone_1")
        or values.get("primary_phone")
        or defaults["contact_phone_1"]
    ).strip()
    contact_address = str(
        values.get("contact_address")
        or values.get("address")
        or defaults["contact_address"]
    ).strip()
    weekday_hours = str(values.get("working_hours_weekday") or defaults["working_hours_weekday"]).strip()
    saturday_hours = str(values.get("working_hours_saturday") or defaults["working_hours_saturday"]).strip()
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
    delivery_fee = Decimal(str(getattr(order, "delivery_fee", 0) or 0))
    total_amount = Decimal(str(getattr(order, "total_amount", 0) or (subtotal + delivery_fee)))

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
    site_origin = _url_origin(base_url) or base_url
    logo_url = f"{site_origin}/logo-white.png"
    contact = _email_contact_settings()

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
            <td style="border-radius:8px;background:#ffcc01;">
              <a href="{escape(cta_url, quote=True)}"
                 style="display:inline-block;padding:14px 32px;color:#143670;font-weight:800;
                        font-family:Arial,Helvetica,sans-serif;font-size:15px;
                        text-decoration:none;letter-spacing:.02em;border-radius:8px;">
                {escape(cta_label)}
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
  <title>{safe_title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:600px){{
      .email-wrapper{{padding:12px 8px!important}}
      .email-card{{border-radius:12px!important}}
      .email-header{{padding:24px 20px!important}}
      .email-body{{padding:24px 20px 20px!important;font-size:15px!important}}
      .email-footer{{padding:20px!important}}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;">
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
    footer_note=None,
):
    """
    Responsive, branded email shell for RealMindX Bookshop emails.
    White logo band at top (bookshop-logo.png renders without blend-mode issues),
    navy #143670 title band, gold #ffcc01 accent — works in all email clients.
    """
    base_url = current_app.config["BASE_URL"].rstrip("/")
    bookshop_url = current_app.config.get("BOOKSHOP_URL", f"{base_url}/bookshop").rstrip("/")
    bookshop_origin = _url_origin(bookshop_url) or _url_origin(base_url) or bookshop_url
    logo_url = f"{bookshop_origin}/bookshop-logo.png"
    contact = _email_contact_settings()

    if cta_url and not cta_url.startswith(("http://", "https://")):
        cta_url = f"{bookshop_url}/{cta_url.lstrip('/')}"

    cta = ""
    if cta_label and cta_url:
        cta = f"""
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 8px;">
          <tr>
            <td style="border-radius:8px;background:#ffcc01;">
              <a href="{escape(cta_url, quote=True)}"
                 style="display:inline-block;padding:14px 32px;color:#143670;font-weight:800;
                        font-family:Arial,Helvetica,sans-serif;font-size:15px;
                        text-decoration:none;letter-spacing:.02em;border-radius:8px;">
                {escape(cta_label)}
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
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;">
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
                RealMindX Bookshop
              </p>
              <p style="margin:0 0 4px;color:#53657d;font-size:12px;text-align:center;">
                Part of RealMindX Education Limited
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
              <p style="margin:0;text-align:center;">
                <a href="{bookshop_url}" style="color:#143670;text-decoration:none;">Bookshop</a>
                &nbsp;&middot;&nbsp;
                <a href="{base_url}" style="color:#143670;text-decoration:none;">Main Site</a>
                &nbsp;&middot;&nbsp;
                <a href="https://web.facebook.com/profile.php?id=61566941171883" style="color:#143670;text-decoration:none;">Facebook</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.instagram.com/realmindxgh/" style="color:#143670;text-decoration:none;">Instagram</a>
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


def send_email(message: OutboundEmail):
    from_email = message.from_email or current_app.config["DEFAULT_FROM_EMAIL"]
    reply_to = message.reply_to or current_app.config["DEFAULT_REPLY_TO_EMAIL"]
    resend_key = current_app.config.get("RESEND_API_KEY")

    if resend_key:
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                json={
                    "from": from_email,
                    "to": [message.to],
                    "subject": message.subject,
                    "html": message.html,
                    "text": message.text or message.subject,
                    "reply_to": reply_to,
                },
                timeout=15,
            )
            response.raise_for_status()
            return {"provider": "resend", "status": "sent", "id": response.json().get("id")}
        except Exception as exc:
            current_app.logger.warning("Resend delivery failed (%s): %s -> %s", exc, message.subject, message.to)

    mail_server = current_app.config.get("MAIL_SERVER")
    mail_username = current_app.config.get("MAIL_USERNAME")
    mail_password = current_app.config.get("MAIL_PASSWORD")

    if mail_server and mail_username and mail_password:
        smtp_message = SmtpEmailMessage()
        smtp_message["From"] = from_email
        smtp_message["To"] = message.to
        smtp_message["Subject"] = message.subject
        smtp_message["Reply-To"] = reply_to
        smtp_message.set_content(message.text or message.subject)
        smtp_message.add_alternative(message.html, subtype="html")

        with smtplib.SMTP(mail_server, current_app.config["MAIL_PORT"], timeout=15) as smtp:
            if current_app.config.get("MAIL_USE_TLS"):
                smtp.starttls()
            smtp.login(mail_username, mail_password)
            smtp.send_message(smtp_message)
        return {"provider": "smtp", "status": "sent"}

    current_app.logger.info("Email disabled locally: %s -> %s", message.subject, message.to)
    return {"provider": "disabled", "status": "skipped"}
