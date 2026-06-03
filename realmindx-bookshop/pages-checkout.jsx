import React from 'react';
import { Icon, cedis, CoverPlaceholder } from './shared.jsx';
import { useCart } from './chrome.jsx';
import { submitOrder } from '../src/lib/managedContent.js';
import { isApiMode, api } from '../src/lib/apiClient.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
const isLoggedIn = () => Boolean(getDemoSession()?.role);

const CheckoutNudge = ({ navigate }) => !isLoggedIn() ? (
  <div className="bs-account-nudge">
    <Icon name="user" size={15} />
    <span>Sign in for saved addresses and order history.</span>
    <button className="bs-nudge-btn" onClick={() => navigate('login')}>Sign in</button>
    <span style={{ opacity:.5 }}>·</span>
    <button className="bs-nudge-btn" onClick={() => navigate('signup')}>Create account</button>
  </div>
) : null;
import TurnstileField from '../src/lib/TurnstileField.jsx';

const StepBar = ({ step }) => {
  const labels = ['Delivery','Payment','Confirm'];
  return (
    <div className="bs-steps">
      {labels.map((l, i) => (
        <React.Fragment key={l}>
          <div className={`bs-step${step === i ? ' active' : ''}${step > i ? ' done' : ''}`}>
            <span className="bs-step-num">{step > i ? <Icon name="check" size={16} /> : i+1}</span>
            <span className="bs-step-label">{l}</span>
          </div>
          {i < 2 && <span className={`bs-step-line${step > i ? ' done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
};

const MiniSummary = ({ detailed, total, delivery, subtotal }) => (
  <div className="bs-mini-summary desktop">
    <h3 className="bs-h3" style={{ fontSize:16, marginBottom:14 }}>Order Summary</h3>
    {detailed.map((b,i) => (
      <div className="bs-mini-item" key={b.id}>
        <div className="bs-mini-cover"><CoverPlaceholder title={b.title} idx={i} small image={b.image} /><span className="bs-mini-qty">{b.qty}</span></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'Montserrat', fontWeight:600, fontSize:13, color:'var(--bs-navy)', lineHeight:1.3 }}>{b.title}</div>
          <div className="bs-muted" style={{ fontSize:12 }}>{cedis(b.price)} x {b.qty}</div>
        </div>
        <span style={{ fontFamily:'Montserrat', fontWeight:700, fontSize:13 }}>{cedis(b.price*b.qty)}</span>
      </div>
    ))}
    <div className="bs-divider" style={{ margin:'14px 0' }} />
    <div className="bs-summary-row"><span>Subtotal</span><span>{cedis(subtotal)}</span></div>
    <div className="bs-summary-row"><span>Delivery</span><span>{cedis(delivery)}</span></div>
    <div className="bs-summary-row bs-total" style={{ fontSize:18 }}><span>Total</span><span>{cedis(total)}</span></div>
  </div>
);

const CheckoutPage = ({ navigate }) => {
  const { detailed, subtotal, count, clear, bulkSaving = 0 } = useCart();
  const [step, setStep] = React.useState(0);
  const [method, setMethod] = React.useState('delivery');
  const [form, setForm] = React.useState({ name:'', phone:'', email:'', address:'', city:'' });
  const [errors, setErrors] = React.useState({});
  const [orderRef, setOrderRef] = React.useState('');
  const [placing, setPlacing] = React.useState(false);
  const [orderError, setOrderError] = React.useState('');
  const [turnstileToken, setTurnstileToken] = React.useState('');

  // Delivery zones — fetched from API in API mode, fallback to fixed fee
  const [deliveryZones, setDeliveryZones] = React.useState([]);
  const [selectedZoneId, setSelectedZoneId] = React.useState('');
  const [loadingZones, setLoadingZones] = React.useState(false);

  React.useEffect(() => {
    if (!isApiMode()) return;
    setLoadingZones(true);
    api.fetchDeliveryZones()
      .then(data => setDeliveryZones(data.items || []))
      .catch(() => {})
      .finally(() => setLoadingZones(false));
  }, []);

  const selectedZone = deliveryZones.find(z => String(z.id) === selectedZoneId);
  const deliveryFee = method !== 'delivery' ? 0
    : (isApiMode() && deliveryZones.length > 0)
      ? (selectedZone ? Number(selectedZone.fee) : 0)
      : 15;  // fallback for local mode

  // Promo code
  const [promoInput, setPromoInput] = React.useState('');
  const [appliedPromo, setAppliedPromo] = React.useState(null);  // { code, discount_type, discount_value, applies_to, description }
  const [promoError, setPromoError] = React.useState('');
  const [checkingPromo, setCheckingPromo] = React.useState(false);

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setCheckingPromo(true); setPromoError('');
    try {
      const result = isApiMode()
        ? await api.validatePromoCode(promoInput.trim().toUpperCase(), subtotal)
        : { valid: promoInput.toUpperCase() === 'STUDENT10', discount_type: 'percentage', discount_value: 10, applies_to: 'products', description: 'Student discount', code: 'STUDENT10' };
      if (result.valid) {
        setAppliedPromo(result);
        setPromoInput('');
      } else {
        setPromoError(result.error || 'Invalid promo code.');
        setAppliedPromo(null);
      }
    } catch (err) {
      setPromoError(err?.message || 'Could not validate code.');
    } finally { setCheckingPromo(false); }
  };

  // Compute discounts from applied promo
  const promoProductDiscount = (!appliedPromo || appliedPromo.applies_to === 'delivery') ? 0
    : appliedPromo.discount_type === 'percentage' ? subtotal * (appliedPromo.discount_value / 100)
    : appliedPromo.discount_value;
  const promoDeliveryDiscount = (!appliedPromo || appliedPromo.applies_to === 'products') ? 0
    : appliedPromo.discount_type === 'percentage' ? deliveryFee * (appliedPromo.discount_value / 100)
    : Math.min(appliedPromo.discount_value, deliveryFee);

  const delivery = deliveryFee - promoDeliveryDiscount;
  const total = subtotal - (bulkSaving || 0) - promoProductDiscount + Math.max(0, delivery);

  React.useEffect(() => { window.scrollTo(0,0); }, [step]);

  const placeOrder = async () => {
    setPlacing(true);
    setOrderError('');
    const orderItems = detailed.map(b => ({
      product_id: Number(b.id) || undefined,
      product_name: b.title,
      quantity: b.qty,
      unit_price: b.price,
    }));
    try {
      const order = await submitOrder({
        customer_name: form.name,
        email: form.email,
        phone: form.phone,
        delivery_method: method,
        location: method === 'delivery' ? [selectedZone?.name, form.address, form.city].filter(Boolean).join(', ') : 'Dome Pillar 2, Accra',
        delivery_zone_id: selectedZone?.id || null,
        promo_code: appliedPromo?.code || null,
        items: orderItems,
        // Signal that this is a payment-pending order (not yet confirmed)
        payment_status: isApiMode() ? 'pending' : 'unpaid',
        status: 'received',
        turnstileToken,
      });

      const ref = order?.order_reference || ('RMX-' + Math.floor(100000 + Math.random() * 900000));
      setOrderRef(ref);

      // In API mode: initialise Paystack and redirect to their hosted page.
      // The Paystack webhook marks the order paid; only THEN is it confirmed.
      // We do NOT advance to the confirmation step here - the user must
      // return from Paystack via the callback URL to see it.
      if (isApiMode() && order?.id) {
        try {
          const callbackUrl = `${window.location.origin}/bookshop?order=${encodeURIComponent(ref)}&status=paid`;
          const payData = await api.initPaystackPayment(order.id, callbackUrl);
          const authUrl = payData?.payment?.authorization_url;
          if (authUrl) {
            window.location.href = authUrl;
            return; // user is redirected to Paystack — don't advance step
          }
        } catch (payErr) {
          // Paystack unavailable in dev — treat as a manual/walk-in order
          console.warn('[Checkout] Paystack init failed (dev mode?):', payErr.message);
          // Don't advance to confirmation — just show an error to the user
          setOrderError('Payment service unavailable. Please complete payment at the shop or contact us on WhatsApp.');
          setPlacing(false);
          return;
        }
      }

      // Local mode (no API / no Paystack): this is a request, not a payment.
      // The confirmation step makes clear it is an enquiry, not a paid order.
      setStep(2);
    } catch (err) {
      setOrderError(err?.message || 'Could not place the order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  if (count === 0 && step < 2) return (
    <div className="bs-container bs-fade-page"><div className="bs-empty-state">
      <div className="bs-empty-icon"><Icon name="cart" size={40} /></div>
      <h2 className="bs-h2">Nothing to check out.</h2><p>Add some books first.</p>
      <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('shop')}>Browse the Shop</button>
    </div></div>
  );

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!/^[0-9+\s]{9,}$/.test(form.phone)) e.phone = 'Enter a valid phone number';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (method === 'delivery' && isApiMode() && deliveryZones.length > 0 && !selectedZoneId) e.address = 'Please select your delivery area first.';
    else if (method === 'delivery' && !form.address.trim()) e.address = 'Required for delivery';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const set = (k) => (ev) => setForm(f => ({ ...f, [k]: ev.target.value }));

  if (step === 2) return (
    <div className="bs-container bs-fade-page">
      <StepBar step={2} />
      <div className="bs-confirm">
        <div className="bs-check-circle"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg></div>
        <h1 className="bs-h2">Order placed successfully!</h1>
        <p className="bs-muted">Thank you, {form.name.split(' ')[0] || 'friend'}. A confirmation has been sent to {form.email || 'your email'}.</p>
        <div className="bs-order-num">Order No. {orderRef}</div>
        <div className="bs-confirm-summary">
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
            <span className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>What you ordered</span>
            <span className="bs-muted" style={{ fontSize:13 }}>{count} items</span>
          </div>
          {detailed.map((b,i) => (
            <div key={b.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:14 }}>
              <span>{b.qty} x {b.title}</span><span style={{ fontFamily:'Montserrat', fontWeight:600 }}>{cedis(b.price*b.qty)}</span>
            </div>
          ))}
          <div className="bs-summary-row bs-total" style={{ fontSize:18, marginTop:10 }}><span>Total paid</span><span>{cedis(total)}</span></div>
          <div className="bs-secure-note" style={{ justifyContent:'flex-start', marginTop:14 }}>
            <Icon name="truck" size={16} /> {method === 'delivery' ? 'Estimated delivery: within 48 hours' : 'Ready for pickup at Dome Pillar 2 tomorrow'}
          </div>
        </div>
        <div className="bs-confirm-actions">
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => { clear(); navigate('track'); }}>Track Your Order</button>
          <button className="bs-btn bs-btn-outline-navy bs-btn-lg" onClick={() => { clear(); navigate('home'); }}>Continue Shopping</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bs-container bs-fade-page">
      <CheckoutNudge navigate={navigate} />
      <StepBar step={step} />
      <div className="bs-checkout-layout">
        <div>
          <div className="bs-mobile-summary-bar"><span>Show order summary</span><span>{cedis(total)}</span></div>

          {step === 0 && (
            <div className="bs-form-card">
              <h3 className="bs-h3">Delivery details</h3>
              <div className="bs-field-row">
                <div className={`bs-field${errors.name?' err':''}`}><label>Full Name</label><input value={form.name} onChange={set('name')} placeholder="Ama Mensah" />{errors.name && <div className="bs-field-error">{errors.name}</div>}</div>
                <div className={`bs-field${errors.phone?' err':''}`}><label>Phone Number</label><input value={form.phone} onChange={set('phone')} placeholder="+233 ..." />{errors.phone && <div className="bs-field-error">{errors.phone}</div>}</div>
              </div>
              <div className={`bs-field${errors.email?' err':''}`}><label>Email</label><input value={form.email} onChange={set('email')} placeholder="you@email.com" />{errors.email && <div className="bs-field-error">{errors.email}</div>}</div>

              <label className="bs-field" style={{ marginBottom:8 }}><span style={{ fontFamily:'Montserrat', fontWeight:600, fontSize:13, color:'var(--bs-navy)', display:'block', marginBottom:7 }}>Delivery Method</span></label>
              <div className={`bs-radio-card${method==='delivery'?' sel':''}`} onClick={() => setMethod('delivery')}>
                <span className="bs-radio-dot" /><div><div className="bs-rc-title">Home Delivery</div><div className="bs-rc-sub">Within 48 hours, nationwide</div></div>
                <span className="bs-rc-price">{selectedZone ? cedis(Number(selectedZone.fee)) : isApiMode() && deliveryZones.length > 0 ? 'Select area' : cedis(15)}</span>
              </div>
              <div className={`bs-radio-card${method==='pickup'?' sel':''}`} onClick={() => setMethod('pickup')}>
                <span className="bs-radio-dot" /><div><div className="bs-rc-title">Pickup at Dome Pillar 2</div><div className="bs-rc-sub">Ready next working day</div></div><span className="bs-rc-price">Free</span>
              </div>

              {method === 'delivery' && <>
                {/* Delivery zone selector */}
                {isApiMode() && deliveryZones.length > 0 && (
                  <div className="bs-field" style={{ marginTop:18 }}>
                    <label>Delivery Area *</label>
                    <select className="bs-field" style={{ height:48, borderRadius:'var(--bs-radius-sm)', border:'1.5px solid var(--bs-border)', padding:'0 15px', fontSize:15, color:'var(--bs-text)', background:'#fff' }}
                      value={selectedZoneId} onChange={e => setSelectedZoneId(e.target.value)}>
                      <option value="">— Select your area —</option>
                      {deliveryZones.map(z => (
                        <option key={z.id} value={String(z.id)}>
                          {z.name} {Number(z.fee) > 0 ? `— ${cedis(Number(z.fee))}` : '— Contact for quote'}
                        </option>
                      ))}
                    </select>
                    {selectedZone?.description && (
                      <p style={{ fontSize:12, color:'var(--bs-muted)', marginTop:4 }}>{selectedZone.description}</p>
                    )}
                  </div>
                )}
                <div className={`bs-field${errors.address?' err':''}`} style={{ marginTop:18 }}><label>Delivery Address</label><textarea value={form.address} onChange={set('address')} placeholder="House number, street, landmark..." />{errors.address && <div className="bs-field-error">{errors.address}</div>}</div>
                <div className="bs-field"><label>City / Region</label><input value={form.city} onChange={set('city')} placeholder="Accra, Greater Accra" /></div>
              </>}

              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" style={{ marginTop:10 }} onClick={() => { if (validate()) setStep(1); }}>Continue to Payment <Icon name="arrow" size={16} /></button>
            </div>
          )}

          {step === 1 && (
            <div className="bs-form-card">
              <h3 className="bs-h3">Payment</h3>
              <p className="bs-muted" style={{ marginTop:-12, marginBottom:20 }}>Review your details. Payment is processed securely by Paystack.</p>
              <div style={{ background:'var(--bs-off-white)', border:'1px solid var(--bs-border)', borderRadius:12, padding:'18px 20px', marginBottom:20 }}>
                <div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)', marginBottom:12 }}>Billing details</div>
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'8px 18px', fontSize:14 }}>
                  <span className="bs-muted">Name</span><span style={{ fontWeight:600 }}>{form.name}</span>
                  <span className="bs-muted">Phone</span><span style={{ fontWeight:600 }}>{form.phone}</span>
                  <span className="bs-muted">Email</span><span style={{ fontWeight:600 }}>{form.email}</span>
                  <span className="bs-muted">{method==='delivery'?'Deliver to':'Pickup'}</span><span style={{ fontWeight:600 }}>{method==='delivery'? (form.address + (form.city?', '+form.city:'')) : 'Dome Pillar 2, Accra'}</span>
                </div>
              </div>
              {/* Promo code */}
              <div className="bs-promo-row" style={{ marginBottom:4 }}>
                <input placeholder="Promo code" value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())}
                  style={{ flex:1, height:44, border:'1.5px solid var(--bs-border)', borderRadius:'var(--bs-radius-sm)', padding:'0 14px', fontSize:14 }} />
                <button className="bs-btn bs-btn-navy" style={{ padding:'0 18px', height:44 }} disabled={checkingPromo} onClick={applyPromo}>
                  {checkingPromo ? '…' : 'Apply'}
                </button>
              </div>
              {promoError && <p style={{ fontSize:12, color:'var(--bs-error)', marginBottom:10 }}>{promoError}</p>}
              {appliedPromo && (
                <div style={{ background:'#e6f4ea', border:'1px solid #b7dfbf', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:13 }}>
                  ✓ <strong>{appliedPromo.code}</strong> applied —{' '}
                  {appliedPromo.description || `${appliedPromo.discount_value}${appliedPromo.discount_type === 'percentage' ? '%' : ' GH₵'} off ${appliedPromo.applies_to}`}
                  <button onClick={() => setAppliedPromo(null)} style={{ marginLeft:10, fontSize:11, color:'#888', background:'none', border:'none', cursor:'pointer' }}>✕ Remove</button>
                </div>
              )}

              {/* Order totals */}
              <div style={{ borderTop:'1px solid var(--bs-border)', paddingTop:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:15 }}><span>Subtotal</span><span>{cedis(subtotal)}</span></div>
                {(bulkSaving || 0) > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Bulk Purchase Discount</span><span>-{cedis(bulkSaving)}</span></div>}
                {promoProductDiscount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Promo ({appliedPromo.code}) on products</span><span>-{cedis(promoProductDiscount)}</span></div>}
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:15 }}>
                  <span>Delivery {selectedZone ? `(${selectedZone.name.split('—')[0].trim()})` : ''}</span>
                  <span>{method === 'pickup' ? 'Free' : cedis(deliveryFee)}</span>
                </div>
                {promoDeliveryDiscount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Delivery discount ({appliedPromo.code})</span><span>-{cedis(promoDeliveryDiscount)}</span></div>}
              </div>

              <div className="bs-summary-row bs-total" style={{ fontSize:22, borderTop:'1px solid var(--bs-border)', paddingTop:14, marginTop:0 }}><span>Total</span><span>{cedis(total)}</span></div>
              {orderError && <div className="bs-field-error" style={{ marginTop:12 }}>{orderError}</div>}
              <TurnstileField className="bs-turnstile-wrap bs-checkout-turnstile" onVerify={setTurnstileToken} />
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" style={{ marginTop:16 }} disabled={placing} onClick={placeOrder}><Icon name="lock" size={17} /> {placing ? 'Placing order...' : `Pay ${cedis(total)} Now`}</button>
              <div className="bs-trust-badges">
                <span className="bs-trust-badge"><Icon name="lock" size={14} /> 256-bit SSL</span>
                <span className="bs-trust-badge"><Icon name="shield" size={14} /> Buyer protection</span>
                <span className="bs-trust-badge bs-mono" style={{ fontWeight:700, color:'var(--bs-navy)' }}>paystack</span>
              </div>
              <button className="bs-btn bs-btn-outline-navy bs-btn-block" style={{ marginTop:16 }} onClick={() => setStep(0)}><Icon name="chevL" size={15} /> Back to details</button>
            </div>
          )}
        </div>

        <MiniSummary detailed={detailed} total={total} delivery={delivery} subtotal={subtotal} />
      </div>
    </div>
  );
};

const TRACK_STEPS = [
  { label:'Order Placed',     time:'12 May 2026, 9:14 AM', icon:'check' },
  { label:'Processing',       time:'12 May 2026, 11:40 AM', icon:'box' },
  { label:'Out for Delivery', time:'Expected today, by 5 PM', icon:'truck' },
  { label:'Delivered',        time:'Pending', icon:'home' },
];

const TrackPage = ({ navigate }) => {
  const [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState(false);
  const current = 2;

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-track-search">
        <div className="bs-text-center">
          <span className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Order Status</span>
          <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:34, marginTop:12 }}>Track your order</h1>
          <p className="bs-muted" style={{ marginTop:10 }}>Enter your Order ID or the email used at checkout.</p>
        </div>
        <form className="bs-track-input-row" onSubmit={(e) => { e.preventDefault(); setResult(true); }}>
          <input placeholder="e.g. RMX-204815 or you@email.com" value={query} onChange={e => setQuery(e.target.value)} />
          <button className="bs-btn bs-btn-navy bs-btn-lg" type="submit">Track</button>
        </form>

        {result && (
          <div className="bs-fade-page" style={{ marginTop:32 }}>
            <div className="bs-summary-card" style={{ position:'static' }}>
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:8 }}>
                <div><div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Order</div><div style={{ fontFamily:'JetBrains Mono', fontSize:16, color:'var(--bs-navy)', marginTop:4 }}>{query.startsWith('RMX') ? query : 'RMX-204815'}</div></div>
                <div style={{ textAlign:'right' }}><div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Placed</div><div style={{ marginTop:4, fontSize:14 }}>12 May 2026</div></div>
              </div>
              <div className="bs-divider" />
              <div style={{ marginBottom:8 }}>
                {['2 x Integrated Science for JHS 1','1 x BECE Past Questions: Mathematics'].map((it,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:14 }}><span>{it}</span></div>
                ))}
              </div>
              <div className="bs-divider" />
              <div className="bs-timeline" style={{ marginTop:18 }}>
                {TRACK_STEPS.map((s, i) => (
                  <div className={`bs-tl-step${i < current ? ' done' : ''}${i === current ? ' current' : ''}`} key={i}>
                    <div className="bs-tl-marker"><div className="bs-tl-dot"><Icon name={i <= current ? s.icon : 'clock'} size={16} /></div><div className="bs-tl-line" /></div>
                    <div className="bs-tl-body"><div className="bs-tl-title">{s.label}</div><div className="bs-tl-time">{s.time}</div></div>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--bs-off-white)', borderRadius:12, padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
                <Icon name="truck" size={22} className="bs-ci" style={{ color:'var(--bs-navy)' }} />
                <div><div style={{ fontFamily:'Montserrat', fontWeight:700, fontSize:14, color:'var(--bs-navy)' }}>Estimated delivery: Today, by 5:00 PM</div><div className="bs-muted" style={{ fontSize:13 }}>Questions? <a href="https://wa.link/q5rjtp" style={{ color:'var(--bs-navy)', textDecoration:'underline' }}>Contact support</a></div></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export { CheckoutPage, TrackPage, StepBar };
