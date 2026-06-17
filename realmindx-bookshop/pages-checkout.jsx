import React from 'react';
import { Icon, LoadingState, cedis, CoverPlaceholder } from './shared.jsx';
import { useCart } from './chrome.jsx';
import { submitOrder } from '../src/lib/managedContent.js';
import { isApiMode, api } from '../src/lib/apiClient.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { setBookshopAuthReturn } from './authReturn.js';
import { normalizeOrderStatus } from '../src/lib/orderStatus.js';
const isLoggedIn = () => Boolean(getDemoSession()?.role);
const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';

const AuthReturnActions = ({ navigate }) => !isLoggedIn() ? (
  <div className="bs-auth-return-actions">
    <p>Sign in or create an account to save this order for later tracking.</p>
    <div>
      <button type="button" onClick={() => { setBookshopAuthReturn('checkout'); navigate('login'); }}>Sign in</button>
      <button type="button" onClick={() => { setBookshopAuthReturn('checkout'); navigate('signup'); }}>Create account</button>
    </div>
  </div>
) : null;
import TurnstileField from '../src/lib/TurnstileField.jsx';
import { GHANA_REGIONS, deliveryLocationAliases, deliveryLocationSearchText, normaliseLocationSearch } from '../src/lib/ghanaLocations.js';

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

const MiniSummary = ({ detailed, total, delivery, subtotal, bulkSaving = 0, promoProductDiscount = 0, promoDeliveryDiscount = 0, promoOrderDiscount = 0, promoCode = '' }) => (
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
    {bulkSaving > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Bulk discount</span><span>-{cedis(bulkSaving)}</span></div>}
    {promoProductDiscount > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Promo {promoCode} on products</span><span>-{cedis(promoProductDiscount)}</span></div>}
    <div className="bs-summary-row"><span>Delivery</span><span>{cedis(delivery)}</span></div>
    {promoDeliveryDiscount > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Delivery discount</span><span>-{cedis(promoDeliveryDiscount)}</span></div>}
    {promoOrderDiscount > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Promo {promoCode} on order</span><span>-{cedis(promoOrderDiscount)}</span></div>}
    <div className="bs-summary-row bs-total" style={{ fontSize:18 }}><span>Total</span><span>{cedis(total)}</span></div>
  </div>
);

