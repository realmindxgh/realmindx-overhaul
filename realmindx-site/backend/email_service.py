import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as SmtpEmailMessage
from html import escape

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
    Responsive, branded email shell.
    - Mobile-first: single-column, readable at 320 px
    - Brand: navy #0b1d38, gold accent #f2bd00
    - Logo: text-based so it renders in all email clients without image-blocking issues
    - Warm, professional tone in content; template adds no copy
    """
    base_url = current_app.config["BASE_URL"].rstrip("/")
    bookshop_url = current_app.config.get("BOOKSHOP_URL", f"{base_url}/bookshop")

    # Resolve CTA URL to absolute
    if cta_url and not cta_url.startswith(("http://", "https://")):
        cta_url = f"{base_url}/{cta_url.lstrip('/')}"

    hero = ""
    if hero_image_url:
        abs_hero = absolute_app_url(hero_image_url)
        hero = f"""
        <tr>
          <td style="padding:0;">
            <img src="{escape(abs_hero, quote=True)}" alt="" width="680"
                 style="display:block;width:100%;max-height:280px;object-fit:cover;" />
          </td>
        </tr>"""

    cta = ""
    if cta_label and cta_url:
        cta = f"""
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px;">
          <tr>
            <td style="border-radius:8px;background:#ffcc01;">
              <a href="{escape(cta_url, quote=True)}"
                 style="display:inline-block;padding:14px 28px;color:#0a1e3d;font-weight:800;
                        font-family:Arial,Helvetica,sans-serif;font-size:15px;
                        text-decoration:none;letter-spacing:.02em;border-radius:8px;">
                {escape(cta_label)} &rarr;
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
        f'<p style="margin:14px 0 0;color:#93a8c8;font-size:12px;">{escape(footer_note)}</p>'
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
      .logo-text{{font-size:20px!important}}
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
            <td class="email-header" style="background:#143670;padding:28px 32px;border-bottom:4px solid #ffcc01;">

              <!-- Logo: image + text fallback -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:22px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="{base_url}/logo-white.png" alt="RealMindX" width="40" height="40"
                         style="display:inline-block;width:40px;height:40px;border-radius:6px;
                                background:#ffcc01;vertical-align:middle;" />
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span class="logo-text"
                          style="font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:22px;
                                 color:#ffffff;letter-spacing:-0.5px;white-space:nowrap;">
                      RealMindX
                    </span>
                    <span style="display:block;font-family:Arial,Helvetica,sans-serif;color:#ffcc01;
                                 font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">
                      Education
                    </span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;color:#ffcc01;font-family:Arial,Helvetica,sans-serif;
                         font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;">
                {safe_eyebrow}
              </p>
              <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                          font-size:26px;line-height:1.2;font-weight:900;">
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
                       font-size:13px;color:#93a8c8;line-height:1.7;">
              <p style="margin:0 0 6px;font-weight:800;color:#ffffff;font-size:14px;">
                RealMindX Education Limited
              </p>
              <p style="margin:0 0 12px;">
                Dome Pillar 2, Accra, Ghana &nbsp;&bull;&nbsp;
                <a href="mailto:info@realmindxgh.com"
                   style="color:#f2bd00;text-decoration:none;">info@realmindxgh.com</a>
                &nbsp;&bull;&nbsp;
                <a href="tel:+233558039190" style="color:#93a8c8;text-decoration:none;">
                  +233 55 803 9190
                </a>
              </p>
              <p style="margin:0;">
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
            # Fall through to SMTP or disabled path below

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
