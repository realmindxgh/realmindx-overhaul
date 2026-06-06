import React, { useState, useRef, useEffect } from 'react';
import { Nav, Footer } from '../components/NavFooter';
import { Icon } from '../assets/components.jsx';
import { submitMessage } from '../../src/lib/managedContent.js';
import { useDonationSlides } from '../../src/lib/siteContent.js';
import { api, isApiMode } from '../../src/lib/apiClient.js';

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

// Load Paystack Inline JS lazily (only when needed)
let paystackLoaded = false;
function loadPaystack() {
  if (paystackLoaded || typeof window === 'undefined') return Promise.resolve();
  if (window.PaystackPop) { paystackLoaded = true; return Promise.resolve(); }
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.onload = () => { paystackLoaded = true; res(); };
    document.body.appendChild(s);
  });
}

// â”€â”€â”€ Impact slideshow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SLIDE_COUNT = 18;
const SLIDES = Array.from({ length: SLIDE_COUNT }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  return {
    src: new URL(`../../src/assets/donation/impact-${num}.png`, import.meta.url).href,
    alt: `RealMindX impact - moment ${i + 1}`,
  };
});

const ImpactSlideshow = () => {
  const slides = useDonationSlides();
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);
  const total = slides.length || 1;

  const go = (n) => setIdx((n + total) % total);

  useEffect(() => {
    if (total <= 1) return undefined;
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % total), 4000);
    return () => clearInterval(timerRef.current);
  }, [total]);

  useEffect(() => {
    if (idx >= total) setIdx(0);
  }, [idx, total]);

  const slide = slides[idx] || slides[0];

  if (!slide) return <div className="donate-slideshow donate-slideshow--empty" />;

  return (
    <div className="donate-slideshow">
      <div className="donate-slide" key={slide?.id || idx}>
        <img src={slide?.src || slide?.img} alt={slide?.alt || slide?.label || 'RealMindX impact'} />
        <div className="donate-slide-overlay">
          <span className="donate-slide-tag">{slide?.label || 'Our Impact'}</span>
        </div>
      </div>
      <div className="donate-slide-dots">
        {slides.map((_, i) => (
          <button key={i} className={`donate-dot${i === idx ? ' active' : ''}`}
            aria-label={`Slide ${i + 1}`} onClick={() => setIdx(i)} />
        ))}
      </div>
      <button className="donate-slide-arrow prev" onClick={() => go(idx - 1)} aria-label="Previous">
        <Icon name="chevL" size={18} />
      </button>
      <button className="donate-slide-arrow next" onClick={() => go(idx + 1)} aria-label="Next">
        <Icon name="chevR" size={18} />
      </button>
    </div>
  );
};

// â”€â”€â”€ Contribution types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MONETARY_TYPES = ['One-time donation', 'Monthly pledge', 'Corporate sponsorship'];
const NON_MONETARY_TYPES = ['In-kind (books, equipment)', 'Volunteer time'];
const ALL_TYPES = [...MONETARY_TYPES, ...NON_MONETARY_TYPES];

const SUPPORT_AREAS = [
  'Learning Materials (books, stationery)',
  'Teacher Development (training & CPD)',
  'School Transformation (systems & curriculum)',
  'Special Education Support',
  'After-School Tutoring Programme',
  'General / Where most needed',
];

const CURRENCIES = [
  { code: 'GHS', label: 'GH (Ghana Cedis)' },
  { code: 'USD', label: '$ (US Dollar)' },
  { code: 'GBP', label: 'GBP (British Pound)' },
  { code: 'EUR', label: 'EUR (Euro)' },
  { code: 'other', label: 'Other / In-kind' },
];

