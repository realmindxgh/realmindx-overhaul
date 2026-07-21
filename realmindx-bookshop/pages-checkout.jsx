import React from 'react';
import { Icon, LoadingState, cedis, CoverPlaceholder } from './shared.jsx';
import { useCart } from './chrome.jsx';
import { submitOrder } from '../src/lib/managedContent.js';
import { isApiMode, api } from '../src/lib/apiClient.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { setBookshopAuthReturn } from './authReturn.js';
import globalToast from '../src/lib/toast.js';
import {
  clearCheckoutDraft,
  clearCheckoutSuccess,
  readCheckoutDraft,
  readCheckoutSuccess,
  writeCheckoutDraft,
  writeCheckoutSuccess,
} from './checkoutStorage.js';
import { normalizeOrderStatus } from '../src/lib/orderStatus.js';
import { rankByFuzzyMatch } from '../src/lib/fuzzySearch.js';
import { usePublicSettings } from '../src/lib/siteContent.js';
const isLoggedIn = () => Boolean(getDemoSession()?.role);
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^[0-9+\s]{9,}$/;
const IS_DEVELOPMENT = import.meta.env.DEV;

const readInvoiceIdFromUrl = () => {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search || '');
    return (params.get('invoice_id') || params.get('invoice') || '').trim().toUpperCase();
  } catch {
    return '';
  }
};

const cleanCheckoutForm = (value = {}) => ({
  name: String(value.name || ''),
  phone: String(value.phone || ''),
  email: String(value.email || ''),
  address: String(value.address || ''),
  city: String(value.city || ''),
  region: String(value.region || ''),
  sex: String(value.sex || ''),
  ageRange: String(value.ageRange || value.age_range || ''),
});

const cartSignatureFor = (items = []) => items
  .map(item => `${String(item.id)}:${Number(item.qty || 1)}:${item.selected === false ? 0 : 1}`)
  .sort()
  .join('|');

const hasRequiredCheckoutDetails = ({
  form,
  method,
  selectedZoneId,
  customDeliveryArea,
  requireZone,
}) => {
  const data = cleanCheckoutForm(form);
  if (!data.name.trim()) return false;
  if (!PHONE_RE.test(data.phone)) return false;
  if (!EMAIL_RE.test(data.email)) return false;
  if (method !== 'delivery') return true;
  if (requireZone && !selectedZoneId) return false;
  if (customDeliveryArea && !data.city.trim()) return false;
  if (customDeliveryArea && !data.region) return false;
  return true;
};

const snapshotCheckoutItems = (items = []) => items.map(item => ({
  id: item.id,
  title: item.title,
  qty: item.qty,
  price: item.price,
}));

const buildCheckoutSuccess = ({
  orderRef,
  form,
  method,
  paymentMethod,
  items,
  count,
  total,
  order = null,
}) => ({
  orderRef,
  form: cleanCheckoutForm(form),
  method,
  paymentMethod,
  confirmedOrder: {
    items,
    count,
    total,
    paymentStatus: order?.payment_status || '',
    invoiceId: order?.invoice_id || '',
  },
});

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

