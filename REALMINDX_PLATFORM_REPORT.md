# RealMindX Platform Technical Report

Prepared: 1 June 2026  
Latest verification update: 2 June 2026  
Workspace: `D:\VS Code Projects\realmindx-overhaul`

## 1. Executive Summary

The current RealMindX overhaul is a unified Vite React frontend backed by a Flask API and PostgreSQL database. It contains the main RealMindX public website, a separately branded bookshop experience, user/applicant portal, admin control room, backend API, database migrations, email integration, file uploads, Paystack payment wiring, Turnstile support, staff permissions, and admin-managed public content.

The build now runs locally at:

- Frontend: `http://127.0.0.1:5173/`
- Backend API: `http://127.0.0.1:5000/api`

The main design direction is preserved: the main site shares one navbar/footer across public pages, auth pages, jobs, services, privacy, terms, contact, donation, admin login, and user login. The bookshop has its own navbar/footer and independent marketplace styling.

Important verification from this pass:

- `npm run build` passes.
- Alembic is at the latest migration head.
- Main public APIs return live admin-backed content.
- User and admin login work through the API and browser forms.
- Bookshop products now come from backend/admin data only in API mode, with no static demo products padding the catalog.
- Gallery, news, services, partners, people, hero slides, donation slides, flyers, and site copy are admin-managed API collections.

## 1.1 Latest Verification Update - 2 June 2026

The latest local pass confirmed the current app is still running and that the recent frontend/backend fixes are active.

Live local URLs:

- Frontend: `http://127.0.0.1:5173/`
- Backend health: `http://127.0.0.1:5000/health`
- Backend API base through Vite proxy: `http://127.0.0.1:5173/api`

Verified account smoke:

```text
admin@realmindxgh.com -> role=admin, verified=True
staff@realmindxgh.com -> role=staff, verified=True
teacher@realmindxgh.com -> role=user, verified=True, applications=0, alerts=None
customer@realmindxgh.com -> role=user, verified=True
admin/staff OTP resend -> bypassed
teacher/customer OTP -> required for new unverified public accounts
```

Verified admin/API content counts:

```text
admin dashboard=summary
admin services=12
admin gallery=6
admin news=3
admin products=2
admin categories=9
admin permissions=99
admin audit-logs=15+
admin settings=6
public services=12
public products=2
public products/categories=11
public gallery=6
public news=3
public flyers=1
public home-hero-slides=5
public donation-slides=5
public people=4
public partners=6
public site-copy=10
public delivery-zones=4
```

Latest UI/content fixes present in the current build:

- Homepage service modal now shows the whole service image using `object-fit: contain`, not a cropped banner.
- The service modal scrolls as one unit, so the image and text move together.
- Service modal includes the service-specific CTAs and the additional `View All Services` CTA.
- Bookshop flyer stripe overlay is optional and was verified off when not enabled.
- Bookshop product covers render as portrait covers.
- Bookshop product ratings show `No ratings yet` instead of unexplained bracketed numbers.
- Bookshop filter CTA is visible as a real navy button without hover.
- Bookshop login has its own footer and the `Sign Up` link is visible in gold.

Latest code checks:

```text
python -m compileall backend -> passed
database local seed -> passed
flask db upgrade -> passed against PostgreSQL
npm run build -> passed
GET http://127.0.0.1:5000/health -> {"service":"realmindx-api","status":"ok"}
all main route entry points -> HTTP 200
admin/teacher/customer login -> passed through Vite proxy
teacher profile-picture upload endpoint -> HTTP 201, then test profile reset clean
temporary QA staff account creation/deletion -> passed
```

Latest known verification caveat:

- The in-app browser automation tool was not exposed in this session, so the latest checks were performed through local HTTP/API/build smoke tests instead of browser clicking.
- No live Resend campaign or Paystack charge was triggered during this verification pass.
- A stray root `login.json` test artifact was removed because it shadowed the React `/login` route and exposed local test credentials.

## 2. Current Folder Structure

High-level structure:

