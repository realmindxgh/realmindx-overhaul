import React from 'react';
import { Icon, Reveal, LoadingState, cedis } from './shared.jsx';
import { ProductCard, ListCard } from './chrome.jsx';
import { useCatalog, fromApiProduct } from './catalog.jsx';
import { trackSearch } from '../src/lib/analytics.js';
import { subscribeNewsletter } from '../src/lib/managedContent.js';
import { bookMatchesBookshopSearch, bookMatchesBookshopSearchIntent, findTaxonomyItem, getBookshopSeoProfile, matchesTaxonomy, taxonomyLabel } from '../src/lib/bookshopTaxonomy.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import globalToast from '../src/lib/toast.js';
import { bookshopPathForRoute } from './urls.js';
import { fuzzyMatches, rankByFuzzyMatch } from '../src/lib/fuzzySearch.js';
import { api } from '../src/lib/apiClient.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';

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
const SEARCHABLE_FILTER_KEYS = new Set(['subjects']);
const DESKTOP_BATCH = 40;
const MOBILE_BATCH = 10;
const SKELETON_COUNT_DESKTOP = 8;
const SKELETON_COUNT_MOBILE = 4;

const ProductCardSkeleton = () => (
  <div className="bs-pcard bs-pcard-skeleton" aria-hidden="true">
    <div className="bs-pcard-cover">
      <div className="bs-skeleton bs-skeleton-img" />
    </div>
    <div className="bs-pcard-body">
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-sm" />
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-lg" />
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-mid" />
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-price" />
    </div>
  </div>
);

const BookRequestModal = ({ open, onClose, initialTitle, browseContext }) => {
  const session = getDemoSession();
  const [form, setForm] = React.useState({ requested_title: '', customer_name: '', email: '', phone: '', author: '', publisher: '', level: '', notes: '' });
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      requested_title: initialTitle || '',
      customer_name: session?.full_name || session?.name || '',
      email: session?.email || '',
      phone: session?.phone || '',
      author: '', publisher: '', level: '', notes: '',
    });
    setTurnstileToken('');
    setError('');
    setResult(null);
  }, [open, initialTitle]);

  if (!open) return null;
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Enter an email address or phone number so we can contact you.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.createBookRequest({
        ...form,
        search_query: initialTitle || undefined,
        browse_context: browseContext,
        turnstile_token: turnstileToken,
      });
      setResult(response.request);
    } catch (err) {
      setError(err?.message || 'We could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bs-request-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="bs-request-modal" role="dialog" aria-modal="true" aria-labelledby="book-request-title">
        <button type="button" className="bs-request-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        {result ? (
          <div className="bs-request-success" role="status">
            <span className="bs-request-success-icon"><Icon name="check" size={24} /></span>
            <span className="bs-eyebrow">Request received</span>
            <h2 id="book-request-title">We are looking for your book.</h2>
            <p>We will contact you when it becomes available. Keep this reference for your records.</p>
            <strong>{result.reference}</strong>
            <button type="button" className="bs-btn bs-btn-navy" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <span className="bs-eyebrow">Cannot find a book?</span>
            <h2 id="book-request-title">Request it from RealMindX</h2>
            <p className="bs-request-intro">Tell us what you need and where to reach you. We will notify you as soon as it is available.</p>
            <div className="bs-request-grid">
              <label className="wide"><span>Book title or search term *</span><input value={form.requested_title} onChange={event => update('requested_title', event.target.value)} required /></label>
              <label><span>Your name *</span><input value={form.customer_name} onChange={event => update('customer_name', event.target.value)} required /></label>
              <label><span>Email address</span><input type="email" value={form.email} onChange={event => update('email', event.target.value)} /></label>
              <label><span>Phone number</span><input type="tel" value={form.phone} onChange={event => update('phone', event.target.value)} /></label>
              <label><span>Author</span><input value={form.author} onChange={event => update('author', event.target.value)} /></label>
              <label><span>Publisher</span><input value={form.publisher} onChange={event => update('publisher', event.target.value)} /></label>
              <label><span>Level or class</span><input value={form.level} onChange={event => update('level', event.target.value)} /></label>
              <label className="wide"><span>Anything else?</span><textarea rows="3" value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
            </div>
            <TurnstileField className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
            {error && <p className="bs-request-error" role="alert">{error}</p>}
            <button type="submit" className="bs-btn bs-btn-gold bs-btn-block" disabled={busy}>{busy ? 'Sending request...' : 'Send book request'}</button>
          </form>
        )}
      </section>
    </div>
  );
};

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

