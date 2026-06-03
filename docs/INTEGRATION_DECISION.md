# RealMindX Integration Decision

## Current Finding

The delivered design output is React/JSX component-based. It includes separate main-site pages and a separate RealMindX Bookshop experience with its own navbar and footer.

## Decision for This Phase

Use a Vite React frontend shell for the current design integration phase.

Reasons:

- The pages are already JSX and map cleanly into React routes.
- The bookshop can remain visually separate through its existing `BookshopNavbar` and `BookshopFooter`.
- This lets us validate page routing, responsive behavior, and link flow before introducing backend complexity.
- A Flask API backend can be added next without throwing away the frontend work.

## Route Map Implemented

- `/`
- `/about`
- `/services`
- `/contact`
- `/jobs`
- `/login`
- `/register`
- `/signup` redirects to `/register`
- `/portal`
- `/admin/login`
- `/admin/dashboard`
- `/bookshop`
- `/bookshop/products`
- `/bookshop/category/:categorySlug`
- `/bookshop/search?q=...`
- `/bookshop/product/:id`
- `/bookshop/products/:id`
- `/bookshop/cart`
- `/bookshop/order-confirmation`
- `/bookshop/order-success`
- `/bookshop/bulk`
- `/bookshop/bulk-orders`
- `/news`
- `/gallery`
- `/resources`
- `/donate`
- `/privacy`
- `/terms`

## Backend Direction

The Flask API now lives under `realmindx-site/backend` with PostgreSQL, Flask-Migrate, session auth, RBAC, upload handling, email services, admin APIs, bookshop order APIs, delivery zones, and a Paystack integration scaffold.

The React frontend still uses the designer JSX as the visual source of truth. Public dynamic sections and the admin console are wired through a local managed-content layer for immediate visual/admin testing, while the Flask APIs are available for the permanent database-backed data path.