```text
realmindx-overhaul/
  index.html
  package.json
  vite.config.js
  run-api.cmd
  src/
    main.jsx
    route-fixes.css
    lib/
      apiClient.js
      authClient.js
      demoAccounts.js
      managedContent.js
      siteContent.js
      TurnstileField.jsx
      useAdminContent.js
    assets/donation/
  realmindx-site/
    backend/
      __init__.py
      config.py
      cli.py
      default_content.py
      email_service.py
      extensions.py
      models.py
      security.py
      serializers.py
      upload_utils.py
      api/
        admin.py
        auth.py
        bookshop.py
        jobs.py
        oauth.py
        profile.py
        public.py
    migrations/
      versions/
    pages/
      AboutPage.jsx
      AdminPortalPage.jsx
      AuthPages.jsx
      ContactPage.jsx
      DonatePage.jsx
      JobsPage.jsx
      ServicesPage.jsx
      UserPortalPage.jsx
    assets/
      app.jsx
      components.jsx
      logo-white.png
      logo-navy-bg.png
      styles.css
      images/
    styles/
      pages.css
    uploads/
    requirements.txt
    wsgi.py
    gunicorn.conf.py
  realmindx-bookshop/
    BookshopApp.jsx
    catalog.jsx
    chrome.jsx
    pages-checkout.jsx
    pages-misc.jsx
    pages-product-cart.jsx
    pages-shop.jsx
    shared.jsx
    styles/bookshop.css
  docs/
    DEPLOYMENT.md
    EMAIL_DNS_NOTES.md
    INTEGRATION_DECISION.md
    LOCAL_TEST_RESULTS.md
    PAYMENTS_AND_DELIVERY_PLAN.md
    TASK_CHECKLIST.md
```

Generated or runtime folders/files also exist, including `dist/`, log files, screenshots, and local upload/runtime artifacts. These should not be treated as source except where explicitly useful for QA.

## 3. Frontend Architecture

The frontend is a single Vite React app.

Core entrypoint:

- `src/main.jsx`

Main website:

- Shared public layout and homepage sections: `realmindx-site/assets/app.jsx`
- Reusable icons/components: `realmindx-site/assets/components.jsx`
- Page-level components: `realmindx-site/pages/*.jsx`
- Main styling: `realmindx-site/assets/styles.css`, `realmindx-site/styles/pages.css`, `src/route-fixes.css`

Bookshop:

- Bookshop route shell: `realmindx-bookshop/BookshopApp.jsx`
- Bookshop chrome/navbar/footer/cart provider: `realmindx-bookshop/chrome.jsx`
- Bookshop catalog adapter: `realmindx-bookshop/catalog.jsx`
- Shop/home/filter pages: `realmindx-bookshop/pages-shop.jsx`
- Product/cart pages: `realmindx-bookshop/pages-product-cart.jsx`
- Checkout/order tracking: `realmindx-bookshop/pages-checkout.jsx`
- Bookshop auth/contact/legal/about pages: `realmindx-bookshop/pages-misc.jsx`
- Bookshop styling: `realmindx-bookshop/styles/bookshop.css`

Important integration decision:

- The designer output is React/JSX-based.
- The chosen path is React/Vite frontend plus Flask API backend.
- This keeps the designer components intact while allowing backend-driven data, auth, admin edits, uploads, email, and payments.

## 4. Frontend Routing

Main routes in `src/main.jsx`:

```text
/                         HomePage
/about                    AboutPage
/services                 ServicesPage
/contact                  ContactPage
/jobs                     JobsPage
/login                    UserLoginPage
/register                 User registration page
/signup                   Redirects to /register
/portal                   UserPortalPage
/admin                    Redirects to /admin/dashboard
/admin/login              AdminLoginPage
/admin/dashboard          AdminPortalPage
/admin/*                  AdminPortalPage
/bookshop/*               BookshopApp
/news                     Managed NewsListPage
/gallery                  Managed GalleryListPage
/privacy                  Managed main Privacy page
/terms                    Managed main Terms page
*                         NotFoundPage
```

Bookshop internal routes in `realmindx-bookshop/BookshopApp.jsx`:

```text
/bookshop                 Bookshop home
/bookshop/products        Product listing/shop
/bookshop/product/:id     Product detail
/bookshop/cart            Cart
/bookshop/checkout        Checkout
/bookshop/track           Track order
/bookshop/login           Bookshop login
/bookshop/signup          Bookshop signup
/bookshop/contact         Bookshop contact
/bookshop/about           Bookshop about
/bookshop/privacy         Bookshop privacy
/bookshop/terms           Bookshop terms
```

The bookshop keeps separate navbar/footer styling. Its privacy and terms pages are separate from main site privacy and terms content.

## 5. Backend Structure

Backend framework:

- Flask
- Flask-SQLAlchemy
- Flask-Migrate / Alembic
- Flask-Login
- Flask-WTF CSRF
- Flask-Limiter
- Flask-CORS
- PostgreSQL via psycopg

Backend app factory:

- `realmindx-site/backend/__init__.py`

Backend modules:

