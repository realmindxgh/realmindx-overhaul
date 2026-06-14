import React from 'react';
import { Icon, Stars, LoadingState, cedis, CoverPlaceholder } from './shared.jsx';
import { useCart, useWishlist, ProductCard } from './chrome.jsx';
import { useCatalog } from './catalog.jsx';
import { api, isApiMode } from '../src/lib/apiClient.js';
import { trackProductView } from '../src/lib/analytics.js';
import { useSiteCopy } from '../src/lib/siteContent.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { setBookshopAuthReturn } from './authReturn.js';
import globalToast from '../src/lib/toast.js';
import { bookshopPathForRoute, categoryHref, productHref, productMatchesSegment, productPathSegment } from './urls.js';
const isLoggedIn = () => Boolean(getDemoSession()?.role);

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;
const hrefForCategory = (category) => `${PREFIX}${categoryHref(category)}`;
const hrefForProduct = (book) => `${PREFIX}${productHref(book)}`;

const Accordion = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`bs-acc-item${open ? ' open' : ''}`}>
      <button className="bs-acc-head" onClick={() => setOpen(o => !o)}>{title} <Icon name="chevDown" size={18} className="bs-chev" /></button>
      <div className="bs-acc-body">{children}</div>
    </div>
  );
};

const QtyStepper = ({ qty, setQty, sm = false }) => (
  <div className={`bs-qty-stepper${sm ? ' sm' : ''}`}>
    <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease"><Icon name="minus" size={16} /></button>
    <input value={qty} onChange={e => { const v = parseInt(e.target.value); setQty(isNaN(v) ? 1 : Math.max(1, v)); }} aria-label="Quantity" />
    <button onClick={() => setQty(qty + 1)} aria-label="Increase"><Icon name="plus" size={16} /></button>
  </div>
);

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
            <p>It will appear here after our team approves it.</p>
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
        Your review will be marked as a verified purchase after moderation. Your email is never shown publicly.
      </div>
    </form>
  );
};

// Fallbacks if the Page Text entries are missing (e.g. stale local cache);
// the live values are edited in admin under Content > Page Text (bookshop area).
const PDP_DELIVERY_FALLBACK = 'Orders are dispatched within 24 hours and delivered nationwide within 48 hours. Free pickup is available at our Dome Pillar 2 shop.';
const PDP_RETURNS_FALLBACK = 'Unused items in original condition can be returned within 7 days for an exchange or store credit. Damaged or incorrect items are replaced free of charge - just reach out on WhatsApp.';

