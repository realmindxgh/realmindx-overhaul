import React from 'react';
import { CartProvider, CartCtx, Navbar, Footer, WhatsAppFab, BottomNav } from './chrome.jsx';
import { useIdleTimeout } from '../src/lib/useIdleTimeout.js';
import { IdleWarning } from '../src/lib/IdleWarning.jsx';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { signOut } from '../src/lib/authClient.js';
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

  // Page titles + OG meta per bookshop route
  React.useEffect(() => {
    const BASE = 'https://realmindxgh.com';
    const meta = {
      home:     { title: 'RealMindX Bookshop | Educational Books & Stationery Ghana', desc: 'Shop textbooks, curricula, stationery and learning materials. Fast delivery across Ghana. Wholesale pricing for schools.' },
      shop:     { title: 'Browse Educational Books & Textbooks | RealMindX Bookshop', desc: 'Find BECE, WASSCE, primary and JHS textbooks, curricula and stationery. In-stock items with delivery across Ghana.' },
      product:  { title: 'Product | RealMindX Bookshop', desc: 'Educational books and materials available at the RealMindX Bookshop, Accra, Ghana.' },
      cart:     { title: 'Your Cart | RealMindX Bookshop', desc: '' },
      checkout: { title: 'Checkout | RealMindX Bookshop', desc: '' },
      track:    { title: 'Track Your Order | RealMindX Bookshop', desc: 'Track your RealMindX Bookshop order by reference number or email address.' },
      login:    { title: 'Sign In | RealMindX Bookshop', desc: 'Sign in to your RealMindX account to track orders, save favourites, and check out faster.' },
      signup:   { title: 'Create Account | RealMindX Bookshop', desc: 'Join the RealMindX Bookshop to track orders, save books, and enjoy a faster checkout experience.' },
      contact:  { title: 'Contact the Bookshop | RealMindX', desc: 'Contact RealMindX Bookshop at Dome Pillar 2, Accra. Call +233 55 803 9190 or send a message.' },
      about:    { title: 'About the Bookshop | RealMindX', desc: 'Learn about the RealMindX Bookshop — Ghana\'s educational books and stationery shop.' },
      privacy:  { title: 'Privacy Policy | RealMindX Bookshop', desc: 'How the RealMindX Bookshop collects, uses, and protects your personal information.' },
      terms:    { title: 'Terms and Conditions | RealMindX Bookshop', desc: 'Terms governing your use of the RealMindX Bookshop and any purchases you make.' },
    };
    const m = meta[route] || { title: 'RealMindX Bookshop', desc: 'Educational books and stationery for Ghanaian students and schools.' };
    document.title = m.title;
    const paths = { home:'/bookshop', shop:'/bookshop/products', product:'/bookshop/products', cart:'/bookshop/cart', checkout:'/bookshop/checkout', track:'/bookshop/track', login:'/bookshop/login', signup:'/bookshop/signup', contact:'/bookshop/contact', about:'/bookshop/about', privacy:'/bookshop/privacy', terms:'/bookshop/terms' };
    const url = `${BASE}${paths[route] || '/bookshop'}`;
    const setM = (k, v) => { if (!v) return; let el = document.querySelector(`meta[name="${k}"]`) || document.querySelector(`meta[property="${k}"]`); if (!el) { el = document.createElement('meta'); el.setAttribute(k.startsWith('og:') ? 'property' : 'name', k); document.head.appendChild(el); } el.setAttribute('content', v); };
    if (m.desc) { setM('description', m.desc); setM('og:description', m.desc); setM('twitter:description', m.desc); }
    setM('og:title', m.title); setM('og:url', url); setM('og:image', `${BASE}/og-image-bookshop.png`); setM('og:site_name', 'RealMindX Bookshop'); setM('twitter:title', m.title); setM('twitter:image', `${BASE}/og-image-bookshop.png`);
    let canon = document.querySelector('link[rel="canonical"]'); if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); } canon.href = url;
  }, [route]);

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

  const session = getDemoSession();
  const { countdown: idleCountdown, keepAlive } = useIdleTimeout({
    enabled: Boolean(session?.role),
    onTimeout: async () => {
      await signOut();
      navigate('login');
    },
  });

  return (
    <div className="bs">
      <Navbar route={route} navigate={navigate} />
      <main className="bs-page">{page}</main>
      <Footer navigate={navigate} />
      <WhatsAppFab />
      <BottomNav route={route} navigate={navigate} />
      <IdleWarning
        countdown={idleCountdown}
        onKeepAlive={keepAlive}
        onLogout={async () => { await signOut(); navigate('login'); }}
      />
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
