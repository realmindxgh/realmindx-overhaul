import React from 'react';
import { Icon, Reveal, LoadingState, cedis } from './shared.jsx';
import { ProductCard, ListCard } from './chrome.jsx';
import { useCatalog } from './catalog.jsx';
import { subscribeNewsletter } from '../src/lib/managedContent.js';
import { findTaxonomyItem, matchesTaxonomy, taxonomyLabel } from '../src/lib/bookshopTaxonomy.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import globalToast from '../src/lib/toast.js';
import { bookshopPathForRoute } from './urls.js';

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;

const FLYER_GRADIENTS = [
  '#0d2550',
  '#143670',
  '#1c4a96',
];

const FILTER_GROUPS = [
  { key: 'categories', taxonomy: 'category', label: 'Item Type', searchLabel: 'Search item types' },
  { key: 'subjects', taxonomy: 'subject', label: 'Subject', searchLabel: 'Search subjects' },
  { key: 'levels', taxonomy: 'level', label: 'Level', searchLabel: 'Search levels' },
  { key: 'curricula', taxonomy: 'curriculum', label: 'Curriculum', searchLabel: 'Search curricula' },
  { key: 'publishers', taxonomy: 'publisher', label: 'Publisher', searchLabel: 'Search publishers' },
];

const FILTER_PREVIEW_LIMIT = 5;
const BATCH = 40;

const filterGroupForTaxonomy = (taxonomy) => FILTER_GROUPS.find((group) => group.taxonomy === taxonomy) || null;
const safeCeilingValue = (value) => Math.max(2, Math.ceil(Number(value) || 0));

const createFilterState = (ceiling, browse = {}, query = '') => {
  const base = {
    categories: [],
    subjects: [],
    levels: [],
    curricula: [],
    publishers: [],
    min: 0,
    max: safeCeilingValue(ceiling),
    ratingMin: '',
    ratingMax: '',
    inStock: false,
    query,
  };
  const group = filterGroupForTaxonomy(browse.taxonomy);
  if (group && browse.value) base[group.key] = [browse.value];
  return base;
};

const bookSearchFields = (book) => ([
  book.title,
  book.short,
  book.desc,
  book.full,
  book.catName,
  book.author,
  book.publisher,
  book.subject,
  book.levelName || book.grade || book.level,
  book.curriculumName || book.curriculum,
  ...(book.tags || []),
]).filter(Boolean).join(' ').toLowerCase();

const matchesRatingFilters = (book, filters) => {
  const stars = Math.round(book.rating || 0);
  return (filters.ratingMin === '' || stars >= filters.ratingMin)
    && (filters.ratingMax === '' || stars <= filters.ratingMax);
};

const matchesQueryFilters = (book, query) => {
  const trimmed = String(query || '').trim().toLowerCase();
  if (!trimmed) return true;
  return bookSearchFields(book).includes(trimmed);
};

const matchesCatalogueFilters = (book, filters, options = {}) => {
  const ignoreTaxonomy = options.ignoreTaxonomy || '';
  const taxonomyMatch = FILTER_GROUPS.every((group) => {
    if (group.taxonomy === ignoreTaxonomy) return true;
    const selected = filters[group.key] || [];
    return selected.length === 0 || selected.some((value) => matchesTaxonomy(book, group.taxonomy, value));
  });
  return taxonomyMatch
    && book.price >= filters.min
    && book.price <= filters.max
    && matchesRatingFilters(book, filters)
    && matchesQueryFilters(book, filters.query)
    && (!filters.inStock || book.stock);
};

const activeSelectionCount = (filters) => FILTER_GROUPS.reduce(
  (total, group) => total + ((filters[group.key] || []).length),
  0,
);

const selectedLabelList = (filters, taxonomies) => FILTER_GROUPS.flatMap((group) => (
  (filters[group.key] || [])
    .map((value) => findTaxonomyItem(taxonomies, group.taxonomy, value)?.label || value)
    .filter(Boolean)
));