- `config.py`: environment-driven config.
- `extensions.py`: db, migrate, csrf, login manager, limiter, CORS.
- `models.py`: SQLAlchemy models.
- `serializers.py`: session/user JSON payloads.
- `security.py`: role/permission decorators, token helpers, Turnstile verification.
- `upload_utils.py`: upload validation/storage helpers.
- `email_service.py`: branded email rendering and Resend/SMTP delivery.
- `default_content.py`: seedable content for services, copy, partners, people, hero slides, donation slides.
- `cli.py`: seed admin/permissions commands.

API blueprints:

- `api/auth.py`: signup, login, logout, email verification, password reset, CSRF token.
- `api/oauth.py`: Google, Facebook, Microsoft, Apple callback scaffolding.
- `api/public.py`: contact, newsletter, services, site copy, public content.
- `api/jobs.py`: job listing, detail, applications, user application history, job alerts.
- `api/profile.py`: user profile and uploads.
- `api/bookshop.py`: products, categories/curricula, orders, reviews, Paystack, bulk orders.
- `api/admin.py`: admin dashboard and all management endpoints.

## 6. Backend API Routes

Public/auth/user/bookshop routes:

```text
GET    /health
GET    /uploads/<path:filepath>

GET    /api/auth/csrf-token
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/verify-email
POST   /api/auth/password-reset/request
POST   /api/auth/password-reset/confirm
GET    /api/auth/google
GET    /api/auth/google/callback
GET    /api/auth/facebook
GET    /api/auth/facebook/callback
GET    /api/auth/microsoft
GET    /api/auth/microsoft/callback
GET    /api/auth/apple
POST   /api/auth/apple/callback

GET    /api/jobs
GET    /api/jobs/<job_id>
POST   /api/jobs/<job_id>/apply
GET    /api/me/applications
GET    /api/me/job-alerts
PUT    /api/me/job-alerts
GET    /api/me/profile
PUT    /api/me/profile
POST   /api/me/uploads

GET    /api/products
GET    /api/products/<product_id>
GET    /api/products/categories
POST   /api/products/<product_id>/reviews
GET    /api/delivery-zones
POST   /api/orders
POST   /api/orders/<order_id>/paystack/initialize
POST   /api/paystack/webhook
POST   /api/bulk-orders

POST   /api/contact
POST   /api/newsletter
GET    /api/settings
GET    /api/services
GET    /api/site-copy
GET    /api/partners
GET    /api/people
GET    /api/home-hero-slides
GET    /api/donation-slides
GET    /api/flyers
GET    /api/news
GET    /api/gallery
GET    /api/resources
```

Admin routes:

```text
GET    /api/admin/dashboard

GET    /api/admin/jobs
POST   /api/admin/jobs
PUT    /api/admin/jobs/<job_id>
DELETE /api/admin/jobs/<job_id>

GET    /api/admin/applications
PUT    /api/admin/applications/<application_id>/status

GET    /api/admin/users
GET    /api/admin/staff
POST   /api/admin/staff
PUT    /api/admin/staff/<user_id>
DELETE /api/admin/staff/<user_id>
GET    /api/admin/permissions

GET    /api/admin/products
POST   /api/admin/products
PUT    /api/admin/products/<product_id>
DELETE /api/admin/products/<product_id>
POST   /api/admin/products/import
GET    /api/admin/products/export

GET    /api/admin/product-reviews
PUT    /api/admin/product-reviews/<review_id>
DELETE /api/admin/product-reviews/<review_id>

GET    /api/admin/categories
POST   /api/admin/categories
PUT    /api/admin/categories/<category_id>
DELETE /api/admin/categories/<category_id>

GET    /api/admin/delivery-zones
POST   /api/admin/delivery-zones
PUT    /api/admin/delivery-zones/<zone_id>
DELETE /api/admin/delivery-zones/<zone_id>

GET    /api/admin/orders
PUT    /api/admin/orders/<order_id>/status
DELETE /api/admin/orders/<order_id>

GET    /api/admin/flyers
POST   /api/admin/flyers
PUT    /api/admin/flyers/<flyer_id>
DELETE /api/admin/flyers/<flyer_id>

GET    /api/admin/news
POST   /api/admin/news
PUT    /api/admin/news/<news_id>
DELETE /api/admin/news/<news_id>

GET    /api/admin/gallery
POST   /api/admin/gallery
PUT    /api/admin/gallery/<item_id>
DELETE /api/admin/gallery/<item_id>

GET    /api/admin/resources
POST   /api/admin/resources
PUT    /api/admin/resources/<resource_id>
DELETE /api/admin/resources/<resource_id>

GET    /api/admin/messages
PUT    /api/admin/messages/<message_id>
POST   /api/admin/messages/<message_id>/reply
DELETE /api/admin/messages/<message_id>

GET    /api/admin/newsletters
PUT    /api/admin/newsletters/<subscriber_id>
DELETE /api/admin/newsletters/<subscriber_id>
POST   /api/admin/newsletters/send

GET    /api/admin/services
POST   /api/admin/services
PUT    /api/admin/services/<service_id>
DELETE /api/admin/services/<service_id>

GET    /api/admin/partners
POST   /api/admin/partners
PUT    /api/admin/partners/<partner_id>
DELETE /api/admin/partners/<partner_id>

GET    /api/admin/people
POST   /api/admin/people
PUT    /api/admin/people/<person_id>
DELETE /api/admin/people/<person_id>

GET    /api/admin/home-hero-slides
POST   /api/admin/home-hero-slides
PUT    /api/admin/home-hero-slides/<slide_id>
DELETE /api/admin/home-hero-slides/<slide_id>

GET    /api/admin/donation-slides
POST   /api/admin/donation-slides
PUT    /api/admin/donation-slides/<slide_id>
DELETE /api/admin/donation-slides/<slide_id>

GET    /api/admin/site-copy
POST   /api/admin/site-copy
PUT    /api/admin/site-copy/<copy_id>
DELETE /api/admin/site-copy/<copy_id>

GET    /api/admin/settings
PUT    /api/admin/settings/<key>
DELETE /api/admin/settings/<key>

POST   /api/admin/uploads
```

