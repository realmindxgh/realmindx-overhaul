# Bookshop Data Schema

> **Read this before creating or modifying a local Bookshop backend.**
> Do not invent curriculum or level values. Do not hard-code local taxonomy IDs. Do not create seed data that uses labels not present in the production schema. Do not change exam-picks rules without updating this document and tests.

---

## 1. Product Table

**Table name:** `products`  
**Model class:** `Product` (`realmindx-site/backend/models.py:261`)  
**Primary key:** `id` (`Integer`, auto-increment)

### Column reference

| Column | Attribute | Type | Nullable | Default | Indexed | Filtered | Notes |
|---|---|---|---|---|---|---|---|
| `id` | `id` | `Integer`, PK | NO | auto | PK | no | |
| `category_id` | `category_id` | `Integer`, FK→`product_categories.id` | YES | — | yes | yes | |
| `name` | `name` | `String(180)` | NO | — | yes | via free-text search | |
| `slug` | `slug` | `String(220)` | NO | — | yes | no | **Unique** |
| `price` | `price` | `Numeric(12,2)` | NO | — | no | `min_price`, `max_price` | |
| `old_price` | `old_price` | `Numeric(12,2)` | YES | — | no | no | sale/compare-at price |
| `short_description` | `short_description` | `String(300)` | YES | — | no | via text search | |
| `full_description` | `full_description` | `Text` | YES | — | no | via text search | |
| `image_file_id` | `image_file_id` | `Integer`, FK→`uploaded_files.id` | YES | — | no | no | original uploaded image |
| `image_original_file_id` | `image_original_file_id` | `Integer`, FK→`uploaded_files.id` | YES | — | no | no | variant: original |
| `image_medium_file_id` | `image_medium_file_id` | `Integer`, FK→`uploaded_files.id` | YES | — | no | no | variant: medium |
| `image_thumb_file_id` | `image_thumb_file_id` | `Integer`, FK→`uploaded_files.id` | YES | — | no | no | variant: thumbnail |
| `stock_status` | `stock_status` | `String(30)` | NO | `'in_stock'` | yes | `in_stock` param | values: `in_stock`, `low_stock`, `out_of_stock` |
| `quantity_available` | `quantity_available` | `Integer` | YES | — | no | no | |
| `subject` | `subject` | `String(160)` | YES | — | yes | `subject` param | free-text, matched via alias ILIKE |
| `level` | `level` | `String(120)` | YES | — | yes | `level` param | free-text, matched via alias ILIKE |
| `curriculum` | `curriculum` | `String(160)` | YES | — | yes | `curriculum` param | free-text, matched via alias ILIKE |
| `author` | `author` | `String(180)` | YES | — | yes | no | |
| `publisher` | `publisher` | `String(180)` | YES | — | yes | `publisher` param | exact match |
| `product_type` | `product_type` | `String(120)` | YES | — | no | no | e.g. `physical`, `digital` |
| `source` | `source` | `String(180)` | YES | — | no | no | admin-only supplier field |
| `featured` | `featured` | `Boolean` | NO | `False` | no | no | always sorted first |
| `delivery_note` | `delivery_note` | `String(255)` | YES | — | no | via text search | |
| `tags` | `tags` | `JSON` | NO | `[]` | no | via text search | stored as JSON array |
| `is_active` | `is_active` | `Boolean` | NO | `True` | no | yes | **every public query filters `is_active=True`** |
| `created_at` | `created_at` | `DateTime(tz)` | NO | `utcnow()` | no | no | inherited from `TimestampMixin` |
| `updated_at` | `updated_at` | `DateTime(tz)` | NO | `utcnow()` | no | no | onupdate=`utcnow()` |

### Relationships

- `category` → `ProductCategory` (`category_id`)
- `image_file` → `UploadedFile` (`image_file_id`)
- `image_original_file` → `UploadedFile` (`image_original_file_id`)
- `image_medium_file` → `UploadedFile` (`image_medium_file_id`)
- `image_thumb_file` → `UploadedFile` (`image_thumb_file_id`)
- `reviews` → `ProductReview` (backref)
- `items` → `OrderItem` (backref)

### Source files

