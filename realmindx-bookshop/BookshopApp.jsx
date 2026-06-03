import React from 'react';
import { CartProvider, CartCtx, Navbar, Footer, WhatsAppFab, BottomNav } from './chrome.jsx';
import { HomePage, ShopPage } from './pages-shop.jsx';
import { ProductPage, CartPage } from './pages-product-cart.jsx';
import { CheckoutPage, TrackPage } from './pages-checkout.jsx';
import { AuthPage, ContactPage, InfoPage, BookshopLegalPage } from './pages-misc.jsx';
import { CatalogProvider } from './catalog.jsx';

const GOLD_ACCENT = '#ffcc01';

const routeFromPath = () => {
  if (typeof window === 'undefined') return { route: 'home', params: {} };
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/bookshop/products')) return { route: 'shop', params: {} };
  if (path.endsWith('/bookshop/cart')) return { route: 'cart', params: {} };
  if (path.endsWith('/bookshop/checkout')) return { route: 'checkout', params: {} };
  if (path.endsWith('/bookshop/track')) return { route: 'track', params: {} };
  if (path.endsWith('/bookshop/login')) return { route: 'login', params: {} };
  if (path.endsWith('/bookshop/signup')) return { route: 'signup', params: {} };
  if (path.endsWith('/bookshop/contact')) return { route: 'contact', params: {} };
  if (path.endsWith('/bookshop/about')) return { route: 'about', params: {} };
  if (path.endsWith('/bookshop/privacy')) return { route: 'privacy', params: {} };
  if (path.endsWith('/bookshop/terms')) return { route: 'terms', params: {} };
  return { route: 'home', params: {} };
};

const pathForRoute = route => ({
  home: '/bookshop',
  shop: '/bookshop/products',
  cart: '/bookshop/cart',
  checkout: '/bookshop/checkout',
  track: '/bookshop/track',
  login: '/bookshop/login',
  signup: '/bookshop/signup',
  contact: '/bookshop/contact',
  about: '/bookshop/about',
  privacy: '/bookshop/privacy',
  terms: '/bookshop/terms',
}[route] || '/bookshop');

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
          <button className="bs-btn bs-btn-outline-navy bs-btn-lg" onClick={() => navigate('shop')}>Continue Shopping</button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
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
    const nextPath = pathForRoute(r);
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    window.scrollTo(0, 0);
  };

  React.useEffect(() => {
    document.documentElement.style.setProperty('--bs-gold-live', GOLD_ACCENT);
  }, []);

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
    case 'shop':     page = <ShopPage navigate={navigate} initialCat={params.cat || 'all'} key={params.cat || 'all'} />; break;
    case 'product':  page = <ProductPage navigate={navigate} bookId={params.id} key={params.id} />; break;
    case 'cart':     page = <CartPage navigate={navigate} />; break;
    case 'checkout': page = <CheckoutPage navigate={navigate} />; break;
    case 'track':    page = <TrackPage navigate={navigate} />; break;
    case 'login':    page = <AuthPage navigate={navigate} mode="login" key="login" />; break;
    case 'signup':   page = <AuthPage navigate={navigate} mode="signup" key="signup" />; break;
    case 'contact':  page = <ContactPage navigate={navigate} />; break;
    case 'about':    page = <InfoPage navigate={navigate} />; break;
    case 'privacy':  page = <BookshopLegalPage type="privacy" />; break;
    case 'terms':    page = <BookshopLegalPage type="terms" />; break;
    default:         page = <HomePage navigate={navigate} />;
  }

  const { clear } = React.useContext(CartCtx) || {};

  // Show Paystack confirmation if returning from payment
  if (paystackReturn) {
    return (
      <div className="bs">
        <Navbar route="home" navigate={(r) => { setPaystackReturn(null); navigate(r); }} />
        <main className="bs-page">
          <PaystackReturnPage
            orderRef={paystackReturn}
            navigate={(r) => { setPaystackReturn(null); navigate(r); }}
            clear={clear || (() => {})}
          />
        </main>
        <Footer navigate={navigate} />
        <WhatsAppFab />
        <BottomNav route="home" navigate={navigate} />
      </div>
    );
  }

  return (
    <div className="bs">
      <Navbar route={route} navigate={navigate} />
      <main className="bs-page">{page}</main>
      <Footer navigate={navigate} />
      <WhatsAppFab />
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