const CheckoutPage = ({ navigate }) => {
  const {
    selectedDetailed: detailed,
    selectedSubtotal: subtotal,
    selectedCount: count,
    clearSelected,
    selectedBulkSaving: bulkSaving = 0,
    loading: cartLoading,
  } = useCart();
  const session = getDemoSession();
  const [step, setStep] = React.useState(0);
  const [method, setMethod] = React.useState('delivery');
  const [paymentMethod, setPaymentMethod] = React.useState('online');
  const [form, setForm] = React.useState(() => ({
    name: [session?.firstName, session?.lastName].filter(Boolean).join(' '),
    phone: session?.phone || '',
    email: session?.email || '',
    address: '',
    city: '',
    region: '',
  }));
  const [errors, setErrors] = React.useState({});
  const [orderRef, setOrderRef] = React.useState('');
  const [confirmedOrder, setConfirmedOrder] = React.useState(null);
  const [placing, setPlacing] = React.useState(false);
  const [orderError, setOrderError] = React.useState('');
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const nameRef = React.useRef(null);
  const phoneRef = React.useRef(null);
  const emailRef = React.useRef(null);
  const zoneRef = React.useRef(null);
  const addressRef = React.useRef(null);

  // Delivery zones — fetched from API in API mode, fallback to fixed fee
  const [deliveryZones, setDeliveryZones] = React.useState([]);
  const [selectedZoneId, setSelectedZoneId] = React.useState('');
  const [zoneSearch, setZoneSearch] = React.useState('');
  const [zonePickerOpen, setZonePickerOpen] = React.useState(false);
  const [loadingZones, setLoadingZones] = React.useState(false);

  React.useEffect(() => {
    if (!isApiMode()) return;
    setLoadingZones(true);
    api.fetchDeliveryZones()
      .then(data => setDeliveryZones(
        (data.items || []).filter(zone =>
          zone.is_active !== false
          && zone.is_delivery_area !== false
          && zone.is_search_alias_only !== true
          && !/pickup/i.test(zone.name || ''),
        ),
      ))
      .catch(() => {})
      .finally(() => setLoadingZones(false));
  }, []);

  React.useEffect(() => {
    let alive = true;
    if (!session?.role || !isApiMode()) return undefined;
    api.fetchProfile()
      .then((data) => {
        if (!alive || !data?.profile) return;
        const profile = data.profile;
        setForm((prev) => ({
          ...prev,
          name: prev.name || [profile.first_name, profile.last_name].filter(Boolean).join(' '),
          phone: prev.phone || profile.phone || '',
          email: prev.email || profile.email || '',
          address: prev.address || profile.location || '',
        }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [session?.role]);

  const selectedZone = deliveryZones.find(z => String(z.id) === selectedZoneId);
  React.useEffect(() => {
    if (selectedZone && zoneSearch !== selectedZone.name) setZoneSearch(selectedZone.name);
  }, [selectedZone?.id]);
  const customDeliveryArea = selectedZoneId === 'other';
  const zoneQuery = normaliseLocationSearch(zoneSearch);
  const filteredDeliveryZones = (zoneQuery
    ? deliveryZones.filter(zone => deliveryLocationSearchText(zone).includes(zoneQuery))
    : deliveryZones
  ).slice(0, 12);
  const selectDeliveryZone = zone => {
    setSelectedZoneId(String(zone.id));
    setZoneSearch(zone.name);
    setZonePickerOpen(false);
    setErrors(prev => ({ ...prev, address: '' }));
  };
  const selectOtherDeliveryArea = () => {
    setSelectedZoneId('other');
    setZoneSearch('Other area');
    setZonePickerOpen(false);
  };
  const commitTypedZone = () => {
    const query = normaliseLocationSearch(zoneSearch);
    if (!query) return;
    const exact = deliveryZones.find(zone => {
      const values = [zone.name, ...deliveryLocationAliases(zone)];
      return values.some(value => normaliseLocationSearch(value) === query);
    });
    if (exact) selectDeliveryZone(exact);
  };
  const deliveryFee = method !== 'delivery' ? 0
    : (isApiMode() && deliveryZones.length > 0)
      ? (selectedZone ? Number(selectedZone.fee) : 0)
      : 15;  // fallback for local mode
  const subtotalAfterBulk = Math.max(0, subtotal - (bulkSaving || 0));
  const orderBase = subtotalAfterBulk + deliveryFee;

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
        ? await api.validatePromoCode(promoInput.trim().toUpperCase(), orderBase)
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
  const promoScope = (appliedPromo?.applies_to || '').toLowerCase();
  const promoBaseAmount = !appliedPromo
    ? 0
    : promoScope === 'delivery'
      ? deliveryFee
      : promoScope === 'all'
        ? orderBase
        : subtotalAfterBulk;
  const promoDiscount = !appliedPromo
    ? 0
    : appliedPromo.discount_type === 'percentage'
      ? promoBaseAmount * (appliedPromo.discount_value / 100)
      : Math.min(appliedPromo.discount_value, promoBaseAmount);
  const promoProductDiscount = promoScope === 'products' ? promoDiscount : 0;
  const promoDeliveryDiscount = promoScope === 'delivery' ? promoDiscount : 0;
  const promoOrderDiscount = promoScope === 'all' ? promoDiscount : 0;
  const delivery = Math.max(0, deliveryFee - promoDeliveryDiscount);
  const total = Math.max(0, orderBase - promoDiscount);

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
        location: method === 'delivery'
          ? [customDeliveryArea ? form.city : selectedZone?.name, form.address, form.region].filter(Boolean).join(', ')
          : 'Dome Pillar 2, Accra',
        delivery_zone_id: selectedZone?.id || null,
        delivery_region: method === 'delivery' ? form.region : '',
        custom_delivery_area: customDeliveryArea,
        payment_method: paymentMethod,
        promo_code: appliedPromo?.code || null,
        items: orderItems,
        // Signal that this is a payment-pending order (not yet confirmed)
        turnstileToken,
      });

      const ref = order?.order_reference || ('RMX-' + Math.floor(100000 + Math.random() * 900000));
      setOrderRef(ref);

      // In API mode: initialise Paystack and redirect to their hosted page.
      // The Paystack webhook marks the order paid; only THEN is it confirmed.
      // We do NOT advance to the confirmation step here - the user must
      // return from Paystack via the callback URL to see it.
      if (paymentMethod === 'online' && isApiMode() && order?.id) {
        try {
          const callbackUrl = `${window.location.origin}${PREFIX}/?order=${encodeURIComponent(ref)}&status=paid`;
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

      // Payment-on-delivery orders are registered immediately. Online payment
      // only reaches this point in local mode where Paystack is unavailable.
      setConfirmedOrder({
        items: detailed.map(item => ({ ...item })),
        count,
        total,
      });
      clearSelected();
      setStep(2);
    } catch (err) {
      const msg = err?.message || 'Could not place the order. Please try again.';
      setOrderError(msg);
    } finally {
      setPlacing(false);
    }
  };

  if (cartLoading && step < 2) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Loading checkout"
        body="Restoring your saved books before payment."
      />
    </div>
  );

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
    if (method === 'delivery' && customDeliveryArea && !form.city.trim()) e.city = 'Enter your delivery town or area';
    if (method === 'delivery' && customDeliveryArea && !form.region) e.region = 'Select your region';
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      const ref = first === 'address' && isApiMode() && deliveryZones.length > 0 && !selectedZoneId
        ? zoneRef
        : { name: nameRef, phone: phoneRef, email: emailRef, address: addressRef }[first];
      requestAnimationFrame(() => {
        const node = ref?.current;
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node?.focus?.({ preventScroll: true });
      });
    }
    return Object.keys(e).length === 0;
  };
  const set = (k) => (ev) => setForm(f => ({ ...f, [k]: ev.target.value }));

  const confirmedItems = confirmedOrder?.items || detailed;
  const confirmedCount = confirmedOrder?.count ?? count;
  const confirmedTotal = confirmedOrder?.total ?? total;

  if (step === 2) return (
    <div className="bs-container bs-fade-page">
      <StepBar step={2} />
      <div className="bs-confirm">
        <div className="bs-check-circle"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg></div>
        <h1 className="bs-h2">{paymentMethod === 'cash_on_delivery' ? 'Order registered!' : 'Order placed successfully!'}</h1>
        <p className="bs-muted">Thank you, {form.name.split(' ')[0] || 'friend'}. A confirmation has been sent to {form.email || 'your email'}.</p>
        <div className="bs-order-num">Order No. {orderRef}</div>
        <div className="bs-confirm-summary">
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
            <span className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>What you ordered</span>
            <span className="bs-muted" style={{ fontSize:13 }}>{confirmedCount} items</span>
          </div>
          {confirmedItems.map((b,i) => (
            <div key={b.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:14 }}>
              <span>{b.qty} x {b.title}</span><span style={{ fontFamily:'Montserrat', fontWeight:600 }}>{cedis(b.price*b.qty)}</span>
            </div>
          ))}
          <div className="bs-summary-row bs-total" style={{ fontSize:18, marginTop:10 }}>
            <span>{paymentMethod === 'cash_on_delivery' ? 'Due on delivery' : 'Total paid'}</span>
            <span>{cedis(confirmedTotal)}</span>
          </div>
          <div className="bs-secure-note" style={{ justifyContent:'flex-start', marginTop:14 }}>
            <Icon name="truck" size={16} /> {method === 'delivery' ? 'Estimated delivery: within 48 hours' : 'Ready for pickup at Dome Pillar 2 tomorrow'}
          </div>
        </div>
        <div className="bs-confirm-actions">
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => { clearSelected(); navigate('track'); }}>Track Your Order</button>
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => { clearSelected(); navigate('home'); }}>Continue Shopping</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bs-container bs-fade-page">
      <StepBar step={step} />
      <div className="bs-checkout-layout">
        <div>
          <div className="bs-mobile-summary-bar"><span>Show order summary</span><span>{cedis(total)}</span></div>

          {step === 0 && (
            <div className="bs-form-card">
              <h3 className="bs-h3">Delivery details</h3>
              <div className="bs-field-row">
                <div className={`bs-field${errors.name?' err':''}`}><label>Full Name</label><input ref={nameRef} aria-invalid={Boolean(errors.name)} value={form.name} onChange={set('name')} placeholder="Ama Mensah" />{errors.name && <div className="bs-field-error">{errors.name}</div>}</div>
                <div className={`bs-field${errors.phone?' err':''}`}><label>Phone Number</label><input ref={phoneRef} aria-invalid={Boolean(errors.phone)} value={form.phone} onChange={set('phone')} placeholder="+233 ..." />{errors.phone && <div className="bs-field-error">{errors.phone}</div>}</div>
              </div>
              <div className={`bs-field${errors.email?' err':''}`}><label>Email</label><input ref={emailRef} aria-invalid={Boolean(errors.email)} value={form.email} onChange={set('email')} placeholder="you@email.com" />{errors.email && <div className="bs-field-error">{errors.email}</div>}</div>

              <label className="bs-field" style={{ marginBottom:8 }}><span style={{ fontFamily:'Montserrat', fontWeight:600, fontSize:13, color:'var(--bs-navy)', display:'block', marginBottom:7 }}>Delivery Method</span></label>
              <div className={`bs-radio-card${method==='delivery'?' sel':''}`} onClick={() => setMethod('delivery')}>
                <span className="bs-radio-dot" /><div><div className="bs-rc-title">Home Delivery</div><div className="bs-rc-sub">Within 48 hours, nationwide</div></div>
                <span className="bs-rc-price">{selectedZone ? cedis(Number(selectedZone.fee)) : ''}</span>
              </div>
              <div className={`bs-radio-card${method==='pickup'?' sel':''}`} onClick={() => setMethod('pickup')}>
                <span className="bs-radio-dot" /><div><div className="bs-rc-title">Pickup at Dome Pillar 2</div><div className="bs-rc-sub">Ready next working day</div></div><span className="bs-rc-price">Free</span>
              </div>

              {method === 'delivery' && <>
                {/* Delivery zone selector */}
                {isApiMode() && deliveryZones.length > 0 && (
                  <div className="bs-field" style={{ marginTop:18 }}>
                    <label>Delivery Area *</label>
                    <div className="bs-zone-picker">
                      <input
                        ref={zoneRef}
                        aria-invalid={Boolean(errors.address && !selectedZoneId)}
                        aria-expanded={zonePickerOpen}
                        aria-controls="delivery-zone-results"
                        className="bs-zone-input"
                        type="search"
                        value={zoneSearch}
                        placeholder={loadingZones ? 'Loading delivery areas...' : 'Search your town or area'}
                        onFocus={() => setZonePickerOpen(true)}
                        onChange={event => {
                          setZoneSearch(event.target.value);
                          setZonePickerOpen(true);
                          if (selectedZoneId && selectedZone?.name !== event.target.value) setSelectedZoneId('');
                        }}
                        onBlur={() => {
                          commitTypedZone();
                          window.setTimeout(() => setZonePickerOpen(false), 120);
                        }}
                      />
                      {zonePickerOpen && (
                        <div className="bs-zone-results" id="delivery-zone-results" role="listbox">
                          {filteredDeliveryZones.map(zone => (
                            <button
                              key={zone.id}
                              type="button"
                              role="option"
                              className="bs-zone-result"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => selectDeliveryZone(zone)}
                            >
                              <strong>{zone.name}</strong>
                              <span>{[zone.nearby_major_town, zone.region].filter(Boolean).join(' · ') || zone.delivery_zone_label || 'Delivery area'}</span>
                            </button>
                          ))}
                          {filteredDeliveryZones.length === 0 && (
                            <div className="bs-zone-empty">No exact match yet. Choose “Other area” and we will confirm the delivery fee.</div>
                          )}
                          <button
                            type="button"
                            className="bs-zone-other"
                            onMouseDown={event => event.preventDefault()}
                            onClick={selectOtherDeliveryArea}
                          >
                            My area is not listed
                          </button>
                        </div>
                      )}
                    </div>
                    {selectedZone?.description && (
                      <p style={{ fontSize:12, color:'var(--bs-muted)', marginTop:4 }}>{selectedZone.description}</p>
                    )}
                  </div>
                )}
                {customDeliveryArea && (
                  <div className="bs-field-row" style={{ marginTop:18 }}>
                    <div className={`bs-field${errors.city?' err':''}`}>
                      <label>Town / Area *</label>
                      <input value={form.city} onChange={set('city')} placeholder="Example: Hohoe, Berekum, Wa" />
                      {errors.city && <div className="bs-field-error">{errors.city}</div>}
                    </div>
                    <div className={`bs-field${errors.region?' err':''}`}>
                      <label>Region *</label>
                      <select value={form.region} onChange={set('region')}>
                        <option value="">Select region</option>
                        {GHANA_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
                      </select>
                      {errors.region && <div className="bs-field-error">{errors.region}</div>}
                    </div>
                  </div>
                )}
                <div className={`bs-field${errors.address?' err':''}`} style={{ marginTop:customDeliveryArea ? 0 : 18 }}><label>Delivery Address</label><textarea ref={addressRef} aria-invalid={Boolean(errors.address)} value={form.address} onChange={set('address')} placeholder="House number, street, landmark..." />{errors.address && <div className="bs-field-error">{errors.address}</div>}</div>
                {!customDeliveryArea && <div className="bs-field"><label>Region</label><select value={form.region} onChange={set('region')}><option value="">Select region (optional)</option>{GHANA_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}</select></div>}
              </>}

              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" style={{ marginTop:10 }} onClick={() => { if (validate()) setStep(1); }}>Continue to Payment <Icon name="arrow" size={16} /></button>
              <AuthReturnActions navigate={navigate} />
            </div>
          )}

          {step === 1 && (
            <div className="bs-form-card">
              <h3 className="bs-h3">Payment</h3>
              <p className="bs-muted" style={{ marginTop:-12, marginBottom:20 }}>Review your details and choose how you want to pay.</p>
              <div style={{ background:'var(--bs-off-white)', border:'1px solid var(--bs-border)', borderRadius:12, padding:'18px 20px', marginBottom:20 }}>
                <div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)', marginBottom:12 }}>Billing details</div>
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'8px 18px', fontSize:14 }}>
                  <span className="bs-muted">Name</span><span style={{ fontWeight:600 }}>{form.name}</span>
                  <span className="bs-muted">Phone</span><span style={{ fontWeight:600 }}>{form.phone}</span>
                  <span className="bs-muted">Email</span><span style={{ fontWeight:600 }}>{form.email}</span>
                  <span className="bs-muted">{method==='delivery'?'Deliver to':'Pickup'}</span><span style={{ fontWeight:600 }}>{method==='delivery'? ([form.address, customDeliveryArea ? form.city : selectedZone?.name, form.region].filter(Boolean).join(', ')) : 'Dome Pillar 2, Accra'}</span>
                </div>
              </div>
              <div className="bs-payment-choice-grid">
                <button type="button" className={`bs-payment-choice${paymentMethod === 'online' ? ' selected' : ''}`} onClick={() => setPaymentMethod('online')}>
                  <span className="bs-radio-dot" />
                  <span><strong>Pay online</strong><small>Continue securely to Paystack after confirmation.</small></span>
                  <Icon name="lock" size={17} />
                </button>
                <button type="button" className={`bs-payment-choice${paymentMethod === 'cash_on_delivery' ? ' selected' : ''}`} onClick={() => setPaymentMethod('cash_on_delivery')}>
                  <span className="bs-radio-dot" />
                  <span><strong>Payment on delivery</strong><small>Register the order now and pay when it arrives.</small></span>
                  <Icon name="truck" size={18} />
                </button>
              </div>
              {/* Promo code */}
              <div className="bs-promo-row" style={{ marginBottom:4 }}>
                <input placeholder="Promo code" value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())}
                  style={{ flex:1, height:44, border:'1.5px solid var(--bs-border)', borderRadius:'var(--bs-radius-sm)', padding:'0 14px', fontSize:14 }} />
                <button className="bs-btn bs-btn-gold" style={{ padding:'0 20px', height:44, fontWeight:800, letterSpacing:'0.04em', flexShrink:0 }} disabled={checkingPromo} onClick={applyPromo}>
                  {checkingPromo ? '…' : 'Apply'}
                </button>
              </div>
              {promoError && <p style={{ fontSize:12, color:'var(--bs-error)', marginBottom:10 }}>{promoError}</p>}
              {appliedPromo && (
                <div style={{ background:'#e6f4ea', border:'1px solid #b7dfbf', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:13 }}>
                  <strong>{appliedPromo.code}</strong> applied:{' '}
                  {appliedPromo.description || `${appliedPromo.discount_value}${appliedPromo.discount_type === 'percentage' ? '%' : ' GH₵'} off ${appliedPromo.applies_to}`}
                  <button onClick={() => setAppliedPromo(null)} style={{ marginLeft:10, fontSize:11, color:'#888', background:'none', border:'none', cursor:'pointer' }}>Remove</button>
                </div>
              )}

              {/* Order totals */}
              <div style={{ borderTop:'1px solid var(--bs-border)', paddingTop:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:15 }}><span>Subtotal</span><span>{cedis(subtotal)}</span></div>
                {(bulkSaving || 0) > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Bulk Purchase Discount</span><span>-{cedis(bulkSaving)}</span></div>}
                {promoProductDiscount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Promo ({appliedPromo.code}) on products</span><span>-{cedis(promoProductDiscount)}</span></div>}
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:15 }}>
                  <span>Delivery {selectedZone ? `(${selectedZone.name})` : ''}</span>
                  <span>{method === 'pickup' ? 'Free' : cedis(delivery)}</span>
                </div>
                {promoDeliveryDiscount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Delivery discount ({appliedPromo.code})</span><span>-{cedis(promoDeliveryDiscount)}</span></div>}
                {promoOrderDiscount > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Promo ({appliedPromo.code}) on order</span><span>-{cedis(promoOrderDiscount)}</span></div>}
              </div>

              <div className="bs-summary-row bs-total" style={{ fontSize:22, borderTop:'1px solid var(--bs-border)', paddingTop:14, marginTop:0 }}><span>Total</span><span>{cedis(total)}</span></div>
              <TurnstileField className="bs-turnstile-wrap bs-checkout-turnstile" onVerify={setTurnstileToken} />
              {orderError && <p className="bs-track-error" role="alert" style={{ marginTop:14 }}>{orderError}</p>}
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" style={{ marginTop:16 }} disabled={placing} onClick={placeOrder}>
                <Icon name={paymentMethod === 'online' ? 'lock' : 'truck'} size={17} />
                {placing ? 'Placing order...' : paymentMethod === 'online' ? `Pay ${cedis(total)} Online` : `Confirm Order · Pay ${cedis(total)} on Delivery`}
              </button>
              <AuthReturnActions navigate={navigate} />
              <div className="bs-trust-badges">
                <span className="bs-trust-badge"><Icon name="lock" size={14} /> 256-bit SSL</span>
                <span className="bs-trust-badge"><Icon name="shield" size={14} /> Buyer protection</span>
                {paymentMethod === 'online' && <span className="bs-trust-badge bs-mono" style={{ fontWeight:700, color:'var(--bs-navy)' }}>paystack</span>}
              </div>
              <button className="bs-btn bs-btn-outline-navy bs-btn-block" style={{ marginTop:16 }} onClick={() => setStep(0)}><Icon name="chevL" size={15} /> Back to details</button>
            </div>
          )}
        </div>

        <MiniSummary
          detailed={detailed}
          total={total}
          delivery={delivery}
          subtotal={subtotal}
          bulkSaving={bulkSaving}
          promoProductDiscount={promoProductDiscount}
          promoDeliveryDiscount={promoDeliveryDiscount}
          promoOrderDiscount={promoOrderDiscount}
          promoCode={appliedPromo?.code || ''}
        />
      </div>
    </div>
  );
};