- Model definition: `realmindx-site/backend/models.py:261`
- Migrations: `realmindx-site/migrations/versions/0001_initial_schema.py`, `0004_product_source.py`, `0006_product_curriculum.py`, `0007_product_metadata_reviews_flyer_options.py`, `0043_product_image_variants.py`
- API serializer: `realmindx-site/backend/serializers.py:133` (`product_json()`)

---

## 2. Curriculum Schema

**Storage type:** `String(160)`, nullable, free-text (no enum, no FK, no constraint on values).

### Canonical values (admin form `PRODUCT_CURRICULUM_OPTIONS`)

Source: `realmindx-site/pages/AdminPortalPage.jsx:216`

| Slug / ID | Canonical value | Stored as |
|---|---|---|
| `ges-nacca-curriculum` | `GES / NaCCA Curriculum` | `'GES / NaCCA Curriculum'` or `'GES'` |
| `tvet-ctvet-curriculum` | `TVET / CTVET Curriculum` | `'TVET / CTVET Curriculum'` |
| `cambridge-international-curriculum` | `Cambridge International Curriculum` | `'Cambridge International Curriculum'` |
| `british-english-national-curriculum` | `British / English National Curriculum` | `'British / English National Curriculum'` |
| `pearson-edexcel-pathway` | `Pearson Edexcel Pathway` | `'Pearson Edexcel Pathway'` |
| `international-baccalaureate-curriculum` | `International Baccalaureate (IB) Curriculum` | `'International Baccalaureate (IB) Curriculum'` |
| `american-curriculum` | `American Curriculum` | `'American Curriculum'` |
| `montessori-curriculum` | `Montessori Curriculum` | `'Montessori Curriculum'` |
| `oxford-international-curriculum` | `Oxford International Curriculum` | `'Oxford International Curriculum'` |

Plus three special values:

| Value | Purpose | ID |
|---|---|---|
| `''` (blank) | Select prompt / no curriculum | — |
| `'All Curricula'` | "Any curriculum" marker | `all-curricula` |
| `'Other Curricula'` | Catch-all for unlisted curricula | `other-curricula` |

### Storage notes

- **Values vary by environment** — local SQLite seed data uses `'GES Standard'` and `'WASSCE'`; production PostgreSQL uses `'GES / NaCCA Curriculum'` and `'GES'`. The alias system (`taxonomy_filter_terms`) normalizes these.
- **Blank and null are distinct:** `NULL` means "not set"; `''` (empty string) means "no curriculum selected on form". Both are excluded from curriculum-based filters.
- **Alias groups** (in `bookshopSearchAliases.json`) map the canonical values to the alias ILIKE terms used by the backend search API. For example, `ges-nacca-curriculum` aliases include `GES`, `NaCCA`, `WAEC`, `BECE books`, `WASSCE books`.

### Source files

- Admin form options: `realmindx-site/pages/AdminPortalPage.jsx:216` (`PRODUCT_CURRICULUM_OPTIONS`)
- Frontend constants: `src/lib/teachingOptions.js:36` (`TEACHING_CURRICULA`)
- Alias groups: `src/lib/bookshopSearchAliases.json` (curriculum section)
- Alias resolution (backend): `realmindx-site/backend/bookshop_search.py:124` (`taxonomy_filter_terms`)

---

## 3. Level Schema

**Storage type:** `String(120)`, nullable, free-text (no enum, no FK, no constraint on values).

### Canonical values (admin form `PRODUCT_LEVEL_OPTIONS`)

Source: `realmindx-site/pages/AdminPortalPage.jsx:216`

| Slug / ID | Canonical value | Stored as |
|---|---|---|
| `early-childhood-daycare` | `Early Childhood / Daycare` | `'Early Childhood / Daycare'` |
| `pre-school-nursery` | `Pre-School / Nursery` | `'Pre-School / Nursery'` |
| `kindergarten` | `Kindergarten` | `'Kindergarten'` or `'KG'` |
| `lower-primary` | `Lower Primary` | `'Lower Primary'` |
| `upper-primary` | `Upper Primary` | `'Upper Primary'` |
| `junior-high-lower-secondary` | `Junior High / Lower Secondary` | `'Junior High / Lower Secondary'` or `'JHS'` |
| `senior-high-upper-secondary` | `Senior High / Upper Secondary` | `'Senior High / Upper Secondary'` or `'SHS'` |
| `sixth-form-pre-university` | `Sixth Form / Pre-University` | `'Sixth Form / Pre-University'` |
| `tvet-vocational` | `TVET / Vocational` | `'TVET / Vocational'` |

