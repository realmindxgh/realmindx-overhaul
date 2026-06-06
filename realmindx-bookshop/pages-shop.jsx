import React from 'react';
import { Icon, Reveal, cedis, Stars } from './shared.jsx';
import { ProductCard, ListCard, useCart } from './chrome.jsx';
import { useCatalog } from './catalog.jsx';
import { subscribeNewsletter } from '../src/lib/managedContent.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';

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
        onClick={() => navigate('shop')} style={{ cursor:'pointer' }} aria-label="Promotional flyers">
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
  const { books } = useCatalog();
  const { toast } = useCart();
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const onSubscribe = async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const email = new FormData(formEl).get('email');
    try {
      const res = await subscribeNewsletter(email, 'bookshop', turnstileToken);
      formEl.reset();
      setTurnstileToken('');
      toast(res?.status === 'already_subscribed' ? "You're already subscribed" : 'Subscribed - thank you!');
    } catch (err) {
      toast(err?.message || 'Could not subscribe.');
    }
  };
  const featuredPool = books.filter(b => b.featured);
  const featured = (featuredPool.length ? featuredPool : books).slice(0, 10);

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
  const examPicks = (examPool.length ? examPool : books.slice(10)).slice(0, 10);
  return (
    <div className="bs-fade-page">
      <HeroSlideshow navigate={navigate} />

      <section className="bs-section bs-container">
        <Reveal className="bs-section-head-row">
          <div>
            <span className="bs-eyebrow">Just Arrived</span>
            <h2 className="bs-h2">New in the shop</h2>
          </div>
          <a className="bs-see-all" href="#" onClick={(e)=>{e.preventDefault();navigate('shop');}}>View all <Icon name="arrow" size={14} /></a>
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
          <a className="bs-see-all" href="#" onClick={(e)=>{e.preventDefault();navigate('shop');}}>Browse the catalogue <Icon name="arrow" size={14} /></a>
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
  const matchesCategory = React.useCallback((book, id) =>
    book.cat === id || book.curriculum === id || book.curriculumName === id,
  []);
  const counts = {};
  categories.forEach(c => { counts[c.id] = c.id === 'all' ? books.length : books.filter(b => matchesCategory(b, c.id)).length; });

  const toggleCat = (id) => setFilters(f => {
    const has = f.cats.includes(id);
    return { ...f, cats: has ? f.cats.filter(x => x !== id) : [...f.cats, id] };
  });

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
          {[5,4,3,0].map(r => (
            <button key={r} type="button" className={`bs-rating-opt${filters.rating === r ? ' active' : ''}`} onClick={() => setFilters(f => ({ ...f, rating: r }))}>
              {r === 5
                ? <><Stars value={5} size={14} /><span>5 stars only</span></>
                : r > 0
                  ? <><Stars value={r} size={14} /><span>{r}+ stars</span></>
                  : <span>Any rating</span>}
            </button>
          ))}
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

const ShopPage = ({ navigate, initialCat = 'all' }) => {
  const { books, categories, priceCeiling } = useCatalog();
  const [filters, setFilters] = React.useState({ cats: initialCat !== 'all' ? [initialCat] : [], min:0, max:priceCeiling, rating:0, inStock:false });
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

  const matchesCategory = (book, id) => book.cat === id || book.curriculum === id || book.curriculumName === id;
  let list = books.filter(b =>
    (filters.cats.length === 0 || filters.cats.some(id => matchesCategory(b, id))) &&
    b.price >= filters.min && b.price <= filters.max &&
    b.rating >= (filters.rating === 5 ? 4.5 : filters.rating) &&
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
    const extras = [];
    if (filters.inStock)             extras.push('in stock only');
    if (filters.rating >= 4)         extras.push(`${filters.rating}+ stars`);
    return extras.length ? `${base}: ${extras.join(', ')}` : base;
  }, [filters, categories]);

  // ── Top picks: highest-rated in-stock books NOT in current filter ──
  const topPicks = React.useMemo(() => {
    const isFiltered = filters.cats.length > 0 || filters.inStock || filters.rating > 0;
    if (!isFiltered) return []; // already showing all books — no need to suggest
    const shownIds = new Set(list.map(b => b.id));
    return books
      .filter(b => !shownIds.has(b.id) && b.stock)
      .sort((a, b) => (b.rating * (b.reviews || 1)) - (a.rating * (a.reviews || 1)))
      .slice(0, 6);
  }, [books, list, filters]);

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href="#" onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a>
        <span className="bs-sep">/</span><span className="bs-cur">Shop</span>
      </div>

      <div className="bs-shop-layout">
        <aside className="bs-filter-card desktop">
          <FilterPanel filters={filters} setFilters={setFilters} ceiling={priceCeiling} />
          <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop:18 }} onClick={()=>{}}>Apply Filters</button>
        </aside>

        <div>
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
                <h2>No books match your filters.</h2>
                <p>Try a different category, adjust the price range, or remove stock/rating filters.</p>
                <button className="bs-btn bs-btn-gold" onClick={() => setFilters({ cats:[], min:0, max:priceCeiling, rating:0, inStock:false })}>
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
                    <a className="bs-see-all" href="#" onClick={(e) => {
                      e.preventDefault();
                      setFilters({ cats:[], min:0, max:priceCeiling, rating:0, inStock:false });
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