## 7. Database

Database name from `.env`: `realmindx`

Current database engine target:

- PostgreSQL

Migrations:

```text
0001_initial_schema.py
0002_bookshop_payments_delivery.py
0003_flyers.py
0004_product_source.py
0005_news_category.py
0006_product_curriculum.py
0007_product_metadata_reviews_flyer_options.py
0008_staff_permissions_and_admin_content.py
```

Alembic current status after verification:

```text
flask db upgrade -> no pending migrations
database engine -> PostgreSQLImpl
```

Tables:

```text
users
roles
permissions
role_permissions
staff_permissions
auth_identities
user_profiles
uploaded_files
jobs
job_applications
job_alert_preferences
products
product_categories
product_reviews
orders
order_items
delivery_zones
newsletter_subscribers
news
gallery_items
flyers
resources
contact_messages
site_settings
audit_logs
email_verification_tokens
password_reset_tokens
```

Important model coverage:

- Unified users with roles and direct staff permissions.
- OAuth identity linking through `auth_identities`.
- User profile and uploaded documents.
- Jobs, applications, and alert preferences.
- Products with category, curriculum, author, publisher, source, stock, quantity, tags, image, and pricing.
- Product reviews with moderation status.
- Bookshop orders with Paystack references, delivery zone, delivery fee, subtotal/total, and payment status.
- Contact messages for ticket-like handling.
- Editable site content through services, partners, people, hero slides, donation slides, site copy, news, gallery, resources, settings, and flyers.

## 8. Admin Console Features Completed

Admin dashboard:

- Summary cards for users, applications, orders, messages, products, newsletter subscribers.
- Recent job posts and recent orders panels.
- Quick actions for posting jobs, adding products, adding flyers, and writing news.

Management sections:

- Jobs
- Applications
- Users
- Staff accounts
- Staff permissions
- Products
- Product reviews
- Product categories
- Delivery zones
- Flyers
- Orders
- News
- Gallery
- Resources
- Contact messages
- Newsletters
- Job alerts placeholder/readiness panel
- Services
- Partner logos
- The People/team cards
- Homepage hero slides
- Donation slides
- Page text/site copy
- Contact and site details

Admin UX improvements:

- Add/edit flows are modal-based for managed collections.
- Sidebar clickable areas are widened.
- Sidebar contrast has been improved.
- Empty states use friendlier wording.
- Dashboard stats show `0` rather than `-` when a count is empty.
- Product create form includes category selection and optional new category name.
- Product create form includes curriculum, author, publisher, supplier/source, image, stock, tags, and featured fields.
- Product batch import is available.
- Product export is available in CSV, XLSX, and PDF.
- Newsletter composer supports title, subject, preheader, CTA, body, and hero image.
- Contact messages can be replied to from admin, sending an email response.

Staff permissions currently supported:

```text
manage_jobs
view_applications
manage_applications
manage_users
manage_products
manage_orders
manage_news
manage_gallery
manage_resources
view_messages
manage_newsletters
manage_settings
manage_admins
```