Plus three special values:

| Value | Purpose | ID |
|---|---|---|
| `''` (blank) | Select prompt / no level | — |
| `'All Levels'` | "Any level" marker | `all-levels` |
| `'Other Levels'` | Catch-all for unlisted levels | `other-levels` |

### Storage notes

- **Values vary by environment** — local SQLite seed data uses `'JHS'`, `'SHS'`, `'Primary'`; production PostgreSQL uses `'Junior High / Lower Secondary'`, `'Senior High / Upper Secondary'`, `'Lower Primary'`, `'Upper Primary'`, etc.
- **Blank and null are distinct:** `NULL` means "not set"; `''` means "no level selected on form". Both are excluded from level-based filters.

### Source files

- Admin form options: `realmindx-site/pages/AdminPortalPage.jsx:216` (`PRODUCT_LEVEL_OPTIONS`)
- Frontend constants: `src/lib/teachingOptions.js:22` (`TEACHING_LEVELS`)
- Alias groups: `src/lib/bookshopSearchAliases.json` (level section)

---

## 4. Exam-Picks Rules

### Combined BECE + WASSCE Picks

```
(curriculum matches GES/NaCCA AND level matches Junior High/Lower Secondary)
OR
(curriculum matches GES/NaCCA AND level matches Senior High/Upper Secondary)
```

**API query:**
```
GET /api/products?exam_picks=1&page=1&per_page=10&sort=newest
```

The `exam_picks=1` parameter applies the combined filter via `exam_picks_filter()` in `bookshop_search.py`. This helper uses `taxonomy_filter_terms` to expand the canonical aliases:
- curriculum: `ges-nacca-curriculum` → `['GES / NaCCA Curriculum', 'GES', 'NaCCA', ...]`
- JHS level: `junior-high-lower-secondary` → `['Junior High / Lower Secondary', 'JHS', ...]`
- SHS level: `senior-high-upper-secondary` → `['Senior High / Upper Secondary', 'SHS', ...]`

### Exclusion rules

A product must NOT be included if:

| Condition | Reason |
|---|---|
| `curriculum = 'All Curricula'` | Not specific to GES/NaCCA |
| `level = 'All Levels'` | Not specific to JHS or SHS |
| `curriculum IS NULL` or `curriculum = ''` | No curriculum set |
| `level IS NULL` or `level = ''` | No level set |
| `curriculum NOT LIKE '%GES%' AND curriculum NOT LIKE '%NaCCA%'` | Wrong curriculum |
| `level NOT LIKE '%Junior High%' AND level NOT LIKE '%Senior High%'` | Wrong level |
| Name, tag, or description contains BECE, WASSCE, JHS, or SHS | Must use structured fields only |

### Homepage section

- Eyebrow: `EXAM SEASON`
- Heading: `BECE & WASSCE picks`
- Link: `Browse the Catalogue` → `/collections/exam-picks`
- Limit: max 10 products (2 rows at widest desktop)
- Fetched via `GET /api/products?exam_picks=1&per_page=10&sort=newest`

### View All page

- Route: `/collections/exam-picks`
- Component: `ExamPicksPage` — full `ShopPage` with `examPicks={true}` prop
- Same pagination as main shop (mobile batch 10, desktop batch 40, infinite scroll)
- Backend query: `GET /api/products?exam_picks=1&page=1&per_page=<batch>&sort=<sort>`

### Production data (as of July 2026)

| Metric | Count |
|---|---|
| Total active products | 215 |
| GES/NaCCA + JHS (BECE-eligible) | 30 |
| GES/NaCCA + SHS (WASSCE-eligible) | 10 |
| Combined exam-picks total | 40 |

### Source files

- Backend filter helper: `realmindx-site/backend/bookshop_search.py` (`exam_picks_filter()`)
- Backend API handler: `realmindx-site/backend/api/bookshop.py:458` (exam_picks logic in `list_products`)
- HomePage fetch: `realmindx-bookshop/pages-shop.jsx` (`examQs` at line 470)
- Non-API fallback: `realmindx-bookshop/pages-shop.jsx` (client-side filter)
- View All wrapper: `realmindx-bookshop/pages-shop.jsx` (`ExamPicksPage`)
- ShopPage support: `realmindx-bookshop/pages-shop.jsx` (`examPicks` prop)
- Route definition: `realmindx-bookshop/urls.js` (exam-catalogue → `/collections/exam-picks`)

