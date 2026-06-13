import React from 'react';
import { Icon, Reveal, LoadingState, cedis } from './shared.jsx';
import { ProductCard, ListCard, useCart } from './chrome.jsx';
import { useCatalog } from './catalog.jsx';
import { subscribeNewsletter } from '../src/lib/managedContent.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import globalToast from '../src/lib/toast.js';
import { bookshopPathForRoute } from './urls.js';

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;

// ---------- Flyer hero slideshow (admin-managed) ----------
const FLYER_GRADIENTS = [
  'linear-gradient(135deg,#0d2550,#1c4a96)',
  'linear-gradient(135deg,#143670,#26417a)',
  'linear-gradient(135deg,#0d2550,#143670)',
];

const HeroSlideshow = ({ navigate }) => {
  const { flyers } = useCatalog();
  const [idx, setIdx] = React.useState(0);
  const total = flyers.length;
  const touch = React.useRef(null);

  React.useEffect(() => {
    if (total < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % total), 5000);
    return () => clearInterval(t);
  }, [total]);

  // Keep the active index valid if the admin removes flyers.
  React.useEffect(() => { setIdx(i => (i >= total ? 0 : i)); }, [total]);

  // Natural aspect ratio of the active flyer's artwork. On phones the hero
  // box adopts it (via --bs-hero-ratio) so the banner fits edge-to-edge at
  // its natural height — no cropping, stretching, or letterbox bars.
  const [imgRatio, setImgRatio] = React.useState(null);
  const activeImage = flyers[idx]?.image || null;
  React.useEffect(() => {
    if (!activeImage) { setImgRatio(null); return undefined; }
    let alive = true;
    const probe = new Image();
    probe.onload = () => { if (alive && probe.naturalHeight) setImgRatio(probe.naturalWidth / probe.naturalHeight); };
    probe.src = activeImage;
    return () => { alive = false; };
  }, [activeImage]);

  if (total === 0) return null;

  const go = (n) => setIdx((n + total) % total);
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
    touch.current = null;
  };

  return (
    <>
      <section className="bs-hero" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        onClick={() => navigate('shop')}
        style={{ cursor: 'pointer', ...(imgRatio ? { '--bs-hero-ratio': String(imgRatio) } : {}) }}
        aria-label="Promotional flyers">
        {flyers.map((f, i) => {
          const bg = f.image
            ? { backgroundImage: `url(${f.image})`, backgroundSize: f.imageFit || 'cover', backgroundPosition: f.imagePosition || 'center', backgroundRepeat: 'no-repeat' }
            : { background: FLYER_GRADIENTS[i % FLYER_GRADIENTS.length] };
          return (
            <div className={`bs-hero-slide${i === idx ? ' active' : ''}`} key={f.id}>
              <div className={`bs-hero-flyer${f.image ? ' has-img' : ''}${f.showOverlay === true ? ' has-overlay' : ''}`} style={bg}>
                <div className="bs-fl-head">{f.headline}{f.accent && <><br/><span className="bs-gold">{f.accent}</span></>}</div>
                {f.subline && <div className="bs-fl-sub">{f.subline}</div>}
                {f.badge && <span className="bs-fl-badge">{f.badge}</span>}
              </div>
            </div>
          );
        })}
        <div className={`bs-hero-vignette${flyers[idx]?.showOverlay === true ? ' active' : ''}`} />
        {total > 1 && <>
          <button className="bs-hero-arrow prev" aria-label="Previous flyer" onClick={(e)=>{e.stopPropagation();go(idx-1);}}><Icon name="chevL" size={22} /></button>
          <button className="bs-hero-arrow next" aria-label="Next flyer" onClick={(e)=>{e.stopPropagation();go(idx+1);}}><Icon name="chevR" size={22} /></button>
          <div className="bs-hero-dots">
            {flyers.map((_, i) => (
              <button key={i} className={`bs-hero-dot${i === idx ? ' active' : ''}`} aria-label={`Flyer ${i+1}`} onClick={(e)=>{e.stopPropagation();go(i);}} />
            ))}
          </div>
        </>}
      </section>
      <div className="bs-gold-rule" />
    </>
  );
};