Access checks are enforced server-side with `@login_required` plus `@permission_required(...)`, `@admin_required`, or `@admin_or_staff_required`.

## 9. User Portal Features Completed

Frontend:

- User login page.
- Separate user registration page at `/register`.
- User portal dashboard at `/portal`.
- Profile area.
- Documents area.
- Application history area.
- Job alerts area.
- Settings area.
- Auth-aware redirect so admin/staff accounts do not render as teacher accounts.

Backend/API:

- Signup
- Login
- Logout
- Email verification token model and endpoint
- Password reset request and confirm endpoints
- Profile read/update
- User uploads
- Job application submission
- Application history
- Job alert preference read/update

Current local test user:

```text
Email: teacher@realmindxgh.com
Password: Teacher@12345
Role: user
Status: verified
```

## 10. Bookshop Features Completed

Frontend:

- Dedicated bookshop navbar and footer.
- Bookshop home.
- Admin-managed flyer slideshow.
- Product listing.
- Product detail page.
- Product search/filter/sort layout.
- Grid/list product views.
- Cart.
- Checkout.
- Order tracking page.
- Contact/enquiry page.
- Newsletter signup.
- Separate bookshop login and signup pages.
- Separate bookshop privacy and terms pages.
- WhatsApp floating action.
- Dynamic category/curriculum marquee.
- Product ratings display as ratings, not fake bracket numbers.
- Product review empty state shows “No ratings yet”.
- Related products prefer the same publisher, then same category.
- “Add to Cart” wording is used.

Backend/API:

- Product list/detail endpoints.
- Dynamic product category endpoint includes product categories and curricula.
- Product category creation/update/delete.
- Product import/export.
- Product reviews with moderation.
- Order creation.
- Bulk order request.
- Delivery zones.
- Paystack payment initialization.
- Paystack webhook.

Important change from this pass:

- In API mode the bookshop no longer falls back to the 20 static sample products once the backend is enabled. It shows exactly the backend/admin product set.

Current backend product count verified locally:

```text
products=2
```

## 11. Main Site Features Completed

Public pages:

- Home
- About
- Services
- Contact
- Jobs
- News
- Gallery
- Donate
- Privacy
- Terms
- User login/register
- Admin login

Shared main-site chrome:

- Main navbar/footer shared across main-site pages.
- Bookshop excluded from the main navbar/footer layout and uses its own chrome.
- Footer copyright year is automatic in code.

Admin-managed public content:

- Services
- Service images
- Service modal content
- Homepage services strip
- News posts
- Gallery posts
- Partner logos
- People/team section
- Homepage hero slides
- Donation slides
- Site copy/page text
- Main privacy and terms copy
- Bookshop privacy and terms copy through site-copy keys
- Contact/site details

Services behavior:

- Homepage services strip is clickable and can be manually advanced.
- Services page supports hash anchors.
- The scroll sync was corrected so manual scrolling updates the active service rather than snapping back to the initially chosen hash.
- Service modal content is sourced from the same service records as the full services page.

Gallery/news:

- Homepage content is backed by actual published gallery/news items.
- Gallery page renders published gallery items with images.
- News page renders published news items.

Contact:

- Contact form posts to backend.
- Admin notification email is sent.
- Sender receives acknowledgement email.
- Contact message is stored as an admin-visible ticket-like record.
- Admin reply endpoint sends email back to the sender.
- Google Maps embed for Dome Pillar 2 is implemented on the contact page.

## 12. Email Setup

Email delivery code:

- `realmindx-site/backend/email_service.py`

Delivery behavior:

- Resend is used first when `RESEND_API_KEY` is set.
- SMTP fallback is available when `MAIL_SERVER`, `MAIL_USERNAME`, and `MAIL_PASSWORD` are configured.
- Email shell is branded with RealMindX logo/header and social/footer structure.
- Reply-to uses configured reply address.

Environment variables involved:

```text
DEFAULT_FROM_EMAIL
DEFAULT_REPLY_TO_EMAIL
JOBS_FROM_EMAIL
BOOKSHOP_FROM_EMAIL
NEWSLETTER_FROM_EMAIL
ADMIN_CC_EMAIL
RESEND_API_KEY
MAIL_SERVER
MAIL_PORT
MAIL_USE_TLS
MAIL_USERNAME
MAIL_PASSWORD
BASE_URL
BOOKSHOP_URL
```

Zoho/Resend split:

- Zoho remains the human mailbox provider.
- Resend is used for app-generated mail.
- Replies are configured to go back to the Zoho inbox via reply-to.
- DNS records must not be changed blindly. If Resend asks for DNS changes, document them and merge SPF into one TXT record if Zoho already has SPF.