---

## 5. Environment Differences

### Local SQLite vs Production PostgreSQL

| Aspect | SQLite (local) | PostgreSQL (production) | Impact |
|---|---|---|---|
| Case sensitivity | `LIKE` is case-insensitive for ASCII; SQLAlchemy `ilike` generates `lower(col) LIKE lower(pattern)` | `ILIKE` is natively case-insensitive | Same behaviour via SQLAlchemy abstraction |
| Boolean storage | `0`/`1` integer | `TRUE`/`FALSE` boolean | SQLAlchemy handles transparently |
| JSON column | Stored as text; SQLAlchemy `JSON` type works | Native `json` type | `tags` column works on both; avoid direct JSON string comparison |
| Enum support | No native enum | Has `CREATE TYPE ... AS ENUM` | Not used — all taxonomy fields are `String` columns |
| Auto-increment | `INTEGER PRIMARY KEY` auto-increments | `SERIAL` or `IDENTITY` | Handled transparently |
| Null ordering | NULLs sort first (default) | NULLs sort last (default) | Not relevant for application queries |
| `ALTER TABLE` | Requires batch mode in migrations | Supports non-blocking DDL | Migrations use `batch_alter_table` for SQLite compatibility |
| Foreign keys | Not enforced by default (`PRAGMA foreign_keys=OFF`) | Enforced | Local DB may allow orphan FKs |

### Critical warnings

1. **Do not hard-code numeric taxonomy IDs.** Curriculum and level values are free-text strings, not foreign-key references to enum tables. The numeric IDs produced by `slugify()` in local seed code will differ from production values.

2. **Do not hard-code local curriculum values.** Local seed data may use short codes (`'GES Standard'`, `'WASSCE'`, `'JHS'`, `'SHS'`) while production uses full canonical names (`'GES / NaCCA Curriculum'`, `'Junior High / Lower Secondary'`). Always use the **canonical display names** or the **alias IDs** (`ges-nacca-curriculum`, `junior-high-lower-secondary`, `senior-high-upper-secondary`) in queries.

3. **ILIKE matching is broad.** The backend's `taxonomy_filter_terms` expands a canonical value into all aliases and matches via `ILIKE '%term%'`. For example, `curriculum=ges-nacca-curriculum` expands to `'GES'`, which matches `'GES Standard'` AND `'GES / NaCCA Curriculum'`. This is intentional but can produce unexpected matches if a curriculum name contains a substring of another value.

4. **JSON arrays:** The `tags` column is a JSON array (`[]` by default). Do not compare with `tags = '[]'` — use `json_array_length(tags) = 0` (PostgreSQL) or equivalent.

---

## 6. Seed-Data Requirements

For local Bookshop testing, seed data must include:

### Required records

| Product | `curriculum` | `level` | `is_active` | `stock_status` | Purpose |
|---|---|---|---|---|---|
| **GES Junior High** | `GES / NaCCA Curriculum` (or `GES Standard`) | `Junior High / Lower Secondary` (or `JHS`) | `True` | `in_stock` | BECE Picks |
| **GES Senior High** | `GES / NaCCA Curriculum` (or `GES Standard`) | `Senior High / Upper Secondary` (or `SHS`) | `True` | `in_stock` | WASSCE Picks |
| All Curricula + JHS | `All Curricula` | `Junior High / Lower Secondary` (or `JHS`) | `True` | `in_stock` | Exclusion test |
| GES + All Levels | `GES / NaCCA Curriculum` (or `GES Standard`) | `All Levels` | `True` | `in_stock` | Exclusion test |
| All Curricula + All Levels | `All Curricula` | `All Levels` | `True` | `in_stock` | Exclusion test |
| Cambridge + JHS | `Cambridge International Curriculum` | `Junior High / Lower Secondary` (or `JHS`) | `True` | `in_stock` | Exclusion test |
| Cambridge + SHS | `Cambridge International Curriculum` | `Senior High / Upper Secondary` (or `SHS`) | `True` | `in_stock` | Exclusion test |
| GES + Primary | `GES / NaCCA Curriculum` (or `GES Standard`) | `Upper Primary` (or `Primary`) | `True` | `in_stock` | Exclusion test |
| GES + Sixth Form | `GES / NaCCA Curriculum` (or `GES Standard`) | `Sixth Form / Pre-University` | `True` | `in_stock` | Exclusion test |
| No curriculum | `NULL` or `''` | `Junior High / Lower Secondary` (or `JHS`) | `True` | `in_stock` | Exclusion test |
| No level | `GES / NaCCA Curriculum` (or `GES Standard`) | `NULL` or `''` | `True` | `in_stock` | Exclusion test |
| **Inactive product** | `GES / NaCCA Curriculum` (or `GES Standard`) | `Senior High / Upper Secondary` (or `SHS`) | `False` | `in_stock` | Must not appear in public queries |
| **Out-of-stock product** | `GES / NaCCA Curriculum` (or `GES Standard`) | `Senior High / Upper Secondary` (or `SHS`) | `True` | `out_of_stock` | `in_stock` filter test |
| **Newest product** | Any | Any | `True` | `in_stock` | Sort/newest test |

