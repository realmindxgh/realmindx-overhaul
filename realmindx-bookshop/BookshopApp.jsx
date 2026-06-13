import React from 'react';
import { CartProvider, CartCtx, Navbar, Footer, WhatsAppFab, BottomNav } from './chrome.jsx';
import { HomePage, ShopPage } from './pages-shop.jsx';
import { ProductPage, CartPage, WishlistPage } from './pages-product-cart.jsx';
import { CheckoutPage, TrackPage } from './pages-checkout.jsx';
import { AuthPage, ContactPage, InfoPage, BookshopLegalPage, AccountPage, OrdersPage } from './pages-misc.jsx';
import { CatalogProvider, useCatalog } from './catalog.jsx';
import { syncSessionFromApi } from '../src/lib/authClient.js';
import { setHeadLink, setHeadMeta, setStructuredData } from '../src/lib/head.js';
import { BOOKSHOP_BASE_URL, BOOKSHOP_DEFAULT_IMAGE } from '../src/lib/seoRoutes.js';
import { bookshopPathForRoute, canonicalBookshopBase, categoryHref, productHref, productMatchesSegment, productPathSegment } from './urls.js';

const GOLD_ACCENT = '#ffcc01';

// On bookshop.realmindxgh.com paths are /products, /cart etc.
// On realmindxgh.com they are /bookshop/products, /bookshop/cart etc.
const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';

const prefixedPath = (path) => `${PREFIX}${path}`;
const SHOP_ROBOTS_NOINDEX = new Set(['cart', 'wishlist', 'checkout', 'track', 'login', 'signup', 'account', 'orders']);
const canonicalUrlForRoute = (route, params = {}) => `${canonicalBookshopBase}${bookshopPathForRoute(route, params)}`;

const routeFromPath = () => {
  if (typeof window === 'undefined') return { route: 'home', params: {} };
  const path = window.location.pathname.replace(/\/+$/, '');
  const search = new URLSearchParams(window.location.search);
  const p = ON_SUBDOMAIN ? path : path.replace('/bookshop', '') || '/';
  const searchQuery = search.get('q') || '';
  const categoryQuery = search.get('category') || search.get('cat') || '';
  if (p === '/products') return { route: 'shop', params: { cat: categoryQuery || 'all', q: searchQuery } };
  if (p.startsWith('/products/')) return { route: 'product', params: { slug: decodeURIComponent(p.split('/products/')[1] || '') } };
  if (p.startsWith('/categories/')) return { route: 'shop', params: { cat: decodeURIComponent(p.split('/categories/')[1] || ''), q: searchQuery } };
  if (p === '/cart')      return { route: 'cart',     params: {} };
  if (p === '/wishlist')  return { route: 'wishlist', params: {} };
  if (p === '/checkout') return { route: 'checkout', params: {} };
  if (p === '/track' || p === '/track-order' || p === '/track-your-order') return { route: 'track', params: {} };
  if (p === '/login')    return { route: 'login',    params: {} };
  if (p === '/signup')   return { route: 'signup',   params: {} };
  if (p === '/contact')  return { route: 'contact',  params: {} };
  if (p === '/about')    return { route: 'about',    params: {} };
  if (p === '/privacy')  return { route: 'privacy',  params: {} };
  if (p === '/terms')    return { route: 'terms',    params: {} };
  if (p === '/account')  return { route: 'account',  params: {} };
  if (p === '/orders')   return { route: 'orders',   params: {} };
  return { route: 'home', params: {} };
};

const pathForRoute = (route, params = {}) => prefixedPath(bookshopPathForRoute(route, params));

