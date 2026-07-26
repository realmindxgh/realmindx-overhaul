import React from 'react';
import { Icon, Stars, LoadingState, cedis, CoverPlaceholder } from './shared.jsx';
import { useCart, useWishlist, ProductCard } from './chrome.jsx';
import { useCatalog, fromApiProduct } from './catalog.jsx';
import { api, isApiMode } from '../src/lib/apiClient.js';
import { trackProductView } from '../src/lib/analytics.js';
import { canUseLocalFallback, useSiteCopyState } from '../src/lib/siteContent.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { setBookshopAuthReturn } from './authReturn.js';
import globalToast from '../src/lib/toast.js';
import { bookshopPathForRoute, productHref, productMatchesSegment, productPathSegment } from './urls.js';
import { BOOKSHOP_BASE_URL } from '../src/lib/seoRoutes.js';
const isLoggedIn = () => Boolean(getDemoSession()?.role);

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;
const hrefForProduct = (book) => `${PREFIX}${productHref(book)}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Accordion = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`bs-acc-item${open ? ' open' : ''}`}>
      <button className="bs-acc-head" onClick={() => setOpen(o => !o)}>{title} <Icon name="chevDown" size={18} className="bs-chev" /></button>
      <div className="bs-acc-body">{children}</div>
    </div>
  );
};

const QtyStepper = ({ qty, setQty, sm = false, onMinimumDecrease }) => {
  const [draft, setDraft] = React.useState(String(qty));

  React.useEffect(() => {
    setDraft(String(qty));
  }, [qty]);

  const commitDraft = () => {
    const value = Number.parseInt(draft, 10);
    if (!Number.isFinite(value) || value < 1) {
      setDraft(String(qty));
      return;
    }
    setQty(value);
  };

  const decrease = () => {
    if (qty <= 1 && onMinimumDecrease) {
      onMinimumDecrease();
      return;
    }
    setQty(Math.max(1, qty - 1));
  };

  return (
    <div className={`bs-qty-stepper${sm ? ' sm' : ''}`}>
      <button onClick={decrease} aria-label={qty <= 1 && onMinimumDecrease ? 'Remove item' : 'Decrease quantity'}><Icon name="minus" size={16} /></button>
      <input
        value={draft}
        inputMode="numeric"
        pattern="[0-9]*"
        onChange={e => {
          const value = e.target.value;
          if (/^\d*$/.test(value)) setDraft(value);
        }}
        onBlur={commitDraft}
        onFocus={e => e.currentTarget.select()}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(qty));
            e.currentTarget.blur();
          }
        }}
        aria-label="Quantity"
      />
      <button onClick={() => setQty(qty + 1)} aria-label="Increase quantity"><Icon name="plus" size={16} /></button>
    </div>
  );
};

// Only customers with a completed order for this product see this form.
// Identity and verified-purchase status come from the signed-in account and
// matching order on the backend, never from customer-entered claims.
const ReviewForm = ({ productId }) => {
  const [form, setForm] = React.useState({ rating: 0, title: '', comment: '' });
  const [hoverStar, setHoverStar] = React.useState(0);
  const [errors, setErrors] = React.useState({});
  const [apiError, setApiError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: '' } : e));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.rating) next.rating = 'Choose a star rating.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setApiError('');
    try {
      await api.createProductReview(productId, {
        rating: form.rating,
        title: form.title.trim(),
        comment: form.comment.trim(),
      });
      setDone(true);
    } catch (err) {
      setApiError(err.status === 429
        ? 'Too many reviews submitted from this device. Please try again later.'
        : (err.message || 'Could not submit your review. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bs-review-form" id="write-review">
        <div className="bs-review-success">
          <Icon name="check" size={20} />
          <div>
            <strong>Review received - thank you!</strong>
            <p>Thanks for sharing your experience.</p>
          </div>
        </div>
      </div>
    );
  }

  const lit = hoverStar || form.rating;
  return (
    <form className="bs-review-form" id="write-review" onSubmit={submit} noValidate>
      <h3 className="bs-review-form-title">Write a review</h3>
      <p className="bs-review-form-sub">Share your experience with this verified purchase.</p>

      <div className={`bs-field${errors.rating ? ' err' : ''}`}>
        <label>Your rating</label>
        <div className="bs-star-picker" role="radiogroup" aria-label="Star rating" onMouseLeave={() => setHoverStar(0)}>
          {[1, 2, 3, 4, 5].map(i => (
            <button
              key={i} type="button" className={i <= lit ? 'lit' : ''}
              role="radio" aria-checked={form.rating === i} aria-label={`${i} star${i === 1 ? '' : 's'}`}
              onMouseEnter={() => setHoverStar(i)} onFocus={() => setHoverStar(i)} onBlur={() => setHoverStar(0)}
              onClick={() => set('rating', i)}
            >
              <Icon name="star" size={26} stroke={0} />
            </button>
          ))}
        </div>
        {errors.rating && <div className="bs-field-error">{errors.rating}</div>}
      </div>

      <div className="bs-field">
        <label htmlFor="rv-title">Review title <span className="bs-optional">(optional)</span></label>
        <input id="rv-title" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Sum it up in a few words" />
      </div>

      <div className="bs-field">
        <label htmlFor="rv-comment">Your review <span className="bs-optional">(optional)</span></label>
        <textarea id="rv-comment" rows={4} value={form.comment} onChange={e => set('comment', e.target.value)} placeholder="What did you like? How is the quality? Would you recommend it?" />
      </div>

      {apiError && <div className="bs-field-error" role="alert" style={{ marginBottom: 12 }}>{apiError}</div>}

      <button type="submit" className="bs-btn bs-btn-gold" disabled={busy}>
        {busy ? 'Submitting...' : 'Submit Review'}
      </button>
      <div className="bs-review-form-hint" style={{ marginTop: 10 }}>
        Your email is never shown publicly.
      </div>
    </form>
  );
};

// Fallbacks if the Page Text entries are missing (e.g. stale local cache);
// the live values are edited in admin under Content > Page Text (bookshop area).
const PDP_DELIVERY_FALLBACK = 'Orders are dispatched as quickly as stock and payment allow. Delivery fees are calculated at checkout, and free pickup is available at our Dome Pillar 2 shop.';
const PDP_RETURNS_FALLBACK = 'Unused items in original condition can be returned within 7 days for an exchange or store credit. Damaged or incorrect items are replaced free of charge - just reach out on WhatsApp.';

const ProductPage = ({ navigate, bookId, bookSlug = '', initialBook = null }) => {
  const { books, loading: catalogLoading } = useCatalog();
  const { copy: siteCopy, loading: siteCopyLoading } = useSiteCopyState({ waitForApi: true });
  const allowLocalFallback = canUseLocalFallback();
  const book = initialBook || books.find(b => b.id === bookId) || books.find(b => productMatchesSegment(b, bookSlug)) || null;
  const { add, buyNow } = useCart();
  const wishlist = useWishlist();
  const [qty, setQty] = React.useState(1);
  const [activeImg, setActiveImg] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);
  const idx = Math.max(0, books.indexOf(book));

  React.useEffect(() => { setQty(1); setActiveImg(0); window.scrollTo(0,0); }, [bookId]);
  React.useEffect(() => {
    if (!lightbox) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => event.key === 'Escape' && setLightbox(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [lightbox]);
  React.useEffect(() => {
    if (!book?.id) return;
    trackProductView({
      productId: book.id,
      path: `${PREFIX}/products/${productPathSegment(book)}`,
      fullPath: `${PREFIX}/products/${productPathSegment(book)}`,
    });
  }, [book]);

  // Approved reviews from the backend. Demo fallback books carry non-numeric
  // ids ('b1') and have no backend rows — they just show the empty state and
  // no submission form (there is no product row to attach the review to).
  const hasBackendProduct = isApiMode() && /^\d+$/.test(String(book?.id ?? ''));
  const [productReviews, setProductReviews] = React.useState([]);
  const [reviewEligibility, setReviewEligibility] = React.useState({
    loading: false,
    eligible: false,
    alreadyReviewed: false,
  });
  React.useEffect(() => {
    setProductReviews([]);
    setReviewEligibility({ loading: false, eligible: false, alreadyReviewed: false });
    if (!isApiMode() || !/^\d+$/.test(String(book?.id ?? ''))) return undefined;
    let alive = true;
    api.fetchProductReviews(book.id)
      .then(data => { if (alive) setProductReviews(data.items || []); })
      .catch(() => {});
    if (isLoggedIn()) {
      setReviewEligibility({ loading: true, eligible: false, alreadyReviewed: false });
      api.fetchProductReviewEligibility(book.id)
        .then(data => {
          if (!alive) return;
          setReviewEligibility({
            loading: false,
            eligible: Boolean(data.eligible),
            alreadyReviewed: Boolean(data.already_reviewed),
          });
        })
        .catch(() => {
          if (alive) setReviewEligibility({ loading: false, eligible: false, alreadyReviewed: false });
        });
    }
    return () => { alive = false; };
  }, [book?.id]);

  if (catalogLoading && books.length === 0) {
    return (
      <div className="bs-container bs-fade-page">
        <LoadingState
          title="Loading product details"
          body="Getting the latest pricing, stock, and review information."
        />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="bs-container bs-fade-page">
        <div className="bs-empty-state">
          <div className="bs-empty-icon"><Icon name="book" size={36} /></div>
          <h2 className="bs-h2">This product is unavailable.</h2>
          <p>It may have been removed from the latest catalog.</p>
          <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('shop')}>
            Browse the Shop <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    );
  }

  const samePublisher = book.publisher
    ? books.filter(b => b.id !== book.id && b.publisher && b.publisher.toLowerCase() === book.publisher.toLowerCase())
    : [];
  const sameCategory = books.filter(b => b.id !== book.id && b.cat === book.cat);
  const related = [...samePublisher, ...sameCategory]
    .filter((item, index, arr) => arr.findIndex(candidate => candidate.id === item.id) === index)
    .slice(0, 5);
  const relatedTitle = samePublisher.length && book.publisher
    ? `More from ${book.publisher}`
    : 'More in this category';
  const deliveryCopy = siteCopy.bookshop_pdp_delivery_info
    || (allowLocalFallback ? PDP_DELIVERY_FALLBACK : 'Current delivery information is unavailable.');
  const returnsCopy = siteCopy.bookshop_pdp_return_policy
    || (allowLocalFallback ? PDP_RETURNS_FALLBACK : 'Current return policy is unavailable.');
  // Star distribution computed from the actual fetched reviews (5★ first)
  const ratingDist = [5, 4, 3, 2, 1].map(star => (
    productReviews.length
      ? Math.round((productReviews.filter(r => Number(r.rating) === star).length / productReviews.length) * 100)
      : 0
  ));
  const hasReviews = Number(book.reviews || 0) > 0 && Number(book.rating || 0) > 0;
  const reviewLinkLabel = reviewEligibility.eligible
    ? 'Write a review'
    : hasReviews
      ? `${book.reviews} review${book.reviews === 1 ? '' : 's'}`
      : 'Verified buyers can review';
  const reviewLinkTarget = reviewEligibility.eligible ? '#write-review' : '#reviews';
  const detailImage = book.imageMedium || book.imageOriginal || book.image;
  const lightboxImage = book.imageOriginal || book.imageMedium || book.image;
  const fmtReviewDate = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const shareProduct = async () => {
    const url = `${BOOKSHOP_BASE_URL}${productHref(book)}`;
    const shareData = {
      title: `${book.title} | RealMindX Bookshop`,
      text: `${book.title} — ${cedis(book.price)} at RealMindX Bookshop`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      globalToast.success('Product link copied');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        globalToast.success('Product link copied');
      } catch {
        globalToast.error('Could not share this product. Please copy the page address.');
      }
    }
  };

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-pdp-topbar">
        <div className="bs-breadcrumb">
          <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a><span className="bs-sep">/</span>
          <a href={hrefForRoute('shop')} onClick={(e)=>{e.preventDefault();navigate('shop');}}>Shop</a><span className="bs-sep">/</span>
          <span>{book.catName}</span><span className="bs-sep">/</span>
          <span className="bs-cur">{book.title}</span>
        </div>
        <button type="button" className="bs-pdp-share" onClick={shareProduct} aria-label={`Share ${book.title}`}>
          <Icon name="share" size={18} />
          <span>Share</span>
        </button>
      </div>

      <div className="bs-pdp">
        <div>
          <div className="bs-pdp-main-img" onClick={() => setLightbox(true)}>
            <CoverPlaceholder
              title={book.title}
              idx={idx}
              image={detailImage}
              loading="eager"
              fetchPriority="high"
              width={900}
              height={1260}
            />
          </div>
          {/* Thumb strip only for placeholder covers (which vary by index) — a real
              single product photo repeated three times reads as a fake gallery */}
          {!book.image && (
            <div className="bs-pdp-thumbs">
              {[0,1,2].map(i => (
                <div key={i} className={`bs-pdp-thumb${activeImg === i ? ' active' : ''}`} onClick={() => setActiveImg(i)}>
                  <CoverPlaceholder title={book.title} idx={idx+i} small image={book.imageThumb || book.image} width={96} height={128} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bs-pdp-info">
          <span className="bs-gold-pill">{book.catName}</span>
          <h1 className="bs-pdp-title bs-h2">{book.title}</h1>
          <div className="bs-pdp-rating-row">
            {hasReviews ? <Stars value={book.rating} size={17} /> : <span className="bs-no-rating">No ratings yet</span>}
            <a className="bs-review-link" href={reviewLinkTarget}>{reviewLinkLabel}</a>
          </div>
          <div className="bs-pdp-price">{cedis(book.price)}{book.old && <span className="bs-old">{cedis(book.old)}</span>}</div>
          <div className={`bs-pcard-stock ${book.stock ? 'bs-stock-in' : 'bs-stock-out'}`} style={{ fontSize:13 }}>
            <span className={`bs-dot ${book.stock ? 'in' : 'out'}`} /> {book.stock ? 'In Stock - ready to ship' : 'Out of Stock'}
          </div>
          <p className="bs-pdp-desc">
            {book.short || book.full || `${book.desc}. A trusted, classroom-ready edition used by schools across Ghana.`}
          </p>

          <div className="bs-pdp-actions">
            <div className="bs-pdp-cart-row">
              <QtyStepper qty={qty} setQty={setQty} />
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" disabled={!book.stock}
                onClick={() => add(book.id, qty)}>
                <Icon name="bag" size={18} /> Add to Cart
              </button>
            </div>
            <div className="bs-pdp-secondary-row">
              <button
                className={`bs-btn bs-btn-outline-navy bs-btn-sm bs-pdp-wishlist-btn${wishlist?.has(book.id) ? ' bs-wishlisted' : ''}`}
                onClick={() => { wishlist?.toggle(book.id); globalToast.success(wishlist?.has(book.id) ? 'Removed from wishlist' : 'Added to wishlist'); }}
              >
                <Icon name="heart" size={17} /> {wishlist?.has(book.id) ? 'Saved' : 'Save to Wishlist'}
              </button>
              <button className="bs-btn bs-btn-navy bs-btn-lg bs-btn-block" disabled={!book.stock}
                onClick={() => { buyNow(book.id, qty); navigate('checkout'); }}>
                Buy Now
              </button>
            </div>
          </div>

          <div className="bs-divider" />
          <dl className="bs-detail-list">
            {/* rows only render when the product actually has the detail */}
            {book.publisher && <><dt>Publisher</dt><dd>{book.publisher}</dd></>}
            {book.isbn && book.isbn !== '-' && <><dt>ISBN</dt><dd className="bs-mono">{book.isbn}</dd></>}
            {book.subject && <><dt>Subject</dt><dd>{book.subject}</dd></>}
            <dt>Grade Level</dt><dd>{book.grade || 'Not specified'}</dd>
          </dl>
          <div className="bs-divider" />

          <div className="bs-accordion">
            <Accordion title="Full description" defaultOpen>
              {book.full || `This title follows its listed curriculum and is structured around clear learning
              outcomes. Each unit opens with objectives, builds through worked examples, and closes with practice
              exercises and revision questions - ideal for both classroom teaching and self-study at home.`}
            </Accordion>
            <Accordion title="Delivery information">
              <span style={{ whiteSpace: 'pre-line' }}>{siteCopyLoading ? 'Loading current delivery information...' : deliveryCopy}</span>
            </Accordion>
            <Accordion title="Return policy">
              <span style={{ whiteSpace: 'pre-line' }}>{siteCopyLoading ? 'Loading current return policy...' : returnsCopy}</span>
            </Accordion>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="bs-section" id="related">
          <div className="bs-section-head-row"><div><span className="bs-eyebrow">Keep browsing</span><h2 className="bs-h2">{relatedTitle}</h2></div></div>
          <div className="bs-hscroll">
            {related.map((b,i) => <ProductCard key={b.id} book={b} idx={i} navigate={navigate} />)}
          </div>
        </section>
      )}

      <section className="bs-section" id="reviews">
        <div className="bs-section-head-row"><div><span className="bs-eyebrow">What buyers say</span><h2 className="bs-h2">Reviews</h2></div></div>
        <div className="bs-reviews-layout">
          <div>
            {hasReviews ? (
              <>
                <div className="bs-rating-big">{book.rating.toFixed(1)}</div>
                <Stars value={book.rating} size={18} />
                <div className="bs-muted" style={{ fontSize:13, marginTop:6 }}>Based on {book.reviews} review{book.reviews === 1 ? '' : 's'}</div>
                {productReviews.length > 0 && (
                  <div style={{ marginTop:18 }}>
                    {ratingDist.map((pct, i) => (
                      <div className="bs-bar-row" key={i}>
                        <span style={{ width:38 }}>{5-i} star</span>
                        <span className="bs-bar-track"><span className="bs-bar-fill" style={{ width: pct+'%' }} /></span>
                        <span style={{ width:34, textAlign:'right' }}>{pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="bs-review-empty">
                <div className="bs-rating-big">0.0</div>
                <div className="bs-muted" style={{ fontSize:13, marginTop:6 }}>No buyer ratings yet.</div>
              </div>
            )}
          </div>
          <div>
            {productReviews.length > 0 ? productReviews.map(r => (
              <div className="bs-review-card" key={r.id}>
                <div className="bs-review-head">
                  <div className="bs-review-avatar">{(r.customer_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="bs-review-name">
                      {r.customer_name}
                      {r.verified_purchase && <span className="bs-muted" style={{ fontWeight:400, fontSize:12 }}> - Verified purchase</span>}
                    </div>
                    <div className="bs-review-date"><Stars value={r.rating} size={12} />{r.created_at && <> - {fmtReviewDate(r.created_at)}</>}</div>
                  </div>
                </div>
                {(r.title || r.comment) && (
                  <p className="bs-review-body">
                    {r.title && <strong>{r.title}{r.comment ? ' — ' : ''}</strong>}
                    {r.comment}
                  </p>
                )}
              </div>
            )) : (
              <div className="bs-review-card">
                <p className="bs-review-body">Buyer reviews will appear here after customers rate this product.</p>
              </div>
            )}
            {hasBackendProduct && reviewEligibility.eligible && <ReviewForm key={book.id} productId={book.id} />}
            {hasBackendProduct && !isLoggedIn() && (
              <div className="bs-review-policy-note">
                Only customers with a completed order for this item can leave a review. Sign in after your purchase to see if you are eligible.
              </div>
            )}
            {hasBackendProduct && isLoggedIn() && reviewEligibility.loading && (
              <div className="bs-review-policy-note">Checking this account’s review eligibility…</div>
            )}
            {hasBackendProduct && isLoggedIn() && !reviewEligibility.loading && !reviewEligibility.eligible && !reviewEligibility.alreadyReviewed && (
              <div className="bs-review-policy-note">
                Reviews are available after this account completes an order containing this item.
              </div>
            )}
            {hasBackendProduct && isLoggedIn() && reviewEligibility.alreadyReviewed && (
              <div className="bs-review-eligibility-note">
                <Icon name="check" size={17} />
                You have already submitted a review for this product purchase.
              </div>
            )}
          </div>
        </div>
      </section>

      {lightbox && (
        <div
          className="bs-lightbox open"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${book.title} cover preview`}
        >
          <button
            type="button"
            className="bs-lightbox-close"
            aria-label="Close cover preview"
            autoFocus
            onClick={(event) => {
              event.stopPropagation();
              setLightbox(false);
            }}
          >
            <Icon name="close" size={24} />
          </button>
          <div className="bs-lightbox-img" onClick={e => e.stopPropagation()}>
            <CoverPlaceholder title={book.title} idx={idx} image={lightboxImage} loading="eager" width={1200} height={1680} />
          </div>
        </div>
      )}
    </div>
  );
};

