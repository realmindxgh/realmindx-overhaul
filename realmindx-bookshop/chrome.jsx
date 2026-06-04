import React from 'react';
import { Icon, Stars, cedis, CoverPlaceholder, Logo } from './shared.jsx';
import { useCatalog } from './catalog.jsx';
import logoWhite from '../realmindx-site/assets/logo-white.png';

// ---------- Cart store (context) ----------
const CartCtx = React.createContext(null);
const useCart = () => React.useContext(CartCtx);

import { getDemoSession } from '../src/lib/demoAccounts.js';
import { isApiMode } from '../src/lib/apiClient.js';

const isLoggedIn = () => {
  const s = getDemoSession();
  return Boolean(s?.role);
};

// Nudge toast: shown once per session after adding to cart when not logged in
let nudgeShown = false;

const CartProvider = ({ children, navigate }) => {
  const { books } = useCatalog();
  const [items, setItems] = React.useState([]);
  const [toasts, setToasts] = React.useState([]);

  const toast = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  };
  const add = (bookId, qty = 1) => {
    setItems(prev => {
      const ex = prev.find(i => i.id === bookId);
      if (ex) return prev.map(i => i.id === bookId ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { id: bookId, qty }];
    });
    const b = books.find(x => x.id === bookId);
    toast(`Added "${b ? b.title : 'item'}" to cart`);
    // Subtle account nudge — shown once per session when not signed in
    if (!nudgeShown && !isLoggedIn()) {
      nudgeShown = true;
      setTimeout(() => {
        setToasts(t => [...t, {
          id: '__nudge__',
          msg: '💡 Sign in to save your cart and access your order history.',
          isNudge: true,
        }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== '__nudge__')), 5000);
      }, 1400);
    }
  };
  const setQty = (bookId, qty) => setItems(prev => prev.map(i => i.id === bookId ? { ...i, qty: Math.max(1, qty) } : i));
  const remove = (bookId) => setItems(prev => prev.filter(i => i.id !== bookId));
  const clear  = () => setItems([]);

  // Resolve against the live catalogue; drop items whose product was
  // removed/unpublished in the admin console so totals stay correct.
  const detailed = items
    .map(i => { const b = books.find(x => x.id === i.id); return b ? { ...b, qty: i.qty } : null; })
    .filter(Boolean);
  const count = detailed.reduce((s, b) => s + b.qty, 0);
  const subtotal = detailed.reduce((s, b) => s + b.price * b.qty, 0);

  // Bulk Purchase Discount — applies when qty >= 10 for items whose category
  // has a bulk_discount_percent set (e.g. the "Bulk / Schools" category).
  // Only the qualifying items get the discount; others are full price.
  const bulkDiscounts = detailed
    .filter(b => b.qty >= 10 && b.bulkDiscountPct > 0)
    .map(b => ({
      id: b.id,
      title: b.title,
      qty: b.qty,
      pct: b.bulkDiscountPct,
      saving: b.price * b.qty * (b.bulkDiscountPct / 100),
    }));
  const bulkSaving = bulkDiscounts.reduce((s, d) => s + d.saving, 0);

  return (
    <CartCtx.Provider value={{ items, detailed, count, subtotal, bulkDiscounts, bulkSaving, add, setQty, remove, clear, toast, navigate }}>
      {children}
      <div className="bs-toast-wrap">
        {toasts.map(t => (
          <div className={`bs-toast${t.isNudge ? ' bs-toast-nudge' : ''}`} key={t.id}>
            {t.isNudge
              ? <><Icon name="user" size={15} className="bs-tc" style={{ opacity:.75 }} /> {t.msg}</>
              : <><Icon name="check" size={16} className="bs-tc" /> {t.msg}</>}
          </div>
        ))}
      </div>
    </CartCtx.Provider>
  );
};