### Sample seed script

Production-grade seed data is available at:
`realmindx-site/scripts/seed_test_products.py`

Run it from `realmindx-site/` with:
```powershell
$env:DATABASE_URL = "sqlite:///$PWD/realmindx_local.db"
$env:FLASK_APP = "backend:create_app"
$env:FLASK_ENV = "development"
& .venv\Scripts\python.exe scripts\seed_test_products.py
```

---

## 7. API Response Shapes

### `GET /products` (paginated)

**Query parameters** — see the full table in the backend source at `realmindx-site/backend/api/bookshop.py:430`.

**Paginated response:**
```json
{
  "items": [ /* product objects */ ],
  "total": 142,
  "page": 1,
  "per_page": 40
}
```

**Non-paginated response:**
```json
{
  "items": [ /* product objects */ ]
}
```

### Product object (from `product_json()`)

Source: `realmindx-site/backend/serializers.py:133`

```json
{
  "id": 1,
  "name": "Core Mathematics for WASSCE",
  "slug": "core-maths-wassce",
  "category": "Textbooks",
  "category_id": 1,
  "category_slug": "textbooks",
  "category_bulk_discount_percent": 5.0,
  "bulk_min_qty": 10,
  "price": 95.00,
  "old_price": 120.00,
  "short_description": "A comprehensive WASSCE mathematics textbook.",
  "full_description": "Detailed explanation with practice questions...",
  "image_url": "/uploads/images/product.jpg",
  "image_url_original": "/uploads/images/product_original.jpg",
  "image_url_medium": "/uploads/images/product_medium.jpg",
  "image_url_thumb": "/uploads/images/product_thumb.jpg",
  "image_file_id": 1,
  "image_original_file_id": 2,
  "image_medium_file_id": 3,
  "image_thumb_file_id": 4,
  "stock_status": "in_stock",
  "quantity_available": 150,
  "subject": "Mathematics",
  "level": "Senior High / Upper Secondary",
  "curriculum": "GES / NaCCA Curriculum",
  "author": "A. A. Asare",
  "publisher": "Aki-Ola Publications",
  "product_type": "physical",
  "featured": false,
  "delivery_note": null,
  "tags": ["popular", "wassce"],
  "rating_average": 4.2,
  "rating_count": 15,
  "is_active": true,
  "status": "published",
  "updated_at": "2026-07-20T12:00:00+00:00"
}
```

When `include_private=True` (admin context), an additional field is included:

```json
{
  "source": "Supplier Name"
}
```

### `GET /products/suggestions`

Response: `{ "items": [ { "id", "name", "slug", "price", "image_url_thumb", "author" } ] }`

### Homepage sections

Fetched via three parallel API calls:
- `?sort=newest&per_page=10`
- `?curriculum=ges-nacca-curriculum&level=junior-high-lower-secondary&per_page=10&sort=newest`
- `?curriculum=ges-nacca-curriculum&level=senior-high-upper-secondary&per_page=10&sort=newest`

### Taxonomy metadata