// â”€â”€â”€ Donate form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DonateForm = () => {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', organisation: '',
    type: '', area: '', currency: 'GHS', amount: '', message: '',
  });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const amountRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reference') || params.get('trxref') || params.get('status') === 'paid') {
      setSent(true);
    }
  }, []);

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setFieldErrors(prev => ({ ...prev, [k]: undefined }));
  };

  const isMonetary = MONETARY_TYPES.includes(form.type);
  // Show Paystack button only for GHS monetary contributions with an amount
  const canPayNow = isMonetary && form.currency === 'GHS' && parseFloat(form.amount) >= 1 && (PAYSTACK_PUBLIC_KEY || isApiMode());

  const focusProblem = (field, message) => {
    const refs = { name: nameRef, email: emailRef, amount: amountRef };
    setError('');
    setFieldErrors({ [field]: message });
    requestAnimationFrame(() => {
      const node = refs[field]?.current;
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node?.focus?.({ preventScroll: true });
    });
  };

  const validateIdentity = () => {
    if (!form.name.trim()) {
      focusProblem('name', 'Enter your full name.');
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      focusProblem('email', 'Enter a valid email address.');
      return false;
    }
    return true;
  };

  const buildMessage = () => [
    form.organisation && `Organisation: ${form.organisation}`,
    form.type     && `Contribution type: ${form.type}`,
    form.area     && `Support area: ${form.area}`,
    form.currency !== 'other' && form.amount && `Amount: ${form.currency} ${form.amount}`,
    form.currency === 'other' && `Currency / type: Other / In-kind`,
    form.message  && `Message: ${form.message}`,
  ].filter(Boolean).join('\n');

  // Submit enquiry only (no payment)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateIdentity()) return;
    setLoading(true); setError('');
    try {
      await submitMessage({
        name: form.name, email: form.email, phone: form.phone,
        subject: `Donation enquiry - ${form.type || 'General'} / ${form.area || 'General'}`,
        message: buildMessage(),
        service: 'Donation',
      });
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Could not send. Please try again or reach us on WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  // Pay via Paystack popup (GHS only)
  const handlePaystack = async () => {
    if (!validateIdentity()) return;
    const amt = parseFloat(form.amount);
    if (!amt || amt < 1) { focusProblem('amount', 'Enter an amount of at least GHS 1.'); return; }
    setPaying(true); setError('');
    try {
      if (isApiMode()) {
        const callbackUrl = `${window.location.origin}/donate?status=paid`;
        const data = await api.initDonationPayment({
          ...form,
          amount: amt,
          callback_url: callbackUrl,
        });
        const authUrl = data?.payment?.authorization_url;
        if (!authUrl) throw new Error('Paystack did not return a checkout link.');
        window.location.href = authUrl;
        return;
      }
      if (!PAYSTACK_PUBLIC_KEY) throw new Error('Paystack is not configured.');
      await loadPaystack();
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: form.email,
        amount: Math.round(amt * 100),
        currency: 'GHS',
        metadata: {
          custom_fields: [
            { display_name: 'Donor Name',        variable_name: 'donor_name',    value: form.name },
            { display_name: 'Contribution Type', variable_name: 'contrib_type',  value: form.type },
            { display_name: 'Support Area',      variable_name: 'support_area',  value: form.area || 'General' },
          ],
        },
        callback: async (response) => {
          // Record the completed donation
          try {
            await submitMessage({
              name: form.name, email: form.email, phone: form.phone,
              subject: `Donation paid GH${amt} - ref ${response.reference}`,
              message: `Paystack ref: ${response.reference}\n${buildMessage()}`,
              service: 'Donation',
            });
          } catch (_) { /* non-blocking */ }
          setSent(true);
        },
        onClose: () => { setPaying(false); },
      });
      handler.openIframe();
    } catch (err) {
      setError(err?.message || 'Could not open Paystack. Please try again or use WhatsApp.');
      setPaying(false);
    }
  };

  if (sent) return (
    <div className="donate-success">
      <div className="donate-success-icon"><Icon name="check" size={28} stroke={2.5} /></div>
      <h3>Thank you!</h3>
      <p>
        Your support means everything. The RealMindX team will be in touch soon to confirm
        how your contribution will be directed.
      </p>
      <a href="/contact" className="btn btn-primary">Stay in Touch</a>
    </div>
  );

  return (
    <form className="donate-form" onSubmit={handleSubmit} noValidate>
      <h2>Express Your Support</h2>
      <p className="donate-form-sub">
        Every contribution - money, materials, or time - makes a real difference.
        Fill in the form and we'll take it from there.
      </p>

      <div className="donate-form-grid">
        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input ref={nameRef} className="form-input" aria-invalid={Boolean(fieldErrors.name)} value={form.name} onChange={set('name')} placeholder="Your name" required />
          {fieldErrors.name && <p className="form-error">{fieldErrors.name}</p>}
        </div>
        <div className="form-group">
          <label className="form-label">Email Address *</label>
          <input ref={emailRef} className="form-input" aria-invalid={Boolean(fieldErrors.email)} type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" required />
          {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
        </div>
        <div className="form-group">
          <label className="form-label">Phone Number</label>
          <input className="form-input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+233 or +44 ..." />
        </div>
        <div className="form-group">
          <label className="form-label">Organisation / School</label>
          <input className="form-input" value={form.organisation} onChange={set('organisation')} placeholder="Optional" />
        </div>

        <div className="form-group">
          <label className="form-label">Contribution Type</label>
          <select className="form-select" value={form.type} onChange={set('type')}>
            <option value="">- Select type -</option>
            <optgroup label="Financial">
              {MONETARY_TYPES.map(t => <option key={t}>{t}</option>)}
            </optgroup>
            <optgroup label="Non-financial">
              {NON_MONETARY_TYPES.map(t => <option key={t}>{t}</option>)}
            </optgroup>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Area of Support</label>
          <select className="form-select" value={form.area} onChange={set('area')}>
            <option value="">- Where it's needed most -</option>
            {SUPPORT_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Show amount + currency only for monetary types */}
        {(isMonetary || !form.type) && (
          <>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="form-select" value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount</label>
              <input className="form-input" type="number" min="1" value={form.amount}
                ref={amountRef}
                aria-invalid={Boolean(fieldErrors.amount)}
                onChange={set('amount')} placeholder="e.g. 200" />
              {fieldErrors.amount && <p className="form-error">{fieldErrors.amount}</p>}
              {form.currency === 'GHS' && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                  {[50,100,200,500,1000].map(a => (
                    <button key={a} type="button"
                      style={{ padding:'5px 12px', borderRadius:8,
                        border:'1.5px solid var(--navy)',
                        background: String(form.amount) === String(a) ? 'var(--navy)' : 'transparent',
                        color: String(form.amount) === String(a) ? '#fff' : 'var(--navy)',
                        fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:12, cursor:'pointer' }}
                      onClick={() => {
                        setForm(f => ({ ...f, amount: String(a) }));
                        setFieldErrors(prev => ({ ...prev, amount: undefined }));
                      }}>
                      GH {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div className="form-group" style={{ gridColumn:'1 / -1' }}>
          <label className="form-label">Message (optional)</label>
          <textarea className="form-textarea" rows={3} value={form.message} onChange={set('message')}
            placeholder="Any schools, programmes, or goals you'd like to support..." />
        </div>
      </div>

      {error && <p style={{ color:'var(--danger)', fontSize:'0.85rem', marginTop:8 }}>{error}</p>}

      <div className="donate-actions">
        {/* Pay via Paystack - only for GHS monetary */}
        {canPayNow && (
          <button className="btn btn-primary btn-lg donate-paystack-btn" type="button" disabled={paying || loading}
            onClick={handlePaystack}>
            <Icon name="lock" size={15} />
            {paying ? 'Opening...' : `Donate GHS ${form.amount} via Paystack`}
          </button>
        )}
        {/* Submit enquiry - always available */}
        <button className="btn btn-outline btn-lg donate-enquiry-btn" type="submit" disabled={loading || paying}
          style={!canPayNow ? { background:'var(--navy)', color:'#fff', borderColor:'var(--navy)' } : {}}>
          {loading ? 'Sending...' : (isMonetary && form.currency !== 'GHS') ? "Submit - We'll Follow Up" : 'Submit Enquiry'}
        </button>
        {/* WhatsApp button */}
        <a className="donate-whatsapp-btn" href="https://wa.link/q5rjtp" target="_blank" rel="noreferrer">
          {/* Full WhatsApp logo */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Chat on WhatsApp
        </a>
      </div>

      {canPayNow && (
        <p style={{ fontSize:'0.74rem', color:'var(--gray-600)', marginTop:8 }}>
          Secured by Paystack - GHS - 256-bit SSL
        </p>
      )}
      {!isMonetary && form.type && (
        <p style={{ fontSize:'0.78rem', color:'var(--gray-600)', marginTop:10, lineHeight:1.5 }}>
          After submitting, the RealMindX team will contact you to coordinate your {form.type.toLowerCase()}.
        </p>
      )}
    </form>
  );
};

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DonatePage = () => (
  <>
    <Nav activePage="" />

    <section className="page-hero route-page-hero">
      <div className="container" style={{ position:'relative', zIndex:1 }}>
        <p className="overline">Support RealMindX</p>
        <h1>Help More Learners<br />Access <span>Better Education.</span></h1>
        <p style={{ maxWidth:560 }}>
          Every contribution - a book, a coaching session, a school visit - goes directly
          into the hands of Ghanaian learners, teachers, and schools that need it most.
        </p>
        <div className="route-page-actions">
          <a href="#donate-form" className="btn btn-primary btn-lg">Make a Donation</a>
          <a href="/contact" className="btn btn-outline btn-lg">Talk to the Team</a>
        </div>
      </div>
    </section>

    <section className="donate-body" id="donate-form">
      <div className="container">
        <div className="donate-layout">
          <div className="donate-visual">
            <p className="overline" style={{ marginBottom:14, color:'var(--gold-dark)' }}>Our Impact in Pictures</p>
            <ImpactSlideshow />
            <p style={{ marginTop:20, color:'var(--gray-600)', fontSize:'0.88rem', lineHeight:1.7 }}>
              From rural classrooms to urban schools, RealMindX works where learning matters.
              Your support powers teacher placements, school transformations, and the bookshop
              that keeps thousands of Ghanaian students in learning materials.
            </p>
          </div>
          <div className="donate-form-wrap">
            <DonateForm />
          </div>
        </div>
      </div>
    </section>

    <section className="site-info-section">
      <div className="container">
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <p className="overline" style={{ marginBottom:10 }}>Where Your Support Goes</p>
          <h2 className="section-title">Three Ways to Make a Difference</h2>
        </div>
        <div className="site-info-grid">
          {[
            { icon:'book',    title:'Learning Materials',    body:'Books, stationery, and resource packs for learners and school programmes across Ghana.' },
            { icon:'teacher', title:'Teacher Development',   body:'Fund training, coaching, and CPD sessions that help teachers grow and keep students engaged.' },
            { icon:'school',  title:'School Transformation', body:'Back structured programmes that improve school systems, staffing models, and learning outcomes.' },
          ].map(card => (
            <article className="site-info-card" key={card.title}>
              <div className="site-info-icon"><Icon name={card.icon} size={22} /></div>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
        <div className="donate-how-section">
          <h2>How Support Is Handled</h2>
          <p>
            All contributions - financial or in-kind - are coordinated directly by the RealMindX team
            so every gift reaches the right programme, school, or learner group. We'll confirm your
            contribution and keep you updated on its impact.
          </p>
        </div>
      </div>
    </section>

    <Footer />
  </>
);

export default DonatePage;