Email triggers currently wired:

- Email verification.
- Password reset.
- Contact admin alert.
- Contact acknowledgement.
- Admin reply to contact message.
- Newsletter signup confirmation.
- Newsletter campaign.
- Job application received.
- Job alerts.
- Bookshop order admin notification.
- Bookshop order customer confirmation.
- Bulk order enquiry.
- Staff invitation/account email path.

What was not done in this pass:

- I did not send a new live test email because that would hit real inboxes. Code and env presence were verified; previous user screenshots showed Resend delivery activity.

## 13. Paystack Setup

Paystack environment variables:

```text
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
VITE_PAYSTACK_PUBLIC_KEY
```

Implemented:

- Order creation stores order totals and payment state.
- `POST /api/orders/<order_id>/paystack/initialize` creates a Paystack transaction.
- Paystack callback URL is environment-derived.
- `POST /api/paystack/webhook` is implemented.
- Webhook signature verification is implemented using HMAC SHA-512 and `x-paystack-signature`.
- Successful payment updates order payment status and references.

Not fully verified in this pass:

- No live Paystack payment was executed.
- Webhook was code-inspected and route-listed, not exercised with a signed Paystack event.

Delivery fee support:

- `delivery_zones` table exists.
- Public `/api/delivery-zones` endpoint exists.
- Admin delivery zone endpoints exist.
- Current local delivery zone count is `4`, seeded as starter examples.
- The real production delivery-location list and final fees still need to be entered by admin before launch.

## 14. Auth State

Auth backend:

- Session-based auth through Flask-Login.
- Password hashing with Werkzeug.
- CSRF token endpoint and CSRF headers for mutating API calls.
- Roles: `admin`, `staff`, `user`.
- Permissions are stored in DB and enforced server-side.
- Social auth scaffolding exists through `auth_identities`.

Auth frontend:

- `src/lib/authClient.js`
- User login page.
- Separate registration page.
- Admin login page.
- Google and Facebook buttons are present where appropriate.
- Apple login logo was removed from user-facing auth UI.
- Terms/privacy agreement gate exists for registration/social auth flow.
- Login now guards against wrong role sessions: admin credentials do not become a teacher portal session, and user credentials do not become an admin session.

Local test accounts:

```text
Admin
Email: admin@realmindxgh.com
Password: Admin@12345
Role: admin

Staff
Email: staff@realmindxgh.com
Password: Staff@12345
Role: staff

Teacher/User
Email: teacher@realmindxgh.com
Password: Teacher@12345
Role: user

Bookshop Customer/User
Email: customer@realmindxgh.com
Password: Customer@12345
Role: user
```

Account verification rules:

- Admin and staff accounts are created/invited by admins and do not require OTP.
- Public teacher/customer accounts require email OTP verification at signup and before login if still unverified.
- The seeded teacher/customer test accounts are verified locally so they can be used immediately for testing.

HTTP auth smoke tests passed:

- Admin login through `/api/auth/login` with role `admin`.
- Teacher login through `/api/auth/login` with role `user`.
- Customer login through `/api/auth/login` with role `user`.
- Admin/staff OTP resend returns the expected bypass message.

## 15. File Upload System

Upload backend:

- `realmindx-site/backend/upload_utils.py`
- Admin upload endpoint: `POST /api/admin/uploads`
- User upload endpoint: `POST /api/me/uploads`
- Upload metadata stored in `uploaded_files`.
- Files are stored under `UPLOAD_FOLDER`.
- File category and visibility are tracked.
- Public upload serving route exists for public files.
- `secure_filename` is used.
- File extension validation is configured.
- Max upload size is controlled by `MAX_UPLOAD_MB`.

Upload use cases covered:

- Profile pictures.
- CVs.
- Certificates.
- Product images.
- Gallery images.
- News images.
- Resource files.
- Flyer images.
- Service images.
- Partner logos.
- Team/person photos.
- Homepage hero slides.
- Donation slides.
- Newsletter hero images.

Current image fitting support:

- Flyer image fit and position controls exist.
- Other images generally use CSS object-fit rules.

Pending improvement:

- A true image cropper UI for every upload type is not yet implemented. The current system supports upload, fit, position, and display; full manual crop/preview tooling should be a later dedicated pass.

## 16. Environment Variables

Root frontend `.env` names:

```text
VITE_API_BASE_URL
VITE_TURNSTILE_SITE_KEY
VITE_PAYSTACK_PUBLIC_KEY
```