const ProductPage = ({ navigate, bookId, bookSlug = '' }) => {
  const { books, loading: catalogLoading } = useCatalog();
  const siteCopy = useSiteCopy();
  const book = books.find(b => b.id === bookId) || books.find(b => productMatchesSegment(b, bookSlug)) || null;
  const { add } = useCart();
  const wishlist = useWishlist();
  const [qty, setQty] = React.useState(1);
  const [activeImg, setActiveImg] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);
  const idx = Math.max(0, books.indexOf(book));

  React.useEffect(() => { setQty(1); setActiveImg(0); window.scrollTo(0,0); }, [bookId]);
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
  // Star distribution computed from the actual fetched reviews (5★ first)
  const ratingDist = [5, 4, 3, 2, 1].map(star => (
    productReviews.length
      ? Math.round((productReviews.filter(r => Number(r.rating) === star).length / productReviews.length) * 100)
      : 0
  ));
  const hasReviews = Number(book.reviews || 0) > 0 && Number(book.rating || 0) > 0;
  const fmtReviewDate = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a><span className="bs-sep">/</span>
        <a href={hrefForRoute('shop')} onClick={(e)=>{e.preventDefault();navigate('shop');}}>Shop</a><span className="bs-sep">/</span>
        <a href={hrefForCategory(book.cat)} onClick={(e)=>{e.preventDefault();navigate('shop',{cat:book.cat});}}>{book.catName}</a><span className="bs-sep">/</span>
        <span className="bs-cur">{book.title}</span>
      </div>

      <div className="bs-pdp">
        <div>
          <div className="bs-pdp-main-img" onClick={() => setLightbox(true)}>
            <CoverPlaceholder title={book.title} idx={idx} image={book.image} />
          </div>
          {/* Thumb strip only for placeholder covers (which vary by index) — a real
              single product photo repeated three times reads as a fake gallery */}
          {!book.image && (
            <div className="bs-pdp-thumbs">
              {[0,1,2].map(i => (
                <div key={i} className={`bs-pdp-thumb${activeImg === i ? ' active' : ''}`} onClick={() => setActiveImg(i)}>
                  <CoverPlaceholder title={book.title} idx={idx+i} small image={book.image} />
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
            <a className="bs-review-link" href="#reviews">{hasReviews ? `${book.reviews} review${book.reviews === 1 ? '' : 's'}` : 'Be the first to review'}</a>
          </div>
          <div className="bs-pdp-price">{cedis(book.price)}{book.old && <span className="bs-old">{cedis(book.old)}</span>}</div>
          <div className={`bs-pcard-stock ${book.stock ? 'bs-stock-in' : 'bs-stock-out'}`} style={{ fontSize:13 }}>
            <span className={`bs-dot ${book.stock ? 'in' : 'out'}`} /> {book.stock ? 'In Stock - ready to ship' : 'Out of Stock'}
          </div>
          <p className="bs-pdp-desc">
            {book.short || book.full || `${book.desc}. A trusted, classroom-ready edition used by schools across Ghana.`}
          </p>

          <div className="bs-pdp-actions">
            <div className="bs-pdp-buy-row">
              <QtyStepper qty={qty} setQty={setQty} />
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" disabled={!book.stock}
                onClick={() => add(book.id, qty)}>
                <Icon name="bag" size={18} /> Add to Cart
              </button>
            </div>
            <button
              className={`bs-btn bs-btn-outline-navy bs-btn-block${wishlist?.has(book.id) ? ' bs-wishlisted' : ''}`}
              onClick={() => { wishlist?.toggle(book.id); globalToast.success(wishlist?.has(book.id) ? 'Removed from wishlist' : 'Added to wishlist'); }}
            >
              <Icon name="heart" size={17} /> {wishlist?.has(book.id) ? 'Saved to Wishlist ✓' : 'Save to Wishlist'}
            </button>
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
              <span style={{ whiteSpace: 'pre-line' }}>{siteCopy.bookshop_pdp_delivery_info || PDP_DELIVERY_FALLBACK}</span>
            </Accordion>
            <Accordion title="Return policy">
              <span style={{ whiteSpace: 'pre-line' }}>{siteCopy.bookshop_pdp_return_policy || PDP_RETURNS_FALLBACK}</span>
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
                <div className="bs-muted" style={{ fontSize:13, marginTop:6 }}>No approved buyer ratings yet.</div>
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
                <p className="bs-review-body">Buyer reviews will appear here after customers rate this product and admin approves the review.</p>
              </div>
            )}
            {hasBackendProduct && reviewEligibility.eligible && <ReviewForm key={book.id} productId={book.id} />}
            {hasBackendProduct && isLoggedIn() && reviewEligibility.alreadyReviewed && (
              <div className="bs-review-eligibility-note">
                <Icon name="check" size={17} />
                You have already submitted a review for this product purchase.
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={`bs-lightbox${lightbox ? ' open' : ''}`} onClick={() => setLightbox(false)}>
        <button className="bs-lightbox-close" aria-label="Close"><Icon name="close" size={24} /></button>
        <div className="bs-lightbox-img" onClick={e => e.stopPropagation()}><CoverPlaceholder title={book.title} idx={idx} image={book.image} /></div>
      </div>
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
  const { detailed, subtotal, bulkDiscounts, bulkSaving, setQty, remove, count, loading: cartLoading } = useCart();
  const wishlist = useWishlist();
  const { books } = useCatalog();
  // Delivery is NOT estimated on the cart page — location has not been chosen yet.
  // The exact fee is calculated once the user selects a delivery zone at checkout.
  const cartTotal = subtotal - (bulkSaving || 0);

  // Suggested products: same categories as cart items, not already in cart, in stock
  const cartIds = new Set(detailed.map(b => b.id));
  const cartCats = new Set(detailed.map(b => b.cat));
  const suggestions = books
    .filter(b => !cartIds.has(b.id) && cartCats.has(b.cat) && b.stock)
    .slice(0, 4);

  if (cartLoading) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Loading your cart"
        body="Restoring your saved items from the latest catalog."
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
    <div className="bs-container-narrow bs-fade-page" style={{ maxWidth: 980 }}>
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a><span className="bs-sep">/</span><span className="bs-cur">Cart</span>
      </div>
      <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:32, margin:'8px 0 8px' }}>Your Cart</h1>
      <p className="bs-muted" style={{ marginBottom:20 }}>{count} item{count>1?'s':''} ready for checkout.</p>

      <div className="bs-cart-layout">
        <div>
          {detailed.map((b, i) => (
            <div className="bs-cart-item" key={b.id}>
              <div className="bs-cart-item-cover"><CoverPlaceholder title={b.title} idx={i} small image={b.image} /></div>
              <div className="bs-cart-item-mid">
                <span className="bs-cat-badge">{b.catName}</span>
                <div className="bs-cart-item-title">{b.title}</div>
                <div className="bs-pcard-desc" style={{ whiteSpace:'normal' }}>{b.desc}</div>
                {/* Save to wishlist link */}
                <button
                  className="bs-cart-wishlist-link"
                  onClick={() => { wishlist?.toggle(b.id); }}
                >
                  <Icon name="heart" size={13} /> {wishlist?.has(b.id) ? 'Remove from Wishlist' : 'Save to Wishlist'}
                </button>
              </div>
              <div className="bs-cart-item-right">
                <QtyStepper qty={b.qty} setQty={(q)=>setQty(b.id,q)} sm />
                <span className="bs-cart-subtotal">{cedis(b.price * b.qty)}</span>
                <button className="bs-remove-btn" aria-label="Remove" onClick={() => remove(b.id)}><Icon name="trash" size={18} /></button>
              </div>
            </div>
          ))}
        </div>

        <aside className="bs-summary-card">
          <h3 className="bs-h3">Order Summary</h3>
          <div className="bs-summary-row"><span>Subtotal</span><span>{cedis(subtotal)}</span></div>
          {/* Bulk Purchase Discount — automatic for 10+ of qualifying items */}
          {bulkSaving > 0 && bulkDiscounts.map(d => (
            <div key={d.id} className="bs-summary-row bs-discount" style={{ fontSize:13 }}>
              <span style={{ maxWidth:200, lineHeight:1.4 }}>
                Bulk Purchase Discount for Retailers &amp; Schools<br/>
                <span style={{ opacity:.7, fontSize:11 }}>{d.qty}&times; {d.title} @ {d.pct}% off</span>
              </span>
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
            <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-flex" onClick={() => navigate('checkout')}>Proceed to Checkout <Icon name="arrow" size={16} /></button>
            <button className="bs-btn bs-btn-navy bs-btn-lg bs-btn-flex" onClick={() => navigate('shop')}><Icon name="chevL" size={15} /> Continue Shopping</button>
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
    </div>
  );
};

/* ─── WISHLIST PAGE ──────────────────────────────────── */
const WishlistPage = ({ navigate }) => {
  const wishlist = useWishlist();
  const { add: addToCart } = useCart();
  const { books, loading: catalogLoading } = useCatalog();

  const wishlisted = books.filter(b => wishlist?.has(b.id));

  if (catalogLoading && (wishlist?.count || 0) > 0 && wishlisted.length === 0) return (
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

  if (!wishlisted.length) return (
    <div className="bs-container bs-fade-page">
      <div className="bs-empty-state">
        <div className="bs-empty-icon"><Icon name="heart" size={40} /></div>
        <h2 className="bs-h2">Your wishlist is empty.</h2>
        <p>Tap the <Icon name="heart" size={14} style={{ verticalAlign:'middle' }} /> on any product to save it here.</p>
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:24 }}>
        <div>
          <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:28, margin:0 }}>My Wishlist</h1>
          <p className="bs-muted" style={{ marginTop:4 }}>{wishlisted.length} saved item{wishlisted.length !== 1 ? 's' : ''}</p>
        </div>
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
              <CoverPlaceholder title={b.title} idx={i} image={b.image} />
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
    </div>
  );
};

export { ProductPage, CartPage, WishlistPage, QtyStepper, Accordion };
