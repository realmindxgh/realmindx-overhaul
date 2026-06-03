# Local Test Results

Date: 2026-05-25

## Local Runtime

- Frontend: `http://127.0.0.1:5173`
- Flask API: `http://127.0.0.1:5000`
- Local PostgreSQL dev cluster: `127.0.0.1:55432`
- Database: `realmindx`
- User: `realmindx`
- Data directory: `.local-pg/data`

The workspace-local PostgreSQL cluster is ignored by Git through `.local-pg/`.

## Test Accounts

- Admin: `admin@realmindxgh.com` / `Admin@12345`
- User: `teacher@realmindxgh.com` / `Teacher@12345`

Both accounts exist in the local PostgreSQL database and are also accepted by the frontend demo login flow.

## Passed Checks

- `npm run build`
- `python -m compileall -q backend wsgi.py`
- `flask --app backend:create_app routes`
- Frontend route smoke for public pages, auth pages, portal pages, admin routes, and bookshop routes.
- API health check: `GET /health`
- CSRF-protected API login for admin and user accounts.
- Admin create flow for product category, product, and job post.
- Public read flow for jobs and products.
- User profile and job alert read flow.
- User job application flow.
- Admin dashboard and application management flow.
- Public contact form endpoint.
- Public newsletter endpoint.
- Bookshop order endpoint.
- Bookshop delivery-zone smoke: admin created a delivery zone, public delivery-zone API returned it, and order total included delivery fee.
- Paystack initialization endpoint returned the expected `503` JSON response while local Paystack keys are intentionally blank.
- Bookshop bulk order endpoint.
- Admin update flow for product, job, application status, and order status.
- Admin delete flow for product category.
- Source audit for visible emoji glyphs and non-input placeholder scaffolding.
- Desktop and mobile screenshot QA for main-site shell, contact page, login pages, bookshop home, bookshop product listing, and bookshop account/enquiry pages.
- Fresh screenshot QA after shell repair: homepage and about page share the same navbar/logo/Donate treatment; bookshop keeps its independent navbar/footer, real logo, clickable icon marquee, and side-by-side hero actions.
- Local Node toolchain repair: `node_modules/@esbuild/win32-x64/esbuild.exe` was a broken small shim, while `gesbuild.exe` was the valid binary. Replacing the shim locally restored `npm run build`.

## Provider-Backed Checks

These are wired but require real provider keys before production verification:

- Resend delivery with domain DNS records. Local config now has a live Resend key loaded from ignored `.env`, but no live email send was triggered during this pass.
- SMTP fallback through Zoho credentials.
- Cloudflare Turnstile challenge verification with production site and secret keys.
- Live Paystack transaction initialization, callback, and webhook confirmation after `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` are provided.
- Final delivery-fee zone list after RealMindX provides the official location/fee table.

Zoho DNS records must stay intact. If Resend asks for SPF, merge SPF includes into one TXT record instead of creating a second SPF record.