const formatOrderDate = (value) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const statusRank = {
  new: 1,
  confirmed: 2,
  shipped: 3,
  complete: 4,
  cancelled: 4,
};

const trackingTimeline = (order) => {
  const status = normalizeOrderStatus(order?.status);
  const payment = String(order?.payment_status || 'unpaid').toLowerCase();
  const paid = payment === 'paid';
  const payOnDelivery = order?.payment_method === 'cash_on_delivery';
  const method = String(order?.delivery_method || '').toLowerCase();
  const deliveryLabel = method === 'pickup' ? 'Ready for Pickup' : 'Out for Delivery';
  const rank = statusRank[status] || (paid ? 2 : 1);
  const current = status === 'cancelled' ? 1 : Math.max(rank, paid ? 2 : 1);

  return {
    current,
    steps: [
      { label:'Order Received', time:formatOrderDate(order?.created_at), icon:'check' },
      {
        label: paid ? 'Payment Confirmed' : payOnDelivery ? 'Payment on Delivery' : 'Payment Pending',
        time: paid ? formatOrderDate(order?.paid_at || order?.updated_at) : payOnDelivery ? 'Payment will be collected when the order arrives' : 'Awaiting payment confirmation',
        icon:'lock',
      },
      {
        label:'Processing',
        time: current >= 2 ? formatOrderDate(order?.updated_at || order?.created_at) : 'Pending',
        icon:'box',
      },
      {
        label: deliveryLabel,
        time: current >= 3 ? formatOrderDate(order?.updated_at) : 'Pending',
        icon: method === 'pickup' ? 'home' : 'truck',
      },
      {
        label: status === 'cancelled' ? 'Cancelled' : 'Delivered',
        time: current >= 4 || status === 'cancelled' ? formatOrderDate(order?.updated_at) : 'Pending',
        icon: status === 'cancelled' ? 'close' : 'home',
      },
    ],
  };
};