const matchesRatingFilters = (book, filters) => {
  const stars = Math.round(book.rating || 0);
  return (filters.ratingMin === '' || stars >= filters.ratingMin)
    && (filters.ratingMax === '' || stars <= filters.ratingMax);
};

const matchesQueryFilters = (book, query) => {
  if (!query) return true;
  const searchText = [book.title, book.author, book.publisher, book.catName, book.subject, book.levelName, book.curriculumName, ...(book.tags || [])].filter(Boolean).join(' ');
  return bookMatchesBookshopSearchIntent(book, query)
    && (bookMatchesBookshopSearch(book, query) || fuzzyMatches(searchText, query));
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

const selectedFilterList = (filters, taxonomies) => FILTER_GROUPS.flatMap((group) => (
  (filters[group.key] || []).map((value) => ({
    key: group.key,
    taxonomy: group.taxonomy,
    value,
    label: findTaxonomyItem(taxonomies, group.taxonomy, value)?.label || value,
  }))
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

const browseSectionLabel = (taxonomy) => {
  switch (taxonomy) {
    case 'category':
      return 'Item Types';
    case 'subject':
      return 'Subjects';
    case 'level':
      return 'Levels';
    case 'curriculum':
      return 'Curricula';
    case 'publisher':
      return 'Publishers';
    default:
      return 'Catalogue';
  }
};

const browseIntroCopy = (taxonomy, browseItem) => {
  if (!taxonomy) return null;
  if (browseItem) {
    const label = String(browseItem.label || browseItem.name || '').trim();
    const seoProfile = getBookshopSeoProfile(taxonomy, browseItem);
    return {
      eyebrow: browseIntroHeading(taxonomy),
      title: label,
      body: browseItem.description || seoProfile.intro || (
        taxonomy === 'subject'
          ? `Showing all available ${label} books, readers, workbooks, and classroom materials.`
          : taxonomy === 'level'
            ? `Showing books, revision guides, and learning materials matched to ${label}.`
            : taxonomy === 'curriculum'
              ? `Showing titles that fit the ${label} pathway.`
              : taxonomy === 'publisher'
                ? `Showing what is currently available from ${label}.`
                : `Showing the latest ${label.toLowerCase()} items in the RealMindX Bookshop.`
      ),
      popularSearches: seoProfile.popularSearches || [],
    };
  }
  const seoProfile = getBookshopSeoProfile(taxonomy);
  switch (taxonomy) {
    case 'category':
      return {
        eyebrow: 'Item Type',
        title: 'Shop by Item Type',
        body: seoProfile.intro || 'Choose the kind of learning material you want first, then narrow the list by subject, level, curriculum, publisher, price, or stock.',
        popularSearches: seoProfile.popularSearches || [],
      };
    case 'subject':
      return {
        eyebrow: 'Subject Finder',
        title: 'Shop by Subject',
        body: seoProfile.intro || 'Search and tick one or more subjects. Matching books update immediately, and you can refine them further by level, curriculum, publisher, or item type.',
        popularSearches: seoProfile.popularSearches || [],
      };
    case 'level':
      return {
        eyebrow: 'Level Finder',
        title: 'Shop by Level',
        body: seoProfile.intro || 'Pick the learner stage first and refine the matching books using subject, curriculum, publisher, or item type filters.',
        popularSearches: seoProfile.popularSearches || [],
      };
    case 'curriculum':
      return {
        eyebrow: 'Curriculum Finder',
        title: 'Shop by Curriculum',
        body: seoProfile.intro || 'Choose the curriculum your school follows so you can reach the most relevant books faster.',
        popularSearches: seoProfile.popularSearches || [],
      };
    case 'publisher':
      return {
        eyebrow: 'Publisher Finder',
        title: 'Shop by Publisher',
        body: seoProfile.intro || 'Compare available titles by publisher, then narrow them by curriculum, subject, level, or item type.',
        popularSearches: seoProfile.popularSearches || [],
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
  const realCategories = categories.filter(c => c.id !== 'all');
  if (realCategories.length === 0) return null;
  const items = [...realCategories, ...realCategories];
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
  const { books, loading: catalogLoading, error: catalogError } = useCatalog();
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

  if (catalogError && books.length === 0) {
    return (
      <div className="bs-fade-page">
        <section className="bs-section bs-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div className="bs-empty-icon" style={{ marginBottom: 16 }}><Icon name="refresh" size={36} /></div>
          <h2>Could not load the bookshop</h2>
          <p style={{ color: 'var(--bs-text-muted)', marginBottom: 24 }}>{catalogError}</p>
          <button className="bs-btn bs-btn-navy" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </div>
    );
  }

  return (
    <div className="bs-fade-page">
      <div className="bs-sr-only" role="status" aria-live="polite">
        {catalogLoading && 'Loading book suggestions\u2026'}
        {!catalogLoading && !!books.length && `${books.length} product${books.length !== 1 ? 's' : ''} available`}
        {catalogError && 'Some sections could not load.'}
      </div>
      <HeroSlideshow navigate={navigate} />

      {featured.length > 0 && (
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
      )}

      <CategoryMarquee navigate={navigate} />

      {examPicks.length > 0 && (
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
      )}

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

const FilterPanel = ({ filters, setFilters, ceiling = 80, hiddenTaxonomy = '' }) => {
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
      <h3 className="bs-h3">Filter Products</h3>
      {FILTER_GROUPS.filter((group) => group.taxonomy !== hiddenTaxonomy).map((group) => {
        const items = taxonomies[group.key] || [];
        if (items.length === 0) return null;
        const selected = filters[group.key] || [];
        const orderedItems = [...items].sort((left, right) => (
          Number(selected.includes(right.id)) - Number(selected.includes(left.id))
        ));
        const query = searchTerms[group.key].trim();
        const searchable = SEARCHABLE_FILTER_KEYS.has(group.key) && items.length > FILTER_PREVIEW_LIMIT;
        const filteredItems = searchable && query ? rankByFuzzyMatch(orderedItems, query, item => `${item.label} ${(item.aliases || []).join(' ')}`) : orderedItems;
        const visibleItems = searchable && !query ? filteredItems.slice(0, FILTER_PREVIEW_LIMIT) : filteredItems;
        const hiddenCount = searchable && !query ? Math.max(0, items.length - visibleItems.length) : 0;

        return (
          <div className={`bs-filter-sec${open[group.key] ? '' : ' collapsed'}`} key={group.key}>
            <button className="bs-filter-sec-head" onClick={() => toggleSection(group.key)}>
              {group.label}
              <Icon name="chevDown" size={16} className="bs-chev" />
            </button>
            <div className="bs-filter-sec-body">
              {searchable && (
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
  const [drawer, setDrawer] = React.useState(false);
  const [browseQuery, setBrowseQuery] = React.useState('');
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [fetchedItems, setFetchedItems] = React.useState([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [fetchError, setFetchError] = React.useState('');
  const [hasMore, setHasMore] = React.useState(true);
  const [fetchLoading, setFetchLoading] = React.useState(false);
  const [requestStatus, setRequestStatus] = React.useState('idle');
  const sentinelRef = React.useRef(null);
  const fetchingRef = React.useRef(false);
  const previousCeilingRef = React.useRef(rangeCeiling);
  const abortRef = React.useRef(null);
  const sentinelKeyRef = React.useRef(0);
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const BATCH = isMobile ? MOBILE_BATCH : DESKTOP_BATCH;

  React.useEffect(() => {
    const previousCeiling = previousCeilingRef.current;
    setFilters((prev) => {
      const nextMin = Math.min(prev.min, Math.max(0, rangeCeiling - 2));
      const nextMax = prev.max >= previousCeiling
        ? rangeCeiling
        : Math.max(Math.min(prev.max, rangeCeiling), Math.min(nextMin + 2, rangeCeiling));
      return { ...prev, min: nextMin, max: nextMax };
    });
    previousCeilingRef.current = rangeCeiling;
  }, [rangeCeiling]);

  const buildSearchQuery = React.useCallback((page, perPage) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    const trimmed = filters.query.trim();
    if (trimmed) params.set('q', trimmed);
    if (initialBrowse.taxonomy === 'category' && initialBrowse.value) {
      params.set('category', initialBrowse.value);
    } else if (initialBrowse.taxonomy === 'subject' && initialBrowse.value) {
      params.set('subject', initialBrowse.value);
    } else if (initialBrowse.taxonomy === 'level' && initialBrowse.value) {
      params.set('level', initialBrowse.value);
    } else if (initialBrowse.taxonomy === 'curriculum' && initialBrowse.value) {
      params.set('curriculum', initialBrowse.value);
    } else if (initialBrowse.taxonomy === 'publisher' && initialBrowse.value) {
      params.set('publisher', initialBrowse.value);
    }
    if (filters.subjects.length && !initialBrowse.value) {
      params.set('subject', filters.subjects.join(','));
    }
    if (filters.levels.length) {
      params.set('level', filters.levels.join(','));
    }
    if (filters.curricula.length) {
      params.set('curriculum', filters.curricula.join(','));
    }
    if (filters.publishers.length) {
      params.set('publisher', filters.publishers.join(','));
    }
    if (filters.categories.length && !initialBrowse.value) {
      params.set('category', filters.categories.join(','));
    }
    if (filters.min > 0) params.set('min_price', String(filters.min));
    if (filters.max < rangeCeiling) params.set('max_price', String(filters.max));
    if (filters.inStock) params.set('in_stock', '1');
    if (sort !== 'newest') params.set('sort', sort);
    return params.toString();
  }, [filters, initialBrowse, sort, rangeCeiling]);

  const fetchPage = React.useCallback(async (page, append = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchLoading(true);
    setFetchError('');
    if (!append) setRequestStatus('loading');
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const qs = buildSearchQuery(page, BATCH);
      const data = await api.fetchProductSearch(`?${qs}`);
      if (controller.signal.aborted) return;
      const items = (data.items || []).map(fromApiProduct);
      if (append) {
        setFetchedItems(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const deduped = items.filter(p => !existingIds.has(p.id));
          return [...prev, ...deduped];
        });
      } else {
        setFetchedItems(items);
      }
      setTotalCount(data.total || 0);
      setCurrentPage(page);
      setHasMore(data.total > page * BATCH);
      setRequestStatus('success');
      sentinelKeyRef.current += 1;
    } catch (err) {
      if (err.name === 'AbortError') return;
      setFetchError('Could not load products. Try again.');
      if (!append) setRequestStatus('error');
    } finally {
      if (!controller.signal.aborted) {
        fetchingRef.current = false;
        setFetchLoading(false);
      }
    }
  }, [buildSearchQuery, BATCH]);

  React.useEffect(() => {
    setFetchedItems([]);
    setTotalCount(0);
    setCurrentPage(1);
    setHasMore(true);
    setFetchError('');
    setRequestStatus('loading');
    fetchingRef.current = false;
    sentinelKeyRef.current += 1;
  }, [filters, sort]);

  React.useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  const loadMore = React.useCallback(() => {
    if (!hasMore || fetchingRef.current) return;
    fetchPage(currentPage + 1, true);
  }, [hasMore, currentPage, fetchPage]);

  const retryPage = React.useCallback(() => {
    if (fetchingRef.current) return;
    const page = fetchedItems.length > 0 ? currentPage + 1 : 1;
    fetchPage(page, fetchedItems.length > 0);
  }, [currentPage, fetchPage, fetchedItems.length]);

  const list = React.useMemo(() => fetchedItems, [fetchedItems]);
  const shown = list;
  const allLoaded = !hasMore;

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || allLoaded || fetchError || requestStatus === 'loading') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetchingRef.current) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [allLoaded, loadMore, fetchError, requestStatus]);

  React.useEffect(() => {
    const term = String(initialQuery || '').trim();
    if (!term || catalogLoading) return;
    trackSearch({
      term,
      scope: 'bookshop',
      pageType: 'bookshop_search',
      path: `${PREFIX}/products`,
      resultsCount: totalCount,
      productImpressions: list.slice(0, 12).map((book, index) => ({
        productId: book.id,
        available: book.stock,
        position: index + 1,
      })),
    });
  }, [catalogLoading, initialQuery, list, totalCount]);

  React.useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer]);

  const selectedLabels = React.useMemo(() => selectedLabelList(filters, taxonomies), [filters, taxonomies]);
  const selectedFilters = React.useMemo(() => selectedFilterList(filters, taxonomies), [filters, taxonomies]);
  const searchContext = filters.query.trim()
    ? { term: filters.query.trim(), scope: 'bookshop', path: `${PREFIX}/products`, source: 'results' }
    : null;
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
  const requestTitle = filters.query.trim() || (selectedLabels.length === 1 ? selectedLabels[0] : initialBrowse.value) || '';
  const requestContext = {
    taxonomy: initialBrowse.taxonomy || null,
    taxonomy_value: initialBrowse.value || null,
    selected_filters: selectedLabels,
    context_label: contextLabel,
  };

  const topPicks = React.useMemo(() => [], []);

  const browseItem = React.useMemo(
    () => (initialBrowse.taxonomy && initialBrowse.value
      ? findTaxonomyItem(taxonomies, initialBrowse.taxonomy, initialBrowse.value)
      : null),
    [initialBrowse.taxonomy, initialBrowse.value, taxonomies],
  );
  const hasScopedBrowse = Boolean(initialBrowse.taxonomy && initialBrowse.value);
  const hiddenFilterTaxonomy = initialBrowse.taxonomy && !hasScopedBrowse
    ? initialBrowse.taxonomy
    : '';
  const browseIntro = React.useMemo(() => browseIntroCopy(initialBrowse.taxonomy, browseItem), [browseItem, initialBrowse.taxonomy]);
  const browseGroup = React.useMemo(() => filterGroupForTaxonomy(initialBrowse.taxonomy), [initialBrowse.taxonomy]);
  const toolbarFilters = React.useMemo(() => selectedFilters.filter(item => !(
    item.taxonomy === initialBrowse.taxonomy && item.value === initialBrowse.value
  )), [initialBrowse.taxonomy, initialBrowse.value, selectedFilters]);
  const browseLinks = React.useMemo(
    () => (browseGroup ? (taxonomies[browseGroup.key] || []) : []),
    [browseGroup, taxonomies],
  );
  const filteredBrowseLinks = React.useMemo(() => {
    const query = browseQuery.trim();
    if (!query && initialBrowse.taxonomy === 'subject' && !hasScopedBrowse) {
      const preferred = ['english', 'mathematics', 'maths', 'science'];
      return preferred
        .map((term) => browseLinks.find((item) => {
          const label = String(item.label || '').toLowerCase();
          return label === term || label === `${term} language` || (term === 'science' && label === 'integrated science');
        }))
        .filter(Boolean)
        .filter((item, index, arr) => arr.findIndex(candidate => candidate.id === item.id) === index)
        .slice(0, 3);
    }
    if (!query) return browseLinks;
    return rankByFuzzyMatch(browseLinks, browseQuery, item => [
        item.label,
        item.name,
        ...(item.aliases || []),
        ...(item.popularSearches || []),
      ].filter(Boolean).join(' '));
  }, [browseLinks, browseQuery, hasScopedBrowse, initialBrowse.taxonomy]);
  const isSubjectFinder = initialBrowse.taxonomy === 'subject' && !hasScopedBrowse;
  const selectedSubjectItems = React.useMemo(() => {
    const selected = new Set(filters.subjects || []);
    return browseLinks.filter((item) => selected.has(item.id));
  }, [browseLinks, filters.subjects]);

  const toggleBrowseFilter = React.useCallback((taxonomy, value) => {
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
  }, []);

  const removeToolbarFilter = React.useCallback(item => {
    setFilters(prev => ({ ...prev, [item.key]: (prev[item.key] || []).filter(value => value !== item.value) }));
  }, []);

  const clearToolbarFilters = React.useCallback(() => {
    setFilters(prev => {
      const next = { ...prev };
      FILTER_GROUPS.forEach(group => {
        next[group.key] = group.taxonomy === initialBrowse.taxonomy && initialBrowse.value ? [initialBrowse.value] : [];
      });
      return next;
    });
  }, [initialBrowse.taxonomy, initialBrowse.value]);

  React.useEffect(() => {
    setBrowseQuery('');
  }, [initialBrowse.taxonomy]);

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
        <span className="bs-sep">/</span>
        <a href={hrefForRoute('shop')} onClick={(event) => { event.preventDefault(); navigate('shop'); }}>Shop</a>
        {initialBrowse.taxonomy && (
          <>
            <span className="bs-sep">/</span>
            <span className={hasScopedBrowse ? '' : 'bs-cur'}>{browseSectionLabel(initialBrowse.taxonomy)}</span>
          </>
        )}
        {hasScopedBrowse && browseItem && (
          <>
            <span className="bs-sep">/</span>
            <span className="bs-cur">{browseItem.label}</span>
          </>
        )}
        {!initialBrowse.taxonomy && <><span className="bs-sep">/</span><span className="bs-cur">All Books</span></>}
      </div>

      <div className="bs-shop-layout">
        <aside className="bs-filter-card desktop">
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            ceiling={rangeCeiling}
            hiddenTaxonomy={hiddenFilterTaxonomy}
          />
          <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop: 18 }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Filters update instantly
          </button>
        </aside>

        <div className="bs-shop-results">
          {browseIntro && !filters.query.trim() && (
            <section className={`bs-category-intro${hasScopedBrowse ? ' compact' : ''}`}>
              {hasScopedBrowse ? (
                <div className="bs-scoped-intro">
                  <div className="bs-scoped-intro-copy">
                    <span className="bs-eyebrow">{browseIntro.eyebrow}</span>
                    <h1 className="bs-h2">
                      {initialBrowse.taxonomy === 'category' || browseIntro.title.toLowerCase().includes('book')
                        ? browseIntro.title
                        : `${browseIntro.title} Books`}
                    </h1>
                    <p>{browseIntro.body}</p>
                  </div>
                  {browseIntro.popularSearches?.length > 0 && (
                    <div className="bs-scoped-explore" aria-label="Popular searches">
                      <strong>Explore popular searches</strong>
                      <div>
                        {browseIntro.popularSearches.slice(0, 4).map((item, index) => (
                          <button key={item} type="button" onClick={() => setFilters(prev => ({ ...prev, query: item }))}>
                            <span className="bs-scoped-explore-icon"><Icon name={index === 0 ? 'cap' : index === 1 ? 'book' : index === 2 ? 'files' : 'search'} size={17} /></span>
                            <span>{item}</span>
                            <Icon name="chevR" size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
              <span className="bs-eyebrow">{browseIntro.eyebrow}</span>
              <h1 className="bs-h2">{browseIntro.title}</h1>
              <p>{browseIntro.body}</p>
              {browseIntro.popularSearches?.length > 0 && (
                <div className="bs-popular-searches" aria-label="Popular searches">
                  <span>Popular searches</span>
                  {browseIntro.popularSearches.slice(0, 5).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, query: item }))}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              {!hasScopedBrowse && browseLinks.length > 0 && (
                <div className="bs-browse-picker">
                  {isSubjectFinder && selectedSubjectItems.length > 0 && (
                    <div className="bs-subject-selection">
                      <div className="bs-subject-selection-head">
                        <span>Selected subjects</span>
                        <button
                          type="button"
                          onClick={() => setFilters((prev) => ({ ...prev, subjects: [] }))}
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="bs-subject-chips" aria-label="Selected subjects">
                        {selectedSubjectItems.map((item) => (
                          <button
                            key={`selected-${item.id}`}
                            type="button"
                            className="bs-subject-chip"
                            onClick={() => toggleBrowseFilter('subject', item.id)}
                            aria-label={`Remove ${item.label}`}
                          >
                            {item.label} <Icon name="close" size={11} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="bs-browse-filter">
                    <Icon name="search" size={16} />
                    <input
                      type="search"
                      value={browseQuery}
                      onChange={(event) => setBrowseQuery(event.target.value)}
                      placeholder={isSubjectFinder
                        ? 'Search subjects (e.g. Mathematics, English)'
                        : `Find a ${browseIntroHeading(initialBrowse.taxonomy).toLowerCase()}`}
                      aria-label={isSubjectFinder
                        ? 'Search subjects'
                        : `Find a ${browseIntroHeading(initialBrowse.taxonomy).toLowerCase()}`}
                    />
                  </label>
                  {isSubjectFinder ? (
                    <div className="bs-subject-check-grid" aria-label="Available subjects">
                      {filteredBrowseLinks.map((item) => {
                        const checked = (filters.subjects || []).includes(item.id);
                        return (
                          <label
                            key={`subject-${item.id}`}
                            className={`bs-subject-check${checked ? ' selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBrowseFilter('subject', item.id)}
                            />
                            <span className="bs-subject-check-box" aria-hidden="true">
                              {checked && <Icon name="check" size={12} />}
                            </span>
                            <span className="bs-subject-check-label">{item.label}</span>
                            <strong>{item.count}</strong>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bs-browse-link-grid">
                      {filteredBrowseLinks.map((item) => {
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
                  {filteredBrowseLinks.length === 0 && (
                    <p className="bs-browse-empty">No matching options. Try a shorter search.</p>
                  )}
                </div>
              )}
              <div className="bs-category-intro-meta">
                <span><strong>{list.length}</strong> result{list.length !== 1 ? 's' : ''}</span>
                <span>
                  {hasScopedBrowse
                    ? `${browseIntroHeading(initialBrowse.taxonomy)} filter already applied.`
                    : isSubjectFinder && selectedSubjectItems.length > 0
                      ? `${selectedSubjectItems.length} subject${selectedSubjectItems.length !== 1 ? 's' : ''} selected. Results update instantly.`
                      : isSubjectFinder
                        ? 'Search and tick every subject you need.'
                        : 'Choose a starting point, then refine with the filters.'}
                </span>
                {hasScopedBrowse && (
                  <button
                    type="button"
                    className="bs-search-clear"
                    onClick={() => navigate('shop', { taxonomy: initialBrowse.taxonomy })}
                  >
                    <Icon name="close" size={12} /> Clear {browseIntroHeading(initialBrowse.taxonomy)}
                  </button>
                )}
              </div>
                </>
              )}
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
          <div className={`bs-shop-toolbar${hasScopedBrowse ? ' scoped' : ''}`}>
            <div className="bs-toolbar-left">
              <button className="bs-filter-mobile-btn" onClick={() => setDrawer(true)}><Icon name="filter" size={16} /> Filter</button>
              <span className="bs-shop-count">
                {requestStatus === 'loading' && shown.length === 0
                  ? 'Loading books\u2026'
                  : allLoaded
                    ? <><strong>{totalCount}</strong> result{totalCount !== 1 ? 's' : ''}</>
                    : <>Showing <strong>{shown.length}</strong> of <strong>{totalCount}</strong></>}
              </span>
              {hasScopedBrowse && toolbarFilters.length > 0 && (
                <div className="bs-toolbar-filters" aria-label="Applied filters">
                  {toolbarFilters.map(item => (
                    <button key={`${item.taxonomy}-${item.value}`} type="button" onClick={() => removeToolbarFilter(item)} aria-label={`Remove ${item.label} filter`}>
                      <span>{browseIntroHeading(item.taxonomy)}: {item.label}</span><Icon name="close" size={11} />
                    </button>
                  ))}
                  <button type="button" className="clear" onClick={clearToolbarFilters}>Clear all</button>
                </div>
              )}
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

          <div className="bs-sr-only" role="status" aria-live="polite">
            {requestStatus === 'loading' && 'Loading products\u2026'}
            {requestStatus === 'success' && `${totalCount} product${totalCount !== 1 ? 's' : ''} found`}
            {requestStatus === 'error' && 'Could not load products.'}
          </div>
          {requestStatus === 'error' && shown.length === 0 ? (
            <div className="bs-empty-state" role="alert">
              <div className="bs-empty-icon"><Icon name="refresh" size={36} /></div>
              <h2>Could not load products.</h2>
              <p>{fetchError}</p>
              <div className="bs-empty-actions">
                <button className="bs-btn bs-btn-navy" onClick={retryPage}>Try again</button>
              </div>
            </div>
          ) : shown.length === 0 && (requestStatus === 'loading' || requestStatus === 'idle') ? (
            <div className="bs-product-grid" aria-busy="true" role="status" aria-label="Loading products">
              {Array.from({ length: isMobile ? SKELETON_COUNT_MOBILE : SKELETON_COUNT_DESKTOP }, (_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : shown.length === 0 && requestStatus === 'success' && totalCount === 0 ? (
            <div className="bs-empty-state">
              <div className="bs-empty-icon"><Icon name="search" size={36} /></div>
              <h2>No books match your {filters.query.trim() ? 'search' : 'filters'}.</h2>
              <p>
                {filters.query.trim()
                  ? <>Nothing matched <strong>"{filters.query.trim()}"</strong>. Try a different term, or clear your search and filters.</>
                  : 'Try a different subject, level, curriculum, publisher, item type, price range, or rating filter.'}
              </p>
              <div className="bs-empty-actions">
                <button className="bs-btn bs-btn-gold" onClick={() => setRequestOpen(true)}>Request this book</button>
                <button className="bs-btn bs-btn-outline" onClick={() => setFilters(createFilterState(rangeCeiling, initialBrowse, ''))}>Clear all filters</button>
              </div>
            </div>
          ) : view === 'grid' ? (
            <div className="bs-product-grid" aria-busy={requestStatus === 'loading' && shown.length > 0 ? 'true' : undefined}>{shown.map((book, index) => <ProductCard key={book.id} book={book} idx={index} navigate={navigate} searchContext={searchContext ? { ...searchContext, position: index + 1 } : null} />)}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy={requestStatus === 'loading' && shown.length > 0 ? 'true' : undefined}>{shown.map((book, index) => <ListCard key={book.id} book={book} idx={index} navigate={navigate} searchContext={searchContext ? { ...searchContext, position: index + 1 } : null} />)}</div>
          )}

          {!allLoaded && shown.length > 0 && (
            <div ref={sentinelRef} className="bs-scroll-sentinel" aria-hidden="true">
              {fetchLoading && (
                <div className="bs-loading-dots" role="status" aria-label="Loading more">
                  <span /><span /><span />
                </div>
              )}
              {fetchError && !fetchLoading && (
                <div className="bs-sentinel-retry">
                  <span>{fetchError}</span>
                  <button type="button" className="bs-btn bs-btn-outline-navy" onClick={retryPage}>Try again</button>
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
              <div className="bs-request-prompt">
                <div><strong>Still did not find the book you need?</strong><span>Send us the title and we will notify you when it is available.</span></div>
                <button type="button" className="bs-btn bs-btn-gold" onClick={() => setRequestOpen(true)}>Request a book</button>
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
        <button
          type="button"
          className="bs-drawer-close"
          onClick={() => setDrawer(false)}
          aria-label="Close filters"
        >
          <Icon name="close" size={17} />
        </button>
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          ceiling={rangeCeiling}
          hiddenTaxonomy={hiddenFilterTaxonomy}
        />
        <button className="bs-btn bs-btn-navy bs-btn-block bs-filter-apply" style={{ marginTop: 18 }} onClick={() => setDrawer(false)}>
          {requestStatus === 'loading' ? 'Loading\u2026' : <>Show {totalCount} result{totalCount !== 1 ? 's' : ''}</>}
        </button>
      </div>
      <BookRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} initialTitle={requestTitle} browseContext={requestContext} />
    </div>
  );
};

export { HomePage, ShopPage, CategoryStrip, BookRequestModal };