const StepBar = ({ step, canVisit = () => false, onStepChange = null }) => {
  const labels = ['Basic information', 'Payment', 'Success'];
  return (
    <div className="bs-steps" aria-label="Checkout progress">
      {labels.map((l, i) => (
        <React.Fragment key={l}>
          <button
            type="button"
            className={`bs-step${step === i ? ' active' : ''}${step > i ? ' done' : ''}${canVisit(i) && i !== step ? ' clickable' : ''}`}
            aria-current={step === i ? 'step' : undefined}
            aria-label={`${l}${step > i ? ', completed' : step === i ? ', current step' : ''}`}
            disabled={!onStepChange || !canVisit(i) || i === step}
            onClick={() => onStepChange?.(i)}
          >
            <span className="bs-step-num">{step > i ? <Icon name="check" size={16} /> : i+1}</span>
            <span className="bs-step-label">{l}</span>
          </button>
          {i < 2 && <span className={`bs-step-line${step > i ? ' done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
};

const MiniSummary = ({ detailed, total, delivery, subtotal, bulkSaving = 0, bulkDiscountPct = '', promoProductDiscount = 0, promoDeliveryDiscount = 0, promoOrderDiscount = 0, promoCode = '' }) => (
  <div className="bs-mini-summary desktop">
    <h3 className="bs-h3" style={{ fontSize:16, marginBottom:14 }}>Order Summary</h3>
    {detailed.map((b,i) => (
      <div className="bs-mini-item" key={b.id}>
        <div className="bs-mini-cover">
          <CoverPlaceholder title={b.title} idx={i} small image={b.imageThumb || b.image} width={72} height={96} />
          <span className="bs-mini-qty">{b.qty}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'Montserrat', fontWeight:600, fontSize:13, color:'var(--bs-navy)', lineHeight:1.3 }}>{b.title}</div>
          <div className="bs-muted" style={{ fontSize:12 }}>{cedis(b.price)} x {b.qty}</div>
        </div>
        <span style={{ fontFamily:'Montserrat', fontWeight:700, fontSize:13 }}>{cedis(b.price*b.qty)}</span>
      </div>
    ))}
    <div className="bs-divider" style={{ margin:'14px 0' }} />
    <div className="bs-summary-row"><span>Subtotal</span><span>{cedis(subtotal)}</span></div>
    {bulkSaving > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Bulk Purchase Discount{bulkDiscountPct ? ` (${bulkDiscountPct}%)` : ''}</span><span>-{cedis(bulkSaving)}</span></div>}
    {promoProductDiscount > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Promo {promoCode} on products</span><span>-{cedis(promoProductDiscount)}</span></div>}
    <div className="bs-summary-row"><span>Delivery</span><span>{cedis(delivery)}</span></div>
    {promoDeliveryDiscount > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Delivery discount</span><span>-{cedis(promoDeliveryDiscount)}</span></div>}
    {promoOrderDiscount > 0 && <div className="bs-summary-row" style={{ fontSize:13, color:'var(--bs-success)' }}><span>Promo {promoCode} on order</span><span>-{cedis(promoOrderDiscount)}</span></div>}
    <div className="bs-summary-row bs-total" style={{ fontSize:18 }}><span>Total</span><span>{cedis(total)}</span></div>
  </div>
);

const CheckoutPage = ({ navigate }) => {
  const settings = usePublicSettings();
  const pickupAddress = settings.contact_address || 'the RealMindX Bookshop';
  const {
    selectedDetailed: detailed,
    selectedSubtotal: subtotal,
    selectedCount: count,
    clear: clearCart,
    selectedBulkSaving: bulkSaving = 0,
    selectedBulkDiscounts = [],
    loading: cartLoading,
    error: cartError,
  } = useCart();
  const session = getDemoSession();
  const initialDraft = React.useMemo(readCheckoutDraft, []);
  const initialSuccess = React.useMemo(readCheckoutSuccess, []);
  const linkedCartInvoiceId = React.useMemo(() => readInvoiceIdFromUrl() || initialDraft?.cartInvoiceId || '', [initialDraft]);
  const restoredDraftSignatureRef = React.useRef(initialDraft?.cartSignature || '');
  const restoredSuccessRef = React.useRef(Boolean(initialSuccess));
  const [step, setStep] = React.useState(() => (
    initialSuccess?.confirmedOrder
      ? 2
      : initialDraft?.step === 1 && hasRequiredCheckoutDetails({
        form: initialDraft.form,
        method: initialDraft.method || 'delivery',
        selectedZoneId: initialDraft.selectedZoneId || '',
        customDeliveryArea: initialDraft.selectedZoneId === 'other',
        requireZone: false,
      })
        ? 1
        : 0
  ));
  const [method, setMethod] = React.useState(() => initialSuccess?.method || initialDraft?.method || 'delivery');
  const [paymentMethod, setPaymentMethod] = React.useState(() => initialSuccess?.paymentMethod || initialDraft?.paymentMethod || 'online');
  const [form, setForm] = React.useState(() => {
    const defaultForm = cleanCheckoutForm({
      name: [session?.firstName, session?.lastName].filter(Boolean).join(' '),
      phone: session?.phone || '',
      email: session?.email || '',
      sex: session?.sex || '',
      ageRange: session?.ageRange || session?.age_range || '',
      address: '',
      city: '',
      region: '',
    });
    const savedForm = initialSuccess?.form || initialDraft?.form;
    return cleanCheckoutForm(savedForm ? { ...defaultForm, ...savedForm } : defaultForm);
  });
  const [errors, setErrors] = React.useState({});
  const [orderRef, setOrderRef] = React.useState(() => initialSuccess?.orderRef || '');
  const [confirmedOrder, setConfirmedOrder] = React.useState(() => initialSuccess?.confirmedOrder || null);
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
  const [selectedZoneId, setSelectedZoneId] = React.useState(() => initialDraft?.selectedZoneId || '');
  const [zoneSearch, setZoneSearch] = React.useState(() => initialDraft?.zoneSearch || '');
  const [zonePickerOpen, setZonePickerOpen] = React.useState(false);
  const [loadingZones, setLoadingZones] = React.useState(() => isApiMode());
  const [savedDetails, setSavedDetails] = React.useState([]);
  const [selectedSavedDetailId, setSelectedSavedDetailId] = React.useState('');
  const [savedDetailsError, setSavedDetailsError] = React.useState('');
  const [savingDetails, setSavingDetails] = React.useState(false);

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
    Promise.allSettled([api.fetchProfile(), api.fetchCheckoutDetails()])
      .then(([profileResult, detailsResult]) => {
        if (!alive) return;
        if (profileResult.status === 'fulfilled' && profileResult.value?.profile) {
          const profile = profileResult.value.profile;
          setForm((prev) => ({
            ...prev,
            name: prev.name || [profile.first_name, profile.last_name].filter(Boolean).join(' '),
            phone: prev.phone || profile.phone || '',
            email: prev.email || profile.email || '',
          }));
        }
        if (detailsResult.status === 'fulfilled') {
          setSavedDetails(detailsResult.value?.items || []);
        }
      });
    return () => { alive = false; };
  }, [session?.role]);

  const selectedZone = deliveryZones.find(z => String(z.id) === selectedZoneId);
  React.useEffect(() => {
    if (selectedZone && zoneSearch !== selectedZone.name) setZoneSearch(selectedZone.name);
  }, [selectedZone?.id]);
  const customDeliveryArea = selectedZoneId === 'other';
  const zoneQuery = normaliseLocationSearch(zoneSearch);
  const filteredDeliveryZones = (zoneQuery
    ? rankByFuzzyMatch(deliveryZones, zoneSearch, deliveryLocationSearchText)
    : [...deliveryZones].sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'en', { sensitivity: 'base' }))
  ).slice(0, 12);
  const selectDeliveryZone = zone => {
    setSelectedZoneId(String(zone.id));
    setZoneSearch(zone.name);
    setZonePickerOpen(false);
    setForm(prev => ({
      ...prev,
      city: zone.name || prev.city,
      region: zone.region || prev.region,
    }));
    setErrors(prev => ({ ...prev, zone: '', region: '' }));
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
  const applySavedDetails = detailId => {
    setSelectedSavedDetailId(detailId);
    const detail = savedDetails.find(item => String(item.id) === String(detailId));
    if (!detail) return;
    setForm(prev => ({
      ...prev,
      name: detail.customer_name || prev.name,
      phone: detail.phone || prev.phone,
      email: detail.email || prev.email,
      address: detail.address || '',
      city: detail.city || detail.delivery_zone_name || '',
      region: detail.region || '',
    }));
    const zone = deliveryZones.find(item =>
      String(item.id) === String(detail.delivery_zone_id)
      || normaliseLocationSearch(item.name) === normaliseLocationSearch(detail.delivery_zone_name),
    );
    if (zone) {
      selectDeliveryZone(zone);
    } else if (detail.city || detail.delivery_zone_name) {
      setSelectedZoneId('other');
      setZoneSearch(detail.city || detail.delivery_zone_name);
    }
    setSavedDetailsError('');
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
      const code = promoInput.trim().toUpperCase();
      const result = isApiMode()
        ? await api.validatePromoCode(code, orderBase)
        : IS_DEVELOPMENT && code === 'STUDENT10'
          ? { valid: true, discount_type: 'percentage', discount_value: 10, applies_to: 'products', description: 'Student discount', code: 'STUDENT10' }
          : { valid: false, error: 'Invalid promo code.' };
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
  const cartSignature = React.useMemo(() => cartSignatureFor(detailed), [detailed]);
  const zoneRequired = method === 'delivery' && isApiMode() && deliveryZones.length > 0;
  const stepOneComplete = hasRequiredCheckoutDetails({
    form,
    method,
    selectedZoneId,
    customDeliveryArea,
    requireZone: zoneRequired,
  });

  React.useEffect(() => { window.scrollTo(0,0); }, [step]);

  React.useEffect(() => {
    if (!restoredSuccessRef.current || cartLoading) return;
    if (count > 0) {
      clearCheckoutSuccess();
      setConfirmedOrder(null);
      setOrderRef('');
      setStep(0);
      restoredSuccessRef.current = false;
    }
  }, [cartLoading, count]);

  React.useEffect(() => {
    if (cartLoading || step !== 1) return;
    if (!cartSignature || count === 0) {
      clearCheckoutDraft();
      setStep(0);
      return;
    }
    if (restoredDraftSignatureRef.current && restoredDraftSignatureRef.current !== cartSignature) {
      restoredDraftSignatureRef.current = '';
      setStep(0);
      return;
    }
    if (!loadingZones && !stepOneComplete) {
      setStep(0);
    }
  }, [cartLoading, cartSignature, count, loadingZones, step, stepOneComplete]);

  React.useEffect(() => {
    if (cartLoading || step === 2) return;
    if (count === 0 || !cartSignature) {
      clearCheckoutDraft();
      return;
    }
    const draftStep = step >= 1 && stepOneComplete ? 1 : 0;
    writeCheckoutDraft({
      step: draftStep,
      form: cleanCheckoutForm(form),
      method,
      paymentMethod,
      selectedZoneId,
      zoneSearch,
      cartSignature,
    });
    restoredDraftSignatureRef.current = cartSignature;
  }, [
    cartLoading,
    cartSignature,
    count,
    form,
    method,
    paymentMethod,
    selectedZoneId,
    step,
    stepOneComplete,
    zoneSearch,
  ]);

  const placeOrder = async () => {
    setPlacing(true);
    setOrderError('');
    const orderedItems = snapshotCheckoutItems(detailed);
    const orderedCount = count;
    const orderedTotal = total;
    const orderItems = detailed.map(b => ({
      product_id: Number(b.id) || undefined,
      product_name: b.title,
      quantity: b.qty,
      unit_price: b.price,
    }));
    const checkoutPayload = {
      customer_name: form.name,
      customer_sex: form.sex || null,
      customer_age_range: form.ageRange || null,
      email: form.email,
      phone: form.phone,
      delivery_method: method,
      location: method === 'delivery'
        ? [customDeliveryArea ? form.city : selectedZone?.name, form.address, form.region].filter(Boolean).join(', ')
        : pickupAddress,
      delivery_address: method === 'delivery' ? form.address : '',
      delivery_city: method === 'delivery' ? (customDeliveryArea ? form.city : selectedZone?.name || form.city) : '',
      delivery_zone_id: selectedZone?.id || null,
      delivery_region: method === 'delivery' ? form.region : '',
      custom_delivery_area: customDeliveryArea,
      payment_method: paymentMethod,
      promo_code: appliedPromo?.code || null,
      cart_invoice_id: linkedCartInvoiceId || null,
      items: orderItems,
    };
    try {
      if (paymentMethod === 'online' && isApiMode()) {
        const payData = await api.initPaystackCheckout({
          ...checkoutPayload,
          ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        });
        const intentRef = payData?.payment_intent?.reference;
        const authUrl = payData?.payment?.authorization_url;
        if (!intentRef || !authUrl) throw new Error('Paystack did not return a valid payment page.');
        writeCheckoutDraft({
          step: 1,
          form: cleanCheckoutForm(form),
          method,
          paymentMethod,
          selectedZoneId,
          zoneSearch,
          cartSignature,
          pendingPaymentIntent: intentRef,
          cartInvoiceId: linkedCartInvoiceId || '',
        });
        window.location.href = authUrl;
        return;
      }

      const order = await submitOrder({ ...checkoutPayload, turnstileToken });
      const ref = order?.order_reference || ('RMX-' + Math.floor(100000 + Math.random() * 900000));
      setOrderRef(ref);

      // Payment-on-delivery orders are placed immediately. Local-only mode
      // keeps its simulated online checkout for interface testing.
      const success = buildCheckoutSuccess({
        orderRef: ref,
        form,
        method,
        paymentMethod,
        items: orderedItems,
        count: orderedCount,
        total: orderedTotal,
        order,
      });
      setConfirmedOrder(success.confirmedOrder);
      writeCheckoutSuccess(success);
      clearCheckoutDraft();
      clearCart();
      setStep(2);
    } catch (err) {
      const msg = err?.message || 'Could not place the order. Please try again.';
      setOrderError(msg);
    } finally {
      setPlacing(false);
    }
  };

  if ((cartLoading || (step === 1 && method === 'delivery' && loadingZones)) && step < 2) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Loading checkout"
        body="Restoring your saved books before payment."
      />
    </div>
  );

  if (cartError && step < 2) return (
    <div className="bs-container bs-fade-page">
      <LoadingState
        title="Could not load checkout"
        body="We could not confirm your saved cart against the latest catalog. Please refresh or try again shortly."
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
    if (!PHONE_RE.test(form.phone)) e.phone = 'Enter a valid phone number';
    if (!EMAIL_RE.test(form.email)) e.email = 'Enter a valid email';
    if (method === 'delivery' && isApiMode() && deliveryZones.length > 0 && !selectedZoneId) e.zone = 'Please select your delivery area first.';
    if (method === 'delivery' && customDeliveryArea && !form.city.trim()) e.city = 'Enter your delivery town or area';
    if (method === 'delivery' && customDeliveryArea && !form.region) e.region = 'Select your region';
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      const ref = first === 'zone'
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
  const continueToPayment = async () => {
    if (!validate()) return;
    clearCheckoutSuccess();
    setSavedDetailsError('');
    if (session?.role && isApiMode() && method === 'delivery') {
      setSavingDetails(true);
      try {
        const result = await api.saveCheckoutDetails({
          customer_name: form.name,
          email: form.email,
          phone: form.phone,
          delivery_zone_id: selectedZone?.id || null,
          delivery_zone_name: selectedZone?.name || (customDeliveryArea ? form.city : ''),
          address: form.address,
          city: customDeliveryArea ? form.city : selectedZone?.name || form.city,
          region: form.region,
        });
        if (result?.detail) {
          setSavedDetails(prev => [
            result.detail,
            ...prev.filter(item => String(item.id) !== String(result.detail.id)),
          ]);
          setSelectedSavedDetailId(String(result.detail.id));
        }
      } catch (error) {
        setSavedDetailsError(error?.message || 'Your details could not be saved, but you can still complete checkout.');
      } finally {
        setSavingDetails(false);
      }
    }
    setStep(1);
  };

  const confirmedItems = confirmedOrder?.items || detailed;
  const confirmedCount = confirmedOrder?.count ?? count;
  const confirmedTotal = confirmedOrder?.total ?? total;
  const confirmedInvoiceId = confirmedOrder?.invoiceId || '';

  if (step === 2) return (
    <div className="bs-container bs-fade-page">
      <StepBar step={2} />
      <div className="bs-confirm">
        <div className="bs-check-circle"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg></div>
        <h1 className="bs-h2">{paymentMethod === 'cash_on_delivery' ? 'Order registered!' : 'Order placed successfully!'}</h1>
        <p className="bs-muted">Thank you, {form.name.split(' ')[0] || 'friend'}. A confirmation has been sent to {form.email || 'your email'}.</p>
        <div className="bs-order-num">Order No. {orderRef}</div>
        {confirmedInvoiceId && <div className="bs-order-num">Invoice ID {confirmedInvoiceId}</div>}
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
            <Icon name="truck" size={16} /> {method === 'delivery' ? 'Estimated delivery: within 48 hours' : `Ready for pickup at ${pickupAddress} tomorrow`}
          </div>
        </div>
        <div className="bs-confirm-actions">
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => { clearCheckoutSuccess(); clearCart(); navigate('track'); }}>Track Your Order</button>
          {confirmedInvoiceId && (
            <a className="bs-btn bs-btn-gold bs-btn-lg" href={api.invoicePdfUrl(confirmedInvoiceId, { download: true })}>
              Download Invoice
            </a>
          )}
          <button className="bs-btn bs-btn-navy bs-btn-lg" onClick={() => { clearCheckoutSuccess(); clearCart(); navigate('home'); }}>Continue Shopping</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bs-container bs-fade-page">
      <StepBar
        step={step}
        canVisit={targetStep => targetStep === 0 || (targetStep === 1 && stepOneComplete)}
        onStepChange={targetStep => {
          if (targetStep === 0) setStep(0);
          if (targetStep === 1 && stepOneComplete) setStep(1);
        }}
      />
      <div className="bs-checkout-layout">
        <div>
          <div className="bs-mobile-summary-bar"><span>Show order summary</span><span>{cedis(total)}</span></div>

          {step === 0 && (
            <div className="bs-form-card">
              <h3 className="bs-h3">Delivery details</h3>
              {session?.role && savedDetails.length > 0 && (
                <div className="bs-saved-checkout-picker">
                  <div className="bs-saved-checkout-icon"><Icon name="refresh" size={18} /></div>
                  <div className="bs-saved-checkout-copy">
                    <strong>Use previous checkout details</strong>
                    <span>Select a saved or previously used contact and delivery set.</span>
                  </div>
                  <select
                    value={selectedSavedDetailId}
                    onChange={event => applySavedDetails(event.target.value)}
                    aria-label="Use previous checkout details"
                  >
                    <option value="">Choose details</option>
                    {savedDetails.map(detail => (
                      <option key={`${detail.source}-${detail.id}`} value={detail.id}>
                        {detail.label} · {detail.customer_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="bs-field-row">
                <div className={`bs-field${errors.name?' err':''}`}><label>Full Name *</label><input ref={nameRef} aria-invalid={Boolean(errors.name)} value={form.name} onChange={set('name')} placeholder="Ama Mensah" />{errors.name && <div className="bs-field-error">{errors.name}</div>}</div>
                <div className={`bs-field${errors.phone?' err':''}`}><label>Phone Number *</label><input ref={phoneRef} aria-invalid={Boolean(errors.phone)} value={form.phone} onChange={set('phone')} placeholder="+233 ..." />{errors.phone && <div className="bs-field-error">{errors.phone}</div>}</div>
              </div>
              <div className={`bs-field${errors.email?' err':''}`}><label>Email *</label><input ref={emailRef} aria-invalid={Boolean(errors.email)} value={form.email} onChange={set('email')} placeholder="you@email.com" />{errors.email && <div className="bs-field-error">{errors.email}</div>}</div>
              <div className="bs-field-row">
                <div className="bs-field"><label>Sex</label><select value={form.sex} onChange={set('sex')}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div>
                <div className="bs-field"><label>Age range</label><select value={form.ageRange} onChange={set('ageRange')}><option value="">Prefer not to say</option>{['under_18','18_24','25_34','35_44','45_54','55_64','65_plus'].map(value => <option key={value} value={value}>{value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</option>)}</select></div>
              </div>

              <label className="bs-field" style={{ marginBottom:8 }}><span style={{ fontFamily:'Montserrat', fontWeight:600, fontSize:13, color:'var(--bs-navy)', display:'block', marginBottom:7 }}>Delivery Method</span></label>
              <div className={`bs-radio-card${method==='delivery'?' sel':''}`} onClick={() => setMethod('delivery')}>
                <span className="bs-radio-dot" /><div><div className="bs-rc-title">Home Delivery</div><div className="bs-rc-sub">Within 48 hours, nationwide</div></div>
                <span className="bs-rc-price">{selectedZone ? cedis(Number(selectedZone.fee)) : ''}</span>
              </div>
              <div className={`bs-radio-card${method==='pickup'?' sel':''}`} onClick={() => setMethod('pickup')}>
                <span className="bs-radio-dot" /><div><div className="bs-rc-title">Pickup at {pickupAddress}</div><div className="bs-rc-sub">Ready next working day</div></div><span className="bs-rc-price">Free</span>
              </div>

              {method === 'delivery' && <>
                {/* Delivery zone selector */}
                {isApiMode() && deliveryZones.length > 0 && (
                  <div className="bs-field" style={{ marginTop:18 }}>
                    <label>Delivery Area *</label>
                    <div className="bs-zone-picker">
                      <input
                        ref={zoneRef}
                        aria-invalid={Boolean(errors.zone)}
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
                    {errors.zone && <div className="bs-field-error">{errors.zone}</div>}
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
                <div className="bs-field" style={{ marginTop:customDeliveryArea ? 0 : 18 }}>
                  <label>Landmark or delivery directions</label>
                  <textarea ref={addressRef} value={form.address} onChange={set('address')} placeholder="House number, street, nearby landmark..." />
                  <p className="bs-field-help">We will contact you to confirm the precise landmark and delivery directions.</p>
                </div>
                {!customDeliveryArea && <div className="bs-field"><label>Region</label><select value={form.region} onChange={set('region')}><option value="">Select region</option>{GHANA_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}</select></div>}
              </>}

              {savedDetailsError && <p className="bs-saved-checkout-error">{savedDetailsError}</p>}
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" style={{ marginTop:10 }} disabled={savingDetails} onClick={continueToPayment}>
                {savingDetails ? 'Saving details...' : 'Continue to Payment'} {!savingDetails && <Icon name="arrow" size={16} />}
              </button>
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
                  <span className="bs-muted">{method==='delivery'?'Deliver to':'Pickup'}</span><span style={{ fontWeight:600 }}>{method==='delivery'? ([form.address, customDeliveryArea ? form.city : selectedZone?.name, form.region].filter(Boolean).join(', ')) : pickupAddress}</span>
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
              <div className="bs-promo-entry">
                <div className="bs-promo-entry-heading">
                  <span className="bs-promo-entry-icon"><Icon name="tag" size={18} /></span>
                  <div>
                    <span className="bs-promo-entry-kicker">Discount code</span>
                    <strong>Have a promo code?</strong>
                  </div>
                </div>
                <p className="bs-promo-entry-copy">Enter your code to update the order total before confirmation.</p>
                <div className="bs-promo-row">
                  <span className="bs-promo-input-icon" aria-hidden="true"><Icon name="tag" size={16} /></span>
                  <input
                    aria-label="Promo code"
                    placeholder="Enter promo code"
                    value={promoInput}
                    onChange={e => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && promoInput.trim() && !checkingPromo) applyPromo();
                    }}
                  />
                  <button type="button" className="bs-btn bs-btn-gold" disabled={checkingPromo || !promoInput.trim()} onClick={applyPromo}>
                    <span>{checkingPromo ? 'Applying' : 'Apply code'}</span>
                    {!checkingPromo && <Icon name="arrow" size={15} />}
                  </button>
                </div>
              </div>
              {promoError && <p className="bs-promo-error">{promoError}</p>}
              {appliedPromo && (
                <div className="bs-applied-promo">
                  <span className="bs-applied-promo-check"><Icon name="check" size={16} /></span>
                  <div className="bs-applied-promo-copy">
                    <strong>{appliedPromo.code}</strong>
                    <span>{appliedPromo.description || `${appliedPromo.discount_value}${appliedPromo.discount_type === 'percentage' ? '%' : ' GH₵'} off ${appliedPromo.applies_to}`}</span>
                  </div>
                  <button type="button" className="bs-applied-promo-delete" onClick={() => setAppliedPromo(null)} aria-label={`Remove promo code ${appliedPromo.code}`}>
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              )}

              {/* Order totals */}
              <div style={{ borderTop:'1px solid var(--bs-border)', paddingTop:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:15 }}><span>Subtotal</span><span>{cedis(subtotal)}</span></div>
                {(bulkSaving || 0) > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:13, color:'var(--bs-success)' }}><span>Bulk Purchase Discount{selectedBulkDiscounts[0]?.pct ? ` (${selectedBulkDiscounts[0].pct}%)` : ''}</span><span>-{cedis(bulkSaving)}</span></div>}
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
                {placing
                  ? paymentMethod === 'online' ? 'Opening secure payment...' : 'Placing order...'
                  : paymentMethod === 'online' ? `Pay ${cedis(total)} Online` : `Confirm Order · Pay ${cedis(total)} on Delivery`}
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
          bulkDiscountPct={selectedBulkDiscounts[0]?.pct || ''}
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
  awaiting_payment: 0,
  new: 1,
  confirmed: 2,
  shipped: 3,
  complete: 4,
  cancelled: 4,
};

const trackingTimeline = (order) => {
  const status = normalizeOrderStatus(order?.status);
  const payment = String(order?.payment_status || 'unpaid').toLowerCase();
  const deliveryTracking = order?.delivery_tracking || {};
  const statusTimes = order?.status_times || {};
  const deliveryStatus = String(deliveryTracking.status || '').toLowerCase();
  const deliveryIssue = Boolean(deliveryTracking.issue);
  const deliveryDelivered = deliveryStatus === 'delivered';
  const paid = payment === 'paid';
  const payOnDelivery = order?.payment_method === 'cash_on_delivery';
  const awaitingPayment = status === 'awaiting_payment' && !paid;
  const method = String(order?.delivery_method || '').toLowerCase();
  const deliveryLabel = method === 'pickup'
    ? 'Ready for Pickup'
    : deliveryTracking.label || 'Ready for delivery';
  const rank = statusRank[status] || (paid ? 2 : 1);
  const deliveryCurrent = deliveryDelivered ? 4 : deliveryIssue ? 3 : deliveryStatus ? 3 : 0;
  const current = awaitingPayment
    ? 0
    : status === 'cancelled'
      ? 1
      : Math.max(rank, deliveryCurrent, paid ? 2 : 1);

  return {
    current,
    steps: [
      { label: awaitingPayment ? 'Payment Started' : 'Order Received', time:formatOrderDate(statusTimes.received_at || order?.created_at), icon: awaitingPayment ? 'lock' : 'check' },
      {
        label: paid ? 'Payment Confirmed' : payOnDelivery ? 'Payment on Delivery' : 'Payment Pending',
        time: paid ? formatOrderDate(statusTimes.payment_at || order?.paid_at) : payOnDelivery ? 'Payment will be collected when the order arrives' : 'Awaiting payment confirmation',
        icon:'lock',
      },
      {
        label:'Preparing order',
        time: current >= 2 ? formatOrderDate(statusTimes.preparing_at || statusTimes.payment_at || statusTimes.received_at || order?.created_at) : 'Pending',
        icon:'box',
      },
      {
        label: deliveryLabel,
        time: current >= 3 ? formatOrderDate(deliveryTracking.picked_up_at || deliveryTracking.assigned_at || statusTimes.shipped_at) : 'Pending',
        icon: method === 'pickup' ? 'home' : 'truck',
      },
      {
        label: status === 'cancelled' ? 'Cancelled' : deliveryIssue ? 'Delivery issue, our team will contact you' : 'Delivered',
        time: current >= 4 || status === 'cancelled' || deliveryIssue
          ? formatOrderDate(deliveryTracking.delivered_at || deliveryTracking.issue_reported_at || deliveryTracking.failed_at || deliveryTracking.returned_at || deliveryTracking.cancelled_at || statusTimes.completed_at || statusTimes.cancelled_at)
          : 'Pending',
        icon: status === 'cancelled' || deliveryIssue ? 'close' : 'home',
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
  const latestQueryRef = React.useRef('');

  const loadTracking = React.useCallback(async (rawQuery, { reset = false } = {}) => {
    const trimmed = rawQuery.trim();
    setError('');
    if (reset) {
      setSearched(false);
      setOrders([]);
    }
    if (!trimmed) {
      setError('Enter your order reference or checkout email.');
      inputRef.current?.focus();
      return false;
    }
    if (!isApiMode()) {
      setError('Live order tracking is available on the deployed bookshop.');
      return false;
    }
    setLoading(true);
    try {
      const data = await api.trackOrders(trimmed);
      setOrders(data.items || []);
      setSearched(true);
      latestQueryRef.current = trimmed;
      return true;
    } catch (err) {
      setError(err?.message || 'Could not track that order.');
      inputRef.current?.focus();
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    await loadTracking(query, { reset: true });
  };

  const hasActiveTracking = orders.some(order => {
    const status = normalizeOrderStatus(order?.status);
    const deliveryStatus = String(order?.delivery_tracking?.status || '');
    return !['complete', 'cancelled', 'archived'].includes(status)
      || Boolean(deliveryStatus && !['delivered', 'failed', 'returned', 'cancelled'].includes(deliveryStatus));
  });

  React.useEffect(() => {
    if (!searched || !isApiMode() || !hasActiveTracking) return undefined;
    const poll = () => {
      if (document.visibilityState === 'visible' && latestQueryRef.current) {
        loadTracking(latestQueryRef.current).catch(() => {});
      }
    };
    const timer = window.setInterval(poll, 25000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [hasActiveTracking, loadTracking, searched]);

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
          const awaitingPayment = normalizeOrderStatus(order.status) === 'awaiting_payment' && String(order.payment_status || '').toLowerCase() !== 'paid';
          return (
          <div className="bs-fade-page" style={{ marginTop:32 }}>
            <div className="bs-summary-card bs-track-card" style={{ position:'static' }}>
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:8 }}>
                <div><div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Order</div><div style={{ fontFamily:'JetBrains Mono', fontSize:16, color:'var(--bs-navy)', marginTop:4 }}>{order.order_reference}</div></div>
                <div style={{ textAlign:'right' }}><div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>{awaitingPayment ? 'Started' : 'Placed'}</div><div style={{ marginTop:4, fontSize:14 }}>{formatOrderDate(order.created_at)}</div></div>
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
                <div>
                  <div style={{ fontFamily:'Montserrat', fontWeight:700, fontSize:14, color:'var(--bs-navy)' }}>
                    {order.delivery_tracking?.label || (order.delivery_method === 'pickup' ? `Pickup at ${order.location || 'the RealMindX Bookshop'}` : order.location || order.delivery_zone_name || 'Delivery details on file')}
                  </div>
                  <div className="bs-muted" style={{ fontSize:13 }}>
                    {order.delivery_tracking?.otp_required ? 'Have your delivery OTP ready when the rider arrives. ' : ''}
                    Questions? <a href="https://wa.link/q5rjtp" style={{ color:'var(--bs-navy)', textDecoration:'underline' }}>Contact support</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
};

const InvoiceDocumentPreview = ({ invoice, documentLabel, documentId }) => {
  if (!invoice) return null;
  const isReceipt = invoice.document_type === 'receipt';
  return (
    <div className="bs-invoice-paper" aria-label={`${documentLabel} preview`}>
      <div className="bs-invoice-paper-head">
        <img src="/bookshop-logo.png" alt="RealMindX Bookshop" />
        <div>
          <h2>{isReceipt ? 'ORDER RECEIPT' : 'CART INVOICE'}</h2>
          <strong>{documentId}</strong>
          <span>{isReceipt ? 'Issued' : 'Generated'}: {formatOrderDate(invoice.issued_at || invoice.created_at)}</span>
        </div>
      </div>
      <div className="bs-invoice-paper-metadata">
        <div><span>Customer</span><strong>{invoice.customer_name || 'Cart invoice'}</strong></div>
        <div><span>Status</span><strong>{normalizeOrderStatus(invoice.status).replace('_', ' ')}</strong></div>
        <div><span>Payment</span><strong>{String(invoice.payment_status || 'not paid').replace('_', ' ')}</strong></div>
      </div>
      <div className="bs-invoice-paper-table">
        <div className="bs-invoice-paper-row head">
          <span>Item</span><span>Qty</span><span>Unit</span><span>Total</span>
        </div>
        {(invoice.items || []).map((item, index) => (
          <div className="bs-invoice-paper-row" key={`${item.product_id || index}-${item.product_name}`}>
            <span>{item.product_name}</span>
            <span>{item.quantity}</span>
            <span>{cedis(item.unit_price || 0)}</span>
            <span>{cedis(Number(item.unit_price || 0) * Number(item.quantity || 1))}</span>
          </div>
        ))}
      </div>
      <div className="bs-invoice-paper-total">
        <div><span>Subtotal</span><strong>{cedis(invoice.subtotal_amount || 0)}</strong></div>
        {(invoice.bulk_discount_amount || 0) > 0 && <div><span>Bulk purchase discount</span><strong>-{cedis(invoice.bulk_discount_amount)}</strong></div>}
        {(invoice.promo_discount_amount || 0) > 0 && <div><span>Promo {invoice.promo_code || ''}</span><strong>-{cedis(invoice.promo_discount_amount)}</strong></div>}
        <div><span>Delivery</span><strong>{isReceipt ? cedis(invoice.delivery_fee || 0) : 'Calculated at checkout'}</strong></div>
        <div className="grand"><span>{isReceipt ? 'Total' : 'Total before delivery'}</span><strong>{cedis(invoice.total_amount || 0)}</strong></div>
      </div>
    </div>
  );
};

const InvoicePage = ({ navigate }) => {
  const cart = useCart();
  const initialInvoiceId = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return (params.get('invoice_id') || params.get('invoice') || params.get('id') || '').trim().toUpperCase();
  }, []);
  const [query, setQuery] = React.useState(initialInvoiceId);
  const [invoice, setInvoice] = React.useState(null);
  const [searched, setSearched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef(null);

  const lookupInvoice = React.useCallback(async (rawInvoiceId, { focusOnError = true } = {}) => {
    const invoiceId = String(rawInvoiceId || '').trim().toUpperCase();
    setQuery(invoiceId);
    setError('');
    setSearched(false);
    setInvoice(null);
    if (!invoiceId) {
      setError('Enter your receipt or invoice ID.');
      if (focusOnError) inputRef.current?.focus();
      return;
    }
    if (!isApiMode()) {
      setError('Live receipt/invoice verification is available on the deployed bookshop.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.lookupInvoice(invoiceId);
      setInvoice(data.invoice || null);
      setSearched(true);
    } catch (err) {
      setError(err?.message || 'No matching receipt or invoice was found.');
      if (focusOnError) inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialInvoiceId) {
      lookupInvoice(initialInvoiceId, { focusOnError: false });
    }
  }, [initialInvoiceId, lookupInvoice]);

  const submit = async (e) => {
    e.preventDefault();
    await lookupInvoice(query);
  };

  const isReceipt = invoice?.document_type === 'receipt';
  const documentId = invoice?.document_id || invoice?.invoice_id || invoice?.order_reference || '';
  const pdfLookupId = isReceipt ? (invoice?.order_reference || documentId) : documentId;
  const pdfOptions = isReceipt ? { document: 'receipt' } : {};
  const pdfUrl = pdfLookupId ? api.invoicePdfUrl(pdfLookupId, pdfOptions) : '';
  const downloadUrl = pdfLookupId ? api.invoicePdfUrl(pdfLookupId, { ...pdfOptions, download: true }) : '';
  const documentLabel = isReceipt ? 'Receipt' : 'Invoice';
  const actionableItems = React.useMemo(
    () => (invoice?.items || []).filter(item => item.product_id),
    [invoice],
  );
  const addInvoiceItemsToCart = React.useCallback((goToCheckout = false) => {
    if (!actionableItems.length) {
      globalToast.info('This document does not include products that can be added back to the cart.');
      return;
    }
    actionableItems.forEach(item => {
      cart.add(item.product_id, Math.max(1, Number(item.quantity || 1)));
    });
    if (goToCheckout) {
      if (!isReceipt && documentId) {
        writeCheckoutDraft({ cartInvoiceId: documentId });
      }
      navigate('checkout');
    }
  }, [actionableItems, cart, documentId, isReceipt, navigate]);

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-track-search bs-invoice-search">
        <div className="bs-text-center">
          <span className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>Receipt/Invoice Verification</span>
          <h1 className="bs-h2" style={{ color:'var(--bs-navy)', fontSize:34, marginTop:12 }}>Verify a receipt or invoice</h1>
          <p className="bs-muted" style={{ marginTop:10 }}>Enter the exact receipt/order reference or invoice ID to confirm that your RealMindX Bookshop document is genuine.</p>
        </div>
        <form className="bs-track-input-row" onSubmit={submit}>
          <input ref={inputRef} placeholder="e.g. RMX-INV-9F2A7C4B11 or RMX-ORDER-..." value={query} onChange={e => setQuery(e.target.value)} aria-invalid={Boolean(error)} />
          <button className="bs-btn bs-btn-navy bs-btn-lg" type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
        {error && <p className="bs-track-error">{error}</p>}

        {searched && !invoice && !error && (
          <div className="bs-empty-state" style={{ marginTop:28, padding:'34px 22px' }}>
            <div className="bs-empty-icon"><Icon name="search" size={30} /></div>
            <h2 className="bs-h3">No matching receipt or invoice found.</h2>
            <p>Check the ID and try again.</p>
          </div>
        )}

        {invoice && (
          <div className="bs-fade-page bs-invoice-result">
            <div className="bs-summary-card bs-track-card" style={{ position:'static' }}>
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:8 }}>
                <div>
                  <div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>{documentLabel}</div>
                  <div style={{ fontFamily:'JetBrains Mono', fontSize:16, color:'var(--bs-navy)', marginTop:4 }}>{documentId}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div className="bs-eyebrow" style={{ color:'var(--bs-gold-dark)' }}>{invoice.order_reference ? 'Order' : 'Source'}</div>
                  <div style={{ marginTop:4, fontFamily:'JetBrains Mono', fontSize:14 }}>{invoice.order_reference || 'Cart invoice'}</div>
                </div>
              </div>
              <div className="bs-divider" />
              <div className="bs-invoice-meta-grid">
                <div><span>Customer</span><strong>{invoice.customer_name}</strong></div>
                <div><span>{isReceipt ? 'Receipt issued' : 'Generated'}</span><strong>{formatOrderDate(invoice.issued_at || invoice.created_at)}</strong></div>
                <div><span>{isReceipt ? 'Order placed' : 'Created'}</span><strong>{formatOrderDate(invoice.created_at)}</strong></div>
                <div><span>Status</span><strong>{normalizeOrderStatus(invoice.status).replace('_', ' ')}</strong></div>
                <div><span>Total</span><strong>{cedis(invoice.total_amount || 0)}</strong></div>
              </div>
              <div className="bs-divider" />
              <div style={{ marginBottom:8 }}>
                {(invoice.items || []).map((it,i) => (
                  <div key={`${it.product_id || i}-${it.product_name}`} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'6px 0', fontSize:14 }}>
                    <span>{it.quantity} x {it.product_name}</span>
                    <span>{cedis(Number(it.unit_price || 0) * Number(it.quantity || 1))}</span>
                  </div>
                ))}
              </div>
              <div className="bs-divider" />
              <div className="bs-summary-row"><span>Subtotal</span><span>{cedis(invoice.subtotal_amount || 0)}</span></div>
              {(invoice.bulk_discount_amount || 0) > 0 && <div className="bs-summary-row bs-discount"><span>Bulk purchase discount</span><span>-{cedis(invoice.bulk_discount_amount)}</span></div>}
              {(invoice.promo_discount_amount || 0) > 0 && <div className="bs-summary-row bs-discount"><span>Promo {invoice.promo_code || ''}</span><span>-{cedis(invoice.promo_discount_amount)}</span></div>}
              <div className="bs-summary-row"><span>Delivery</span><span>{cedis(invoice.delivery_fee || 0)}</span></div>
              <div className="bs-summary-row bs-total"><span>Total</span><span>{cedis(invoice.total_amount || 0)}</span></div>
              <div className="bs-invoice-download-action">
                <a className="bs-btn bs-btn-gold bs-btn-lg" href={downloadUrl}>
                  <Icon name="files" size={16} /> Download PDF
                </a>
              </div>
              <div className="bs-invoice-actions">
                <button className="bs-btn bs-btn-gold bs-btn-lg" type="button" onClick={() => addInvoiceItemsToCart(true)} disabled={!actionableItems.length}>
                  Buy Now
                </button>
                <button className="bs-btn bs-btn-outline-navy bs-btn-lg" type="button" onClick={() => addInvoiceItemsToCart(false)} disabled={!actionableItems.length}>
                  Add to Cart
                </button>
                <button className="bs-btn bs-btn-navy bs-btn-lg" type="button" onClick={() => navigate('home')}>
                  Bookshop Home
                </button>
              </div>
            </div>

            {pdfUrl && (
              <div className="bs-invoice-viewer-wrap">
                <div className="bs-invoice-viewer-head">
                  <span>{documentLabel} PDF Preview</span>
                  <a href={downloadUrl}>Download</a>
                </div>
                <InvoiceDocumentPreview invoice={invoice} documentLabel={documentLabel} documentId={documentId} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { CheckoutPage, TrackPage, InvoicePage, StepBar };