const browseIntroHeading = (taxonomy) => {
  switch (taxonomy) {
    case 'category':
      return 'Item Type';
    case 'subject':
      return 'Subject';
    case 'level':
      return 'Level';
    case 'curriculum':
      return 'Curriculum';
    case 'publisher':
      return 'Publisher';
    default:
      return 'Catalogue';
  }
};

const browseIntroCopy = (taxonomy, browseItem) => {
  if (!taxonomy) return null;
  if (browseItem) {
    const label = String(browseItem.label || browseItem.name || '').trim();
    return {
      eyebrow: browseIntroHeading(taxonomy),
      title: label,
      body: browseItem.description || (
        taxonomy === 'subject'
          ? `Find textbooks, readers, workbooks, and classroom materials for ${label}.`
          : taxonomy === 'level'
            ? `Browse books, revision guides, and learning materials matched to ${label}.`
            : taxonomy === 'curriculum'
              ? `Explore titles that fit the ${label} pathway.`
              : taxonomy === 'publisher'
                ? `See what is currently available from ${label}.`
                : `Explore the latest ${label.toLowerCase()} items in the RealMindX Bookshop.`
      ),
    };
  }
  switch (taxonomy) {
    case 'category':
      return {
        eyebrow: 'Item Type',
        title: 'Shop by Item Type',
        body: 'Choose the kind of learning material you want first, then narrow the list by subject, level, curriculum, publisher, price, or stock.',
      };
    case 'subject':
      return {
        eyebrow: 'Subject Finder',
        title: 'Shop by Subject',
        body: 'Start with the subject your learner needs, then narrow the results by level, curriculum, publisher, or item type.',
      };
    case 'level':
      return {
        eyebrow: 'Level Finder',
        title: 'Shop by Level',
        body: 'Pick the learner stage first and refine the matching books using subject, curriculum, publisher, or item type filters.',
      };
    case 'curriculum':
      return {
        eyebrow: 'Curriculum Finder',
        title: 'Shop by Curriculum',
        body: 'Choose the curriculum your school follows so you can reach the most relevant books faster.',
      };
    case 'publisher':
      return {
        eyebrow: 'Publisher Finder',
        title: 'Shop by Publisher',
        body: 'Compare available titles by publisher, then narrow them by curriculum, subject, level, or item type.',
      };
    default:
      return null;
  }
};

