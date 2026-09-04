import React from 'react';
import { Icon, Stars, cedis, CoverPlaceholder, Logo } from './shared.jsx';
import { useCatalog, fromApiProduct } from './catalog.jsx';

import logoWhite from '../realmindx-site/assets/logo-white.png';
import { bookMatchesBookshopSearch, bookMatchesBookshopSearchIntent } from '../src/lib/bookshopTaxonomy.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { trackCartAction, trackSearchClick, trackWishlistAction } from '../src/lib/analytics.js';
import { syncSessionFromApi } from '../src/lib/authClient.js';
import { isApiMode, api } from '../src/lib/apiClient.js';
import { usePublicSettings } from '../src/lib/siteContent.js';
import globalToast from '../src/lib/toast.js';
import { clearCheckoutDraft } from './checkoutStorage.js';
import { bookshopPathForRoute, productHref, productPathSegment } from './urls.js';
import { fuzzyMatches, rankByFuzzyMatch } from '../src/lib/fuzzySearch.js';

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;
const hrefForProduct = (book) => `${PREFIX}${productHref(book)}`;
const hrefForBrowse = (taxonomy, value = '') => `${PREFIX}${bookshopPathForRoute('shop', { taxonomy, value })}`;

// ---------- Wishlist store ----------
const WishlistCtx = React.createContext(null);
const useWishlist = () => React.useContext(WishlistCtx);

const WISHLIST_STORAGE_KEY = 'rmx.bookshop.wishlist.v1';
const LEGACY_WISHLIST_STORAGE_KEYS = [
  'rmx.bookshop.wishlist',
  'realmindx.bookshop.wishlist',
  'bookshop.wishlist',
];

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

const removeStorageKeys = (keys) => {
  const store = storage();
  if (!store) return;
  keys.forEach((key) => {
    try {
      store.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  });
};

const parseStorageJson = (key) => {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    store.removeItem(key);
    return null;
  }
};

const legacyDemoProductId = (id) => isApiMode() && /^b\d+$/i.test(String(id || '').trim());

const readSavedWishlist = () => {
  const parsed = parseStorageJson(WISHLIST_STORAGE_KEY);
  removeStorageKeys(LEGACY_WISHLIST_STORAGE_KEYS);
  return Array.isArray(parsed)
    ? parsed
      .map(id => String(id).trim())
      .filter(id => id && !legacyDemoProductId(id))
    : [];
};

const WishlistProvider = ({ children }) => {
  const { loading: catalogLoading } = useCatalog();
  const [items, setItems] = React.useState(readSavedWishlist);
  const itemsRef = React.useRef(items);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
    itemsRef.current = items;
  }, [items]);

  const toggle = (bookId) => {
    const id = String(bookId);
    const hadItem = itemsRef.current.map(item => String(item)).includes(id);
    setItems(prev => (hadItem ? prev.filter(item => String(item) !== id) : [...prev, id]));
    trackWishlistAction(hadItem ? 'remove' : 'add', { productId: id });
  };
  const add = (bookId) => {
    const id = String(bookId);
    if (itemsRef.current.map(item => String(item)).includes(id)) return;
    setItems(prev => [...prev, id]);
    trackWishlistAction('add', { productId: id });
  };
  const remove = (bookId) => {
    const id = String(bookId);
    if (!itemsRef.current.map(item => String(item)).includes(id)) return;
    setItems(prev => prev.filter(item => String(item) !== id));
    trackWishlistAction('remove', { productId: id });
  };
  const removeMany = (bookIds) => {
    const ids = new Set((bookIds || []).map(id => String(id)));
    const removedIds = itemsRef.current
      .map(item => String(item))
      .filter(id => ids.has(id));
    if (!removedIds.length) return;
    setItems(prev => prev.filter(item => !ids.has(String(item))));
    removedIds.forEach(id => trackWishlistAction('remove', { productId: id }));
  };
  const has    = (bookId) => items.map(item => String(item)).includes(String(bookId));
  const count  = items.length;

  return (
    <WishlistCtx.Provider value={{ items, count, toggle, add, remove, removeMany, has }}>
      {children}
    </WishlistCtx.Provider>
  );
};

// ---------- Cart store (context) ----------
const CartCtx = React.createContext(null);
const useCart = () => React.useContext(CartCtx);

const CART_STORAGE_KEY = 'rmx.bookshop.cart.v1';
const LEGACY_CART_STORAGE_KEYS = [
  'rmx.bookshop.cart',
  'realmindx.bookshop.cart',
  'bookshop.cart',
  'bookshopCart',
];

const normalizeStoredCartItem = (item) => {
  const rawId = typeof item === 'string' || typeof item === 'number'
    ? item
    : item?.id ?? item?.productId ?? item?.product_id ?? item?.bookId;
  const id = String(rawId ?? '').trim();
  if (!id || id === 'undefined' || id === 'null' || legacyDemoProductId(id)) return null;
  const qty = typeof item === 'object' && item !== null
    ? item.qty ?? item.quantity
    : 1;
  return {
    id,
    qty: Math.max(1, Number(qty || 1)),
    selected: typeof item === 'object' && item !== null ? item.selected !== false : true,
  };
};

const normalizeStoredCart = (value) => (
  Array.isArray(value)
    ? value.map(normalizeStoredCartItem).filter(Boolean)
    : []
);