Backend `.env` names found:

```text
SECRET_KEY
DATABASE_URL
BASE_URL
BOOKSHOP_URL
API_URL
CORS_ORIGINS
RATELIMIT_STORAGE_URI
SESSION_COOKIE_SECURE
UPLOAD_FOLDER
DEFAULT_FROM_EMAIL
ADMIN_CC_EMAIL
DEFAULT_REPLY_TO_EMAIL
JOBS_FROM_EMAIL
BOOKSHOP_FROM_EMAIL
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_FIRST_NAME
ADMIN_LAST_NAME
RESEND_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID
FACEBOOK_APP_ID
FACEBOOK_APP_SECRET
APPLE_CLIENT_ID
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
TURNSTILE_SECRET_KEY
NEWSLETTER_FROM_EMAIL
```

Note:

- Values are intentionally not documented here.
- The pasted Resend key must be treated as sensitive and should not be committed or repeated in docs.

## 17. Local Run Commands

From workspace root:

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Backend:

```powershell
cd "D:\VS Code Projects\realmindx-overhaul\realmindx-site"
.\.venv\Scripts\python.exe -m flask --app backend:create_app db upgrade
.\.venv\Scripts\python.exe -m flask --app backend:create_app seed-permissions
.\.venv\Scripts\python.exe -m flask --app backend:create_app seed-admin
```

Current convenience launcher:

```powershell
cd "D:\VS Code Projects\realmindx-overhaul"
.\run-api.cmd
```

Current verified local listeners:

```text
127.0.0.1:5000  Flask API
127.0.0.1:5173  Vite frontend
```

## 18. Security State

Implemented:

- Password hashing.
- Flask-Login sessions.
- HTTP-only session cookie config.
- SameSite=Lax.
- `SESSION_COOKIE_SECURE` environment-controlled.
- CSRF protection.
- CSRF retry handling in frontend API client.
- Role-based access control.
- Permission-based admin routes.
- Upload type restrictions.
- Upload max-size config.
- Turnstile verification helper.
- Rate limiter extension configured.
- Paystack webhook signature verification.
- No secrets should be committed.

Needs production attention:

- Set `SESSION_COOKIE_SECURE=True` on HTTPS production.
- Confirm `RATELIMIT_STORAGE_URI` points to Redis or another durable limiter store in production.
- Confirm Cloudflare Turnstile site key and secret are paired correctly.
- Keep Zoho DNS intact when adding any Resend records.
- Review CORS origins before VPS deployment.
- Add production logging/monitoring for auth failures, upload errors, webhook failures, and email failures.
- Add automated backend tests for permissions and CSRF.

## 19. Turnstile Setup

Frontend:

- `TurnstileField.jsx` loads Cloudflare Turnstile.
- Forms pass `turnstile_token` to the backend.

Backend:

- `security.py` verifies tokens through Cloudflare.
- Public forms wired with Turnstile include signup, contact, newsletter, bookshop order/checkout, and bookshop contact/enquiry.

Needed provider-side steps:

1. In Cloudflare Turnstile, create a site for:
   - `realmindxgh.com`
   - `www.realmindxgh.com`
   - `bookshop.realmindxgh.com`
   - `localhost` / `127.0.0.1` if local testing should enforce Turnstile.
2. Put the site key in root `.env` as `VITE_TURNSTILE_SITE_KEY`.
3. Put the secret key in backend `.env` as `TURNSTILE_SECRET_KEY`.
4. Restart both Vite and Flask after changing keys.

## 20. Known Issues and Current Gaps

Important current gaps:

- Delivery zones are implemented but current local count is `0`. Admin must add location names and fees before checkout can calculate real delivery charges.
- A full image cropper is not implemented yet. Uploads work, and flyers have fit/position controls, but advanced crop UI is pending.
- OAuth provider buttons/scaffolding exist, but Google/Facebook/Microsoft/Apple were not fully exercised locally in this pass.
- Apple auth routes still exist in backend scaffolding, even though Apple UI was removed. This is harmless but can be removed later if Apple is fully out of scope.
- Product reviews are implemented and moderated, but strict verified-buyer-only enforcement should be strengthened before production.
- Live Paystack payment was not executed in this pass.
- Live Resend email was not sent in this pass.
- The frontend bundle is large because of imported large images and single-bundle structure. It builds, but code-splitting/image optimization should be a production polish pass.
- The user portal has API support for real data, but some presentation areas still use local/demo-style defaults when API data is empty.
- Admin console is much more usable now, but a final beginner-user copy pass would still help simplify labels like “Page Text” and clarify batch import instructions.