`GET /products/filters` returns aggregate counts:
```json
{
  "subjects": [{ "name": "Mathematics", "count": 25 }],
  "levels": [{ "name": "Senior High / Upper Secondary", "count": 13 }],
  "curricula": [{ "name": "GES / NaCCA Curriculum", "count": 181 }],
  "publishers": [{ "name": "Aki-Ola Publications", "count": 5 }],
  "max_price": 250.00,
  "total": 200
}
```

### View All exam listings

Each is a full `ShopPage` rendered with the exam-picks filters pre-applied. Uses the same pagination as the shop (mobile batch: 10, desktop batch: 40).

---

## 8. Local-Backend Compatibility Checklist

Before claiming a local backend is compatible with the production schema, verify all of the following:

- [ ] **Schema:** The `products` table has all columns listed in Section 1 (especially `curriculum`, `level`, `is_active`, `tags` as JSON).
- [ ] **Canonical taxonomy values:** The `curriculum` and `level` columns store values from the canonical lists in Sections 2-3 (or at least values that the alias system can resolve).
- [ ] **Response shapes:** All API endpoints (`GET /products`, single product, suggestions, filters) return the exact JSON shapes documented in Section 7.
- [ ] **Pagination:** `page`+`per_page` params return `{ items, total, page, per_page }`. Test both pages and out-of-range pages.
- [ ] **Visibility rules:** Every public endpoint enforces `is_active=True`. Inactive products never appear in any listing, pick, or suggestion.
- [ ] **Exam-picks logic:** `?curriculum=ges-nacca-curriculum&level=junior-high-lower-secondary` returns only GES/NaCCA + JHS/Lower Secondary products. The WASSCE equivalent returns only GES/NaCCA + SHS/Upper Secondary products.
- [ ] **Null handling:** Products with `NULL` or `''` curriculum/level are excluded from curriculum/level-filtered queries. They still appear in unfiltered listings.
- [ ] **Seed coverage:** The local database includes at minimum the seed records listed in Section 6 (exclusion test cases).
- [ ] **API routes:** The following endpoints exist:
  - `GET /products` — product search/list
  - `GET /products/<id>` — single product
  - `GET /products/suggestions` — autocomplete
  - `GET /products/filters` — taxonomy aggregate counts
  - `POST /products/batch` — batch lookup by ID array
- [ ] **ILike behaviour:** `taxonomy_filter_terms` uses SQLAlchemy `.ilike()` (case-insensitive `LIKE`). Verify that curriculum values containing `"GES"` are matched by a `ges-nacca-curriculum` alias query.

---

## 9. Admin-Issued Sales Invoices

Admin users with `orders.create` permission can issue payable sales invoices from the Receipts & Invoices area. These records use `cart_invoices` with `source='admin'`; ordinary saved-cart invoices continue to use `source='cart'`.

### Line-item rules

- A catalogue line stores its current `product_id`, product name, quantity, and the unit price approved by the admin.
- An off-catalogue line stores `product_id=NULL` plus a required `product_name`, quantity, unit price, and optional description. No `products` record or image is required.
- Every newly generated cart or admin sales invoice stores the receiving individual(s) or organisation in `customer_name`; this name appears in the online preview, email greeting, and invoice PDF.
- Admin sales-invoice and manual-order lines automatically receive a 10% bulk discount when one line reaches 10 copies. The server calculates and freezes the gross subtotal, bulk discount, exact delivery fee, and total; the dashboard preview mirrors that calculation.
- Public payment requests never accept replacement item prices or totals.
- When payment is confirmed, every line is copied to an `OrderItem`; an off-catalogue line remains valid with `product_id=NULL`.

### State and payment rules

- New records start with `status='issued'` (or `emailed` after accepted delivery) and `payment_status='unpaid'`.
- Online payment starts only through `POST /invoices/<invoice_id>/paystack/initialize`. The ordinary cart checkout rejects admin-issued invoice IDs.
- A successful Paystack verification or an authorised admin-recorded offline payment creates one tracked order, marks the invoice `converted` and `paid`, and enables its receipt.
- A paid invoice cannot be voided. Voiding an unpaid invoice keeps the record, actor, timestamp, and required reason.
- An initialized online payment blocks offline recording and voiding until it is reconciled, preventing conflicting payment paths.

### Related tables and endpoints