const AuthReturnActions = ({ navigate, route = 'cart' }) => (
  !isLoggedIn() ? (
    <div className="bs-auth-return-actions">
      <p>Want your cart and order history saved?</p>
      <div>
        <button type="button" onClick={() => { setBookshopAuthReturn(route); navigate('login'); }}>Sign in</button>
        <button type="button" onClick={() => { setBookshopAuthReturn(route); navigate('signup'); }}>Create account</button>
      </div>
    </div>
  ) : null
);

const CartPage = ({ navigate }) => {
  const {
    detailed,
    selectedDetailed,
    selectedSubtotal,
    selectedBulkDiscounts,
    selectedBulkSaving,
    setQty,
    remove,
    clear,
    toggleSelected,
    selectAll,
    count,
    selectedCount,
    loading: cartLoading,
    error: cartError,
  } = useCart();
  const wishlist = useWishlist();
  const { books } = useCatalog();
  const [pendingRemoval, setPendingRemoval] = React.useState(null);
  const [generatingInvoice, setGeneratingInvoice] = React.useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [invoiceEmails, setInvoiceEmails] = React.useState('');
  const [invoiceEmailError, setInvoiceEmailError] = React.useState('');
  const [sentInvoice, setSentInvoice] = React.useState(null);
  // Delivery is NOT estimated on the cart page — location has not been chosen yet.
  // The exact fee is calculated once the user selects a delivery zone at checkout.
  const cartTotal = selectedSubtotal - (selectedBulkSaving || 0);

  // Suggested products: same categories as cart items, not already in cart, in stock
  const cartIds = new Set(detailed.map(b => b.id));
  const cartCats = new Set(detailed.map(b => b.cat));
  const suggestions = books
    .filter(b => !cartIds.has(b.id) && cartCats.has(b.cat) && b.stock)
    .slice(0, 4);

  const generateCartInvoice = async () => {
    if (selectedCount === 0) {
      globalToast.error('Select at least one cart item first.');
      return;
    }
    if (!isApiMode()) {
      globalToast.error('Invoice generation needs the live bookshop backend.');
      return;
    }
    setInvoiceModalOpen(true);
    setInvoiceEmailError('');
  };

  const emailCartInvoice = async (event) => {
    event.preventDefault();
    setInvoiceEmailError('');
    setSentInvoice(null);
    const emails = invoiceEmails
      .split(/[\s,;]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    const uniqueEmails = [...new Set(emails)];
    if (!uniqueEmails.length) {
      setInvoiceEmailError('Enter at least one email address.');
      return;
    }
    const invalid = uniqueEmails.find(email => !EMAIL_RE.test(email));
    if (invalid) {
      setInvoiceEmailError(`Check this email address: ${invalid}`);
      return;
    }
    setGeneratingInvoice(true);
    try {
      const response = await api.emailCartInvoice({
        emails: uniqueEmails,
        items: selectedDetailed.map(item => ({
          product_id: item.id,
          quantity: item.qty,
        })),
      });
      const invoiceId = response?.invoice?.invoice_id;
      if (!invoiceId) throw new Error('Invoice was created without an invoice ID.');
      setSentInvoice({ invoiceId, recipients: uniqueEmails });
      globalToast.success(`Invoice ${invoiceId} emailed.`);
    } catch (err) {
      setInvoiceEmailError(err?.message || 'Could not email invoice.');
      globalToast.error(err?.message || 'Could not email invoice.');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  if (cartLoading) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Loading your cart"
        body="Restoring your saved items from the latest catalog."
      />
    </div>
  );

  if (cartError) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Could not load your cart"
        body="We could not confirm your saved items against the latest catalog. Please refresh or try again shortly."
      />
    </div>
  );

  if (count === 0) return (
    <div className="bs-container bs-fade-page">
      <div className="bs-empty-state">
        <div className="bs-empty-icon"><Icon name="cart" size={40} /></div>
        <h2 className="bs-h2">Your cart is empty.</h2>
        <p>Find your next textbook below.</p>
        <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('shop')}>Browse the Shop <Icon name="arrow" size={16} /></button>
      </div>
    </div>
  );

  return (
    <div className="bs-container-narrow bs-fade-page bs-cart-page">
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a><span className="bs-sep">/</span><span className="bs-cur">Cart</span>
      </div>
      <div className="bs-cart-page-head">
        <div className="bs-cart-title-block">
          <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:32, margin:'0 0 8px' }}>Your Cart</h1>
          <p className="bs-muted bs-cart-count-copy" style={{ margin:0 }}>
            <span>{count} item{count>1?'s':''} in cart.</span>
            <span>{selectedCount} selected for checkout.</span>
          </p>
        </div>
        <div className="bs-cart-head-actions">
          <button type="button" className="bs-cart-clear-btn" onClick={clear}>
            <Icon name="trash" size={14} /> Clear cart
          </button>
        </div>
      </div>

      <div className={`bs-cart-savings-banner${selectedBulkSaving > 0 ? '' : ' is-invoice-only'}`}>
          <span className="bs-cart-savings-icon"><Icon name={selectedBulkSaving > 0 ? 'gift' : 'files'} size={24} /></span>
          <div className="bs-cart-savings-copy">
            {selectedBulkSaving > 0 ? (
              <>
                <strong>Nice choice! You’re saving more with bulk pricing.</strong>
                <span>You saved <b>{cedis(selectedBulkSaving)}</b> with your bulk discount.</span>
              </>
            ) : (
              <>
                <strong>Need a shareable copy of this cart?</strong>
                <span>Generate a detailed invoice for your selected books.</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="bs-cart-savings-invoice"
            disabled={selectedCount === 0 || generatingInvoice}
            onClick={generateCartInvoice}
          >
            <Icon name="files" size={16} /> {generatingInvoice ? 'Generating...' : 'Generate Invoice'}
          </button>
      </div>

      <div className="bs-cart-layout">
        <div className="bs-cart-items-card">
          {detailed.map((b, i) => (
            <div className={`bs-cart-item${b.selected ? '' : ' is-unselected'}`} key={b.id}>
              <button
                type="button"
                className={`bs-cart-select${b.selected && b.stock ? ' selected' : ''}`}
                aria-label={`${b.selected && b.stock ? 'Unselect' : 'Select'} ${b.title} for checkout`}
                disabled={!b.stock}
                onClick={() => toggleSelected(b.id)}
              >
                {b.selected && b.stock && <Icon name="check" size={14} />}
              </button>
              <div className="bs-cart-item-cover"><CoverPlaceholder title={b.title} idx={i} small image={b.imageThumb || b.image} width={96} height={128} /></div>
              <div className="bs-cart-item-mid">
                <div className="bs-cart-meta-row">
                  <span className="bs-cat-badge">{b.catName}</span>
                  <button
                    type="button"
                    className={`bs-cart-wishlist-link${wishlist?.has(b.id) ? ' active' : ''}`}
                    aria-label={wishlist?.has(b.id) ? `Remove ${b.title} from wishlist` : `Save ${b.title} to wishlist`}
                    aria-pressed={wishlist?.has(b.id)}
                    title={wishlist?.has(b.id) ? 'Remove from wishlist' : 'Save to wishlist'}
                    onClick={() => {
                      const wasSaved = wishlist?.has(b.id);
                      wishlist?.toggle(b.id);
                      globalToast.success(wasSaved ? 'Removed from wishlist' : 'Saved to wishlist');
                    }}
                  >
                    <Icon name="heart" size={16} />
                  </button>
                </div>
                <div className="bs-cart-item-title">{b.title}</div>
                {!b.stock && <span className="bs-stock-warning">Out of stock</span>}
                <div className="bs-pcard-desc" style={{ whiteSpace:'normal' }}>{b.desc}</div>
              </div>
              <div className="bs-cart-item-right">
                <QtyStepper
                  qty={b.qty}
                  setQty={(q)=>setQty(b.id,q)}
                  onMinimumDecrease={() => setPendingRemoval(b)}
                  sm
                />
                <span className="bs-cart-subtotal">{cedis(b.price * b.qty)}</span>
                <button className="bs-remove-btn" aria-label="Remove" onClick={() => remove(b.id)}><Icon name="trash" size={18} /></button>
              </div>
            </div>
          ))}
        </div>

        <aside className="bs-summary-card">
          <h3 className="bs-h3">Order Summary</h3>
          <div className="bs-summary-row"><span>Selected items</span><span>{selectedCount}</span></div>
          <div className="bs-summary-row"><span>Subtotal</span><span>{cedis(selectedSubtotal)}</span></div>
          {/* Bulk Purchase Discount — automatic at each category's configured quantity */}
          {selectedBulkSaving > 0 && selectedBulkDiscounts.map(d => (
            <div key={d.id} className="bs-summary-row bs-discount" style={{ fontSize:13 }}>
              <span style={{ maxWidth:220, lineHeight:1.4 }}>Bulk Purchase Discount ({d.pct}%)</span>
              <span style={{ color:'var(--bs-success)', fontWeight:700 }}>-{cedis(d.saving)}</span>
            </div>
          ))}
          {/* Delivery — only known after selecting a zone at checkout */}
          <div className="bs-summary-row">
            <span>Delivery</span>
            <span className="bs-delivery-tbd">Calculated at checkout</span>
          </div>
          <p style={{ fontSize:12, color:'var(--bs-muted)', marginBottom:4 }}>
            Have a promo code? Apply it at checkout.
          </p>
          <div className="bs-summary-row bs-total"><span>Subtotal</span><span>{cedis(cartTotal)}</span></div>
          <div className="bs-cart-cta-row" style={{ marginTop:18 }}>
            <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-flex" disabled={selectedCount === 0} onClick={() => navigate('checkout')}>Proceed to Checkout <Icon name="arrow" size={16} /></button>
            <button className="bs-btn bs-btn-navy bs-btn-lg bs-btn-flex" onClick={() => navigate('shop')}><Icon name="chevL" size={15} /> Continue Shopping</button>
            {selectedCount === 0 && (
              <button className="bs-btn bs-btn-outline-navy bs-btn-flex" onClick={selectAll}>Select all items</button>
            )}
          </div>
          <AuthReturnActions navigate={navigate} route="cart" />
          <div className="bs-secure-note"><Icon name="lock" size={14} /> Secure checkout powered by Paystack</div>
        </aside>
      </div>

      {/* You might also like */}
      {suggestions.length > 0 && (
        <section className="bs-section" style={{ marginTop:48 }}>
          <div className="bs-section-head-row">
            <div>
              <span className="bs-eyebrow">While you're here</span>
              <h2 className="bs-h2">You might also like</h2>
            </div>
          </div>
          <div className="bs-hscroll">
            {suggestions.map((b, i) => <ProductCard key={b.id} book={b} idx={i} navigate={navigate} />)}
          </div>
        </section>
      )}

      {pendingRemoval && (
        <div className="bs-modal-scrim" role="presentation" onClick={() => setPendingRemoval(null)}>
          <div
            className="bs-modal-box bs-cart-remove-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bs-cart-remove-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="bs-modal-head">
              <div>
                <span className="bs-eyebrow">Cart item</span>
                <h3 className="bs-h3" id="bs-cart-remove-title">Remove this book?</h3>
              </div>
              <button type="button" className="bs-modal-close" aria-label="Cancel removal" onClick={() => setPendingRemoval(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="bs-modal-body">
              <p>Quantity cannot go below one. Remove <strong>{pendingRemoval.title}</strong> from your cart instead?</p>
            </div>
            <div className="bs-modal-foot">
              <button type="button" className="bs-btn bs-btn-outline-navy" onClick={() => setPendingRemoval(null)}>Keep item</button>
              <button
                type="button"
                className="bs-btn bs-cart-remove-confirm"
                onClick={() => {
                  remove(pendingRemoval.id);
                  setPendingRemoval(null);
                  globalToast.success('Item removed from cart');
                }}
              >
                <Icon name="trash" size={15} /> Remove item
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModalOpen && (
        <div className="bs-modal-scrim" role="presentation" onClick={() => !generatingInvoice && setInvoiceModalOpen(false)}>
          <form
            className="bs-modal-box bs-cart-invoice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bs-cart-invoice-title"
            onSubmit={emailCartInvoice}
            onClick={event => event.stopPropagation()}
          >
            <div className="bs-modal-head">
              <div>
                <span className="bs-eyebrow">Email invoice</span>
                <h3 className="bs-h3" id="bs-cart-invoice-title">Send selected cart invoice</h3>
              </div>
              <button type="button" className="bs-modal-close" aria-label="Close invoice email modal" disabled={generatingInvoice} onClick={() => setInvoiceModalOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="bs-modal-body">
              {sentInvoice ? (
                <div className="bs-invoice-sent-box">
                  <strong>Invoice {sentInvoice.invoiceId} sent.</strong>
                  <p>We emailed the PDF attachment to {sentInvoice.recipients.join(', ')}.</p>
                </div>
              ) : (
                <>
                  <p>Enter one or more email addresses. The invoice PDF will be sent as an attachment with RealMindX Bookshop branding.</p>
                  <label className="bs-field" style={{ marginTop:14 }}>
                    <span>Email address(es)</span>
                    <textarea
                      value={invoiceEmails}
                      onChange={event => setInvoiceEmails(event.target.value)}
                      rows={4}
                      placeholder="customer@school.edu.gh, bursar@school.edu.gh"
                      disabled={generatingInvoice}
                    />
                  </label>
                  <p className="bs-muted" style={{ fontSize:12, marginTop:8 }}>Separate multiple emails with commas, spaces, or new lines.</p>
                </>
              )}
              {invoiceEmailError && <p className="bs-track-error" style={{ marginTop:10 }}>{invoiceEmailError}</p>}
            </div>
            <div className="bs-modal-foot">
              <button type="button" className="bs-btn bs-btn-outline-navy" disabled={generatingInvoice} onClick={() => setInvoiceModalOpen(false)}>
                {sentInvoice ? 'Close' : 'Cancel'}
              </button>
              {!sentInvoice && (
                <button type="submit" className="bs-btn bs-btn-gold" disabled={generatingInvoice}>
                  <Icon name="mail" size={15} /> {generatingInvoice ? 'Sending...' : 'Send Invoice'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ─── WISHLIST PAGE ──────────────────────────────────── */
const WishlistPage = ({ navigate }) => {
  const wishlist = useWishlist();
  const { add: addToCart, addMany: addManyToCart } = useCart();
  const { books, loading: catalogLoading } = useCatalog();
  const [resolvedBooks, setResolvedBooks] = React.useState(() => (isApiMode() ? [] : books));
  const [wishlistLoading, setWishlistLoading] = React.useState(false);

  React.useEffect(() => {
    const ids = wishlist?.items || [];
    if (!isApiMode()) {
      setResolvedBooks(books);
      setWishlistLoading(false);
      return undefined;
    }
    if (!ids.length) {
      setResolvedBooks([]);
      setWishlistLoading(false);
      return undefined;
    }

    let cancelled = false;
    setWishlistLoading(true);
    // The normal catalogue endpoint is cached and proxy-safe in every
    // supported deployment. Resolve the saved IDs from it instead of making
    // tab navigation depend on a POST-only batch request.
    api.fetchProducts('?limit=100')
      .then(({ items = [] }) => {
        if (cancelled) return;
        const byId = new Map(items.map(item => [String(item.id), fromApiProduct(item)]));
        // Keep the user's saved order and quietly drop products that are no
        // longer active in the catalogue.
        setResolvedBooks(ids.map(id => byId.get(String(id))).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setResolvedBooks([]);
      })
      .finally(() => {
        if (!cancelled) setWishlistLoading(false);
      });
    return () => { cancelled = true; };
  }, [books, wishlist?.items]);

  const wishlisted = (isApiMode() ? resolvedBooks : books).filter(b => wishlist?.has(b.id));

  if ((catalogLoading || wishlistLoading) && (wishlist?.count || 0) > 0 && wishlisted.length === 0) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Loading your wishlist"
        body="Restoring your saved books from the latest catalog."
      />
    </div>
  );

  const moveToCart = (book) => {
    addToCart(book.id, 1);
    wishlist?.remove(book.id);
    globalToast.success(`"${book.title}" moved to cart`);
  };

  const moveAllToCart = () => {
    const available = wishlisted.filter(book => book.stock);
    const ids = available.map(book => book.id);
    const movedCount = addManyToCart(ids, 1);
    if (!movedCount) {
      globalToast.error('None of your saved products are currently in stock.');
      return;
    }
    wishlist?.removeMany(ids);
    globalToast.success(`${movedCount} saved product${movedCount === 1 ? '' : 's'} moved to cart`);
  };

  if (!wishlisted.length) return (
    <div className="bs-container bs-fade-page">
      <div className="bs-empty-state">
        <div className="bs-empty-icon"><Icon name="heart" size={40} /></div>
        <h2 className="bs-h2">Your wishlist is empty.</h2>
        <p>Tap the heart on any product to save it here.</p>
        <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('shop')}>Browse the Shop <Icon name="arrow" size={16} /></button>
      </div>
    </div>
  );

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a>
        <span className="bs-sep">/</span>
        <span className="bs-cur">Wishlist</span>
      </div>
      <div className="bs-wishlist-head">
        <div>
          <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:28, margin:0 }}>My Wishlist</h1>
          <p className="bs-muted" style={{ marginTop:4 }}>{wishlisted.length} saved item{wishlisted.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          className="bs-btn bs-btn-gold bs-wishlist-move-all"
          onClick={moveAllToCart}
          disabled={!wishlisted.some(book => book.stock)}
        >
          <Icon name="cart" size={16} /> Move all to cart
        </button>
      </div>

      <div className="bs-wishlist-grid">
        {wishlisted.map((b, i) => (
          <div className="bs-wishlist-card" key={b.id}>
            <a
              className="bs-wishlist-cover bs-product-link"
              href={hrefForProduct(b)}
              onClick={(e) => {
                e.preventDefault();
                navigate('product', { id: b.id, slug: productPathSegment(b) });
              }}
            >
              <CoverPlaceholder
                title={b.title}
                idx={i}
                image={b.imageThumb || b.image}
                loading={i < 4 ? 'eager' : 'lazy'}
                width={400}
                height={560}
              />
            </a>
            <div className="bs-wishlist-body">
              <span className="bs-cat-badge" style={{ marginBottom:6 }}>{b.catName}</span>
              <a
                className="bs-wishlist-title bs-product-link"
                href={hrefForProduct(b)}
                onClick={(e) => {
                  e.preventDefault();
                  navigate('product', { id: b.id, slug: productPathSegment(b) });
                }}
              >
                {b.title}
              </a>
              <div className="bs-wishlist-price">{cedis(b.price)}</div>
              <div className={`bs-pcard-stock ${b.stock ? 'bs-stock-in' : 'bs-stock-out'}`} style={{ fontSize:12, marginBottom:10 }}>
                <span className={`bs-dot ${b.stock ? 'in' : 'out'}`} /> {b.stock ? 'In Stock' : 'Out of Stock'}
              </div>
              <div className="bs-wishlist-actions">
                {b.stock && (
                  <button className="bs-btn bs-btn-gold bs-btn-sm" onClick={() => moveToCart(b)}>
                    <Icon name="bag" size={14} /> Move to Cart
                  </button>
                )}
                <button className="bs-btn bs-btn-outline-navy bs-btn-sm" onClick={() => wishlist.remove(b.id)}>
                  <Icon name="trash" size={14} /> Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      {(() => {
        const wIds = new Set(wishlisted.map(b => b.id));
        const wCats = new Set(wishlisted.map(b => b.cat));
        const sugg = books.filter(b => !wIds.has(b.id) && wCats.has(b.cat) && b.stock).slice(0, 4);
        if (!sugg.length) return null;
        return (
          <section className="bs-section" style={{ marginTop:48 }}>
            <div className="bs-section-head-row"><div><span className="bs-eyebrow">More to love</span><h2 className="bs-h2">You might like</h2></div></div>
            <div className="bs-hscroll">
              {sugg.map((b, i) => <ProductCard key={b.id} book={b} idx={i} navigate={navigate} />)}
            </div>
          </section>
        );
      })()}

      <div className="bs-wishlist-continue">
        <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => navigate('shop')}>
          <Icon name="chevL" size={15} /> Continue Shopping
        </button>
      </div>
    </div>
  );
};

export { ProductPage, CartPage, WishlistPage, QtyStepper, Accordion };