## 21. Deployment Readiness Checklist

Before VPS deployment:

- Confirm PostgreSQL database and user exist on VPS.
- Copy production `.env` to backend only.
- Set `SESSION_COOKIE_SECURE=True`.
- Set production `BASE_URL`, `BOOKSHOP_URL`, and `API_URL`.
- Confirm `CORS_ORIGINS`.
- Confirm `SECRET_KEY` is strong and private.
- Confirm `RESEND_API_KEY` is production key.
- Confirm Zoho mailbox DNS remains intact.
- Confirm Resend DNS records are documented and SPF is merged, not duplicated.
- Confirm Paystack production keys.
- Configure Paystack webhook URL.
- Add delivery zones in admin.
- Add real products/categories/curricula.
- Add real services/news/gallery/team/partner content.
- Confirm Turnstile site/secret keys.
- Configure upload directory permissions.
- Add Nginx reverse proxy.
- Add HTTPS certificate.
- Run migrations on VPS.
- Seed admin securely.
- Run frontend build.
- Serve built `dist` via Nginx or equivalent.
- Run Gunicorn for Flask API.
- Add process manager such as systemd.
- Add backup plan for PostgreSQL and uploads.

## 22. Exact Tests Run in This Pass

Build:

```powershell
npm run build
```

Result:

- Passed.
- Warnings:
  - React Router module-level `"use client"` directive ignored by Vite.
  - `apiClient.js` is both dynamically and statically imported.
  - Main JS chunk is over 500 kB.
  - Several images are large.

Migration status:

```powershell
cd realmindx-site
.\.venv\Scripts\python.exe -m flask --app backend:create_app db upgrade
```

Result:

```text
No pending migrations. Alembic used PostgreSQLImpl.
```

Public API smoke:

```text
services=12
products=2
products/categories=11
gallery=6
news=3
flyers=1
home-hero-slides=5
donation-slides=5
people=4
partners=6
site-copy=10
delivery-zones=4
```

Auth/API smoke:

```text
admin=admin@realmindxgh.com, role=admin, verified=True
staff=staff@realmindxgh.com, role=staff, verified=True
teacher=teacher@realmindxgh.com, role=user, verified=True, applications=0, alerts=None
customer=customer@realmindxgh.com, role=user, verified=True
admin_otp_message=Internal admin and staff accounts do not use OTP verification.
teacher_otp_message=This email is already verified.
```

Route checks:

- `/`, `/services`, `/about`, `/news`, `/gallery`, `/contact`, `/login`, `/register`, `/bookshop`, `/bookshop/products`, `/bookshop/login`, and `/admin/login` returned HTTP 200 from Vite.
- `/login` was repaired after removing a stray root `login.json` artifact that shadowed the React route.

Upload/API checks:

- Teacher profile endpoint loaded through `/api/me/profile`.
- Teacher applications endpoint returned `0`.
- Teacher profile-picture upload returned HTTP 201 with an uploaded public URL; the test profile picture link was then reset to keep the test account clean.
- Temporary QA staff account was created with product permissions and deleted successfully.

Bookshop product catalog verification after the fallback patch:

```text
Showing 2 of 2 results
Cambridge Primary English Reader
Mathematics JHS 1
hasDemo=false
```

## 23. Recommendation on Bookshop Backend Separation

A separate bookshop backend is not needed right now.

The best current approach is one shared Flask backend with a dedicated bookshop blueprint and shared database because:

- Admin manages bookshop products/orders from the same admin console.
- Users, orders, newsletters, files, and email delivery share infrastructure.
- Paystack, Turnstile, uploads, and audit logs do not need duplication.
- Deployment is simpler on the VPS.

The bookshop should remain visually separate at the frontend level, not operationally separate at the database/API level.

## 24. Immediate Next Work

Recommended next tasks:

1. Replace starter delivery zones with the real location list and final fees.
2. Test one Paystack transaction end to end with a test key and signed webhook.
3. Send one controlled Resend test for contact, order, verification, and newsletter templates.
4. Add a production-grade cropper component for all image upload fields.
5. Add backend tests for admin permissions, CSRF, product import/export, order payment updates, and contact replies.
6. Add route-level code splitting and compress/replace oversized hero/donation images.
7. Run a final mobile browser pass on homepage, services, bookshop, checkout, admin, and user portal.
8. Perform a beginner-admin usability pass on labels, helper text, and forms.
9. Wire the frontend Turnstile widgets into every protected public form with the live site key.
10. Exercise public signup OTP with a real Turnstile token and a controlled inbox.