| Area | Details |
|---|---|
| `cart_invoices` | Customer, fulfilment, currency, payment state, issue/expiry, creator, conversion, and void metadata |
| `cart_invoice_items` | Snapshot name, optional description, quantity, price, and nullable catalogue `product_id` |
| `bookshop_payment_intents` | Nullable `cart_invoice_id` links Paystack attempts to their immutable invoice snapshot |
| Admin API | `GET /admin/invoices/options`, `POST /admin/invoices`, `POST /admin/invoices/<id>/record-payment`, `POST /admin/invoices/<id>/void` |
| Public API | `GET /invoices/<invoice_id>`, `GET /invoices/<invoice_id>/pdf`, `POST /invoices/<invoice_id>/paystack/initialize` |
| Migration | `realmindx-site/migrations/versions/0063_admin_sales_invoices.py` |

---

## 10. Admin-Created Manual Orders

Admins and staff with `orders.create` permission can create a normal tracked order from the Bookshop Orders dashboard. These orders use `orders.source='admin'`, preserve the creating user in `created_by_id`, and can include catalogue or off-catalogue lines. Off-catalogue lines require only a title, unit price, and quantity and store `product_id=NULL`.

The admin-only `payment_option` is one of `partially_paid`, `fully_paid`, or `payment_on_delivery`. `amount_paid` and `balance_due` are server-calculated from the frozen order total. Public checkout does not expose or accept these administrative payment options.

Admin-created orders use the ordinary order tracking, delivery assignment, invoice/receipt, customer email, and customer SMS paths. The supplied email, receiving name, and phone are also upserted into the deduplicated Bookshop contact record. The schema is introduced by `realmindx-site/migrations/versions/0064_admin_manual_orders.py`.

---

## 11. Source References

Every claim in this document traces to a source file. The key references:

| Claim | Source file | Line(s) |
|---|---|---|
| Product model columns | `realmindx-site/backend/models.py` | 261–294 |
| Product JSON serializer | `realmindx-site/backend/serializers.py` | 133–179 |
| List products API | `realmindx-site/backend/api/bookshop.py` | 430–506 |
| Suggestions API | `realmindx-site/backend/api/bookshop.py` | 528–542 |
| Filters API | `realmindx-site/backend/api/bookshop.py` | 519–556 |
| Batch API | `realmindx-site/backend/api/bookshop.py` | 573–598 |
| Admin form options | `realmindx-site/pages/AdminPortalPage.jsx` | 216+ |
| Frontend taxonomy constants | `src/lib/teachingOptions.js` | 22–45 |
| Search alias groups | `src/lib/bookshopSearchAliases.json` | entire file |
| Taxonomy normalization | `src/lib/bookshopTaxonomy.js` | 588–636 |
| Backend alias resolution | `realmindx-site/backend/bookshop_search.py` | 124–133 |
| API response mapper | `realmindx-bookshop/catalog.jsx` | 76–119 |
| HomePage exam-picks fetches | `realmindx-bookshop/pages-shop.jsx` | 473–474 |
| Non-API fallback filter | `realmindx-bookshop/pages-shop.jsx` | 500–501 |
| View All wrapper components | `realmindx-bookshop/pages-shop.jsx` | BECEPicksPage, WASSCEPicksPage |
| Route definitions | `realmindx-bookshop/urls.js` | bece-picks, wassce-picks |
| Migration (curriculum) | `realmindx-site/migrations/versions/0006_product_curriculum.py` | entire |
| Migration (author/publisher) | `realmindx-site/migrations/versions/0007_product_metadata_reviews_flyer_options.py` | entire |
| Migration (image variants) | `realmindx-site/migrations/versions/0043_product_image_variants.py` | entire |
| Seed script | `realmindx-site/scripts/seed_test_products.py` | entire |

---

## 11. Agent Guidance

> **AGENTS.md entry:**
> `docs/BOOKSHOP_DATA_SCHEMA.md` documents the exact Bookshop product data model, API shapes, taxonomy values, exam-picks rules, environment differences, and seed requirements.
>
> Read it before creating or modifying a local Bookshop backend.
> Do not invent curriculum or level values.
> Do not hard-code local taxonomy IDs.
> Do not create seed data using labels not present in the production schema.
> Do not change exam-picks rules without updating this document and the test suite.