// ---------- Category strip ----------
const CategoryStrip = ({ active = 'all', navigate }) => {
  const { categories } = useCatalog();
  return (
  <div className="bs-cat-strip-wrap">
    <div className="bs-cat-strip">
      {categories.map(c => (
        <button key={c.id} className={`bs-cat-pill${active === c.id ? ' active' : ''}`}
          onClick={() => navigate('shop', { cat: c.id })}>
          <Icon name={c.icon} size={16} /> {c.name}
        </button>
      ))}
    </div>
  </div>
  );
};

const CategoryMarquee = ({ navigate }) => {
  const { categories } = useCatalog();
  const items = [...categories, ...categories];
  return (
    <div className="bs-promo-band bs-category-marquee" aria-label="Bookshop categories">
      <div className="bs-category-marquee-track">
        {items.map((category, index) => (
          <button
            key={`${category.id}-${index}`}
            className="bs-category-marquee-item"
            type="button"
            onClick={() => navigate('shop', { cat: category.id })}
          >
            <Icon name={category.icon} size={19} className="bs-pi-icn" />
            <strong>{category.name}</strong>
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------- Homepage ----------
const HomePage = ({ navigate }) => {
  const { books, loading: catalogLoading } = useCatalog();
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const onSubscribe = async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const email = new FormData(formEl).get('email');
    try {
      const res = await subscribeNewsletter(email, 'bookshop', turnstileToken);
      formEl.reset();
      setTurnstileToken('');
      globalToast.success(res?.status === 'already_subscribed' ? "You're already subscribed" : 'Subscribed - thank you!');
    } catch (err) {
      globalToast.error(err?.message || 'Could not subscribe.');
    }
  };
  const featuredPool = books.filter(b => b.featured);
  // featured first, then top up from the rest of the catalogue so the
  // 5x2 grid fills even when fewer than 10 products are flagged featured
  const featured = [...featuredPool, ...books.filter(b => !b.featured)].slice(0, 10);

  // BECE/WASSCE picks — admin-curated via the 'exam-pick' tag on individual products
  // (set in the admin product editor under Tags), or featured products in exam categories.
  // Fallback to category-name heuristic when nothing is explicitly tagged.
  const examTagged = books.filter(b => (b.tags || []).includes('exam-pick'));
  const examCatFeatured = books.filter(b =>
    b.featured && /bece|wassce|exam|past[\s-]?questions?|textbook/i.test(`${b.cat || ''} ${b.catName || ''}`)
  );
  const examFallback = books.filter(b =>
    /exam|past|textbook/i.test(b.cat || '') || /exam|past|textbook/i.test(b.catName || '')
  );
  const examPool = examTagged.length ? examTagged : examCatFeatured.length ? examCatFeatured : examFallback;
  // curated picks first, then top up from the rest of the catalogue so this
  // section also fills its 5x2 grid instead of leaving holes
  const examPicks = [...examPool, ...books.filter(b => !examPool.includes(b))].slice(0, 10);

  if (catalogLoading && books.length === 0) {
    return (
      <div className="bs-fade-page">
        <HeroSlideshow navigate={navigate} />
        <section className="bs-section bs-container">
          <LoadingState
            title="Loading the bookshop"
            body="Fetching the latest books, categories, and offers."
          />
        </section>
      </div>
    );
  }

  return (
    <div className="bs-fade-page">
      <HeroSlideshow navigate={navigate} />

      <section className="bs-section bs-container">
        <Reveal className="bs-section-head-row">
          <div>
            <span className="bs-eyebrow">Just Arrived</span>
            <h2 className="bs-h2">New in the shop</h2>
          </div>
          <a className="bs-see-all" href={hrefForRoute('shop')} onClick={(e)=>{e.preventDefault();navigate('shop');}}>View all <Icon name="arrow" size={14} /></a>
        </Reveal>
        <div className="bs-product-grid bs-home-new-grid">
          {featured.map((b, i) => (
            <Reveal key={b.id} delay={(i % 4) + 1}><ProductCard book={b} idx={i} navigate={navigate} /></Reveal>
          ))}
        </div>
      </section>

      <CategoryMarquee navigate={navigate} />

      <section className="bs-section bs-container">
        <Reveal className="bs-section-head-row">
          <div>
            <span className="bs-eyebrow">Exam Season</span>
            <h2 className="bs-h2">BECE & WASSCE picks</h2>
          </div>
          <a className="bs-see-all" href={hrefForRoute('shop')} onClick={(e)=>{e.preventDefault();navigate('shop');}}>Browse the catalogue <Icon name="arrow" size={14} /></a>
        </Reveal>
        <div className="bs-product-grid">
          {examPicks.map((b, i) => (
            <Reveal key={b.id} delay={(i % 4) + 1}><ProductCard book={b} idx={i+4} navigate={navigate} /></Reveal>
          ))}
        </div>
      </section>

      <section className="bs-newsletter">
        <div className="bs-container-narrow">
          <span className="bs-eyebrow">Stay in the loop</span>
          <h2 className="bs-h2">Stay ahead of the curriculum.</h2>
          <p>New arrivals, price drops, and study tips. Straight to your inbox.</p>
          <form className="bs-newsletter-form" onSubmit={onSubscribe}>
            <input name="email" type="email" placeholder="you@email.com" aria-label="Email address" required />
            <button className="bs-btn bs-btn-gold" type="submit">Subscribe</button>
            <TurnstileField className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
          </form>
        </div>
      </section>
    </div>
  );
};

// ---------- Filter panel ----------
const FilterPanel = ({ filters, setFilters, ceiling = 80 }) => {
  const { books, categories } = useCatalog();
  const [open, setOpen] = React.useState({ cat:true, price:true, rating:true, avail:true });
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const matchesCategory = React.useCallback((book, id) => (
    id === 'curriculum'
      ? Boolean(book.curriculum || book.curriculumName)
      : book.cat === id || book.curriculum === id || book.curriculumName === id
  ), []);
  const counts = {};
  categories.forEach(c => { counts[c.id] = c.id === 'all' ? books.length : books.filter(b => matchesCategory(b, c.id)).length; });

  const toggleCat = (id) => setFilters(f => {
    const has = f.cats.includes(id);
    return { ...f, cats: has ? f.cats.filter(x => x !== id) : [...f.cats, id] };
  });

  // Star-range picker: clicking an active chip clears it back to "Any" (empty).
  // Picking a bound that would conflict with the other one (min > max) carries
  // the other bound along so the range stays valid — e.g. Min=4 while Max=2 is
  // set pulls Max up to 4, rather than silently producing zero results.
  const setRatingBound = (key, n) => setFilters(f => {
    const other = key === 'ratingMin' ? 'ratingMax' : 'ratingMin';
    const value = f[key] === n ? '' : n;
    const conflicts = value !== '' && f[other] !== '' &&
      (key === 'ratingMin' ? f[other] < value : f[other] > value);
    return { ...f, [key]: value, [other]: conflicts ? value : f[other] };
  });
  // Live hover/focus preview for the star pickers below — while the pointer (or
  // keyboard focus) rests on star N, stars 1..N preview as filled, exactly like
  // the selection itself would look, the same "rate up to here" convention every
  // star-rating control uses. Falls back to the actual committed value otherwise.
  const [hoverMin, setHoverMin] = React.useState(null);
  const [hoverMax, setHoverMax] = React.useState(null);
  const starFilled = (value, hover, n) => hover !== null ? n <= hover : (value !== '' && n <= value);
  const { ratingMin, ratingMax } = filters;
  const ratingHint =
    ratingMin === '' && ratingMax === '' ? 'Any rating'
    : ratingMin !== '' && ratingMax !== ''
      ? (ratingMin === ratingMax ? `${ratingMin} star${ratingMin > 1 ? 's' : ''} only` : `${ratingMin}–${ratingMax} stars`)
    : ratingMin !== '' ? `${ratingMin}+ stars`
    : `${ratingMax} stars or fewer`;

  return (
    <>
      <h3 className="bs-h3">Filter Books</h3>
      <div className={`bs-filter-sec${open.cat ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggle('cat')}>Categories <Icon name="chevDown" size={16} className="bs-chev" /></button>
        <div className="bs-filter-sec-body">
          {categories.filter(c => c.id !== 'all').map(c => (
            <label className="bs-check-row" key={c.id}>
              <input type="checkbox" checked={filters.cats.includes(c.id)} onChange={() => toggleCat(c.id)} />
              <span className="bs-cbox"><Icon name="check" size={13} /></span>
              {c.name} <span className="bs-cnt">{counts[c.id]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className={`bs-filter-sec${open.price ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggle('price')}>Price Range <Icon name="chevDown" size={16} className="bs-chev" /></button>
        <div className="bs-filter-sec-body">
          <div className="bs-range-wrap">
            <div className="bs-range-vals"><span>{cedis(filters.min)}</span><span>{cedis(filters.max)}</span></div>
            <div className="bs-range-track">
              <div className="bs-range-fill" style={{ left: `${(filters.min/ceiling)*100}%`, right: `${100-(filters.max/ceiling)*100}%` }} />
              <input type="range" min="0" max={ceiling} value={filters.min}
                onChange={e => setFilters(f => ({ ...f, min: Math.min(+e.target.value, f.max - 2) }))} aria-label="Minimum price" />
              <input type="range" min="0" max={ceiling} value={filters.max}
                onChange={e => setFilters(f => ({ ...f, max: Math.max(+e.target.value, f.min + 2) }))} aria-label="Maximum price" />
            </div>
          </div>
        </div>
      </div>
      <div className={`bs-filter-sec${open.rating ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggle('rating')}>Rating <Icon name="chevDown" size={16} className="bs-chev" /></button>
        <div className="bs-filter-sec-body bs-rating-filter">
          <p className="bs-rating-hint">{ratingHint}</p>
          <div className="bs-rating-range-row">
            <span className="bs-rating-range-label">Min</span>
            <div className="bs-rating-stars" role="group" aria-label="Minimum star rating"
              onMouseLeave={() => setHoverMin(null)}>
              <span className="bs-rating-endpoint" aria-hidden="true">1</span>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  className={`bs-rating-star${starFilled(ratingMin, hoverMin, n) ? ' filled' : ''}`}
                  aria-pressed={ratingMin === n}
                  aria-label={`Set minimum rating to ${n} star${n > 1 ? 's' : ''}`}
                  onMouseEnter={() => setHoverMin(n)}
                  onFocus={() => setHoverMin(n)}
                  onBlur={() => setHoverMin(null)}
                  onClick={() => setRatingBound('ratingMin', n)}>
                  <Icon name="star" size={20} stroke={0} />
                </button>
              ))}
              <span className="bs-rating-endpoint" aria-hidden="true">5</span>
            </div>
          </div>
          <div className="bs-rating-range-row">
            <span className="bs-rating-range-label">Max</span>
            <div className="bs-rating-stars" role="group" aria-label="Maximum star rating"
              onMouseLeave={() => setHoverMax(null)}>
              <span className="bs-rating-endpoint" aria-hidden="true">1</span>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  className={`bs-rating-star${starFilled(ratingMax, hoverMax, n) ? ' filled' : ''}`}
                  aria-pressed={ratingMax === n}
                  aria-label={`Set maximum rating to ${n} star${n > 1 ? 's' : ''}`}
                  onMouseEnter={() => setHoverMax(n)}
                  onFocus={() => setHoverMax(n)}
                  onBlur={() => setHoverMax(null)}
                  onClick={() => setRatingBound('ratingMax', n)}>
                  <Icon name="star" size={20} stroke={0} />
                </button>
              ))}
              <span className="bs-rating-endpoint" aria-hidden="true">5</span>
            </div>
          </div>
          {(ratingMin !== '' || ratingMax !== '') && (
            <button type="button" className="bs-rating-reset" onClick={() => setFilters(f => ({ ...f, ratingMin: '', ratingMax: '' }))}>
              <Icon name="close" size={11} /> Clear rating filter
            </button>
          )}
        </div>
      </div>
      <div className={`bs-filter-sec${open.avail ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggle('avail')}>Availability <Icon name="chevDown" size={16} className="bs-chev" /></button>
        <div className="bs-filter-sec-body">
          <label className="bs-check-row" style={{ justifyContent:'space-between' }} onClick={(e)=>e.preventDefault()}>
            In stock only
            <span className={`bs-toggle${filters.inStock ? ' on' : ''}`} onClick={() => setFilters(f => ({ ...f, inStock: !f.inStock }))} role="switch" aria-checked={filters.inStock} />
          </label>
        </div>
      </div>
    </>
  );
};

const BATCH = 40;

const ShopPage = ({ navigate, initialCat = 'all', initialQuery = '' }) => {
  const { books, categories, priceCeiling, loading: catalogLoading } = useCatalog();
  const [filters, setFilters] = React.useState({ cats: initialCat !== 'all' ? [initialCat] : [], min:0, max:priceCeiling, ratingMin:'', ratingMax:'', inStock:false, query: initialQuery });
  const [sort, setSort] = React.useState('newest');
  const [view, setView] = React.useState('grid');
  const [visible, setVisible] = React.useState(BATCH);
  const [loading, setLoading] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const sentinelRef = React.useRef(null);
  const loadingRef = React.useRef(false);

  // Reset to first batch when filters or sort changes
  React.useEffect(() => { setVisible(BATCH); setLoading(false); loadingRef.current = false; }, [filters, sort]);
  React.useEffect(() => { document.body.style.overflow = drawer ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [drawer]);

  const matchesCategory = (book, id) => {
    if (id === 'curriculum') return Boolean(book.curriculum || book.curriculumName);
    return book.cat === id || book.curriculum === id || book.curriculumName === id;
  };
  // Compare against the *rounded* star value — that's what the ★ icons (and the
  // picker itself) display, so "min 3 / max 4" reliably shows only books whose
  // visible star rating falls in [3,4], with no confusing rounding edge-cases.
  const matchesRating = (b) => {
    const stars = Math.round(b.rating);
    return (filters.ratingMin === '' || stars >= filters.ratingMin) &&
           (filters.ratingMax === '' || stars <= filters.ratingMax);
  };
  // Same title/category/author substring matcher the navbar's live-suggestions
  // dropdown uses (chrome.jsx) — "See all results for ..." should show exactly
  // the books that matched there, not the unfiltered catalogue.
  const trimmedQuery = filters.query.trim().toLowerCase();
  const matchesQuery = (b) => {
    if (!trimmedQuery) return true;
    return b.title.toLowerCase().includes(trimmedQuery) ||
           (b.catName || '').toLowerCase().includes(trimmedQuery) ||
           (b.author || '').toLowerCase().includes(trimmedQuery);
  };
  let list = books.filter(b =>
    (filters.cats.length === 0 || filters.cats.some(id => matchesCategory(b, id))) &&
    b.price >= filters.min && b.price <= filters.max &&
    matchesRating(b) &&
    matchesQuery(b) &&
    (!filters.inStock || b.stock)
  );
  if (sort === 'low') list = [...list].sort((a,b) => a.price - b.price);
  if (sort === 'high') list = [...list].sort((a,b) => b.price - a.price);
  if (sort === 'popular') list = [...list].sort((a,b) => (b.rating * (b.reviews||1)) - (a.rating * (a.reviews||1)));

  const shown = list.slice(0, visible);
  const allLoaded = shown.length >= list.length;

  // ── Infinite scroll sentinel ──────────────────────────────────
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || allLoaded) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          setLoading(true);
          setTimeout(() => {
            setVisible(v => v + BATCH);
            setLoading(false);
            loadingRef.current = false;
          }, 280);
        }
      },
      { rootMargin: '300px' } // trigger 300px before sentinel reaches viewport
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [allLoaded, visible]);

  // ── Context label for end-of-results message ─────────────────
  const contextLabel = React.useMemo(() => {
    const catNames = filters.cats
      .map(id => categories.find(c => c.id === id)?.name)
      .filter(Boolean);
    let base;
    if (catNames.length === 1)      base = catNames[0];
    else if (catNames.length > 1)   base = 'your selected categories';
    else                             base = 'the full catalogue';
    if (filters.query)               base = `"${filters.query.trim()}" search results${catNames.length ? ` in ${base}` : ''}`;
    const extras = [];
    if (filters.inStock)             extras.push('in stock only');
    const { ratingMin, ratingMax } = filters;
    if (ratingMin !== '' && ratingMax !== '') {
      extras.push(ratingMin === ratingMax ? `${ratingMin}★ only` : `${ratingMin}–${ratingMax}★`);
    } else if (ratingMin !== '') {
      extras.push(`${ratingMin}★ & up`);
    } else if (ratingMax !== '') {
      extras.push(`${ratingMax}★ or under`);
    }
    return extras.length ? `${base}: ${extras.join(', ')}` : base;
  }, [filters, categories]);

  // ── Top picks: highest-rated in-stock books NOT in current filter ──
  const topPicks = React.useMemo(() => {
    const isFiltered = filters.cats.length > 0 || filters.inStock || filters.ratingMin !== '' || filters.ratingMax !== '' || filters.query !== '';
    if (!isFiltered) return []; // already showing all books — no need to suggest
    const shownIds = new Set(list.map(b => b.id));
    return books
      .filter(b => !shownIds.has(b.id) && b.stock)
      .sort((a, b) => (b.rating * (b.reviews || 1)) - (a.rating * (a.reviews || 1)))
      .slice(0, 6);
  }, [books, list, filters]);
  const selectedCategory = React.useMemo(
    () => (filters.cats.length === 1 ? categories.find(category => category.id === filters.cats[0]) || null : null),
    [categories, filters.cats],
  );
  const categoryIntro = React.useMemo(() => {
    if (!selectedCategory) return null;
    if (selectedCategory.id === 'curriculum') {
      return {
        title: selectedCategory.name,
        body: 'Browse books grouped by curriculum, with real product listings that schools and families can order immediately.',
      };
    }
    return {
      title: selectedCategory.name,
      body: selectedCategory.description || `Explore ${selectedCategory.name.toLowerCase()} currently available in the RealMindX Bookshop.`,
    };
  }, [selectedCategory]);

  if (catalogLoading && books.length === 0) {
    return (
      <div className="bs-container bs-fade-page">
        <div className="bs-breadcrumb">
          <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a>
          <span className="bs-sep">/</span><span className="bs-cur">Shop</span>
        </div>
        <LoadingState
          title="Loading the shop"
          body="Fetching the latest catalog, categories, and pricing."
        />
      </div>
    );
  }

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a>
        <span className="bs-sep">/</span><span className="bs-cur">Shop</span>
      </div>

      <div className="bs-shop-layout">
        <aside className="bs-filter-card desktop">
          <FilterPanel filters={filters} setFilters={setFilters} ceiling={priceCeiling} />
          <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop:18 }} onClick={()=>{}}>Apply Filters</button>
        </aside>

        <div>
          {categoryIntro && !filters.query && (
            <section className="bs-category-intro">
              <span className="bs-eyebrow">{selectedCategory?.type === 'curriculum-group' ? 'Curriculum Collection' : 'Bookshop Category'}</span>
              <h1 className="bs-h2">{categoryIntro.title}</h1>
              <p>{categoryIntro.body}</p>
              <div className="bs-category-intro-meta">
                <span><strong>{list.length}</strong> result{list.length !== 1 ? 's' : ''}</span>
                <span>Indexable catalogue page</span>
              </div>
            </section>
          )}
          {filters.query && (
            <div className="bs-search-banner">
              <span className="bs-search-banner-label">
                <Icon name="search" size={15} />
                Search results for <strong>"{filters.query.trim()}"</strong>
              </span>
              <button type="button" className="bs-search-clear" onClick={() => setFilters(f => ({ ...f, query: '' }))}>
                <Icon name="close" size={12} /> Clear search
              </button>
            </div>
          )}
          <div className="bs-shop-toolbar">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="bs-filter-mobile-btn" onClick={() => setDrawer(true)}><Icon name="filter" size={16} /> Filter</button>
              <span className="bs-shop-count">
                {allLoaded
                  ? <><strong>{list.length}</strong> result{list.length !== 1 ? 's' : ''}</>
                  : <>Showing <strong>{shown.length}</strong> of <strong>{list.length}</strong></>}
              </span>
            </div>
            <div className="bs-toolbar-right">
              <select className="bs-sort-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort by">
                <option value="newest">Newest</option>
                <option value="low">Price: Low to High</option>
                <option value="high">Price: High to Low</option>
                <option value="popular">Most Popular</option>
              </select>
              <div className="bs-view-toggle">
                <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Icon name="grid" size={18} /></button>
                <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><Icon name="list" size={18} /></button>
              </div>
            </div>
          </div>

          {shown.length === 0
            ? (
              <div className="bs-empty-state">
                <div className="bs-empty-icon"><Icon name="search" size={36} /></div>
                <h2>No books match your {filters.query ? 'search' : 'filters'}.</h2>
                <p>{filters.query
                  ? <>Nothing matched <strong>"{filters.query.trim()}"</strong>. Try a different term, or clear your search and filters.</>
                  : 'Try a different category, adjust the price range, or remove stock/rating filters.'}</p>
                <button className="bs-btn bs-btn-gold" onClick={() => setFilters({ cats:[], min:0, max:priceCeiling, ratingMin:'', ratingMax:'', inStock:false, query:'' })}>
                  Clear all filters
                </button>
              </div>
            )
            : view === 'grid'
              ? <div className="bs-product-grid">{shown.map((b,i) => <ProductCard key={b.id} book={b} idx={i} navigate={navigate} />)}</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:14 }}>{shown.map((b,i) => <ListCard key={b.id} book={b} idx={i} navigate={navigate} />)}</div>
          }

          {/* Infinite scroll sentinel + loading indicator */}
          {!allLoaded && shown.length > 0 && (
            <div ref={sentinelRef} className="bs-scroll-sentinel" aria-hidden="true">
              {loading && (
                <div className="bs-loading-dots" role="status" aria-label="Loading more">
                  <span /><span /><span />
                </div>
              )}
            </div>
          )}

          {/* End-of-results */}
          {allLoaded && list.length > 0 && (
            <div className="bs-end-of-results">
              <div className="bs-eor-divider" />
              <div className="bs-eor-badge">
                <Icon name="check" size={14} />
                That's all for <strong>{contextLabel}</strong>
              </div>

              {topPicks.length >= 2 && (
                <div className="bs-eor-picks">
                  <div className="bs-section-head-row" style={{ marginBottom:18 }}>
                    <div>
                      <span className="bs-eyebrow">While you're here</span>
                      <h2 className="bs-h2" style={{ fontSize:'clamp(20px,4vw,26px)', margin:0 }}>Top picks from across the shop</h2>
                    </div>
                    <a className="bs-see-all" href={hrefForRoute('shop')} onClick={(e) => {
                      e.preventDefault();
                      setFilters({ cats:[], min:0, max:priceCeiling, ratingMin:'', ratingMax:'', inStock:false, query:'' });
                      window.scrollTo({ top:0, behavior:'smooth' });
                    }}>Browse all <Icon name="arrow" size={14} /></a>
                  </div>
                  <div className="bs-hscroll">
                    {topPicks.map((b, i) => <ProductCard key={b.id} book={b} idx={i} navigate={navigate} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <div className={`bs-drawer-scrim${drawer ? ' open' : ''}`} onClick={() => setDrawer(false)} />
      <div className={`bs-filter-drawer${drawer ? ' open' : ''}`}>
        <div className="bs-drawer-handle" />
        <FilterPanel filters={filters} setFilters={setFilters} ceiling={priceCeiling} />
        <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop:18 }} onClick={() => setDrawer(false)}>
          Show {list.length} result{list.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
};

export { HomePage, ShopPage, CategoryStrip };