// Paystack confirmation page: shown when user returns from Paystack payment
const PaystackReturnPage = ({ orderRef, navigate, clear }) => {
  React.useEffect(() => { clear(); }, [clear]);
  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-confirm" style={{ padding:'60px 24px' }}>
        <div className="bs-check-circle">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
        </div>
        <h1 className="bs-h2">Payment received!</h1>
        <p className="bs-muted">Your order <strong>{orderRef}</strong> has been placed and payment confirmed. A confirmation email is on its way.</p>
        <div className="bs-confirm-actions" style={{ marginTop:28 }}>
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('track')}>Track Your Order</button>
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('shop')}>Continue Shopping</button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const { books, categories } = useCatalog();
  const initialRoute = React.useMemo(routeFromPath, []);
  const [route, setRoute] = React.useState(initialRoute.route);
  const [params, setParams] = React.useState(initialRoute.params);

  // Handle Paystack return: ?order=REF&status=paid in the URL
  const [paystackReturn, setPaystackReturn] = React.useState(() => {
    if (typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    const order = sp.get('order');
    const status = sp.get('status');
    return (order && status === 'paid') ? order : null;
  });

  const navigate = (r, p = {}) => {
    setRoute(r);
    setParams(p);
    const nextPath = pathForRoute(r, p);
    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    window.scrollTo(0, 0);
  };

  const activeProduct = route === 'product'
    ? books.find(book => String(book.id) === String(params.id))
      || books.find(book => productMatchesSegment(book, params.slug))
      || null
    : null;
  const activeCategory = route === 'shop' && params.cat && params.cat !== 'all'
    ? categories.find(category => category.id === params.cat)
    : null;
  const categoryLabel = activeCategory?.name || (params.cat && params.cat !== 'all' ? params.cat : null);
  const activeCategoryCount = route === 'shop' && params.cat && params.cat !== 'all'
    ? books.filter(book => (
      params.cat === 'curriculum'
        ? Boolean(book.curriculum || book.curriculumName)
        : book.cat === params.cat || book.curriculum === params.cat || book.curriculumName === params.cat
    )).length
    : null;
  const canonicalParams = route === 'product' && activeProduct
    ? { slug: productPathSegment(activeProduct) }
    : route === 'shop'
      ? { cat: params.cat, q: params.q }
      : params;
  const canonicalPath = bookshopPathForRoute(route, canonicalParams);
  const canonicalUrl = `${canonicalBookshopBase}${canonicalPath}`;

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
      login:    { title: 'Sign In | RealMindX Bookshop', desc: 'Sign in to your RealMindX account to track orders, save favourites, and check out faster.' },
      signup:   { title: 'Create Account | RealMindX Bookshop', desc: 'Join the RealMindX Bookshop to track orders, save books, and enjoy a faster checkout experience.' },
      contact:  { title: 'Contact the Bookshop | RealMindX', desc: 'Contact RealMindX Bookshop at Dome Pillar 2, Accra. Call +233 55 803 9190 or send a message.' },
      about:    { title: 'About the Bookshop | RealMindX', desc: 'Learn about the RealMindX Bookshop, Ghana\'s educational books and stationery shop.' },
      privacy:  { title: 'Privacy Policy | RealMindX Bookshop', desc: 'How the RealMindX Bookshop collects, uses, and protects your personal information.' },
      terms:    { title: 'Terms and Conditions | RealMindX Bookshop', desc: 'Terms governing your use of the RealMindX Bookshop and any purchases you make.' },
      account:  { title: 'My Account | RealMindX Bookshop', desc: 'Manage your RealMindX Bookshop account, view billing info, and access your order history.' },
      orders:   { title: 'My Orders | RealMindX Bookshop', desc: 'View all your past orders, track deliveries, and see order details.' },
    };
    let currentMeta = meta[route] || { title: 'RealMindX Bookshop', desc: 'Educational books and stationery for Ghanaian students and schools.' };
    let image = BOOKSHOP_DEFAULT_IMAGE;
    let structuredData = null;
    let robots = ON_SUBDOMAIN && !SHOP_ROBOTS_NOINDEX.has(route) ? 'index,follow' : 'noindex,follow';

    if (route === 'product') {
      if (activeProduct) {
        currentMeta = {
          title: `${activeProduct.title} | RealMindX Bookshop`,
          desc: activeProduct.short || activeProduct.desc || activeProduct.full || meta.product.desc,
        };
        image = activeProduct.image || BOOKSHOP_DEFAULT_IMAGE;
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: activeProduct.title,
          description: currentMeta.desc,
          image: image ? [image] : undefined,
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
          },
        };
      } else {
        currentMeta = {
          title: 'Product Not Found | RealMindX Bookshop',
          desc: 'That product link does not match a currently published RealMindX Bookshop item.',
        };
        robots = 'noindex,follow';
      }
    } else if (route === 'shop' && categoryLabel && !params.q) {
      const categoryDescription = activeCategory?.description
        || (params.cat === 'curriculum'
          ? 'Browse books grouped by curriculum, with useful category content and live product listings.'
          : `Browse ${categoryLabel.toLowerCase()} textbooks, learning materials, and school supplies from the RealMindX Bookshop.`);
      currentMeta = {
        title: `${categoryLabel} | RealMindX Bookshop`,
        desc: categoryDescription,
      };
      if (!activeCategoryCount) robots = 'noindex,follow';
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: currentMeta.title,
        description: currentMeta.desc,
        url: canonicalUrl,
      };
    } else if (route === 'shop' && params.q) {
      currentMeta = {
        title: `Search results for "${params.q}" | RealMindX Bookshop`,
        desc: `Browse RealMindX Bookshop results for ${params.q}.`,
      };
      robots = 'noindex,follow';
    }

    document.title = currentMeta.title;
    setHeadMeta('description', currentMeta.desc);
    setHeadMeta('robots', robots);
    setHeadMeta('og:type', route === 'product' ? 'product' : 'website', { property: true });
    setHeadMeta('og:title', currentMeta.title, { property: true });
    setHeadMeta('og:description', currentMeta.desc, { property: true });
    setHeadMeta('og:url', canonicalUrl, { property: true });
    setHeadMeta('og:image', image, { property: true });
    setHeadMeta('og:site_name', 'RealMindX Bookshop', { property: true });
    setHeadMeta('twitter:card', 'summary_large_image');
    setHeadMeta('twitter:title', currentMeta.title);
    setHeadMeta('twitter:description', currentMeta.desc);
    setHeadMeta('twitter:image', image);
    setHeadLink('canonical', canonicalUrl);
    setStructuredData('bookshop-route-seo', structuredData);
  }, [route, params.cat, params.id, params.q, params.slug, activeProduct, activeCategory, activeCategoryCount, categoryLabel, canonicalUrl, books]);

  React.useEffect(() => {
    document.body.classList.add('bs-has-bottomnav');
    return () => { document.body.classList.remove('bs-has-bottomnav'); };
  }, []);

  React.useEffect(() => {
    const onPop = () => {
      const next = routeFromPath();
      setRoute(next.route);
      setParams(next.params);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  let page;
  switch (route) {
    case 'home':     page = <HomePage navigate={navigate} />; break;
    case 'shop':     page = <ShopPage navigate={navigate} initialCat={params.cat || 'all'} initialQuery={params.q || ''} key={`${params.cat || 'all'}::${params.q || ''}::${params.sq || ''}`} />; break;
    case 'product':  page = <ProductPage navigate={navigate} bookId={activeProduct?.id} bookSlug={params.slug} key={activeProduct?.id || params.slug} />; break;
    case 'cart':     page = <CartPage navigate={navigate} />; break;
    case 'wishlist': page = <WishlistPage navigate={navigate} />; break;
    case 'checkout': page = <CheckoutPage navigate={navigate} />; break;
    case 'track':    page = <TrackPage navigate={navigate} />; break;
    case 'login':    page = <AuthPage navigate={navigate} mode="login" key="login" />; break;
    case 'signup':   page = <AuthPage navigate={navigate} mode="signup" key="signup" />; break;
    case 'contact':  page = <ContactPage navigate={navigate} />; break;
    case 'about':    page = <InfoPage navigate={navigate} />; break;
    case 'privacy':  page = <BookshopLegalPage type="privacy" />; break;
    case 'terms':    page = <BookshopLegalPage type="terms" />; break;
    case 'account':  page = <AccountPage navigate={navigate} />; break;
    case 'orders':   page = <OrdersPage navigate={navigate} />; break;
    default:         page = <HomePage navigate={navigate} />;
  }
  const mainClassName = `bs-page${route === 'login' || route === 'signup' ? ' bs-page-auth' : ''}`;

  const { clear } = React.useContext(CartCtx) || {};

  // Show Paystack confirmation if returning from payment
  if (paystackReturn) {
      return (
        <div className="bs">
        <Navbar route="home" navigate={(r) => { setPaystackReturn(null); navigate(r); }} />
        <main className={mainClassName}>
          <PaystackReturnPage
            orderRef={paystackReturn}
            navigate={(r) => { setPaystackReturn(null); navigate(r); }}
            clear={clear || (() => {})}
          />
        </main>
        <Footer navigate={navigate} />
        <WhatsAppFab route="home" />
        <BottomNav route="home" navigate={navigate} />
      </div>
    );
  }

  return (
    <div className="bs">
      <Navbar route={route} navigate={navigate} />
      <main className={mainClassName}>{page}</main>
      <Footer navigate={navigate} />
      <WhatsAppFab route={route} />
      <BottomNav route={route} navigate={navigate} />
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