// ---------- User account pill (navbar) ----------
const NavUserMenu = ({ navigate }) => {
  const session = getDemoSession();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!session?.role) {
    return (
      <button className="bs-icon-btn" aria-label="Sign in" onClick={() => navigate('login')}>
        <Icon name="user" size={21} />
      </button>
    );
  }

  const initials = session.initials || ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || 'ME';
  const name = [session.firstName, session.lastName].filter(Boolean).join(' ') || session.email;

  const handleSignOut = async () => {
    setOpen(false);
    const { signOut } = await import('../src/lib/authClient.js');
    await signOut();
    navigate('home');
  };

  return (
    <div className="bs-user-pill" ref={ref}>
      <button
        className="bs-user-pill-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={`Account menu for ${name}`}
        aria-expanded={open}
      >
        <span className="bs-user-avatar">{initials}</span>
        <span className="bs-user-name">{session.firstName || 'Account'}</span>
        <Icon name="chevDown" size={13} />
      </button>

      {open && (
        <div className="bs-user-dropdown">
          <div className="bs-user-dd-header">
            <span className="bs-user-dd-name">{name}</span>
            <span className="bs-user-dd-email">{session.email}</span>
          </div>
          <div className="bs-user-dd-divider" />
          <button className="bs-user-dd-item" onClick={() => { setOpen(false); navigate('track'); }}>
            <Icon name="truck" size={16} /> My Orders
          </button>
          <button className="bs-user-dd-item" onClick={() => { setOpen(false); window.location.href = '/portal'; }}>
            <Icon name="user" size={16} /> My RealMindX Profile
          </button>
          <div className="bs-user-dd-divider" />
          <button className="bs-user-dd-item bs-user-dd-signout" onClick={handleSignOut}>
            <Icon name="x" size={16} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

// ---------- Navbar ----------
const Navbar = ({ route, navigate }) => {
  const { count } = useCart();
  const { categories } = useCatalog();
  const [catsOpen, setCatsOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [q, setQ] = React.useState('');
  const catsRef = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (catsRef.current && !catsRef.current.contains(e.target)) setCatsOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  React.useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menuOpen]);

  const go = (r, e) => { if (e) e.preventDefault(); setMenuOpen(false); setCatsOpen(false); navigate(r); };
  const submitSearch = (e) => { e.preventDefault(); navigate('shop'); setSearching(false); };

  return (
    <>
      <nav className={`bs-nav${searching ? ' bs-searching' : ''}`}>
        <div className="bs-nav-inner">
          <Logo onClick={(e) => go('home', e)} />

          <form className="bs-nav-search" onSubmit={submitSearch}>
            <Icon name="search" size={19} className="bs-search-icn" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search textbooks, curriculum, stationery..." aria-label="Search the shop" />
          </form>

          <div className="bs-nav-actions">
            <button className="bs-icon-btn bs-nav-search-toggle" aria-label="Search" onClick={() => setSearching(true)}>
              <Icon name="search" size={21} />
            </button>
            <button className="bs-icon-btn bs-nav-search-toggle bs-close" aria-label="Close search" onClick={() => setSearching(false)}>
              <Icon name="close" size={21} />
            </button>

            <div className="bs-nav-cats" ref={catsRef}>
              <button className="bs-nav-cats-btn" onClick={() => setCatsOpen(o => !o)} aria-expanded={catsOpen}>
                <span>Categories</span> <Icon name="chevDown" size={15} />
              </button>
              <div className={`bs-cats-menu${catsOpen ? ' open' : ''}`}>
                {categories.map(c => (
                  <a key={c.id} href="#" onClick={(e) => { e.preventDefault(); setCatsOpen(false); navigate('shop', { cat: c.id }); }}>
                    <Icon name={c.icon} size={18} className="bs-ci" /> {c.name}
                  </a>
                ))}
              </div>
            </div>

            <NavUserMenu navigate={navigate} />
            <button className="bs-icon-btn" aria-label={`Cart, ${count} items`} onClick={() => navigate('cart')}>
              <Icon name="cart" size={21} />
              {count > 0 && <span className="bs-cart-badge">{count}</span>}
            </button>
            <button className="bs-hamburger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <span/><span/><span/>
            </button>
          </div>
        </div>
      </nav>

      {/* mobile full-screen menu */}
      <div className={`bs-mobile-menu${menuOpen ? ' open' : ''}`}>
        <div className="bs-mm-top">
          <Logo onClick={(e) => go('home', e)} />
          <button className="bs-mm-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><Icon name="close" size={26} /></button>
        </div>
        <form className="bs-mm-search" onSubmit={(e) => { e.preventDefault(); go('shop'); }}>
          <Icon name="search" size={19} className="bs-search-icn" />
          <input placeholder="Search the shop..." aria-label="Search" />
        </form>
        <nav className="bs-mm-links">
          {[['home','Home'],['shop','Shop'],['cart','Cart'],['track','Track Order'],['contact','Contact'],['about','About']].map(([r,l]) => (
            <a key={r} href="#" className={route === r ? 'active' : ''} onClick={(e) => go(r, e)}>
              {l} <Icon name="chevR" size={20} className="bs-ci" />
            </a>
          ))}
        </nav>
        <div className="bs-mm-foot">RealMindX Bookshop - Dome Pillar 2, Accra</div>
      </div>
    </>
  );
};

// ---------- Footer ----------
const Footer = ({ navigate }) => (
  <footer className="bs-footer">
    <div className="bs-container">
      <div className="bs-footer-grid">
        <div>
          <div className="bs-footer-logo"><img src={logoWhite} alt="RealMindX Bookshop" /></div>
          <p className="bs-footer-tag">Learning materials for every Ghanaian student.</p>
          <div className="bs-footer-socials">
            <a href="https://wa.link/q5rjtp" aria-label="WhatsApp"><Icon name="wa" size={17} /></a>
            <a href="#" aria-label="Facebook"><Icon name="facebook" size={17} /></a>
            <a href="#" aria-label="Instagram"><Icon name="instagram" size={17} /></a>
            <a href="#" aria-label="X"><Icon name="x" size={17} /></a>
          </div>
        </div>
        <div>
          <h4>Quick Links</h4>
          <div className="bs-footer-links">
            <a href="#" onClick={(e)=>{e.preventDefault();navigate('shop');}}>Shop All Books</a>
            <a href="#" onClick={(e)=>{e.preventDefault();navigate('shop');}}>All Curricula</a>
            <a href="#" onClick={(e)=>{e.preventDefault();navigate('track');}}>Track an Order</a>
            <a href="#" onClick={(e)=>{e.preventDefault();navigate('about');}}>About Us</a>
            <a href="#" onClick={(e)=>{e.preventDefault();navigate('contact');}}>Contact</a>
          </div>
        </div>
        <div>
          <h4>Contact</h4>
          <div className="bs-footer-contact">
            <span><Icon name="pin" size={17} className="bs-ci" /> Dome Pillar 2, Accra, Ghana</span>
            <a href="mailto:bookshop@realmindxgh.com"><Icon name="mail" size={17} className="bs-ci" /> bookshop@realmindxgh.com</a>
            <span><Icon name="phone" size={17} className="bs-ci" /> +233 55 803 9190</span>
            <span style={{ marginLeft: 27 }}>+233 55 452 9493</span>
          </div>
        </div>
        <div>
          <h4>Legal</h4>
          <div className="bs-footer-links">
            <a href="/bookshop/privacy">Bookshop Privacy Policy</a>
            <a href="/bookshop/terms">Bookshop Terms</a>
            <a href="https://schoolms.realmindxgh.com/">SchoolMS</a>
            <a href="/donate">Donate</a>
          </div>
        </div>
      </div>
      <div className="bs-footer-bottom">
        &copy; {new Date().getFullYear()} RealMindX Education Limited. All rights reserved.
        <span style={{ margin: '0 10px', opacity: 0.4 }}>-</span>
        <a href="/bookshop/privacy" style={{ color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</a>
        <span style={{ margin: '0 8px', opacity: 0.4 }}>-</span>
        <a href="/bookshop/terms" style={{ color: 'rgba(255,255,255,0.5)' }}>Terms of Service</a>
      </div>
    </div>
  </footer>
);

// ---------- Floating WhatsApp ----------
const WhatsAppFab = () => (
  <a className="bs-wa-fab" href="https://wa.link/q5rjtp" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
    <Icon name="wa" size={28} />
  </a>
);

// ---------- Mobile bottom nav ----------
const BottomNav = ({ route, navigate }) => {
  const { count } = useCart();
  const items = [['home','Home','home'],['shop','Shop','shop'],['cart','Cart','cart'],['login','Account','user']];
  return (
    <nav className="bs-bottom-nav">
      {items.map(([r,l,icn]) => (
        <a key={r} href="#" className={route === r ? 'active' : ''} onClick={(e) => { e.preventDefault(); navigate(r); }}>
          <Icon name={icn} size={22} />
          {l}
          {r === 'cart' && count > 0 && <span className="bs-bn-badge">{count}</span>}
        </a>
      ))}
    </nav>
  );
};

const RatingLine = ({ book, size = 13 }) => {
  const count = Number(book?.reviews || 0);
  const rating = Number(book?.rating || 0);
  if (!count || !rating) {
    return <span className="bs-no-rating">No ratings yet</span>;
  }
  return (
    <span className="bs-rating-line">
      <Stars value={rating} size={size} />
      <span>{rating.toFixed(1)} / 5</span>
      <span className="bs-rating-count">{count} review{count === 1 ? '' : 's'}</span>
    </span>
  );
};

// ---------- Product card ----------
const ProductCard = ({ book, idx = 0, navigate }) => {
  const { add } = useCart();
  const [added, setAdded] = React.useState(false);
  const onAdd = (e) => {
    e.stopPropagation();
    add(book.id);
    setAdded(true); setTimeout(() => setAdded(false), 1200);
  };
  return (
    <div className={`bs-pcard${book.stock ? '' : ' bs-oos'}`} onClick={() => navigate('product', { id: book.id })} style={{ cursor:'pointer' }}>
      <div className="bs-pcard-cover">
        {book.badge && <span className="bs-cover-badge">{book.badge}</span>}
        <CoverPlaceholder title={book.title} idx={idx} image={book.image} />
      </div>
      <div className="bs-pcard-body">
        <div className={`bs-pcard-stock ${book.stock ? 'bs-stock-in' : 'bs-stock-out'}`}>
          <span className={`bs-dot ${book.stock ? 'in' : 'out'}`} />
          {book.stock ? 'In Stock' : 'Out of Stock'}
        </div>
        <div className="bs-pcard-title">{book.title}</div>
        <div className="bs-pcard-desc">{book.desc}</div>
        {(book.publisher || book.author) && (
          <div className="bs-pcard-meta">{book.publisher || book.author}</div>
        )}
        <div className="bs-pcard-price">{cedis(book.price)}</div>
        <div className="bs-pcard-foot">
          <RatingLine book={book} size={13} />
          {book.stock
            ? <button className={`bs-add-btn${added ? ' added' : ''}`} onClick={onAdd} aria-label="Add to cart">
                <Icon name={added ? 'check' : 'plus'} size={18} />
              </button>
            : <button className="bs-notify-btn" onClick={(e)=>{e.stopPropagation();}}>Notify Me</button>}
        </div>
      </div>
    </div>
  );
};

// ---------- List-view card ----------
const ListCard = ({ book, idx = 0, navigate }) => {
  const { add } = useCart();
  return (
    <div className="bs-lcard" onClick={() => navigate('product', { id: book.id })} style={{ cursor:'pointer' }}>
      <div className="bs-lcard-cover"><CoverPlaceholder title={book.title} idx={idx} small image={book.image} /></div>
      <div className="bs-lcard-mid">
        <span className="bs-cat-badge">{book.catName}</span>
        <div className="bs-cart-item-title">{book.title}</div>
        <div className="bs-pcard-desc" style={{ whiteSpace:'normal' }}>{book.desc}</div>
        <div className={`bs-list-stock-row ${book.stock ? 'bs-stock-in' : 'bs-stock-out'}`}>
          <span className={`bs-dot ${book.stock ? 'in' : 'out'}`} />
          {book.stock ? 'In Stock' : 'Out of Stock'}
        </div>
        <RatingLine book={book} size={13} />
      </div>
      <div className="bs-lcard-right">
        <div className="bs-pcard-price" style={{ fontSize:18 }}>{cedis(book.price)}</div>
        {book.stock
          ? <button className="bs-btn bs-btn-navy" onClick={(e)=>{e.stopPropagation();add(book.id);}}><Icon name="plus" size={15}/> Add to Cart</button>
          : <button className="bs-btn bs-btn-outline-navy" disabled>Notify Me</button>}
      </div>
    </div>
  );
};

export { CartCtx, useCart, CartProvider, Navbar, Footer, WhatsAppFab, BottomNav, ProductCard, ListCard };
