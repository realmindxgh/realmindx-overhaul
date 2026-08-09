import React from 'react';
import './styles/bookshop.css';
import { CartProvider, CartCtx, Navbar, Footer, WhatsAppFab, ScrollToTopFab, BottomNav } from './chrome.jsx';
import { HomePage, ShopPage, ExamPicksPage } from './pages-shop.jsx';
import RequestBookPage from './pages-request.jsx';
import { ProductPage, CartPage, WishlistPage } from './pages-product-cart.jsx';
import { CheckoutPage, TrackPage, InvoicePage } from './pages-checkout.jsx';
import { AuthPage, BookshopResetPasswordPage, ContactPage, InfoPage, BookshopLegalPage, AccountPage, OrderReviewPage, OrdersPage } from './pages-misc.jsx';
import { DocumentsPage, ResourceDetailPage } from './pages-documents.jsx';
import { CatalogProvider, useCatalog, fromApiProduct } from './catalog.jsx';
import { Icon, LoadingState, cedis } from './shared.jsx';
import { api, isApiMode } from '../src/lib/apiClient.js';
import { syncSessionFromApi } from '../src/lib/authClient.js';
import { trackPageView } from '../src/lib/analytics.js';
import { setFavicons, setHeadLink, setHeadMeta, setStructuredData } from '../src/lib/head.js';
import {
  BOOKSHOP_APPLE_TOUCH_ICON,
  BOOKSHOP_DEFAULT_IMAGE,
  BOOKSHOP_FAVICON,
  bookOpenGraphImage,
} from '../src/lib/seoRoutes.js';
import { findTaxonomyItem, getBookshopSeoProfile, matchesTaxonomy, taxonomyLabel } from '../src/lib/bookshopTaxonomy.js';
import { clearCheckoutDraft, clearCheckoutSuccess } from './checkoutStorage.js';
import { bookshopPathForRoute, canonicalBookshopBase, productHref, productMatchesSegment, productPathSegment } from './urls.js';
import { saveCurrentScrollPosition, getSavedScrollPosition, hasSavedScroll } from '../src/lib/bookshopRouteCache.js';

const GOLD_ACCENT = '#ffcc01';

// On bookshop.realmindxgh.com paths are /products, /cart etc.
// On realmindxgh.com they are /bookshop/products, /bookshop/cart etc.
const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';

const prefixedPath = (path) => `${PREFIX}${path}`;
const SHOP_ROBOTS_NOINDEX = new Set(['cart', 'wishlist', 'checkout', 'login', 'signup', 'reset-password', 'account', 'orders', 'review', 'request-book', 'not-found']);
const canonicalUrlForRoute = (route, params = {}) => `${canonicalBookshopBase}${bookshopPathForRoute(route, params)}`;
const browseParam = (taxonomy, value = '') => ({ taxonomy, value });
const BOOKSHOP_SHIPPING_DETAILS = {
  '@type': 'OfferShippingDetails',
  shippingDestination: {
    '@type': 'DefinedRegion',
    addressCountry: 'GH',
  },
  shippingRate: {
    '@type': 'MonetaryAmount',
    currency: 'GHS',
    maxValue: '200.00',
  },
  deliveryTime: {
    '@type': 'ShippingDeliveryTime',
    handlingTime: {
      '@type': 'QuantitativeValue',
      minValue: 0,
      maxValue: 1,
      unitCode: 'DAY',
    },
    transitTime: {
      '@type': 'QuantitativeValue',
      minValue: 1,
      maxValue: 2,
      unitCode: 'DAY',
    },
  },
};
const BOOKSHOP_RETURN_POLICY = {
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'GH',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 7,
  returnMethod: 'https://schema.org/ReturnByMail',
  returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
};

const productReviewStructuredData = (review) => {
  const ratingValue = Number(review?.rating || 0);
  if (ratingValue <= 0) return null;
  return {
    '@type': 'Review',
    author: {
      '@type': 'Person',
      name: review.customer_name || 'Verified Buyer',
    },
    datePublished: review.created_at ? String(review.created_at).split('T')[0] : undefined,
    reviewBody: [review.title, review.comment].filter(Boolean).join(' - ') || `${ratingValue}-star review from a verified buyer.`,
    reviewRating: {
      '@type': 'Rating',
      ratingValue,
      bestRating: 5,
      worstRating: 1,
    },
  };
};

const queryBrowseParam = (search) => {
  const mappings = [
    ['category', 'category'],
    ['cat', 'category'],
    ['subject', 'subject'],
    ['level', 'level'],
    ['curriculum', 'curriculum'],
    ['publisher', 'publisher'],
  ];
  const match = mappings.find(([queryKey]) => cleanQueryValue(search.get(queryKey)));
  if (!match) return null;
  const [queryKey, taxonomy] = match;
  return browseParam(taxonomy, cleanQueryValue(search.get(queryKey)));
};

const cleanQueryValue = (value) => String(value || '').trim();