const TrackPage = ({ navigate }) => {
  const [query, setQuery] = React.useState('');
  const [orders, setOrders] = React.useState([]);
  const [searched, setSearched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    setError('');
    setSearched(false);
    setOrders([]);
    if (!trimmed) {
      setError('Enter your order reference or checkout email.');
      inputRef.current?.focus();
      return;
    }
    if (!isApiMode()) {
      setError('Live order tracking is available on the deployed bookshop.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.trackOrders(trimmed);
      setOrders(data.items || []);
      setSearched(true);
    } catch (err) {
      setError(err?.message || 'Could not track that order.');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-track-search">
        <div className="bs-text-center">
          <span className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Order Status</span>
          <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:34, marginTop:12 }}>Track your order</h1>
          <p className="bs-muted" style={{ marginTop:10 }}>Enter your Order ID or the email used at checkout.</p>
        </div>
        <form className="bs-track-input-row" onSubmit={submit}>
          <input ref={inputRef} placeholder="e.g. RMX-204815 or you@email.com" value={query} onChange={e => setQuery(e.target.value)} aria-invalid={Boolean(error)} />
          <button className="bs-btn bs-btn-navy bs-btn-lg" type="submit" disabled={loading}>
            {loading ? 'Checking...' : 'Track'}
          </button>
        </form>
        {error && <p className="bs-track-error">{error}</p>}

        {searched && orders.length === 0 && (
          <div className="bs-empty-state" style={{ marginTop:28, padding:'34px 22px' }}>
            <div className="bs-empty-icon"><Icon name="search" size={30} /></div>
            <h2 className="bs-h3">No matching order found.</h2>
            <p>Check the order reference or use the email address from checkout.</p>
          </div>
        )}

        {orders.map(order => {
          const timeline = trackingTimeline(order);
          return (
          <div className="bs-fade-page" style={{ marginTop:32 }}>
            <div className="bs-summary-card bs-track-card" style={{ position:'static' }}>
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:8 }}>
                <div><div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Order</div><div style={{ fontFamily:'JetBrains Mono', fontSize:16, color:'var(--bs-navy)', marginTop:4 }}>{order.order_reference}</div></div>
                <div style={{ textAlign:'right' }}><div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Placed</div><div style={{ marginTop:4, fontSize:14 }}>{formatOrderDate(order.created_at)}</div></div>
              </div>
              <div className="bs-divider" />
              <div style={{ marginBottom:8 }}>
                {(order.items || []).map((it,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:14 }}>
                    <span>{it.quantity} x {it.product_name}</span>
                    <span>{cedis(Number(it.unit_price || 0) * Number(it.quantity || 1))}</span>
                  </div>
                ))}
              </div>
              <div className="bs-divider" />
              <div className="bs-timeline" style={{ marginTop:18 }}>
                {timeline.steps.map((s, i) => (
                  <div className={`bs-tl-step${i < timeline.current ? ' done' : ''}${i === timeline.current ? ' current' : ''}`} key={s.label}>
                    <div className="bs-tl-marker"><div className="bs-tl-dot"><Icon name={i <= timeline.current ? s.icon : 'clock'} size={16} /></div><div className="bs-tl-line" /></div>
                    <div className="bs-tl-body"><div className="bs-tl-title">{s.label}</div><div className="bs-tl-time">{s.time}</div></div>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--bs-off-white)', borderRadius:12, padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
                <Icon name="truck" size={22} className="bs-ci" style={{ color:'var(--bs-navy)' }} />
                <div><div style={{ fontFamily:'Montserrat', fontWeight:700, fontSize:14, color:'var(--bs-navy)' }}>{order.delivery_method === 'pickup' ? 'Pickup at Dome Pillar 2, Accra' : order.location || order.delivery_zone_name || 'Delivery details on file'}</div><div className="bs-muted" style={{ fontSize:13 }}>Questions? <a href="https://wa.link/q5rjtp" style={{ color:'var(--bs-navy)', textDecoration:'underline' }}>Contact support</a></div></div>
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
};

export { CheckoutPage, TrackPage, StepBar };