const readSavedCart = () => {
  const store = storage();
  if (!store) return [];
  const current = normalizeStoredCart(parseStorageJson(CART_STORAGE_KEY));
  if (current.length > 0 || store.getItem(CART_STORAGE_KEY)) {
    removeStorageKeys(LEGACY_CART_STORAGE_KEYS);
    return current;
  }

  for (const key of LEGACY_CART_STORAGE_KEYS) {
    const migrated = normalizeStoredCart(parseStorageJson(key));
    if (migrated.length > 0) {
      try {
        store.setItem(CART_STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        // Ignore migration write failures; in-memory cart still works.
      }
      removeStorageKeys(LEGACY_CART_STORAGE_KEYS);
      return migrated;
    }
  }
  removeStorageKeys(LEGACY_CART_STORAGE_KEYS);
  return [];
};

const clearBookshopCartStorage = () => {
  removeStorageKeys([CART_STORAGE_KEY, ...LEGACY_CART_STORAGE_KEYS]);
};

const mainPortalHref = () => {
  if (typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.')) {
    return 'https://realmindxgh.com/portal';
  }
  return '/portal';
};

const CartProvider = ({ children, navigate }) => {
  // CartProvider wraps WishlistProvider so both contexts are available everywhere
  return (
    <WishlistProvider>
      <CartProviderInner navigate={navigate}>{children}</CartProviderInner>
    </WishlistProvider>
  );
};

const CartProviderInner = ({ children, navigate }) => {
  const { books } = useCatalog();
  const [items, setItems] = React.useState(readSavedCart);
  const [productMap, setProductMap] = React.useState({});
  const [cartLoading, setCartLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const itemsRef = React.useRef(items);
  const lastFetchIdsRef = React.useRef('');
  const cartFetchGenerationRef = React.useRef(0);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    itemsRef.current = items;
  }, [items]);

  // Fetch product details for cart items via batch API
  React.useEffect(() => {
    const ids = [...new Set(items.map(i => String(i.id || '')).filter(Boolean))];
    if (ids.length === 0) {
      lastFetchIdsRef.current = '';
      cartFetchGenerationRef.current += 1;
      setProductMap(current => Object.keys(current).length ? {} : current);
      setCartLoading(false);
      setError('');
      return;
    }
    const key = [...ids].sort().join(',');
    if (key === lastFetchIdsRef.current) return;
    lastFetchIdsRef.current = key;
    const requestGeneration = ++cartFetchGenerationRef.current;
    const alreadyResolved = ids.every(id => Boolean(productMap[id]));
    if (alreadyResolved) {
      setProductMap(current => {
        const next = {};
        ids.forEach(id => { if (current[id]) next[id] = current[id]; });
        const currentKeys = Object.keys(current);
        return currentKeys.length === Object.keys(next).length && currentKeys.every(id => current[id] === next[id])
          ? current
          : next;
      });
      setCartLoading(false);
      setError('');
      return;
    }
    setCartLoading(Object.keys(productMap).length === 0);
    setError('');
    if (isApiMode()) {
      api.fetchProductBatch(ids).then((data) => {
        if (requestGeneration !== cartFetchGenerationRef.current) return;
        const map = {};
        (data.items || []).forEach((p) => { map[String(p.id)] = fromApiProduct(p); });
        setProductMap(map);
        setCartLoading(false);
      }).catch((err) => {
        if (requestGeneration !== cartFetchGenerationRef.current) return;
        lastFetchIdsRef.current = '';
        setError(err.message || 'Could not load product details.');
        setCartLoading(false);
      });
    } else {
      if (requestGeneration !== cartFetchGenerationRef.current) return;
      if (books && books.length) {
        const map = {};
        books.forEach((b) => { map[String(b.id)] = b; });
        setProductMap(map);
      }
      setCartLoading(false);
    }
  }, [items, books, productMap]);

  React.useEffect(() => {
    if (items.length === 0) clearCheckoutDraft();
  }, [items.length]);

  const add = (bookId, qty = 1) => {
    const safeQty = Math.max(1, Number(qty) || 1);
    const id = String(bookId);
    setItems(prev => {
      const ex = prev.find(i => String(i.id) === id);
      if (ex) return prev.map(i => String(i.id) === id ? { ...i, qty: i.qty + safeQty, selected: true } : i);
      return [...prev, { id, qty: safeQty, selected: true }];
    });
    globalToast.success('Added item to cart');
    trackCartAction('add', { productId: id, quantity: safeQty });
  };
  const addMany = (bookIds, qty = 1) => {
    const safeQty = Math.max(1, Number(qty) || 1);
    const ids = [...new Set((bookIds || []).map(id => String(id)).filter(Boolean))];
    if (!ids.length) return 0;
    setItems(prev => {
      const next = [...prev];
      ids.forEach(id => {
        const index = next.findIndex(item => String(item.id) === id);
        if (index >= 0) {
          next[index] = { ...next[index], qty: next[index].qty + safeQty, selected: true };
        } else {
          next.push({ id, qty: safeQty, selected: true });
        }
      });
      return next;
    });
    ids.forEach(id => trackCartAction('add', { productId: id, quantity: safeQty }));
    return ids.length;
  };
  const buyNow = (bookId, qty = 1) => {
    const safeQty = Math.max(1, Number(qty) || 1);
    const id = String(bookId);
    setItems(prev => {
      const exists = prev.some(item => String(item.id) === id);
      const next = prev.map(item => (
        String(item.id) === id
          ? { ...item, qty: safeQty, selected: true }
          : { ...item, selected: false }
      ));
      return exists ? next : [...next, { id, qty: safeQty, selected: true }];
    });
    trackCartAction('add', { productId: id, quantity: safeQty });
    navigate?.('checkout');
  };
  const setQty = (bookId, qty) => {
    const nextQty = Math.max(1, Number(qty) || 1);
    const id = String(bookId);
    const current = itemsRef.current.find(item => String(item.id) === id);
    if (current) {
      const delta = nextQty - current.qty;
      if (delta > 0) trackCartAction('add', { productId: id, quantity: delta });
      if (delta < 0) trackCartAction('remove', { productId: id, quantity: Math.abs(delta) });
    }
    setItems(prev => prev.map(i => String(i.id) === id ? { ...i, qty: nextQty } : i));
  };
  const remove = (bookId) => {
    const id = String(bookId);
    const current = itemsRef.current.find(item => String(item.id) === id);
    if (current) trackCartAction('remove', { productId: id, quantity: current.qty });
    setItems(prev => prev.filter(i => String(i.id) !== id));
  };
  const toggleSelected = (bookId) => {
    const id = String(bookId);
    setItems(prev => prev.map(item => (
      String(item.id) === id ? { ...item, selected: item.selected === false } : item
    )));
  };
  const selectAll = () => setItems(prev => prev.map(item => ({ ...item, selected: true })));
  const deselectAll = () => setItems(prev => prev.map(item => ({ ...item, selected: false })));
  const clear  = () => {
    clearBookshopCartStorage();
    clearCheckoutDraft();
    setItems([]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('rmx-bookshop-cart-cleared'));
    }
  };
  const clearSelected = () => setItems(prev => prev.filter(item => item.selected === false));

  const rawCount = items.reduce((s, item) => s + item.qty, 0);
  const detailed = items
    .map(i => { const b = productMap[String(i.id)]; return b ? { ...b, qty: i.qty, selected: i.selected !== false } : null; })
    .filter(Boolean);
  const selectedDetailed = detailed.filter(item => item.selected && item.stock);
  const count = detailed.reduce((s, item) => s + item.qty, 0);
  // One source of truth for every cart badge and summary: total units in the
  // validated cart. A cart with one title at quantity 27 must read 27
  // everywhere, not 1 in navigation and 27 on the cart page.
  const productCount = count;
  const selectedCount = selectedDetailed.reduce((s, item) => s + item.qty, 0);
  const subtotal = detailed.reduce((s, b) => s + b.price * b.qty, 0);
  const selectedSubtotal = selectedDetailed.reduce((s, b) => s + b.price * b.qty, 0);
  const loading = cartLoading;

  // Bulk Purchase Discount — applies at the category's configured threshold.
  // Only the qualifying items get the discount; others are full price.
  const bulkDiscounts = detailed
    .filter(b => b.qty >= (Number(b.bulkMinQty) || 10) && b.bulkDiscountPct > 0)
    .map(b => ({
      id: b.id,
      title: b.title,
      qty: b.qty,
      pct: b.bulkDiscountPct,
      minQty: Number(b.bulkMinQty) || 10,
      saving: b.price * b.qty * (b.bulkDiscountPct / 100),
    }));
  const bulkSaving = bulkDiscounts.reduce((s, d) => s + d.saving, 0);
  const selectedBulkDiscounts = selectedDetailed
    .filter(b => b.qty >= (Number(b.bulkMinQty) || 10) && b.bulkDiscountPct > 0)
    .map(b => ({
      id: b.id,
      title: b.title,
      qty: b.qty,
      pct: b.bulkDiscountPct,
      minQty: Number(b.bulkMinQty) || 10,
      saving: b.price * b.qty * (b.bulkDiscountPct / 100),
    }));
  const selectedBulkSaving = selectedBulkDiscounts.reduce((s, d) => s + d.saving, 0);

  return (
    <CartCtx.Provider value={{
      items,
      detailed,
      selectedDetailed,
      count,
      productCount,
      selectedCount,
      subtotal,
      selectedSubtotal,
      bulkDiscounts,
      bulkSaving,
      selectedBulkDiscounts,
      selectedBulkSaving,
      add,
      addMany,
      buyNow,
      setQty,
      remove,
      clear,
      clearSelected,
      toggleSelected,
      selectAll,
      deselectAll,
      navigate,
      loading,
      error,
    }}>
      {children}
    </CartCtx.Provider>
  );
};