const routeFromPath = () => {
  if (typeof window === 'undefined') return { route: 'home', params: {} };
  const path = window.location.pathname.replace(/\/+$/, '');
  const search = new URLSearchParams(window.location.search);
  const p = ON_SUBDOMAIN ? path : path.replace('/bookshop', '') || '/';
  const searchQuery = search.get('q') || '';
  const queryBrowse = queryBrowseParam(search);
  if (!p || p === '/') return { route: 'home', params: {} };
  if (p === '/products') return { route: 'shop', params: { ...(queryBrowse || {}), q: searchQuery } };
  if (p.startsWith('/products/')) return { route: 'product', params: { slug: decodeURIComponent(p.split('/products/')[1] || '') } };
  if (p === '/categories') return { route: 'shop', params: { ...browseParam('category'), q: searchQuery } };
  if (p.startsWith('/categories/')) {
    const value = decodeURIComponent(p.split('/categories/')[1] || '');
    if (value === 'curriculum') return { route: 'shop', params: { ...browseParam('curriculum'), q: searchQuery } };
    if (value.startsWith('curriculum-')) return { route: 'shop', params: { ...browseParam('curriculum', value.replace(/^curriculum-/, '')), q: searchQuery } };
    return { route: 'shop', params: { ...browseParam('category', value), q: searchQuery } };
  }
  if (p === '/subjects') return { route: 'shop', params: { ...browseParam('subject'), q: searchQuery } };
  if (p.startsWith('/subjects/')) return { route: 'shop', params: { ...browseParam('subject', decodeURIComponent(p.split('/subjects/')[1] || '')), q: searchQuery } };
  if (p === '/levels') return { route: 'shop', params: { ...browseParam('level'), q: searchQuery } };
  if (p.startsWith('/levels/')) return { route: 'shop', params: { ...browseParam('level', decodeURIComponent(p.split('/levels/')[1] || '')), q: searchQuery } };
  if (p === '/curriculum' || p === '/curricula') return { route: 'shop', params: { ...browseParam('curriculum'), q: searchQuery } };
  if (p.startsWith('/curriculum/')) return { route: 'shop', params: { ...browseParam('curriculum', decodeURIComponent(p.split('/curriculum/')[1] || '')), q: searchQuery } };
  if (p.startsWith('/curricula/')) return { route: 'shop', params: { ...browseParam('curriculum', decodeURIComponent(p.split('/curricula/')[1] || '')), q: searchQuery } };
  if (p === '/publishers') return { route: 'shop', params: { ...browseParam('publisher'), q: searchQuery } };
  if (p.startsWith('/publishers/')) return { route: 'shop', params: { ...browseParam('publisher', decodeURIComponent(p.split('/publishers/')[1] || '')), q: searchQuery } };
  if (p === '/cart')      return { route: 'cart',     params: {} };
  if (p === '/wishlist')  return { route: 'wishlist', params: {} };
  if (p === '/checkout') return { route: 'checkout', params: {} };
  if (p === '/track' || p === '/track-order' || p === '/track-your-order') return { route: 'track', params: {} };
  if (p === '/invoice' || p === '/invoices') return { route: 'invoice', params: {} };
  if (p === '/documents' || p === '/education-documents') return { route: 'documents', params: {} };
  if (p.startsWith('/documents/')) return { route: 'resource', params: { segment: decodeURIComponent(p.split('/documents/')[1] || '') } };
  if (p === '/login')    return { route: 'login',    params: {} };
  if (p === '/signup')   return { route: 'signup',   params: {} };
  if (p === '/reset-password') return { route: 'reset-password', params: {} };
  if (p === '/contact')  return { route: 'contact',  params: {} };
  if (p === '/about')    return { route: 'about',    params: {} };
  if (p === '/privacy')  return { route: 'privacy',  params: {} };
  if (p === '/terms')    return { route: 'terms',    params: {} };
  if (p === '/account')  return { route: 'account',  params: {} };
  if (p === '/orders')   return { route: 'orders',   params: {} };
  if (p === '/review')   return { route: 'review',   params: {} };
  if (p === '/request-book') return { route: 'request-book', params: {} };
  if (p === '/collections/exam-picks') return { route: 'exam-catalogue', params: {} };
  if (p === '/collections/bece-picks') return { route: 'exam-catalogue', params: {} };
  if (p === '/collections/wassce-picks') return { route: 'exam-catalogue', params: {} };
  return { route: 'not-found', params: {} };
};

const pathForRoute = (route, params = {}) => prefixedPath(bookshopPathForRoute(route, params));

const BookshopBackButton = ({ navigate }) => {
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('home');
  };
  return (
    <div className="bs-app-back-row">
      <button type="button" className="bs-app-back" onClick={goBack} aria-label="Go back" title="Go back">
        <Icon name="chevL" size={21} />
      </button>
      <button type="button" className="bs-app-back" onClick={() => window.history.forward()} aria-label="Go forward" title="Go forward">
        <Icon name="chevR" size={21} />
      </button>
    </div>
  );
};

// Paystack confirmation page: shown when user returns from Paystack payment
const isPaidOrder = (order) => String(order?.payment_status || '').toLowerCase() === 'paid';

