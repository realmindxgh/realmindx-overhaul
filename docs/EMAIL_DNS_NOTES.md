# RealMindX Email and DNS Notes

Zoho Mail is the human mailbox provider for `info@realmindxgh.com`. Do not remove or replace existing Zoho MX, SPF, DKIM, or DMARC records when adding app email.

The app email service is Resend-first, then SMTP fallback:

- Default app sender: `RealMindX <notifications@realmindxgh.com>`
- Jobs sender: `RealMindX Jobs <jobs@realmindxgh.com>`
- Bookshop sender: `RealMindX Bookshop <bookshop@realmindxgh.com>`
- Reply-To: `info@realmindxgh.com`

Before adding Resend DNS records, copy the exact DNS values from the Resend dashboard and record them here. Do not guess the include value.

SPF caution:

- There must be only one SPF TXT record for `realmindxgh.com`.
- If Zoho already has an SPF TXT record and Resend asks for SPF on the same host, merge both providers into one record.
- Example structure only, not final values: `v=spf1 include:<zoho-value> include:<resend-value> ~all`
- Use the exact include values from Zoho and Resend.

Required environment variables:

```env
DEFAULT_FROM_EMAIL=RealMindX <notifications@realmindxgh.com>
DEFAULT_REPLY_TO_EMAIL=info@realmindxgh.com
JOBS_FROM_EMAIL=RealMindX Jobs <jobs@realmindxgh.com>
BOOKSHOP_FROM_EMAIL=RealMindX Bookshop <bookshop@realmindxgh.com>
RESEND_API_KEY=
MAIL_SERVER=
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=
MAIL_PASSWORD=
```