// ---------- User account pill (navbar) ----------
const NavUserMenu = ({ navigate }) => {
  const [session, setSession] = React.useState(() => (isApiMode() ? null : getDemoSession()));
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  React.useEffect(() => {
    const refresh = () => setSession(getDemoSession());
    window.addEventListener('rmx-session-sync', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('rmx-session-sync', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  React.useEffect(() => {
    let alive = true;
    syncSessionFromApi().then(freshSession => {
      if (alive) setSession(freshSession);
    });
    return () => { alive = false; };
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
        <span className="bs-user-avatar">
          {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials}
        </span>
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
          <button className="bs-user-dd-item" onClick={() => { setOpen(false); navigate('account'); }}>
            <Icon name="user" size={16} /> My Account
          </button>
          <div className="bs-user-dd-divider" />
          <button className="bs-user-dd-item bs-user-dd-signout" onClick={handleSignOut}>
            <Icon name="logout" size={16} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

const SearchSuggestionList = ({ suggestions, query, onSelect, onSubmit, className = '', onSuggestionClickStart }) => (
  <div className={`bs-search-suggestions${className ? ` ${className}` : ''}`} role="listbox">
    {suggestions.map((book) => (
      <a
        key={book.id}
        href={hrefForProduct(book)}
        role="option"
        className="bs-search-sug-item"
        onMouseDown={event => {
          event.preventDefault();
          onSuggestionClickStart?.();
        }}
        onClick={event => onSelect(event, book)}
      >
        <span className="bs-search-sug-cover" aria-hidden="true">
          <CoverPlaceholder title={book.title} image={book.imageThumb || book.image} small width={72} height={96} />
        </span>
        <span className="bs-search-sug-copy">
          <span className="bs-sug-title">{book.title}</span>
          <span className="bs-sug-cat">{cedis(book.price)}</span>
        </span>
      </a>
    ))}
    <button
      type="button"
      className="bs-sug-all"
      onMouseDown={event => {
        event.preventDefault();
        onSuggestionClickStart?.();
      }}
      onClick={onSubmit}
    >
      <Icon name="search" size={13} />
      <span>See all results for <strong>"{query.trim()}"</strong></span>
    </button>
  </div>
);

// ---------- Navbar ----------
const Navbar = ({ route, navigate }) => {
  const { productCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { books, taxonomies } = useCatalog();
  const [catsOpen, setCatsOpen] = React.useState(false);
  const [openBrowseGroup, setOpenBrowseGroup] = React.useState('');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [moreMenuStyle, setMoreMenuStyle] = React.useState({});
  const [navQuery, setNavQuery] = React.useState('');
  const [menuQuery, setMenuQuery] = React.useState('');
  const [debouncedNavQuery, setDebouncedNavQuery] = React.useState('');
  const [debouncedMenuQuery, setDebouncedMenuQuery] = React.useState('');
  const [searchSurface, setSearchSurface] = React.useState('');
  const [suggestionsSurface, setSuggestionsSurface] = React.useState('');
  const activeQuery = searchSurface === 'menu' ? menuQuery : navQuery;
  const catsRef = React.useRef(null);
  const catsSearchRef = React.useRef(null);
  const moreRef = React.useRef(null);
  // Bumped on every explicit search submission so ShopPage remounts even when
  // the same query text is submitted twice in a row (e.g. search "pencils",
  // clear it in-page, search "pencils" again — params.q alone wouldn't change).
  const searchSeq = React.useRef(0);

  const positionMoreMenu = React.useCallback((button) => {
    if (typeof window === 'undefined' || window.matchMedia('(max-width: 768px)').matches) {
      setMoreMenuStyle({});
      return;
    }
    const width = 340;
    const margin = 12;
    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const centeredLeft = rect.left + (rect.width / 2) - (width / 2);
    const left = Math.min(Math.max(margin, centeredLeft), maxLeft);
    setMoreMenuStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(rect.bottom + 4)}px`,
    });
  }, []);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (catsRef.current && !catsRef.current.contains(e.target)) {
        setCatsOpen(false);
        if (!suggestionClickRef.current) {
          setSearchSurface('');
          setMenuQuery('');
          setSuggestionsSurface('');
        }
      }
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  React.useEffect(() => {
    if (!catsOpen) return undefined;
    if (!window.matchMedia('(max-width: 768px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => catsSearchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [catsOpen]);

  React.useEffect(() => {
    if (!catsOpen) return undefined;
    if (!window.matchMedia('(max-width: 768px)').matches) return undefined;
    const menu = catsRef.current?.querySelector('.bs-cats-menu');
    if (!menu) return undefined;

    const fitMenuToVisibleViewport = () => {
      const viewport = window.visualViewport;
      const viewportBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
      const availableHeight = Math.max(120, Math.floor(viewportBottom - menu.getBoundingClientRect().top - 8));
      menu.style.setProperty('--bs-cats-menu-max-height', `${availableHeight}px`);
    };

    const frame = window.requestAnimationFrame(fitMenuToVisibleViewport);
    window.addEventListener('resize', fitMenuToVisibleViewport);
    window.visualViewport?.addEventListener('resize', fitMenuToVisibleViewport);
    window.visualViewport?.addEventListener('scroll', fitMenuToVisibleViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', fitMenuToVisibleViewport);
      window.visualViewport?.removeEventListener('resize', fitMenuToVisibleViewport);
      window.visualViewport?.removeEventListener('scroll', fitMenuToVisibleViewport);
      menu.style.removeProperty('--bs-cats-menu-max-height');
    };
  }, [catsOpen]);

  React.useEffect(() => {
    if (!moreOpen) {
      setMoreMenuStyle({});
      return undefined;
    }
    const button = moreRef.current?.querySelector('.bs-more-btn');
    if (!button) return undefined;
    positionMoreMenu(button);
    const reposition = () => positionMoreMenu(button);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [moreOpen, positionMoreMenu]);

  const [suggestions, setSuggestions] = React.useState([]);
  const abortRef = React.useRef(null);
  const suggestionClickRef = React.useRef(false);
  const blurTimerRef = React.useRef(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedNavQuery(navQuery), 300);
    return () => window.clearTimeout(timer);
  }, [navQuery]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedMenuQuery(menuQuery), 300);
    return () => window.clearTimeout(timer);
  }, [menuQuery]);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    const t = (searchSurface === 'menu' ? debouncedMenuQuery : debouncedNavQuery).trim();
    if (t.length < 2) {
      setSuggestions([]);
      setSuggestionsSurface(searchSurface === 'menu' ? 'menu' : 'nav');
      return;
    }
    if (!isApiMode()) {
      const candidates = books.filter(book => bookMatchesBookshopSearchIntent(book, t) && (bookMatchesBookshopSearch(book, t) || fuzzyMatches(
        [book.title, book.author, book.publisher, book.catName, book.subject, book.levelName, book.curriculumName, ...(book.tags || [])].filter(Boolean).join(' '),
        t,
      )));
      const local = rankByFuzzyMatch(candidates, t, book => [book.title, book.author, book.publisher, book.catName, book.subject, book.levelName, book.curriculumName, ...(book.tags || [])].filter(Boolean).join(' ')).slice(0, 6);
      setSuggestions(local);
      setSuggestionsSurface(searchSurface === 'menu' ? 'menu' : 'nav');
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    api.fetchProductSuggestions(t)
      .then(data => {
        if (!controller.signal.aborted) {
          setSuggestions((data.items || []).map(p => ({
            id: String(p.id),
            title: p.name,
            slug: p.slug || '',
            price: Number(p.price) || 0,
            image: p.image_url_thumb || null,
            imageThumb: p.image_url_thumb || null,
            author: p.author || '',
          })));
          setSuggestionsSurface(searchSurface === 'menu' ? 'menu' : 'nav');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([]);
      });
    return () => controller.abort();
  }, [books, searchSurface, debouncedNavQuery, debouncedMenuQuery]);

  const go = (r, e) => {
    if (e) e.preventDefault();
    setMenuOpen(false);
    setCatsOpen(false);
    setOpenBrowseGroup('');
    setMoreOpen(false);
    setSearchSurface('');
    setSuggestionsSurface('');
    setMenuQuery('');
    navigate(r);
  };

  const submitSearch = (e, queryValue) => {
    if (e) e.preventDefault();
    const t = (queryValue !== undefined ? queryValue : activeQuery).trim();
    navigate('shop', t ? { q: t, sq: ++searchSeq.current } : {});
    setCatsOpen(false);
    setOpenBrowseGroup('');
    setMoreOpen(false);
    setSearchSurface('');
    setSuggestionsSurface('');
    setMenuQuery('');
    setNavQuery('');
  };

  const selectSuggestion = (event, book) => {
    event.preventDefault();
    suggestionClickRef.current = false;
    const term = searchSurface === 'menu' ? menuQuery : navQuery;
    trackSearchClick({ term, productId: book.id, scope: 'bookshop', path: '/bookshop/products', source: 'suggestions' });
    navigate('product', { id: book.id, slug: productPathSegment(book) });
    setCatsOpen(false);
    setOpenBrowseGroup('');
    setMoreOpen(false);
    setSearchSurface('');
    setSuggestionsSurface('');
    if (searchSurface === 'menu') setMenuQuery(''); else setNavQuery('');
  };

  const quickSubjects = [
    { ids: ['mathematics', 'maths'], label: 'Maths' },
    { ids: ['english-language', 'english'], label: 'English' },
    { ids: ['science', 'integrated-science'], label: 'Science' },
  ].flatMap(({ ids, label }) => {
    const item = (taxonomies.subjects || []).find(candidate => ids.includes(candidate.id));
    return item ? [{ ...item, label }] : [];
  });

  const browseGroups = [
    { title: 'Subject', allLabel: 'Subjects', taxonomy: 'subject', icon: 'book', items: quickSubjects },
    { title: 'Level', allLabel: 'Levels', taxonomy: 'level', icon: 'cap', items: taxonomies.levels || [] },
    { title: 'Curriculum', allLabel: 'Curricula', taxonomy: 'curriculum', icon: 'files', items: taxonomies.curricula || [] },
    { title: 'Item Type', allLabel: 'Item Types', taxonomy: 'category', icon: 'box', items: taxonomies.categories || [] },
  ];
  const utilityLinks = [
    { route: 'request-book', label: 'Request a Book', icon: 'search', description: 'Tell us what book you need and we will find it' },
    { route: 'invoice', label: 'Receipt/Invoice Verification', icon: 'files', description: 'Verify receipts and PDF invoices' },
    { route: 'documents', label: 'Education Documents', icon: 'book', description: 'Browse useful education files' },
  ];

  const showNavSuggestions = suggestions.length > 0 && searchSurface === 'nav' && suggestionsSurface === 'nav';
  const showMenuSuggestions = suggestions.length > 0 && searchSurface === 'menu' && suggestionsSurface === 'menu';

  return (
    <>
      <nav className="bs-nav">
        <div className="bs-nav-inner">
          <Logo href={hrefForRoute('home')} onClick={(e) => go('home', e)} />

          <div className="bs-nav-search-wrap">
            <form
              className="bs-nav-search"
              onSubmit={(e) => submitSearch(e, e.currentTarget.elements.shopSearch?.value ?? navQuery)}
              autoComplete="off"
            >
              <Icon name="search" size={19} className="bs-search-icn" />
              <input
                type="search"
                name="shopSearch"
                data-form-icon="none"
                value={navQuery}
                onChange={e => {
                  setNavQuery(e.target.value);
                  setSearchSurface('nav');
                  setSuggestionsSurface('nav');
                }}
                onFocus={() => {
                  suggestionClickRef.current = false;
                  if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
                  setSearchSurface('nav');
                  setSuggestionsSurface('nav');
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') submitSearch(event, event.currentTarget.value);
                }}
                onBlur={() => {
                  if (suggestionClickRef.current) return;
                  blurTimerRef.current = setTimeout(() => {
                    blurTimerRef.current = null;
                    setSearchSurface(current => current === 'nav' ? '' : current);
                  }, 160);
                }}
                placeholder="Search textbooks, curriculum, stationery..."
                aria-label="Search the shop"
                aria-autocomplete="list"
                aria-expanded={showNavSuggestions}
              />
              {/* Submit button — inside the input, right side, visible when query has text */}
              {navQuery.trim() && (
                <button type="submit" className="bs-search-go" aria-label="Search">
                  <Icon name="arrow" size={15} />
                </button>
              )}
            </form>

            {/* Live suggestions dropdown */}
              {showNavSuggestions && <SearchSuggestionList suggestions={suggestions} query={navQuery} onSelect={selectSuggestion} onSubmit={(e) => submitSearch(e, navQuery)} onSuggestionClickStart={() => suggestionClickRef.current = true} />}
          </div>

          <div className="bs-nav-actions">
            <div className="bs-nav-cats" ref={catsRef}>
              <button
                className="bs-nav-cats-btn"
                onClick={() => {
                  setMenuOpen(false);
                  setMoreOpen(false);
                  setCatsOpen(open => {
                    if (open) setOpenBrowseGroup('');
                    const next = !open;
                    setSearchSurface(next ? 'menu' : '');
                    if (next) {
                      setMenuQuery('');
                      setSuggestionsSurface('');
                    }
                    return next;
                  });
                }}
                aria-expanded={catsOpen}
              >
                <Icon name="search" size={15} />
                <span>Quick Search</span>
                <Icon name="chevDown" size={14} />
              </button>
              <div className={`bs-cats-menu${catsOpen ? ' open' : ''}`}>
                <div className="bs-cats-search-wrap">
                  <form
                    className="bs-cats-search-form"
                    onSubmit={(e) => submitSearch(e, e.currentTarget.elements.shopMenuSearch?.value ?? menuQuery)}
                    autoComplete="off"
                  >
                    <Icon name="search" size={18} className="bs-search-icn" />
                    <input
                      type="search"
                      name="shopMenuSearch"
                      data-form-icon="none"
                      ref={catsSearchRef}
                      value={menuQuery}
                      onChange={event => {
                        setMenuQuery(event.target.value);
                        setSearchSurface('menu');
                        setSuggestionsSurface('menu');
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') submitSearch(event, event.currentTarget.value);
                      }}
                      onFocus={() => {
                        suggestionClickRef.current = false;
                        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; }
                        setSearchSurface('menu');
                        setSuggestionsSurface('menu');
                      }}
                      onBlur={() => {
                        if (suggestionClickRef.current) return;
                        blurTimerRef.current = setTimeout(() => {
                          blurTimerRef.current = null;
                          setSearchSurface(current => current === 'menu' ? '' : current);
                        }, 160);
                      }}
                      placeholder="Search textbooks, curriculum, stationery..."
                      aria-label="Search the shop"
                      aria-autocomplete="list"
                      aria-expanded={showMenuSuggestions}
                    />
                    {menuQuery.trim() && (
                      <button type="submit" className="bs-cats-search-go" aria-label="Search">
                        <Icon name="arrow" size={15} />
                      </button>
                    )}
                  </form>
                </div>
                {showMenuSuggestions ? (
                  <div className="bs-cats-results-scroll">
                    <SearchSuggestionList
                      suggestions={suggestions}
                      query={menuQuery}
                      onSelect={selectSuggestion}
                      onSubmit={(e) => submitSearch(e, menuQuery)}
                      className="bs-cats-search-suggestions"
                      onSuggestionClickStart={() => suggestionClickRef.current = true}
                    />
                  </div>
                ) : (
                  <div className="bs-cats-menu-scroll">
                    <a className="bs-cats-menu-entry" href={hrefForRoute('shop')} onClick={(e) => { e.preventDefault(); setCatsOpen(false); navigate('shop'); }}>
                      <Icon name="grid" size={18} className="bs-ci" /> All Books
                    </a>
                    {browseGroups.map((group) => (
                      <div className={`bs-cats-flyout${openBrowseGroup === group.taxonomy ? ' open' : ''}`} key={group.taxonomy}>
                        <button
                          type="button"
                          className="bs-cats-menu-entry has-submenu"
                          aria-expanded={openBrowseGroup === group.taxonomy}
                          onClick={() => setOpenBrowseGroup(current => current === group.taxonomy ? '' : group.taxonomy)}
                        >
                          <span className="bs-cats-menu-label"><Icon name={group.icon} size={17} className="bs-ci" /> {group.title}</span>
                          <Icon name={openBrowseGroup === group.taxonomy ? 'chevDown' : 'chevR'} size={14} className="bs-ci" />
                        </button>
                        <div className="bs-cats-submenu">
                          {group.items.map((item) => (
                            <a
                              key={`${group.taxonomy}-${item.id}`}
                              href={hrefForBrowse(group.taxonomy, item.id)}
                              onClick={(e) => { e.preventDefault(); setCatsOpen(false); setOpenBrowseGroup(''); navigate('shop', { taxonomy: group.taxonomy, value: item.id }); }}
                            >
                              {item.label}
                            </a>
                          ))}
                          <a
                            className="bs-cats-submenu-viewall"
                            href={hrefForBrowse(group.taxonomy)}
                            onClick={(e) => { e.preventDefault(); setCatsOpen(false); setOpenBrowseGroup(''); navigate('shop', { taxonomy: group.taxonomy }); }}
                          >
                            See all {group.allLabel.toLowerCase()}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button className="bs-track-pill" onClick={() => navigate('track')} title="Track your order">
              <Icon name="truck" size={15} />
              <span>Track Order</span>
            </button>
            <div className="bs-nav-user-slot"><NavUserMenu navigate={navigate} /></div>
            <button className="bs-icon-btn" aria-label={`Wishlist, ${wishlistCount} items`} onClick={() => navigate('wishlist')} title="Wishlist">
              <Icon name="heart" size={20} />
              {wishlistCount > 0 && <span className="bs-cart-badge">{wishlistCount}</span>}
            </button>
            <button className="bs-icon-btn" aria-label={`Cart, ${productCount} products`} onClick={() => navigate('cart')}>
              <Icon name="cart" size={21} />
              {productCount > 0 && <span className="bs-cart-badge">{productCount}</span>}
            </button>
            <div className="bs-more-nav" ref={moreRef}>
              <button
                className={`bs-icon-btn bs-more-btn${moreOpen ? ' open' : ''}`}
                aria-label="More bookshop options"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                title="More"
                onClick={(event) => {
                  setMenuOpen(false);
                  setCatsOpen(false);
                  setOpenBrowseGroup('');
                  setSearchSurface('');
                  if (!moreOpen) positionMoreMenu(event.currentTarget);
                  setMoreOpen(open => !open);
                }}
              >
                <Icon name="plus" size={21} />
              </button>
              <div className={`bs-more-menu${moreOpen ? ' open' : ''}`} role="menu" style={moreMenuStyle}>
                {utilityLinks.map(link => (
                  <a
                    key={link.route}
                    className={`bs-more-item${route === link.route ? ' active' : ''}`}
                    href={hrefForRoute(link.route)}
                    onClick={(event) => go(link.route, event)}
                    role="menuitem"
                  >
                    <Icon name={link.icon} size={18} className="bs-ci" />
                    <span>
                      <strong>{link.label}</strong>
                      <small>{link.description}</small>
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Hamburger — toggles the mobile menu. */}
            <button
              className={`bs-hamburger${menuOpen ? ' open' : ''}`}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => {
                setCatsOpen(false);
                setOpenBrowseGroup('');
                setMoreOpen(false);
                setMenuOpen(o => !o);
              }}
            >
              <span/><span/><span/>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu — slide down from top-right */}
      {/* Note: no redundant close button here — the hamburger in the navbar already animates to X */}
      <div className={`bs-mobile-menu${menuOpen ? ' open' : ''}`}>
        <nav className="bs-mm-links">
          {[['home','Home'],['shop','Shop'],['request-book','Request a Book'],['track','Track Order'],['invoice','Receipt/Invoice Verification'],['documents','Education Documents'],['contact','Contact'],['about','About']].map(([r,l]) => (
            <a key={r} href={hrefForRoute(r)} className={`bs-mm-item${route === r ? ' active' : ''}`} onClick={(e) => go(r, e)}>
              {l}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
};

// ---------- Footer ----------
const Footer = ({ navigate }) => {
  const settings = usePublicSettings();
  const phones = [
    settings.contact_phone_1,
    settings.contact_phone_2,
    settings.contact_phone_3,
  ].filter(Boolean);

  return (
    <footer className="bs-footer">
      <div className="bs-container">
        <div className="bs-footer-grid">
          <div>
            <div className="bs-footer-logo"><img src={logoWhite} alt="RealMindX Bookshop" /></div>
            <p className="bs-footer-tag">Learning materials for every Ghanaian student.</p>
            <div className="bs-footer-socials">
              <a href="https://wa.link/q5rjtp" target="_blank" rel="noopener" aria-label="WhatsApp"><Icon name="wa" size={17} /></a>
              <a href="https://web.facebook.com/profile.php?id=61566941171883" target="_blank" rel="noopener" aria-label="Facebook"><Icon name="facebook" size={17} /></a>
              <a href="https://www.instagram.com/realmindxgh/" target="_blank" rel="noopener" aria-label="Instagram"><Icon name="instagram" size={17} /></a>
              <a href="https://x.com/realmindxgh" target="_blank" rel="noopener" aria-label="X"><Icon name="x" size={17} /></a>
            </div>
          </div>
          <div>
            <h4>Quick Links</h4>
            <div className="bs-footer-links">
              <a href={hrefForRoute('shop')} onClick={(e)=>{e.preventDefault();navigate('shop');}}>All Products</a>
              <a href={hrefForBrowse('curriculum')} onClick={(e)=>{e.preventDefault();navigate('shop', { taxonomy: 'curriculum' });}}>All Curricula</a>
              <a href={hrefForRoute('request-book')} onClick={(e)=>{e.preventDefault();navigate('request-book');}}>Request a Book</a>
              <a href={hrefForRoute('track')} onClick={(e)=>{e.preventDefault();navigate('track');}}>Track an Order</a>
              <a href={hrefForRoute('invoice')} onClick={(e)=>{e.preventDefault();navigate('invoice');}}>Receipt/Invoice Verification</a>
              <a href={hrefForRoute('documents')} onClick={(e)=>{e.preventDefault();navigate('documents');}}>Education Documents</a>
              <a href={hrefForRoute('about')} onClick={(e)=>{e.preventDefault();navigate('about');}}>About Us</a>
              <a href={hrefForRoute('contact')} onClick={(e)=>{e.preventDefault();navigate('contact');}}>Contact</a>
            </div>
          </div>
          <div>
            <h4>Contact</h4>
            <div className="bs-footer-contact">
              {settings.contact_address ? <span><Icon name="pin" size={17} className="bs-ci" /> {settings.contact_address}</span> : null}
              {settings.contact_email ? <a href={`mailto:${settings.contact_email}`}><Icon name="mail" size={17} className="bs-ci" /> {settings.contact_email}</a> : null}
              {phones.map((phone, index) => (
                <a
                  key={phone}
                  href={`tel:${String(phone).replace(/\s+/g, '')}`}
                  style={index === 0 ? undefined : { marginLeft: 27 }}
                >
                  {index === 0 ? <Icon name="phone" size={17} className="bs-ci" /> : null}
                  {phone}
                </a>
              ))}
              {settings.working_hours_weekday ? (
                <span><Icon name="clock" size={17} className="bs-ci" /> {settings.working_hours_weekday}</span>
              ) : null}
              {settings.working_hours_saturday ? (
                <span style={{ marginLeft: 27 }}>{settings.working_hours_saturday}</span>
              ) : null}
            </div>
          </div>
          <div>
            <h4>Legal</h4>
            <div className="bs-footer-links">
              <a href={hrefForRoute('privacy')} onClick={(e)=>{e.preventDefault();navigate('privacy');}}>Bookshop Privacy Policy</a>
              <a href={hrefForRoute('terms')} onClick={(e)=>{e.preventDefault();navigate('terms');}}>Bookshop Terms</a>
              <a href="https://schoolms.realmindxgh.com/">SchoolMS</a>
              <a href="https://realmindxgh.com/donate">Donate</a>
            </div>
          </div>
        </div>
        <div className="bs-footer-bottom">
          &copy; {new Date().getFullYear()} RealMindX Education Limited. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

// ---------- Floating WhatsApp ----------
const WHATSAPP_HIDDEN_ROUTES = new Set(['track', 'invoice', 'login', 'signup', 'account', 'orders']);
const MOBILE_STICKY_DOCK_ROUTES = new Set(['cart', 'checkout', 'product']);

const WhatsAppFab = ({ route }) => (
  WHATSAPP_HIDDEN_ROUTES.has(route) ? null :
  <a
    className={`bs-wa-fab${MOBILE_STICKY_DOCK_ROUTES.has(route) ? ' has-sticky-dock' : ''}`}
    href="https://wa.link/q5rjtp"
    target="_blank"
    rel="noopener"
    aria-label="Chat on WhatsApp"
  >
    <Icon name="wa" size={28} />
  </a>
);

const getMobileScrollContainer = () => (
  document.querySelector('.bs-tab-panel.active')
  || document.querySelector('.bs-tab-overlay')
);

const getTabScrollTop = () => {
  const container = getMobileScrollContainer();
  return container ? container.scrollTop : window.scrollY;
};

const scrollTabOrWindow = (top, behavior) => {
  const container = getMobileScrollContainer();
  if (container) {
    container.scrollTo({ top, behavior });
  } else {
    window.scrollTo({ top, behavior });
  }
};

const ScrollToTopFab = ({ route }) => {
  const [visible, setVisible] = React.useState(false);
  const whatsappHidden = WHATSAPP_HIDDEN_ROUTES.has(route);

  React.useEffect(() => {
    const update = () => {
      const panel = getMobileScrollContainer();
      const pageTop = Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0, document.body?.scrollTop || 0);
      setVisible(Math.max(panel?.scrollTop || 0, pageTop) > 360);
    };
    const panel = getMobileScrollContainer();
    window.addEventListener('scroll', update, { passive: true });
    document.addEventListener('scroll', update, { passive: true, capture: true });
    panel?.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      document.removeEventListener('scroll', update, true);
      panel?.removeEventListener('scroll', update);
    };
  }, [route]);

  if (!visible) return null;
  return (
    <button
      type="button"
      className={`bs-scrolltop-fab${whatsappHidden ? ' is-solo' : ''}${MOBILE_STICKY_DOCK_ROUTES.has(route) ? ' has-sticky-dock' : ''}`}
      aria-label="Back to top"
      onClick={() => scrollTabOrWindow(0, 'smooth')}
    >
      <Icon name="arrowUp" size={21} stroke={2.2} />
    </button>
  );
};

// ---------- Mobile bottom nav ----------
const BottomNav = ({ route, navigate, onReTap }) => {
  const { count } = useCart();
  const [session, setSession] = React.useState(() => (isApiMode() ? null : getDemoSession()));
  React.useEffect(() => {
    const refresh = () => setSession(getDemoSession());
    window.addEventListener('rmx-session-sync', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('rmx-session-sync', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  React.useEffect(() => {
    let alive = true;
    syncSessionFromApi().then(freshSession => {
      if (alive) setSession(freshSession);
    });
    return () => { alive = false; };
  }, []);
  const items = [['home','Home','home'],['shop','Shop','shop'],['cart','Cart','cart'],['account','Account','user']];
  const isActive = (r) => r === 'account' ? (route === 'login' || route === 'signup' || route === 'account') : route === r;
  return (
    <nav className="bs-bottom-nav" role="tablist">
      {items.map(([r,l,icn]) => (
        <a key={r} href={hrefForRoute(r)} role="tab" aria-selected={isActive(r)} className={isActive(r) ? 'active' : ''} onClick={(e) => {
          e.preventDefault();
          const alreadyActive = isActive(r);
          if (r === 'account') {
            navigate(session?.role ? 'account' : 'login');
            if (alreadyActive && onReTap) onReTap(r);
            return;
          }
          navigate(r);
          if (alreadyActive && onReTap) onReTap(r);
        }}>
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
const ProductCard = React.memo(({ book, idx = 0, navigate, searchContext = null }) => {
  const { add } = useCart();
  const wishlist = useWishlist();
  const [added, setAdded] = React.useState(false);
  const productUrl = hrefForProduct(book);
  const openProduct = () => {
    if (searchContext?.term) {
      trackSearchClick({
        term: searchContext.term,
        productId: book.id,
        scope: searchContext.scope || 'bookshop',
        path: searchContext.path || '/bookshop/products',
        source: searchContext.source || 'results',
        position: searchContext.position,
      });
    }
    navigate('product', { id: book.id, slug: productPathSegment(book) });
  };
  const onAdd = (e) => {
    e.stopPropagation();
    add(book.id);
    setAdded(true); setTimeout(() => setAdded(false), 1200);
  };
  const onWishlist = (e) => {
    e.stopPropagation();
    wishlist.toggle(book.id);
  };
  const wishlisted = wishlist?.has(book.id);
  const coverImage = book.imageThumb || book.image;
  const eagerImage = idx < 8;
  return (
    <div className={`bs-pcard${book.stock ? '' : ' bs-oos'}`} onClick={openProduct} style={{ cursor:'pointer' }}>
      <div className="bs-pcard-cover">
        {book.badge && <span className="bs-cover-badge">{book.badge}</span>}
        <button
          className={`bs-wishlist-btn${wishlisted ? ' active' : ''}`}
          onClick={onWishlist}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Icon name="heart" size={16} />
        </button>
        <a
          href={productUrl}
          className="bs-product-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct();
          }}
        >
          <CoverPlaceholder
            title={book.title}
            idx={idx}
            showTitle={false}
            image={coverImage}
            loading={eagerImage ? 'eager' : 'lazy'}
            fetchPriority={idx < 2 ? 'high' : undefined}
            width={400}
            height={560}
          />
        </a>
      </div>
      <div className="bs-pcard-body">
        <div className={`bs-pcard-stock ${book.stock ? 'bs-stock-in' : 'bs-stock-out'}`}>
          <span className={`bs-dot ${book.stock ? 'in' : 'out'}`} />
          {book.stock ? 'In Stock' : 'Out of Stock'}
        </div>
        <a
          href={productUrl}
          className="bs-pcard-title bs-product-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct();
          }}
        >
          {book.title}
        </a>
        <div className="bs-pcard-desc">{book.desc}</div>
        <div className="bs-pcard-price">{book.old ? <del className="bs-pcard-old">{cedis(book.old)}</del> : null}{cedis(book.price)}</div>
        <div className="bs-pcard-foot">
          <RatingLine book={book} size={13} />
          {book.stock
            ? <button className={`bs-add-btn${added ? ' added' : ''}`} onClick={onAdd} aria-label="Add to cart">
                <Icon name={added ? 'check' : 'plus'} size={18} />
              </button>
            : <button className="bs-notify-btn" type="button" disabled>Out of Stock</button>}
        </div>
      </div>
    </div>
  );
});

// ---------- List-view card ----------
const ListCard = React.memo(({ book, idx = 0, navigate, searchContext = null }) => {
  const { add } = useCart();
  const productUrl = hrefForProduct(book);
  const coverImage = book.imageThumb || book.image;
  const eagerImage = idx < 4;
  const openProduct = () => {
    if (searchContext?.term) {
      trackSearchClick({
        term: searchContext.term,
        productId: book.id,
        scope: searchContext.scope || 'bookshop',
        path: searchContext.path || '/bookshop/products',
        source: searchContext.source || 'results',
        position: searchContext.position,
      });
    }
    navigate('product', { id: book.id, slug: productPathSegment(book) });
  };
  return (
    <div className="bs-lcard" onClick={openProduct} style={{ cursor:'pointer' }}>
      <a
        href={productUrl}
        className="bs-lcard-cover bs-product-link"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openProduct();
        }}
      >
        <CoverPlaceholder
          title={book.title}
          idx={idx}
          small
          image={coverImage}
          loading={eagerImage ? 'eager' : 'lazy'}
          width={96}
          height={128}
        />
      </a>
      <div className="bs-lcard-mid">
        <span className="bs-cat-badge">{book.catName}</span>
        <a
          href={productUrl}
          className="bs-cart-item-title bs-product-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct();
          }}
        >
          {book.title}
        </a>
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
          : <button className="bs-btn bs-btn-outline-navy" disabled>Out of Stock</button>}
      </div>
    </div>
  );
});

export { CartCtx, useCart, CartProvider, clearBookshopCartStorage, WishlistCtx, useWishlist, WishlistProvider, Navbar, Footer, WhatsAppFab, ScrollToTopFab, BottomNav, ProductCard, ListCard };