const HeroSlideshow = ({ navigate }) => {
  const { flyers } = useCatalog();
  const [idx, setIdx] = React.useState(0);
  const total = flyers.length;
  const touch = React.useRef(null);

  React.useEffect(() => {
    if (total < 2) return undefined;
    const timer = setInterval(() => setIdx((value) => (value + 1) % total), 5000);
    return () => clearInterval(timer);
  }, [total]);

  React.useEffect(() => {
    setIdx((value) => (value >= total ? 0 : value));
  }, [total]);

  const [imgRatio, setImgRatio] = React.useState(null);
  const activeImage = flyers[idx]?.image || null;
  React.useEffect(() => {
    if (!activeImage) {
      setImgRatio(null);
      return undefined;
    }
    let alive = true;
    const probe = new Image();
    probe.onload = () => {
      if (alive && probe.naturalHeight) setImgRatio(probe.naturalWidth / probe.naturalHeight);
    };
    probe.src = activeImage;
    return () => {
      alive = false;
    };
  }, [activeImage]);

  if (total === 0) return null;

  const go = (value) => setIdx((value + total) % total);
  const onTouchStart = (event) => {
    touch.current = event.touches[0].clientX;
  };
  const onTouchEnd = (event) => {
    if (touch.current == null) return;
    const delta = event.changedTouches[0].clientX - touch.current;
    if (Math.abs(delta) > 40) go(idx + (delta < 0 ? 1 : -1));
    touch.current = null;
  };

  return (
    <>
      <section
        className="bs-hero"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => navigate('shop')}
        style={{ cursor: 'pointer', ...(imgRatio ? { '--bs-hero-ratio': String(imgRatio) } : {}) }}
        aria-label="Promotional flyers"
      >
        {flyers.map((flyer, index) => {
          const bg = flyer.image
            ? {
                backgroundImage: `url(${flyer.image})`,
                backgroundSize: flyer.imageFit || 'cover',
                backgroundPosition: flyer.imagePosition || 'center',
                backgroundRepeat: 'no-repeat',
              }
            : { background: FLYER_GRADIENTS[index % FLYER_GRADIENTS.length] };
          return (
            <div className={`bs-hero-slide${index === idx ? ' active' : ''}`} key={flyer.id}>
              <div className={`bs-hero-flyer${flyer.image ? ' has-img' : ''}${flyer.showOverlay === true ? ' has-overlay' : ''}`} style={bg}>
                <div className="bs-fl-head">{flyer.headline}{flyer.accent && <><br /><span className="bs-gold">{flyer.accent}</span></>}</div>
                {flyer.subline && <div className="bs-fl-sub">{flyer.subline}</div>}
                {flyer.badge && <span className="bs-fl-badge">{flyer.badge}</span>}
              </div>
            </div>
          );
        })}
        <div className={`bs-hero-vignette${flyers[idx]?.showOverlay === true ? ' active' : ''}`} />
        {total > 1 && (
          <>
            <button className="bs-hero-arrow prev" aria-label="Previous flyer" onClick={(event) => { event.stopPropagation(); go(idx - 1); }}><Icon name="chevL" size={22} /></button>
            <button className="bs-hero-arrow next" aria-label="Next flyer" onClick={(event) => { event.stopPropagation(); go(idx + 1); }}><Icon name="chevR" size={22} /></button>
            <div className="bs-hero-dots">
              {flyers.map((_, index) => (
                <button key={index} className={`bs-hero-dot${index === idx ? ' active' : ''}`} aria-label={`Flyer ${index + 1}`} onClick={(event) => { event.stopPropagation(); go(index); }} />
              ))}
            </div>
          </>
        )}
      </section>
      <div className="bs-gold-rule" />
    </>
  );
};

