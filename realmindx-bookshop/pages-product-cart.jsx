import React from 'react';
import { Icon, Stars, cedis, CoverPlaceholder, REVIEWS } from './shared.jsx';
import { useCart, ProductCard } from './chrome.jsx';
import { useCatalog } from './catalog.jsx';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { setBookshopAuthReturn } from './authReturn.js';
const isLoggedIn = () => Boolean(getDemoSession()?.role);

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

const ProductPage = ({ navigate, bookId }) => {
  const { books } = useCatalog();
  const book = books.find(b => b.id === bookId) || books[0];
  const { add, toast } = useCart();
  const [qty, setQty] = React.useState(1);
  const [activeImg, setActiveImg] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);
  const idx = Math.max(0, books.indexOf(book));

  React.useEffect(() => { setQty(1); setActiveImg(0); window.scrollTo(0,0); }, [bookId]);

  if (!book) return null;

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
  const ratingDist = [70,20,6,3,1];
  const hasReviews = Number(book.reviews || 0) > 0 && Number(book.rating || 0) > 0;

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href="#" onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a><span className="bs-sep">/</span>
        <a href="#" onClick={(e)=>{e.preventDefault();navigate('shop');}}>Shop</a><span className="bs-sep">/</span>
        <a href="#" onClick={(e)=>{e.preventDefault();navigate('shop',{cat:book.cat});}}>{book.catName}</a><span className="bs-sep">/</span>
        <span className="bs-cur">{book.title}</span>
      </div>

      <div className="bs-pdp">
        <div>
          <div className="bs-pdp-main-img" onClick={() => setLightbox(true)}>
            <CoverPlaceholder title={book.title} idx={idx} image={book.image} />
          </div>
          <div className="bs-pdp-thumbs">
            {[0,1,2].map(i => (
              <div key={i} className={`bs-pdp-thumb${activeImg === i ? ' active' : ''}`} onClick={() => setActiveImg(i)}>
                <CoverPlaceholder title={book.title} idx={idx+i} small image={book.image} />
              </div>
            ))}
          </div>
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
            {book.full || `${book.desc}. A trusted, classroom-ready edition used by schools across Ghana.`}
          </p>

          <div className="bs-pdp-actions">
            <div className="bs-pdp-buy-row">
              <QtyStepper qty={qty} setQty={setQty} />
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" disabled={!book.stock}
                onClick={() => add(book.id, qty)}>
                <Icon name="bag" size={18} /> Add to Cart
              </button>
            </div>
            <button className="bs-btn bs-btn-outline-navy bs-btn-block" onClick={() => toast('Saved for later')}>
              <Icon name="heart" size={17} /> Save for Later
            </button>
          </div>

          <div className="bs-divider" />
          <dl className="bs-detail-list">
            <dt>Publisher</dt><dd>{book.publisher}</dd>
            <dt>ISBN</dt><dd className="bs-mono">{book.isbn}</dd>
            <dt>Subject</dt><dd>{book.subject}</dd>
            <dt>Grade Level</dt><dd>{book.grade || 'All levels'}</dd>
          </dl>
          <div className="bs-divider" />

          <div className="bs-accordion">
            <Accordion title="Full description" defaultOpen>
              This title follows its listed curriculum and is structured around clear learning
              outcomes. Each unit opens with objectives, builds through worked examples, and closes with practice
              exercises and revision questions - ideal for both classroom teaching and self-study at home.
            </Accordion>
            <Accordion title="Delivery information">
              Orders are dispatched within 24 hours and delivered nationwide within 48 hours. Greater Accra delivery
              from GHS 15; other regions calculated at checkout. Free pickup available at our Dome Pillar 2 shop.
            </Accordion>
            <Accordion title="Return policy">
              Unused items in original condition can be returned within 7 days for an exchange or store credit.
              Damaged or incorrect items are replaced free of charge - just reach out on WhatsApp.
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
                <div style={{ marginTop:18 }}>
                  {ratingDist.map((pct, i) => (
                    <div className="bs-bar-row" key={i}>
                      <span style={{ width:38 }}>{5-i} star</span>
                      <span className="bs-bar-track"><span className="bs-bar-fill" style={{ width: pct+'%' }} /></span>
                      <span style={{ width:34, textAlign:'right' }}>{pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bs-review-empty">
                <div className="bs-rating-big">0.0</div>
                <div className="bs-muted" style={{ fontSize:13, marginTop:6 }}>No approved buyer ratings yet.</div>
              </div>
            )}
          </div>
          <div>
            {hasReviews ? REVIEWS.slice(0, Math.min(REVIEWS.length, Number(book.reviews))).map((r,i) => (
              <div className="bs-review-card" key={i}>
                <div className="bs-review-head">
                  <div className="bs-review-avatar">{r.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
                  <div>
                    <div className="bs-review-name">{r.name} <span className="bs-muted" style={{ fontWeight:400, fontSize:12 }}>- {r.role}</span></div>
                    <div className="bs-review-date"><Stars value={r.rating} size={12} /> - {r.date}</div>
                  </div>
                </div>
                <p className="bs-review-body">{r.body}</p>
              </div>
            )) : (
              <div className="bs-review-card">
                <p className="bs-review-body">Buyer reviews will appear here after customers rate this product and admin approves the review.</p>
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
  const { detailed, subtotal, bulkDiscounts, bulkSaving, setQty, remove, count } = useCart();
  const delivery = subtotal > 0 ? 15 : 0;   // delivery fee shown on cart; exact fee is computed at checkout
  const total = subtotal - (bulkSaving || 0) + delivery;

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
        <a href="#" onClick={(e)=>{e.preventDefault();navigate('home');}}>Home</a><span className="bs-sep">/</span><span className="bs-cur">Cart</span>
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
          <div className="bs-summary-row"><span>Delivery</span><span>{cedis(delivery)}</span></div>
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
          <p style={{ fontSize:12, color:'var(--bs-muted)', marginBottom:4 }}>
            Have a promo code? Apply it at checkout.
          </p>
          <div className="bs-summary-row bs-total"><span>Total</span><span>{cedis(total)}</span></div>
          <div className="bs-cart-cta-row" style={{ marginTop:18 }}>
            <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-flex" onClick={() => navigate('checkout')}>Proceed to Checkout <Icon name="arrow" size={16} /></button>
            <button className="bs-btn bs-btn-outline-navy bs-btn-lg bs-btn-flex" onClick={() => navigate('shop')}><Icon name="chevL" size={15} /> Continue Shopping</button>
          </div>
          <AuthReturnActions navigate={navigate} route="cart" />
          <div className="bs-secure-note"><Icon name="lock" size={14} /> Secure checkout powered by Paystack</div>
        </aside>
      </div>
    </div>
  );
};

export { ProductPage, CartPage, QtyStepper, Accordion };