const PaystackReturnPage = ({ paymentRef, legacy = false, navigate, clearCart }) => {
  const [state, setState] = React.useState(() => ({
    status: isApiMode() ? 'checking' : 'paid',
    order: null,
    error: '',
  }));
  const clearCartRef = React.useRef(clearCart);
  const clearedRef = React.useRef(false);

  React.useEffect(() => {
    clearCartRef.current = clearCart;
  }, [clearCart]);

  React.useEffect(() => {
    let cancelled = false;
    let timer = null;

    const finish = (order = null) => {
      if (cancelled) return;
      if (!clearedRef.current) {
        clearCartRef.current?.();
        clearCheckoutDraft();
        clearCheckoutSuccess();
        clearedRef.current = true;
      }
      setState({ status: 'paid', order, error: '' });
    };

    if (!isApiMode()) {
      finish(null);
      return () => { cancelled = true; };
    }

    const checkPayment = async (attempt = 0) => {
      try {
        try {
          const verified = await api.verifyPaystackPayment(paymentRef, { legacy });
          if (isPaidOrder(verified?.order)) {
            finish(verified.order);
            return;
          }
        } catch {
          // The webhook may still be processing. Retry briefly without
          // clearing the customer's cart or presenting an unpaid order.
        }
        if (legacy) {
          const data = await api.trackOrders(paymentRef);
          const order = (data.items || []).find(item => item.order_reference === paymentRef) || data.items?.[0] || null;
          if (isPaidOrder(order)) {
            finish(order);
            return;
          }
        }
        if (attempt < 4) {
          timer = window.setTimeout(() => checkPayment(attempt + 1), 1500);
          return;
        }
        if (!cancelled) setState({ status: 'pending', order: null, error: '' });
      } catch (err) {
        if (attempt < 2) {
          timer = window.setTimeout(() => checkPayment(attempt + 1), 1500);
          return;
        }
        if (!cancelled) setState({ status: 'error', order: null, error: err?.message || 'Could not confirm payment yet.' });
      }
    };

    checkPayment();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [legacy, paymentRef]);

  if (state.status === 'checking') {
    return (
      <div className="bs-container bs-fade-page">
        <LoadingState
          title="Confirming payment"
          body="Checking the payment status before we clear your cart."
        />
      </div>
    );
  }

  if (state.status === 'pending') {
    return (
      <div className="bs-container bs-fade-page">
        <div className="bs-confirm" style={{ padding:'60px 24px' }}>
          <div className="bs-empty-icon"><Icon name="clock" size={40} /></div>
          <h1 className="bs-h2">Payment is still confirming</h1>
          <p className="bs-muted">Payment <strong>{paymentRef}</strong> has not been confirmed. No order has been placed, and your cart has not been cleared.</p>
          <div className="bs-confirm-actions" style={{ marginTop:28 }}>
            <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('checkout')}>Return to Checkout</button>
            <button className="bs-btn bs-btn-outline-navy bs-btn-lg" onClick={() => window.location.reload()}>Check Again</button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="bs-container bs-fade-page">
        <div className="bs-confirm" style={{ padding:'60px 24px' }}>
          <div className="bs-empty-icon"><Icon name="refresh" size={40} /></div>
          <h1 className="bs-h2">Could not confirm payment</h1>
          <p className="bs-muted">{state.error} Your cart has not been cleared.</p>
          <div className="bs-confirm-actions" style={{ marginTop:28 }}>
            <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('checkout')}>Return to Checkout</button>
            <button className="bs-btn bs-btn-outline-navy bs-btn-lg" onClick={() => window.location.reload()}>Try Again</button>
          </div>
        </div>
      </div>
    );
  }

  const orderItems = state.order?.items || [];
  const paidTotal = Number(state.order?.total_amount || 0);
  const orderRef = state.order?.order_reference || '';
  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-confirm" style={{ padding:'60px 24px' }}>
        <div className="bs-check-circle">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
        </div>
        <h1 className="bs-h2">Payment received!</h1>
        <p className="bs-muted">Your order <strong>{orderRef}</strong> has been placed and payment confirmed. A confirmation email is on its way.</p>
        {orderItems.length > 0 && (
          <div className="bs-confirm-summary">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
              <span className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>What you ordered</span>
              <span className="bs-muted" style={{ fontSize:13 }}>{orderItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)} items</span>
            </div>
            {orderItems.map((item, index) => (
              <div key={`${item.product_id || item.product_name}-${index}`} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:14 }}>
                <span>{Number(item.quantity) || 1} x {item.product_name}</span>
                <span style={{ fontFamily:'Montserrat', fontWeight:600 }}>{cedis((Number(item.unit_price) || 0) * (Number(item.quantity) || 1))}</span>
              </div>
            ))}
            {paidTotal > 0 && (
              <div className="bs-summary-row bs-total" style={{ fontSize:18, marginTop:10 }}>
                <span>Total paid</span>
                <span>{cedis(paidTotal)}</span>
              </div>
            )}
          </div>
        )}
        <div className="bs-confirm-actions" style={{ marginTop:28 }}>
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('track')}>Track Your Order</button>
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('shop')}>Continue Shopping</button>
        </div>
      </div>
    </div>
  );
};

class BookshopErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[BookshopErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="bs-empty-state" style={{ padding: '80px 20px' }}>
          <div className="bs-empty-icon"><span role="img" aria-label="error">⚠</span></div>
          <h2>Something went wrong</h2>
          <p style={{ color: 'var(--bs-text-muted)', marginBottom: 24 }}>This section could not be displayed.</p>
          <button className="bs-btn bs-btn-navy" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---- Memoized persistent tab wrappers ----
// These prevent the full page component tree from re-rendering when
// another tab becomes active. Only the wrapper div's CSS class changes.
const PersistentHomeTab = React.memo(({ navigate, isActive, onLoadingChange, homeLoading }) => (
  <div className={`bs-tab-panel${isActive ? ' active' : ''}`} role="tabpanel" data-tab="home" aria-hidden={!isActive}>
    <HomePage navigate={navigate} onLoadingChange={onLoadingChange} />
    {!homeLoading && <Footer navigate={navigate} />}
  </div>
));

const PersistentShopTab = React.memo(({ navigate, initialBrowse, initialQuery, isActive, scrollContainerRef }) => (
  <div ref={isActive ? scrollContainerRef : null} className={`bs-tab-panel${isActive ? ' active' : ''}`} role="tabpanel" data-tab="shop" aria-hidden={!isActive}>
    <ShopPage navigate={navigate} initialBrowse={initialBrowse} initialQuery={initialQuery} active={isActive} scrollContainerRef={scrollContainerRef} />
    <Footer navigate={navigate} />
  </div>
));

const PersistentCartTab = React.memo(({ navigate, isActive }) => (
  <div className={`bs-tab-panel${isActive ? ' active' : ''}`} role="tabpanel" data-tab="cart" aria-hidden={!isActive}>
    <CartPage navigate={navigate} />
    <Footer navigate={navigate} />
  </div>
));

const PersistentAccountTab = React.memo(({ navigate, isActive }) => (
  <div className={`bs-tab-panel${isActive ? ' active' : ''}`} role="tabpanel" data-tab="account" aria-hidden={!isActive}>
    <AccountPage navigate={navigate} />
    <Footer navigate={navigate} />
  </div>
));

const App = () => {
  const { books, categories, taxonomies, loading: catalogLoading } = useCatalog();
  const initialRoute = React.useMemo(routeFromPath, []);
  const [route, setRoute] = React.useState(initialRoute.route);
  const [params, setParams] = React.useState(initialRoute.params);
  const [homeLoading, setHomeLoading] = React.useState(initialRoute.route === 'home');

  // Handle the new payment-intent callback and legacy order callbacks that
  // may still return from Paystack after deployment.
  const [paystackReturn, setPaystackReturn] = React.useState(() => {
    if (typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    const paymentIntent = sp.get('payment_intent');
    const order = sp.get('order');
    const status = sp.get('status');
    if (status !== 'paid') return null;
    if (paymentIntent) return { reference: paymentIntent, legacy: false };
    return order ? { reference: order, legacy: true } : null;
  });

  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const routeRef = React.useRef(route);
  routeRef.current = route;

  const navigate = React.useCallback((r, p = {}) => {
    if (typeof performance !== 'undefined' && performance.mark) performance.mark('tab-tap');
    if (typeof performance !== 'undefined' && performance.mark) performance.mark('route-update');
    if (!isMobile) saveCurrentScrollPosition(routeRef.current);
    setRoute(r);
    setParams(p);
    const nextPath = pathForRoute(r, p);
    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  }, [isMobile]);

  const [activeProduct, setActiveProduct] = React.useState(null);
  const [productError, setProductError] = React.useState('');
  const productAbortRef = React.useRef(null);

  React.useEffect(() => {
    if (route !== 'product') { setActiveProduct(null); setProductError(''); return; }
    if (productAbortRef.current) productAbortRef.current.abort();
    const controller = new AbortController();
    productAbortRef.current = controller;
    setProductError('');
    if (params.id && isApiMode()) {
      api.fetchProduct(params.id).then((data) => {
        if (controller.signal.aborted) return;
        const p = data?.product ? fromApiProduct(data.product) : null;
        if (p) { setActiveProduct(p); setProductError(''); }
        else { setActiveProduct(null); setProductError('Product not found.'); }
      }).catch((err) => {
        if (controller.signal.aborted) return;
        setActiveProduct(null);
        setProductError(err?.status === 404 ? 'Product not found.' : 'Could not load product. Try again.');
      });
    } else if (params.slug && isApiMode()) {
      api.fetchProductSearch(`?q=${encodeURIComponent(params.slug)}&per_page=1`).then((data) => {
        if (controller.signal.aborted) return;
        const items = (data.items || []).map(fromApiProduct);
        const matched = items.find((b) => productMatchesSegment(b, params.slug));
        if (matched) { setActiveProduct(matched); setProductError(''); }
        else { setActiveProduct(null); setProductError('Product not found.'); }
      }).catch((err) => {
        if (controller.signal.aborted) return;
        setActiveProduct(null);
        setProductError('Could not load product. Try again.');
      });
    } else if (params.id || params.slug) {
      api.fetchProducts().then((data) => {
        if (controller.signal.aborted) return;
        const items = (data.items || []).map(fromApiProduct);
        const found = items.find((b) => String(b.id) === String(params.id)) || items.find((b) => productMatchesSegment(b, params.slug)) || null;
        if (found) { setActiveProduct(found); setProductError(''); }
        else { setActiveProduct(null); setProductError('Product not found.'); }
      }).catch((err) => {
        if (controller.signal.aborted) return;
        setActiveProduct(null);
        setProductError('Could not load product. Try again.');
      });
    }
    return () => { controller.abort(); };
  }, [params.id, params.slug, route]);
  const activeBrowse = route === 'shop' && params.taxonomy
    ? findTaxonomyItem(taxonomies, params.taxonomy, params.value)
    : route === 'shop' && params.cat && params.cat !== 'all'
      ? findTaxonomyItem(taxonomies, 'category', params.cat)
      : null;
  const browseTaxonomy = params.taxonomy || (params.cat && params.cat !== 'all' ? 'category' : '');
  const requestedBrowseValue = params.value || params.cat || '';
  const browseValue = browseTaxonomy && requestedBrowseValue && !catalogLoading && !activeBrowse ? '' : requestedBrowseValue;
  const browseLabel = activeBrowse?.name || activeBrowse?.label || (browseValue ? taxonomyLabel(browseTaxonomy) : null);
  const initialBrowse = React.useMemo(() => ({ taxonomy: browseTaxonomy, value: browseValue }), [browseTaxonomy, browseValue]);
  const activeBrowseCount = route === 'shop' && browseTaxonomy && browseValue
    ? taxonomies?.lookup?.[browseTaxonomy]?.get(browseValue)?.count || null
    : null;
  const canonicalParams = route === 'product' && activeProduct
    ? { slug: productPathSegment(activeProduct) }
    : route === 'shop'
      ? { taxonomy: browseTaxonomy, value: browseValue, q: params.q }
      : params;
  const canonicalPath = bookshopPathForRoute(route, canonicalParams);
  const canonicalUrl = `${canonicalBookshopBase}${canonicalPath}`;
  const [seoProductReviewState, setSeoProductReviewState] = React.useState({
    productId: null,
    loaded: false,
    items: [],
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const preferredPath = `${PREFIX}${canonicalPath}`;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath !== preferredPath) {
      window.history.replaceState({}, '', preferredPath);
    }
  }, [canonicalPath]);

  React.useEffect(() => {
    document.documentElement.style.setProperty('--bs-gold-live', GOLD_ACCENT);
  }, []);

  React.useEffect(() => {
    const pageType = route === 'product'
      ? 'product'
      : route === 'documents'
        ? 'bookshop_documents'
      : route === 'shop' && params.q
        ? 'bookshop_search'
        : 'bookshop';
    trackPageView({
      path: `${PREFIX}${canonicalPath}`,
      fullPath: `${PREFIX}${canonicalPath}`,
      pageType,
      productId: activeProduct?.id || null,
    });
  }, [activeProduct?.id, canonicalPath, params.q, route]);

  React.useEffect(() => {
    let alive = true;
    const productId = String(activeProduct?.id || '');
    if (route !== 'product' || !productId || !isApiMode() || !/^\d+$/.test(productId)) {
      setSeoProductReviewState({ productId: null, loaded: true, items: [] });
      return undefined;
    }
    setSeoProductReviewState({ productId, loaded: false, items: [] });
    api.fetchProductReviews(productId)
      .then((data) => {
        if (!alive) return;
        setSeoProductReviewState({
          productId,
          loaded: true,
          items: Array.isArray(data.items) ? data.items.slice(0, 3) : [],
        });
      })
      .catch(() => {
        if (alive) setSeoProductReviewState({ productId, loaded: true, items: [] });
      });
    return () => { alive = false; };
  }, [activeProduct?.id, route]);

  React.useEffect(() => {
    let alive = true;
    syncSessionFromApi().then(() => {
      if (alive) window.dispatchEvent(new Event('rmx-session-sync'));
    });
    return () => { alive = false; };
  }, [route]);

  // Page titles + OG meta per bookshop route
  React.useEffect(() => {
    const meta = {
      home:     { title: 'RealMindX Bookshop | Educational Books & Stationery Ghana', desc: 'Shop textbooks, curricula, stationery and learning materials. Fast delivery across Ghana. Wholesale pricing for schools.' },
      shop:     { title: 'Browse Educational Books & Textbooks | RealMindX Bookshop', desc: 'Find BECE, WASSCE, primary and JHS textbooks, curricula and stationery. In-stock items with delivery across Ghana.' },
      product:  { title: 'Product | RealMindX Bookshop', desc: 'Educational books and materials available at the RealMindX Bookshop, Accra, Ghana.' },
      cart:     { title: 'Your Cart | RealMindX Bookshop', desc: '' },
      wishlist: { title: 'My Wishlist | RealMindX Bookshop', desc: 'Your saved books and learning materials at the RealMindX Bookshop.' },
      checkout: { title: 'Checkout | RealMindX Bookshop', desc: '' },
      track:    { title: 'Track Your Order | RealMindX Bookshop', desc: 'Track your RealMindX Bookshop order by reference number or email address.' },
      invoice:  { title: 'Receipt/Invoice Verification | RealMindX Bookshop', desc: 'Verify and download a RealMindX Bookshop receipt or invoice by exact ID.' },
      documents:{ title: 'Education Documents | RealMindX Bookshop', desc: 'Browse useful education documents, guides, templates, and learning resources from RealMindX Bookshop.' },
      resource: { title: 'Education Resource | RealMindX Bookshop', desc: 'View a published document from the RealMindX Ghana Education Resource Library.' },
      login:    { title: 'Sign In | RealMindX Bookshop', desc: 'Sign in to your RealMindX account to track orders, save favourites, and check out faster.' },
      signup:   { title: 'Create Account | RealMindX Bookshop', desc: 'Join the RealMindX Bookshop to track orders, save books, and enjoy a faster checkout experience.' },
      'reset-password': { title: 'Reset Password | RealMindX Bookshop', desc: 'Create a new password for your RealMindX account.' },
      contact:  { title: 'Contact the Bookshop | RealMindX', desc: 'Contact RealMindX Bookshop at Dome Pillar 2, Accra. Call +233 55 803 9190 or send a message.' },
      about:    { title: 'About the Bookshop | RealMindX', desc: 'Learn about the RealMindX Bookshop, Ghana\'s educational books and stationery shop.' },
      privacy:  { title: 'Privacy Policy | RealMindX Bookshop', desc: 'How the RealMindX Bookshop collects, uses, and protects your personal information.' },
      terms:    { title: 'Terms and Conditions | RealMindX Bookshop', desc: 'Terms governing your use of the RealMindX Bookshop and any purchases you make.' },
      account:  { title: 'My Account | RealMindX Bookshop', desc: 'Manage your RealMindX Bookshop account, view billing info, and access your order history.' },
      orders:   { title: 'My Orders | RealMindX Bookshop', desc: 'View all your past orders, track deliveries, and see order details.' },
      review:   { title: 'Rate Your Order | RealMindX Bookshop', desc: 'Share feedback on your RealMindX Bookshop order.' },
      'exam-catalogue': { title: 'BECE & WASSCE Picks | Junior & Senior High Textbooks | RealMindX Bookshop', desc: 'Shop BECE (Junior High) and WASSCE (Senior High) textbooks and learning materials aligned with the GES / NaCCA Curriculum. Fast delivery across Ghana.' },
      'request-book': { title: 'Request a Book | RealMindX Bookshop', desc: 'Tell us what book you need and we will notify you when it is available.' },
      'not-found': { title: 'Page Not Found | RealMindX Bookshop', desc: 'That address does not match a currently available RealMindX Bookshop page.' },
    };
    let currentMeta = meta[route] || { title: 'RealMindX Bookshop', desc: 'Educational books and stationery for Ghanaian students and schools.' };
    let image = BOOKSHOP_DEFAULT_IMAGE;
    let structuredData = null;
    let robots = ON_SUBDOMAIN && !SHOP_ROBOTS_NOINDEX.has(route) ? 'index, follow' : 'noindex, follow';

    if (route === 'product') {
      if (activeProduct) {
        const reviewCount = Number(activeProduct.reviews || 0);
        const ratingValue = Number(activeProduct.rating || 0);
        const productId = String(activeProduct.id || '');
        const needsReviewFetch = isApiMode() && /^\d+$/.test(productId);
        const reviewsLoaded = !needsReviewFetch
          || (seoProductReviewState.productId === productId && seoProductReviewState.loaded);
        const approvedReviews = reviewsLoaded
          ? seoProductReviewState.items.map(productReviewStructuredData).filter(Boolean)
          : [];
        const productImage = activeProduct.imageMedium || activeProduct.imageOriginal || activeProduct.image || BOOKSHOP_DEFAULT_IMAGE;
        currentMeta = {
          title: `${activeProduct.title} | RealMindX Bookshop`,
          desc: activeProduct.short || activeProduct.desc || activeProduct.full || meta.product.desc,
        };
        image = bookOpenGraphImage(activeProduct);
        if (!reviewCount || reviewsLoaded) {
          structuredData = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: activeProduct.title,
            description: currentMeta.desc,
            image: productImage ? [productImage] : undefined,
            sku: String(activeProduct.id),
            category: activeProduct.catName,
            brand: {
              '@type': 'Brand',
              name: activeProduct.publisher || 'RealMindX Bookshop',
            },
            offers: {
              '@type': 'Offer',
              priceCurrency: 'GHS',
              price: activeProduct.price,
              availability: activeProduct.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: canonicalUrl,
              shippingDetails: BOOKSHOP_SHIPPING_DETAILS,
              hasMerchantReturnPolicy: BOOKSHOP_RETURN_POLICY,
            },
          };
          if (reviewCount > 0 && ratingValue > 0) {
            structuredData.aggregateRating = {
              '@type': 'AggregateRating',
              ratingValue,
              reviewCount,
              bestRating: 5,
              worstRating: 1,
            };
          }
          if (approvedReviews.length) {
            structuredData.review = approvedReviews;
          }
        }
      } else if (catalogLoading) {
        // Preserve the server-rendered product metadata while the catalogue is
        // still loading. A temporary "Product Not Found" title is misleading
        // and can flash in the browser before the real product resolves.
        return;
      } else {
        currentMeta = {
          title: 'Product Not Found | RealMindX Bookshop',
          desc: 'That product link does not match a currently published RealMindX Bookshop item.',
        };
        robots = 'noindex, follow';
      }
    } else if (route === 'exam-catalogue') {
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: currentMeta.title,
        description: currentMeta.desc,
        url: canonicalUrl,
      };
    } else if (route === 'shop' && browseTaxonomy && !params.q) {
      if (browseValue && !activeBrowse) {
        if (catalogLoading) return;
        currentMeta = {
          title: 'Catalogue Page Not Found | RealMindX Bookshop',
          desc: 'That catalogue link does not match a current RealMindX Bookshop subject, level, curriculum, category or publisher.',
        };
        robots = 'noindex, follow';
      } else {
      const taxonomyName = taxonomyLabel(browseTaxonomy);
      const browseName = activeBrowse?.name || activeBrowse?.label || taxonomyName;
      const seoProfile = getBookshopSeoProfile(
        browseTaxonomy,
        activeBrowse || (browseValue ? { id: browseValue, label: browseName } : ''),
      );
      currentMeta = {
        title: browseValue ? (activeBrowse?.seoTitle || seoProfile.title) : seoProfile.title,
        desc: browseValue ? (activeBrowse?.seoDescription || seoProfile.description) : seoProfile.description,
      };
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: currentMeta.title,
        description: currentMeta.desc,
        url: canonicalUrl,
      };
      }
    } else if (route === 'shop' && params.q) {
      currentMeta = {
        title: `Search results for "${params.q}" | RealMindX Bookshop`,
        desc: `Browse RealMindX Bookshop results for ${params.q}.`,
      };
      robots = 'noindex, follow';
    }

    document.title = currentMeta.title;
    setHeadMeta('description', currentMeta.desc);
    setHeadMeta('robots', robots);
    setHeadMeta('og:type', route === 'product' ? 'product' : 'website', { property: true });
    setHeadMeta('og:title', currentMeta.title, { property: true });
    setHeadMeta('og:description', currentMeta.desc, { property: true });
    setHeadMeta('og:url', canonicalUrl, { property: true });
    setHeadMeta('og:image', image, { property: true });
    setHeadMeta('og:image:alt', `${currentMeta.title.split('|', 1)[0].trim()} social preview`, { property: true });
    setHeadMeta('og:image:width', '1200', { property: true });
    setHeadMeta('og:image:height', '630', { property: true });
    setHeadMeta('og:site_name', 'RealMindX Bookshop', { property: true });
    setHeadMeta('twitter:card', 'summary_large_image');
    setHeadMeta('twitter:title', currentMeta.title);
    setHeadMeta('twitter:description', currentMeta.desc);
    setHeadMeta('twitter:image', image);
    setFavicons({ icon: BOOKSHOP_FAVICON, appleTouchIcon: BOOKSHOP_APPLE_TOUCH_ICON });
    setHeadLink('canonical', canonicalUrl);
    setStructuredData('bookshop-route-seo', structuredData);
  }, [route, params.cat, params.id, params.q, params.slug, params.taxonomy, params.value, activeProduct, activeBrowse, activeBrowseCount, browseTaxonomy, browseValue, canonicalUrl, books, catalogLoading, seoProductReviewState]);

  React.useEffect(() => {
    document.body.classList.add('bs-has-bottomnav');
    return () => { document.body.classList.remove('bs-has-bottomnav'); };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.scrollRestoration = 'manual';
  }, []);

  React.useLayoutEffect(() => {
    if (isMobile) return;
    if (route === 'home' || route === 'shop') {
      const savedY = getSavedScrollPosition(route);
      if (savedY > 0) window.scrollTo(0, savedY);
    } else {
      window.scrollTo(0, 0);
    }
  }, [route, isMobile]);

  React.useEffect(() => {
    if (isMobile) return;
    let ticking = false;
    const handler = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          saveCurrentScrollPosition(route);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('pagehide', () => { saveCurrentScrollPosition(route); }, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
    };
  }, [route, isMobile]);

  React.useLayoutEffect(() => {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('tab-visible');
      if (performance.getEntriesByName('tab-tap', 'mark').length) {
        performance.measure('tab-switch', 'tab-tap', 'tab-visible');
      }
    }
  }, [route]);

  React.useEffect(() => {
    const onPop = () => {
      if (!isMobile) saveCurrentScrollPosition(route);
      const next = routeFromPath();
      setRoute(next.route);
      setParams(next.params);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [route, isMobile]);

  // ---- Persistent tab host ----
  // All four main tab pages remain mounted after first visit so their
  // React state and scroll positions survive route changes.
  const TAB_ROUTES = new Set(['home', 'shop', 'cart', 'account']);
  const persistentHomeRef = React.useRef(false);
  const persistentShopRef = React.useRef(false);
  const persistentCartRef = React.useRef(false);
  const persistentAccountRef = React.useRef(false);
  if (route === 'home') persistentHomeRef.current = true;
  if (route === 'shop') persistentShopRef.current = true;
  if (route === 'cart') persistentCartRef.current = true;
  if (route === 'account') persistentAccountRef.current = true;

  let page;
  switch (route) {
    case 'home': case 'shop': case 'cart': case 'account': page = null; break;
    case 'product':
      if (productError) {
        page = (
          <div className="bs-empty-state bs-fade-page" style={{ padding: '80px 20px' }}>
            <div className="bs-empty-icon"><Icon name="search" size={36} /></div>
            <h2>{productError}</h2>
            <p style={{ color: 'var(--bs-text-muted)', marginBottom: 24 }}>The product may have been removed or is unavailable.</p>
            <div className="bs-empty-actions">
              <button className="bs-btn bs-btn-navy" onClick={() => navigate('shop')}>Browse the shop</button>
              <button className="bs-btn bs-btn-outline" onClick={() => window.location.reload()}>Try again</button>
            </div>
          </div>
        );
      } else if (activeProduct) {
        page = <ProductPage navigate={navigate} bookId={activeProduct?.id} bookSlug={params.slug} initialBook={activeProduct} key={activeProduct?.id || params.slug} />;
      } else {
        page = (
          <div className="bs-fade-page">
            <div className="bs-page-loader">
              <LoadingState minimal />
            </div>
          </div>
        );
      }
      break;
    case 'wishlist': page = <WishlistPage navigate={navigate} />; break;
    case 'checkout': page = <CheckoutPage navigate={navigate} />; break;
    case 'track':    page = <TrackPage navigate={navigate} />; break;
    case 'invoice':  page = <InvoicePage navigate={navigate} />; break;
    case 'documents': page = <DocumentsPage navigate={navigate} />; break;
    case 'resource': page = <ResourceDetailPage navigate={navigate} segment={params.segment} key={params.segment} />; break;
    case 'login':    page = <AuthPage navigate={navigate} mode="login" key="login" />; break;
    case 'signup':   page = <AuthPage navigate={navigate} mode="signup" key="signup" />; break;
    case 'reset-password': page = <BookshopResetPasswordPage navigate={navigate} />; break;
    case 'contact':  page = <ContactPage navigate={navigate} />; break;
    case 'about':    page = <InfoPage navigate={navigate} />; break;
    case 'privacy':  page = <BookshopLegalPage type="privacy" />; break;
    case 'terms':    page = <BookshopLegalPage type="terms" />; break;
    case 'orders':   page = <OrdersPage navigate={navigate} />; break;
    case 'review':   page = <OrderReviewPage navigate={navigate} />; break;
    case 'exam-catalogue':
      page = <ExamPicksPage navigate={navigate} />; break;
    case 'request-book': page = <RequestBookPage navigate={navigate} />; break;
    case 'not-found': page = (
      <div className="bs-empty-state bs-fade-page" style={{ padding: '80px 20px' }}>
        <h1>Page Not Found</h1>
        <p>We could not find that bookshop page.</p>
        <a className="bs-btn bs-btn-primary" href="/">Return to the Bookshop</a>
      </div>
    ); break;
    default:         page = null;
  }
  const mainClassName = `bs-page${route === 'login' || route === 'signup' || route === 'reset-password' ? ' bs-page-auth' : ''}`;

  const { clear: clearCart } = React.useContext(CartCtx) || {};

  // Show Paystack confirmation if returning from payment
  if (paystackReturn) {
      return (
        <div className="bs">
        <Navbar route="home" navigate={(r) => { setPaystackReturn(null); navigate(r); }} />
        <main className={mainClassName}>
          <PaystackReturnPage
            paymentRef={paystackReturn.reference}
            legacy={paystackReturn.legacy}
            navigate={(r) => { setPaystackReturn(null); navigate(r); }}
            clearCart={clearCart || (() => {})}
          />
        </main>
        <Footer navigate={navigate} />
        <ScrollToTopFab route="home" />
        <WhatsAppFab route="home" />
        <BottomNav route="home" navigate={navigate} />
      </div>
    );
  }

  const shopScrollRef = React.useRef(null);

  const handleTabReTap = React.useCallback(() => {
    if (isMobile) {
      const activePanel = document.querySelector('.bs-tab-panel.active');
      if (activePanel) activePanel.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isMobile]);

  if (isMobile) {
    return (
      <div className="bs">
        <Navbar route={route} navigate={navigate} />
        <div className="bs-mobile-shell">
          {route !== 'home' && TAB_ROUTES.has(route) && <BookshopBackButton navigate={navigate} />}
          <div className="bs-tab-viewport">
            {persistentHomeRef.current && (
              <PersistentHomeTab navigate={navigate} isActive={route === 'home'} homeLoading={homeLoading} onLoadingChange={setHomeLoading} />
            )}
            {persistentShopRef.current && (
              <PersistentShopTab navigate={navigate} initialBrowse={initialBrowse} initialQuery={params.q || ''} isActive={route === 'shop'} scrollContainerRef={shopScrollRef} />
            )}
            {persistentCartRef.current && (
              <PersistentCartTab navigate={navigate} isActive={route === 'cart'} />
            )}
            {persistentAccountRef.current && (
              <PersistentAccountTab navigate={navigate} isActive={route === 'account'} />
            )}
            {!TAB_ROUTES.has(route) && (
              <div className="bs-tab-overlay">
                <BookshopErrorBoundary>
                  <BookshopBackButton navigate={navigate} />
                  {page}
                  <Footer navigate={navigate} />
                </BookshopErrorBoundary>
              </div>
            )}
          </div>
          <BottomNav route={route} navigate={navigate} onReTap={handleTabReTap} />
        </div>
        <Footer navigate={navigate} />
        <ScrollToTopFab route={route} />
        <WhatsAppFab route={route} />
      </div>
    );
  }

  return (
    <div className="bs">
      <Navbar route={route} navigate={navigate} />
      <main className={mainClassName}>
        {route !== 'home' && <BookshopBackButton navigate={navigate} />}
        {persistentHomeRef.current && (
          <div style={route !== 'home' ? { display: 'none' } : undefined}>
            <HomePage navigate={navigate} active={route === 'home'} onLoadingChange={setHomeLoading} />
          </div>
        )}
        {persistentShopRef.current && (
          <div style={route !== 'shop' ? { display: 'none' } : undefined}>
            <ShopPage navigate={navigate} initialBrowse={initialBrowse} initialQuery={params.q || ''} active={route === 'shop'} scrollContainerRef={shopScrollRef} />
          </div>
        )}
        {persistentCartRef.current && (
          <div style={route !== 'cart' ? { display: 'none' } : undefined}>
            <CartPage navigate={navigate} />
          </div>
        )}
        {persistentAccountRef.current && (
          <div style={route !== 'account' ? { display: 'none' } : undefined}>
            <AccountPage navigate={navigate} />
          </div>
        )}
        <BookshopErrorBoundary>
          {page}
        </BookshopErrorBoundary>
      </main>
      {!(route === 'home' && homeLoading) && <Footer navigate={navigate} />}
      <ScrollToTopFab route={route} />
      <WhatsAppFab route={route} />
      <BottomNav route={route} navigate={navigate} onReTap={handleTabReTap} />
    </div>
  );
};

const BookshopApp = () => (
  <CatalogProvider>
    <CartProvider>
      <App />
    </CartProvider>
  </CatalogProvider>
);

export default BookshopApp;
