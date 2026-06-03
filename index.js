/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          REALMINDX FRONTEND — CODEX INTEGRATION GUIDE           ║
 * ║                                                                  ║
 * ║  All pages and components are complete React/JSX.               ║
 * ║  Wire up routing, auth context, and API calls to activate them. ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ── CSS IMPORTS (add to your main entry file) ─────────────────────
 *
 *   import './styles/pages.css';                 // main site pages
 *   import './bookshop/styles/bookshop.css';     // bookshop
 *
 *   Google Fonts (in <head> or CSS @import):
 *   Montserrat:wght@700;800;900
 *   Arimo:wght@400;500;600
 *   JetBrains+Mono:wght@400
 *
 *
 * ── MAIN SITE PAGES ───────────────────────────────────────────────
 *
 *   Route            Component                File
 *   /about           AboutPage                pages/AboutPage.jsx
 *   /services        ServicesPage             pages/ServicesPage.jsx
 *   /contact         ContactPage              pages/ContactPage.jsx
 *   /login           UserLoginPage            pages/AuthPages.jsx
 *   /register        UserLoginPage (mode)     pages/AuthPages.jsx
 *   /admin/login     AdminLoginPage           pages/AuthPages.jsx
 *   /jobs            JobsPage                 pages/JobsPage.jsx
 *   /portal          UserPortalPage           pages/UserPortalPage.jsx
 *   /admin           AdminPortalPage          pages/AdminPortalPage.jsx
 *
 *
 * ── BOOKSHOP PAGES ────────────────────────────────────────────────
 *
 *   Route                          Component                File
 *   /bookshop                      BookshopHomePage         bookshop/pages/BookshopHomePage.jsx
 *   /bookshop/products             ProductListingPage       bookshop/pages/ProductListingPage.jsx
 *   /bookshop/category/:cat        ProductListingPage       bookshop/pages/ProductListingPage.jsx
 *   /bookshop/search               SearchResultsPage        bookshop/pages/ProductListingPage.jsx
 *   /bookshop/product/:id          ProductDetailPage        bookshop/pages/ProductDetailPage.jsx
 *   /bookshop/cart                 CartPage                 bookshop/pages/CartAndOrderPages.jsx
 *   /bookshop/order-confirmation   OrderConfirmationPage    bookshop/pages/CartAndOrderPages.jsx
 *   /bookshop/bulk                 BulkOrdersPage           bookshop/pages/CartAndOrderPages.jsx
 *
 *
 * ── SHARED COMPONENTS ─────────────────────────────────────────────
 *
 *   Nav, Footer              components/NavFooter.jsx
 *   BookshopNavbar,          bookshop/components/BookshopNavFooter.jsx
 *   BookshopFooter
 *   ProductCard              bookshop/components/BookshopComponents.jsx
 *   FilterPanel              bookshop/components/BookshopComponents.jsx
 *   NewsletterSignup         bookshop/components/BookshopComponents.jsx
 *   BookshopEmptyState       bookshop/components/BookshopComponents.jsx
 *   NoProductsState          bookshop/components/BookshopComponents.jsx
 *   NoSearchResults          bookshop/components/BookshopComponents.jsx
 *   OutOfStockState          bookshop/components/BookshopComponents.jsx
 *   EmptyCartState           bookshop/components/BookshopComponents.jsx
 *
 *
 * ── PRODUCT DATA ──────────────────────────────────────────────────
 *
 *   SAMPLE_PRODUCTS          bookshop/data/products.js
 *   CATEGORIES, LEVELS,      bookshop/data/products.js
 *   SUBJECTS
 *
 *   Replace SAMPLE_PRODUCTS with a real API call:
 *     const { data: products } = useQuery(['products'], fetchProducts);
 *
 *
 * ── INTEGRATION CHECKLIST ─────────────────────────────────────────
 *
 *   □ Add CSS imports to main entry file
 *   □ Wire pages into React Router (or Next.js pages/)
 *   □ Replace MOCK_USER in UserPortalPage with real auth context
 *   □ Replace MOCK_STATS/MOCK_APPLICATIONS in AdminPortalPage with API calls
 *   □ Replace SAMPLE_PRODUCTS in bookshop with real API calls
 *   □ Replace all fake `await new Promise(r => setTimeout(r, 1000))`
 *     calls with real fetch/axios/react-query API calls
 *   □ Add Supabase auth to AdminLoginPage and UserLoginPage
 *   □ Wire onAddToCart in bookshop to a real cart context / Zustand store
 *   □ Replace cartCount prop with real cart state from context
 *   □ Wire ContactPage form to your email/SMTP provider (Resend)
 *   □ Wire Newsletter form to your mailing list provider
 *   □ Set real WhatsApp link in BookshopNavbar (wa.link/d6x888 → real link)
 *   □ Replace all placeholder images with real product/content images
 *   □ Add OG meta tags to each page
 *   □ Test all mobile breakpoints
 *
 *
 * ── PORTAL AUTH GUARD EXAMPLE ─────────────────────────────────────
 *
 *   // In your router:
 *   <Route
 *     path="/portal"
 *     element={
 *       <ProtectedRoute requiredRole="user">
 *         <UserPortalPage />
 *       </ProtectedRoute>
 *     }
 *   />
 *   <Route
 *     path="/admin"
 *     element={
 *       <ProtectedRoute requiredRole="admin">
 *         <AdminPortalPage />
 *       </ProtectedRoute>
 *     }
 *   />
 *
 *
 * ── BOOKSHOP CART STATE EXAMPLE ───────────────────────────────────
 *
 *   // Create a CartContext or Zustand store:
 *   const useCartStore = create(set => ({
 *     items: [],
 *     addItem: (product) => set(state => {
 *       const existing = state.items.find(i => i.id === product.id);
 *       if (existing) {
 *         return { items: state.items.map(i => i.id === product.id ? { ...i, qty: i.qty + (product.qty || 1) } : i) };
 *       }
 *       return { items: [...state.items, { ...product, qty: product.qty || 1 }] };
 *     }),
 *     removeItem: (id) => set(state => ({ items: state.items.filter(i => i.id !== id) })),
 *     clearCart: () => set({ items: [] }),
 *     get count() { return this.items.reduce((s, i) => s + i.qty, 0); },
 *   }));
 *
 *   // Then in app:
 *   const { items, addItem, count } = useCartStore();
 *   <BookshopHomePage cartCount={count} onAddToCart={addItem} />
 *
 */

// Re-exports for convenience
export { default as AboutPage }        from './pages/AboutPage';
export { default as ServicesPage }     from './pages/ServicesPage';
export { default as ContactPage }      from './pages/ContactPage';
export { default as JobsPage }         from './pages/JobsPage';
export { default as UserPortalPage }   from './pages/UserPortalPage';
export { default as AdminPortalPage }  from './pages/AdminPortalPage';
export { AdminLoginPage, UserLoginPage } from './pages/AuthPages';

export { default as BookshopHomePage }    from './bookshop/pages/BookshopHomePage';
export { default as ProductListingPage, SearchResultsPage } from './bookshop/pages/ProductListingPage';
export { default as ProductDetailPage }   from './bookshop/pages/ProductDetailPage';
export { CartPage, OrderConfirmationPage, BulkOrdersPage }  from './bookshop/pages/CartAndOrderPages';

export { BookshopNavbar, BookshopFooter } from './bookshop/components/BookshopNavFooter';
export {
  ProductCard, FilterPanel, NewsletterSignup,
  BookshopEmptyState, NoProductsState, NoSearchResults,
  OutOfStockState, EmptyCartState,
} from './bookshop/components/BookshopComponents';

export { Nav, Footer } from './components/NavFooter';