const CategoryStrip = ({ active = 'all', navigate }) => {
  const { categories } = useCatalog();
  return (
    <div className="bs-cat-strip-wrap">
      <div className="bs-cat-strip">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`bs-cat-pill${active === category.id ? ' active' : ''}`}
            onClick={() => navigate('shop', { cat: category.id })}
          >
            <Icon name={category.icon} size={16} /> {category.name}
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

const HomePage = ({ navigate }) => {
  const { books, loading: catalogLoading } = useCatalog();
  const [turnstileToken, setTurnstileToken] = React.useState('');

  const onSubscribe = async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const email = new FormData(formEl).get('email');
    try {
      const response = await subscribeNewsletter(email, 'bookshop', turnstileToken);
      formEl.reset();
      setTurnstileToken('');
      globalToast.success(response?.status === 'already_subscribed' ? "You're already subscribed" : 'Subscribed - thank you!');
    } catch (err) {
      globalToast.error(err?.message || 'Could not subscribe.');
    }
  };

  const featuredPool = books.filter((book) => book.featured);
  const featured = [...featuredPool, ...books.filter((book) => !book.featured)].slice(0, 10);

  const examTagged = books.filter((book) => (book.tags || []).includes('exam-pick'));
  const examCatFeatured = books.filter((book) =>
    book.featured && /bece|wassce|exam|past[\s-]?questions?|textbook/i.test(`${book.cat || ''} ${book.catName || ''}`)
  );
  const examFallback = books.filter((book) =>
    /exam|past|textbook/i.test(book.cat || '') || /exam|past|textbook/i.test(book.catName || '')
  );
  const examPool = examTagged.length ? examTagged : examCatFeatured.length ? examCatFeatured : examFallback;
  const examPicks = [...examPool, ...books.filter((book) => !examPool.includes(book))].slice(0, 10);

  if (catalogLoading && books.length === 0) {
    return (
      <div className="bs-fade-page">
        <HeroSlideshow navigate={navigate} />
        <section className="bs-section bs-container">
          <LoadingState title="Loading the bookshop" body="Fetching the latest books, categories, and offers." />
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
          <a className="bs-see-all" href={hrefForRoute('shop')} onClick={(event) => { event.preventDefault(); navigate('shop'); }}>View all <Icon name="arrow" size={14} /></a>
        </Reveal>
        <div className="bs-product-grid bs-home-new-grid">
          {featured.map((book, index) => (
            <Reveal key={book.id} delay={(index % 4) + 1}><ProductCard book={book} idx={index} navigate={navigate} /></Reveal>
          ))}
        </div>
      </section>

      <CategoryMarquee navigate={navigate} />

      <section className="bs-section bs-container">
        <Reveal className="bs-section-head-row">
          <div>
            <span className="bs-eyebrow">Exam Season</span>
            <h2 className="bs-h2">BECE &amp; WASSCE picks</h2>
          </div>
          <a className="bs-see-all" href={hrefForRoute('shop')} onClick={(event) => { event.preventDefault(); navigate('shop'); }}>Browse the catalogue <Icon name="arrow" size={14} /></a>
        </Reveal>
        <div className="bs-product-grid">
          {examPicks.map((book, index) => (
            <Reveal key={book.id} delay={(index % 4) + 1}><ProductCard book={book} idx={index + 4} navigate={navigate} /></Reveal>
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

const FilterPanel = ({ filters, setFilters, ceiling = 80 }) => {
  const { books, taxonomies } = useCatalog();
  const [open, setOpen] = React.useState({
    categories: true,
    subjects: true,
    levels: true,
    curricula: true,
    publishers: true,
    price: true,
    rating: true,
    availability: true,
  });
  const [searchTerms, setSearchTerms] = React.useState({
    categories: '',
    subjects: '',
    levels: '',
    curricula: '',
    publishers: '',
  });

  const toggleSection = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleTaxonomyValue = (taxonomy, value) => {
    const group = filterGroupForTaxonomy(taxonomy);
    if (!group) return;
    setFilters((prev) => {
      const selected = prev[group.key] || [];
      const hasValue = selected.includes(value);
      return {
        ...prev,
        [group.key]: hasValue ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
  };

  const setRatingBound = (key, rating) => setFilters((prev) => {
    const other = key === 'ratingMin' ? 'ratingMax' : 'ratingMin';
    const value = prev[key] === rating ? '' : rating;
    const conflicts = value !== '' && prev[other] !== ''
      && (key === 'ratingMin' ? prev[other] < value : prev[other] > value);
    return { ...prev, [key]: value, [other]: conflicts ? value : prev[other] };
  });

  const [hoverMin, setHoverMin] = React.useState(null);
  const [hoverMax, setHoverMax] = React.useState(null);
  const starFilled = (value, hover, rating) => hover !== null ? rating <= hover : (value !== '' && rating <= value);
  const { ratingMin, ratingMax } = filters;
  const ratingHint = ratingMin === '' && ratingMax === ''
    ? 'Any rating'
    : ratingMin !== '' && ratingMax !== ''
      ? (ratingMin === ratingMax ? `${ratingMin} star${ratingMin > 1 ? 's' : ''} only` : `${ratingMin}-${ratingMax} stars`)
      : ratingMin !== '' ? `${ratingMin}+ stars` : `${ratingMax} stars or fewer`;

  const availableCounts = React.useMemo(() => {
    const nextCounts = {};
    FILTER_GROUPS.forEach((group) => {
      const scopedBooks = books.filter((book) => matchesCatalogueFilters(book, filters, { ignoreTaxonomy: group.taxonomy }));
      nextCounts[group.key] = new Map(
        (taxonomies[group.key] || []).map((item) => [
          item.id,
          scopedBooks.filter((book) => matchesTaxonomy(book, group.taxonomy, item.id)).length,
        ]),
      );
    });
    return nextCounts;
  }, [books, filters, taxonomies]);

  const rangeMax = safeCeilingValue(ceiling);

  return (
    <>
      <h3 className="bs-h3">Filter Books</h3>
      {FILTER_GROUPS.map((group) => {
        const items = taxonomies[group.key] || [];
        if (items.length === 0) return null;
        const query = searchTerms[group.key].trim().toLowerCase();
        const filteredItems = query ? items.filter((item) => item.label.toLowerCase().includes(query)) : items;
        const visibleItems = query ? filteredItems : filteredItems.slice(0, FILTER_PREVIEW_LIMIT);
        const hiddenCount = query ? 0 : Math.max(0, items.length - visibleItems.length);
        const selected = filters[group.key] || [];

        return (
          <div className={`bs-filter-sec${open[group.key] ? '' : ' collapsed'}`} key={group.key}>
            <button className="bs-filter-sec-head" onClick={() => toggleSection(group.key)}>
              {group.label}
              <Icon name="chevDown" size={16} className="bs-chev" />
            </button>
            <div className="bs-filter-sec-body">
              {items.length > FILTER_PREVIEW_LIMIT && (
                <input
                  type="search"
                  className="bs-filter-search"
                  placeholder={group.searchLabel}
                  value={searchTerms[group.key]}
                  onChange={(event) => setSearchTerms((prev) => ({ ...prev, [group.key]: event.target.value }))}
                  aria-label={group.searchLabel}
                />
              )}
              <div className="bs-filter-checklist">
                {visibleItems.map((item) => (
                  <label className="bs-check-row" key={item.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => toggleTaxonomyValue(group.taxonomy, item.id)}
                    />
                    <span className="bs-cbox"><Icon name="check" size={13} /></span>
                    <span className="bs-filter-item-label">{item.label}</span>
                    <span className="bs-cnt">{availableCounts[group.key]?.get(item.id) || 0}</span>
                  </label>
                ))}
                {visibleItems.length === 0 && (
                  <p className="bs-filter-hint">No matches yet.</p>
                )}
              </div>
              {hiddenCount > 0 && (
                <p className="bs-filter-hint">Showing {visibleItems.length} of {items.length}. Search to reveal the rest.</p>
              )}
            </div>
          </div>
        );
      })}

      <div className={`bs-filter-sec${open.price ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggleSection('price')}>
          Price Range
          <Icon name="chevDown" size={16} className="bs-chev" />
        </button>
        <div className="bs-filter-sec-body">
          <div className="bs-range-wrap">
            <div className="bs-range-vals"><span>{cedis(filters.min)}</span><span>{cedis(filters.max)}</span></div>
            <div className="bs-range-track">
              <div className="bs-range-fill" style={{ left: `${(filters.min / rangeMax) * 100}%`, right: `${100 - (filters.max / rangeMax) * 100}%` }} />
              <input
                type="range"
                min="0"
                max={rangeMax}
                value={filters.min}
                onChange={(event) => setFilters((prev) => ({ ...prev, min: Math.min(+event.target.value, prev.max - 2) }))}
                aria-label="Minimum price"
              />
              <input
                type="range"
                min="0"
                max={rangeMax}
                value={filters.max}
                onChange={(event) => setFilters((prev) => ({ ...prev, max: Math.max(+event.target.value, prev.min + 2) }))}
                aria-label="Maximum price"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`bs-filter-sec${open.rating ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggleSection('rating')}>
          Rating
          <Icon name="chevDown" size={16} className="bs-chev" />
        </button>
        <div className="bs-filter-sec-body bs-rating-filter">
          <p className="bs-rating-hint">{ratingHint}</p>
          <div className="bs-rating-range-row">
            <span className="bs-rating-range-label">Min</span>
            <div className="bs-rating-stars" role="group" aria-label="Minimum star rating" onMouseLeave={() => setHoverMin(null)}>
              <span className="bs-rating-endpoint" aria-hidden="true">1</span>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={`bs-rating-star${starFilled(ratingMin, hoverMin, rating) ? ' filled' : ''}`}
                  aria-pressed={ratingMin === rating}
                  aria-label={`Set minimum rating to ${rating} star${rating > 1 ? 's' : ''}`}
                  onMouseEnter={() => setHoverMin(rating)}
                  onFocus={() => setHoverMin(rating)}
                  onBlur={() => setHoverMin(null)}
                  onClick={() => setRatingBound('ratingMin', rating)}
                >
                  <Icon name="star" size={20} stroke={0} />
                </button>
              ))}
              <span className="bs-rating-endpoint" aria-hidden="true">5</span>
            </div>
          </div>
          <div className="bs-rating-range-row">
            <span className="bs-rating-range-label">Max</span>
            <div className="bs-rating-stars" role="group" aria-label="Maximum star rating" onMouseLeave={() => setHoverMax(null)}>
              <span className="bs-rating-endpoint" aria-hidden="true">1</span>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className={`bs-rating-star${starFilled(ratingMax, hoverMax, rating) ? ' filled' : ''}`}
                  aria-pressed={ratingMax === rating}
                  aria-label={`Set maximum rating to ${rating} star${rating > 1 ? 's' : ''}`}
                  onMouseEnter={() => setHoverMax(rating)}
                  onFocus={() => setHoverMax(rating)}
                  onBlur={() => setHoverMax(null)}
                  onClick={() => setRatingBound('ratingMax', rating)}
                >
                  <Icon name="star" size={20} stroke={0} />
                </button>
              ))}
              <span className="bs-rating-endpoint" aria-hidden="true">5</span>
            </div>
          </div>
          {(ratingMin !== '' || ratingMax !== '') && (
            <button type="button" className="bs-rating-reset" onClick={() => setFilters((prev) => ({ ...prev, ratingMin: '', ratingMax: '' }))}>
              <Icon name="close" size={11} /> Clear rating filter
            </button>
          )}
        </div>
      </div>

      <div className={`bs-filter-sec${open.availability ? '' : ' collapsed'}`}>
        <button className="bs-filter-sec-head" onClick={() => toggleSection('availability')}>
          Availability
          <Icon name="chevDown" size={16} className="bs-chev" />
        </button>
        <div className="bs-filter-sec-body">
          <label className="bs-check-row" style={{ justifyContent: 'space-between' }} onClick={(event) => event.preventDefault()}>
            In stock only
            <span
              className={`bs-toggle${filters.inStock ? ' on' : ''}`}
              onClick={() => setFilters((prev) => ({ ...prev, inStock: !prev.inStock }))}
              role="switch"
              aria-checked={filters.inStock}
            />
          </label>
        </div>
      </div>
    </>
  );
};

const ShopPage = ({ navigate, initialBrowse = {}, initialQuery = '' }) => {
  const { books, taxonomies, priceCeiling, loading: catalogLoading } = useCatalog();
  const rangeCeiling = safeCeilingValue(priceCeiling);
  const [filters, setFilters] = React.useState(() => createFilterState(rangeCeiling, initialBrowse, initialQuery));
  const [sort, setSort] = React.useState('newest');
  const [view, setView] = React.useState('grid');
  const [visible, setVisible] = React.useState(BATCH);
  const [loading, setLoading] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const sentinelRef = React.useRef(null);
  const loadingRef = React.useRef(false);

  React.useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      min: Math.min(prev.min, Math.max(0, rangeCeiling - 2)),
      max: Math.max(Math.min(prev.max, rangeCeiling), Math.min(prev.min + 2, rangeCeiling)),
    }));
  }, [rangeCeiling]);

  React.useEffect(() => {
    setVisible(BATCH);
    setLoading(false);
    loadingRef.current = false;
  }, [filters, sort]);

  React.useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer]);

  let list = books.filter((book) => matchesCatalogueFilters(book, filters));
  if (sort === 'low') list = [...list].sort((left, right) => left.price - right.price);
  if (sort === 'high') list = [...list].sort((left, right) => right.price - left.price);
  if (sort === 'popular') list = [...list].sort((left, right) => (right.rating * (right.reviews || 1)) - (left.rating * (left.reviews || 1)));

  const shown = list.slice(0, visible);
  const allLoaded = shown.length >= list.length;

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || allLoaded) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          setLoading(true);
          setTimeout(() => {
            setVisible((current) => current + BATCH);
            setLoading(false);
            loadingRef.current = false;
          }, 280);
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [allLoaded, visible]);

  const selectedLabels = React.useMemo(() => selectedLabelList(filters, taxonomies), [filters, taxonomies]);
  const contextLabel = React.useMemo(() => {
    let base = 'the full catalogue';
    if (filters.query.trim()) base = `search results for "${filters.query.trim()}"`;
    else if (selectedLabels.length === 1) base = selectedLabels[0];
    else if (selectedLabels.length > 1) base = 'your selected filters';
    const extras = [];
    if (filters.inStock) extras.push('in stock only');
    if (filters.ratingMin !== '' && filters.ratingMax !== '') {
      extras.push(filters.ratingMin === filters.ratingMax ? `${filters.ratingMin} stars only` : `${filters.ratingMin}-${filters.ratingMax} stars`);
    } else if (filters.ratingMin !== '') {
      extras.push(`${filters.ratingMin}+ stars`);
    } else if (filters.ratingMax !== '') {
      extras.push(`${filters.ratingMax} stars or fewer`);
    }
    return extras.length ? `${base}: ${extras.join(', ')}` : base;
  }, [filters, selectedLabels]);

  const topPicks = React.useMemo(() => {
    if (activeSelectionCount(filters) === 0 && !filters.inStock && filters.ratingMin === '' && filters.ratingMax === '' && !filters.query.trim()) {
      return [];
    }
    const shownIds = new Set(list.map((book) => book.id));
    return books
      .filter((book) => !shownIds.has(book.id) && book.stock)
      .sort((left, right) => (right.rating * (right.reviews || 1)) - (left.rating * (left.reviews || 1)))
      .slice(0, 6);
  }, [books, filters, list]);

  const browseItem = React.useMemo(
    () => (initialBrowse.taxonomy && initialBrowse.value
      ? findTaxonomyItem(taxonomies, initialBrowse.taxonomy, initialBrowse.value)
      : null),
    [initialBrowse.taxonomy, initialBrowse.value, taxonomies],
  );
  const browseIntro = React.useMemo(() => browseIntroCopy(initialBrowse.taxonomy, browseItem), [browseItem, initialBrowse.taxonomy]);
  const browseGroup = React.useMemo(() => filterGroupForTaxonomy(initialBrowse.taxonomy), [initialBrowse.taxonomy]);
  const browseLinks = React.useMemo(
    () => (browseGroup ? (taxonomies[browseGroup.key] || []) : []),
    [browseGroup, taxonomies],
  );

  if (catalogLoading && books.length === 0) {
    return (
      <div className="bs-container bs-fade-page">
        <div className="bs-breadcrumb">
          <a href={hrefForRoute('home')} onClick={(event) => { event.preventDefault(); navigate('home'); }}>Home</a>
          <span className="bs-sep">/</span><span className="bs-cur">Shop</span>
        </div>
        <LoadingState title="Loading the shop" body="Fetching the latest catalog, categories, and pricing." />
      </div>
    );
  }

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(event) => { event.preventDefault(); navigate('home'); }}>Home</a>
        <span className="bs-sep">/</span><span className="bs-cur">Shop</span>
      </div>

      <div className="bs-shop-layout">
        <aside className="bs-filter-card desktop">
          <FilterPanel filters={filters} setFilters={setFilters} ceiling={rangeCeiling} />
          <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop: 18 }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Filters update instantly
          </button>
        </aside>

        <div>
          {browseIntro && !filters.query.trim() && (
            <section className="bs-category-intro">
              <span className="bs-eyebrow">{browseIntro.eyebrow}</span>
              <h1 className="bs-h2">{browseIntro.title}</h1>
              <p>{browseIntro.body}</p>
              {browseLinks.length > 0 && (
                <div className="bs-browse-link-grid">
                  {browseLinks.map((item) => {
                    const active = item.id === initialBrowse.value;
                    return (
                      <a
                        key={`${initialBrowse.taxonomy}-${item.id}`}
                        className={`bs-browse-link-card${active ? ' active' : ''}`}
                        href={hrefForRoute('shop', { taxonomy: initialBrowse.taxonomy, value: item.id })}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate('shop', { taxonomy: initialBrowse.taxonomy, value: item.id });
                        }}
                      >
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                      </a>
                    );
                  })}
                </div>
              )}
              <div className="bs-category-intro-meta">
                <span><strong>{list.length}</strong> result{list.length !== 1 ? 's' : ''}</span>
                <span>Use the left filters to narrow the list further.</span>
              </div>
            </section>
          )}
          {filters.query.trim() && (
            <div className="bs-search-banner">
              <span className="bs-search-banner-label">
                <Icon name="search" size={15} />
                Search results for <strong>"{filters.query.trim()}"</strong>
              </span>
              <button type="button" className="bs-search-clear" onClick={() => setFilters((prev) => ({ ...prev, query: '' }))}>
                <Icon name="close" size={12} /> Clear search
              </button>
            </div>
          )}
          <div className="bs-shop-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="bs-filter-mobile-btn" onClick={() => setDrawer(true)}><Icon name="filter" size={16} /> Filter</button>
              <span className="bs-shop-count">
                {allLoaded
                  ? <><strong>{list.length}</strong> result{list.length !== 1 ? 's' : ''}</>
                  : <>Showing <strong>{shown.length}</strong> of <strong>{list.length}</strong></>}
              </span>
            </div>
            <div className="bs-toolbar-right">
              <select className="bs-sort-select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort by">
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

          {shown.length === 0 ? (
            <div className="bs-empty-state">
              <div className="bs-empty-icon"><Icon name="search" size={36} /></div>
              <h2>No books match your {filters.query.trim() ? 'search' : 'filters'}.</h2>
              <p>
                {filters.query.trim()
                  ? <>Nothing matched <strong>"{filters.query.trim()}"</strong>. Try a different term, or clear your search and filters.</>
                  : 'Try a different subject, level, curriculum, publisher, item type, price range, or rating filter.'}
              </p>
              <button className="bs-btn bs-btn-gold" onClick={() => setFilters(createFilterState(rangeCeiling, initialBrowse, ''))}>
                Clear all filters
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className="bs-product-grid">{shown.map((book, index) => <ProductCard key={book.id} book={book} idx={index} navigate={navigate} />)}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{shown.map((book, index) => <ListCard key={book.id} book={book} idx={index} navigate={navigate} />)}</div>
          )}

          {!allLoaded && shown.length > 0 && (
            <div ref={sentinelRef} className="bs-scroll-sentinel" aria-hidden="true">
              {loading && (
                <div className="bs-loading-dots" role="status" aria-label="Loading more">
                  <span /><span /><span />
                </div>
              )}
            </div>
          )}

          {allLoaded && list.length > 0 && (
            <div className="bs-end-of-results">
              <div className="bs-eor-divider" />
              <div className="bs-eor-badge">
                <Icon name="check" size={14} />
                That's all for <strong>{contextLabel}</strong>
              </div>

              {topPicks.length >= 2 && (
                <div className="bs-eor-picks">
                  <div className="bs-section-head-row" style={{ marginBottom: 18 }}>
                    <div>
                      <span className="bs-eyebrow">While you're here</span>
                      <h2 className="bs-h2" style={{ fontSize: 'clamp(20px,4vw,26px)', margin: 0 }}>Top picks from across the shop</h2>
                    </div>
                    <a
                      className="bs-see-all"
                      href={hrefForRoute('shop')}
                      onClick={(event) => {
                        event.preventDefault();
                        setFilters(createFilterState(rangeCeiling, {}, ''));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Browse all <Icon name="arrow" size={14} />
                    </a>
                  </div>
                  <div className="bs-hscroll">
                    {topPicks.map((book, index) => <ProductCard key={book.id} book={book} idx={index} navigate={navigate} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`bs-drawer-scrim${drawer ? ' open' : ''}`} onClick={() => setDrawer(false)} />
      <div className={`bs-filter-drawer${drawer ? ' open' : ''}`}>
        <div className="bs-drawer-handle" />
        <FilterPanel filters={filters} setFilters={setFilters} ceiling={rangeCeiling} />
        <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop: 18 }} onClick={() => setDrawer(false)}>
          Show {list.length} result{list.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
};

export { HomePage, ShopPage, CategoryStrip };
