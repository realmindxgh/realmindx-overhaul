# RealMindX Build Checklist

## Phase 1: Frontend Foundation

- [x] Inspect current directory and design output.
- [x] Choose React/Vite frontend shell for the current JSX design output.
- [x] Add local Vite app entrypoint.
- [x] Wire main website routes.
- [x] Wire user auth and portal routes.
- [x] Wire admin login and dashboard routes.
- [x] Wire bookshop routes with separate bookshop navbar and footer.
- [x] Add real support, legal, account, and enquiry routes for modules that do not have full backend workflows yet.
- [x] Run local build and route smoke test.
- [x] Repair main-site shell conflicts so routed pages share the homepage navbar, footer, logo, and colours.
- [x] Repair bookshop shell conflicts while preserving its separate navbar and footer.
- [x] Replace visible emoji glyphs and placeholder logo/image treatments with proper icons and RealMindX assets.
- [x] Review mobile navigation and routed-page rendering with local browser screenshots.

## Phase 2: Backend Foundation

- [x] Create Flask app package under `realmindx-site/backend`.
- [x] Add PostgreSQL configuration through environment variables.
- [x] Add SQLAlchemy models for users, roles, permissions, jobs, products, orders, content, messages, uploads, and audit logs.
- [x] Add Flask-Migrate/Alembic migrations.
- [x] Add seed command for first admin.
- [x] Add session auth, password hashing, email verification, and password reset.
- [x] Add RBAC helpers for admin/staff permissions.
- [x] Add file upload validation and protected upload paths.

## Phase 3: Public Site APIs

- [x] Contact form endpoint with validation, rate limiting, and admin email alert.
- [x] Newsletter endpoint with duplicate handling and confirmation email.
- [x] News, gallery, resources, and settings APIs.
- [x] Replace public frontend placeholders with admin-managed seed content where the public route is dynamic.
- [x] Add optional Turnstile verification to public endpoints once keys are available.

## Phase 4: Jobs and User Portal

- [x] Job listing and detail APIs.
- [x] User registration and profile completion APIs.
- [x] CV, certificate, profile image, and document uploads.
- [x] Job application flow.
- [x] Application status tracking.
- [x] Job alert preferences.
- [x] Job matching and email alert dispatch.

## Phase 5: Bookshop

- [x] Product categories and products APIs.
- [x] Product image uploads.
- [x] Product search and filters backed by database queries.
- [x] Cart/order request API.
- [x] Order reference generation.
- [x] Delivery-zone fee model and public delivery-zone API.
- [x] Admin delivery-zone CRUD endpoints for location-based delivery pricing.
- [x] Paystack initialization endpoint and webhook handler scaffold.
- [x] Customer and admin order emails.
- [x] Bulk order enquiry endpoint.
- [x] Newsletter integration for bookshop.

## Phase 6: Admin Portal

- [x] Dashboard summary API.
- [x] Manage jobs and applications.
- [x] Manage users, staff accounts, roles, and permissions.
- [x] Manage products, categories, and orders.
- [x] Manage news, gallery, resources, messages, newsletters, job alerts, and site settings.
- [x] Add audit logs for admin actions.

## Phase 7: Email and Security

- [x] Add Resend-first email service with SMTP fallback.
- [x] Keep Zoho MX/SPF/DKIM/DMARC intact.
- [x] Document Resend DNS record-capture process before any records are added.
- [x] Document SPF merge requirement if Resend requires SPF for the root domain.
- [x] Add CSRF protection where needed.
- [x] Add rate limiting to auth and public forms.
- [x] Add backend Turnstile enforcement hook for signup, contact, newsletter, order, and bulk enquiry forms.
- [x] Add frontend Turnstile widget rendering after site key is provided.
- [x] Add production session cookie settings.

## Phase 8: Deployment Readiness

- [x] Add production `.env` template.
- [x] Add Gunicorn config.
- [x] Add Nginx config notes.
- [x] Add VPS setup instructions.
- [x] Add database backup plan.
- [x] Run full local smoke checklist before deployment handoff; provider-backed email delivery and Turnstile require production keys.

## Phase 9: Current Hardening Pass - 2 June 2026

- [x] Verify homepage service modal shows the whole image instead of a cropped banner.
- [x] Verify service modal image and text scroll together as one modal surface.
- [x] Verify service modal includes service-specific CTAs and a `View All Services` CTA.
- [x] Verify admin and teacher test accounts authenticate through the Vite API proxy.
- [x] Verify teacher account has zero backend applications and cannot access admin endpoints.
- [x] Verify admin-managed public collections load from API: services, gallery, news, products, categories, partners, people, hero slides, donation slides, flyers, and page text.
- [x] Verify staff-management and audit-log endpoints are full-admin-only.
- [x] Verify bookshop flyer overlay is optional, product covers are portrait, ratings are readable, filter CTA is visible, and bookshop auth/footer contrast is acceptable.
- [x] Re-run backend Python compile checks.
- [x] Re-run permission seeding.
- [x] Re-run frontend production build.
- [x] Update the comprehensive platform report with current tests, caveats, accounts, endpoints, and remaining work.
- [ ] Add real delivery-zone fee rows once the official RealMindX delivery locations and charges are supplied.
- [ ] Run a signed Paystack webhook test and one full Paystack test transaction.
- [ ] Run controlled live Resend email sends for every email template after confirming final sender identities.
- [ ] Add production-grade image crop/position tooling for every upload field.
- [ ] Add automated backend tests for auth, permissions, product import/export, Paystack, public forms, and contact replies.
- [ ] Add frontend route-level code splitting and optimise large hero/donation assets.
