import React from 'react';
import { Icon } from './shared.jsx';
import { useCart } from './chrome.jsx';
import { submitMessage } from '../src/lib/managedContent.js';
import { useSiteCopy } from '../src/lib/siteContent.js';
import { resendVerificationOtp, signIn, signUp, verifyEmailOtp } from '../src/lib/authClient.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import globalToast from '../src/lib/toast.js';
const bookshopHeroImage = '/uploads/Redesign/hero/Books and Stationery (Hero).png';

const AuthPage = ({ navigate, mode = 'login' }) => {
  const isLogin = mode === 'login';
  const { toast } = useCart();
  const [form, setForm] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    remember: false,
    acceptedTerms: false,
  });
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const [pendingVerificationEmail, setPendingVerificationEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const termsRef = React.useRef(null);
  const set = key => event => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const fullNameParts = () => {
    const parts = form.fullName.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' '),
    };
  };

  const setErr = (msg) => { setError(msg); if (msg) globalToast.error(msg); };

  const showTermsProblem = () => {
    setErr('Please agree to the Bookshop Terms of Service and Bookshop Privacy Policy before creating an account.');
    requestAnimationFrame(() => {
      termsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      termsRef.current?.focus?.({ preventScroll: true });
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (isLogin) {
        await signIn({ email: form.email, password: form.password, role: 'user', remember: form.remember });
        toast('Signed in to the bookshop');
        navigate('home');
        return;
      }
      if (!form.acceptedTerms) {
        showTermsProblem();
        return;
      }
      if (form.password.length < 8) {
        setErr('Password must be at least 8 characters.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setErr('Passwords do not match.');
        return;
      }
      const { firstName, lastName } = fullNameParts();
      if (!firstName) {
        setErr('Enter your full name.');
        return;
      }
      const result = await signUp({
        email: form.email,
        password: form.password,
        firstName,
        lastName,
        phone: form.phone,
        acceptedTerms: form.acceptedTerms,
        turnstileToken,
      });
      setPendingVerificationEmail(form.email);
      setOtp('');
      setMessage(result?.message || 'Account created. Enter the code sent to your email.');
    } catch (err) {
      if (err?.data?.requires_verification) {
        setPendingVerificationEmail(err.data.email || form.email);
        setMessage('Enter the code we sent to your email before signing in.');
        return;
      }
      setErr(err?.message || (isLogin ? 'Could not sign in.' : 'Could not create your account.'));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (otp.replace(/\D/g, '').length !== 6) {
      setErr('Enter the 6 digit verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmailOtp({ email: pendingVerificationEmail, otp });
      setPendingVerificationEmail('');
      setOtp('');
      setMessage(result?.message || 'Email verified. You can now sign in.');
      navigate('login');
    } catch (err) {
      setErr(err?.message || 'Could not verify that code.');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!pendingVerificationEmail) return;
    setError('');
    setLoading(true);
    try {
      const result = await resendVerificationOtp(pendingVerificationEmail);
      setMessage(result?.message || 'A fresh code has been sent.');
    } catch (err) {
      setErr(err?.message || 'Could not resend the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bs-auth bs-fade-page">
      <div className="bs-auth-brand">
        <span className="bs-eyebrow">RealMindX Bookshop</span>
        <h1 className="bs-h1">{isLogin ? 'Welcome back to the shop.' : 'Join the RealMindX Bookshop.'}</h1>
        <p>
          {isLogin
            ? 'Sign in to track orders, save books for later, and check out faster.'
            : 'Create an account to track orders, save favourites, and enjoy a faster checkout.'}
        </p>
        <div className="bs-auth-trust">
          {[
            ['truck', 'Delivery within 48 hours, nationwide'],
            ['shield', 'Secure payments via Paystack'],
            ['spark', 'Wholesale pricing for schools'],
          ].map(([icon, text]) => (
            <div className="bs-auth-trust-row" key={text}>
              <span className="bs-tc"><Icon name={icon} size={16} /></span>
              {text}
            </div>
          ))}
        </div>
        <div className="bs-auth-illo">
          <img src={bookshopHeroImage} alt="Books and stationery from the RealMindX Bookshop" />
        </div>
      </div>

      <div className="bs-auth-form-wrap">
        <div className="bs-auth-form">
          <h2 className="bs-h2">{pendingVerificationEmail ? 'Verify Your Email' : isLogin ? 'Sign In' : 'Create Account'}</h2>
          <p className="bs-sub">
            {pendingVerificationEmail
              ? `Enter the 6 digit code sent to ${pendingVerificationEmail}.`
              : isLogin ? 'Enter your details to continue.' : 'It only takes a minute.'}
          </p>
          {message && <div className="bs-auth-notice success"><Icon name="check" size={16} /> {message}</div>}

          {pendingVerificationEmail ? (
            <form onSubmit={verifyOtp}>
              <div className="bs-field">
                <label>Verification Code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </div>
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>
              <div className="bs-auth-alt">
                Did not receive it? <button type="button" className="bs-link-button" onClick={resendOtp} disabled={loading}>Send a fresh code</button>
              </div>
            </form>
          ) : (
            <form onSubmit={submit}>

          {!isLogin && (
            <div className="bs-field">
              <label>Full Name</label>
              <input placeholder="Ama Mensah" value={form.fullName} onChange={set('fullName')} required />
            </div>
          )}
          <div className="bs-field">
            <label>Email</label>
            <input type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} autoComplete="email" required />
          </div>
          {!isLogin && (
            <div className="bs-field">
              <label>Phone Number</label>
              <input placeholder="+233 XX XXX XXXX" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </div>
          )}
          <div className="bs-field">
            <label>Password</label>
            <input type="password" placeholder="Minimum 8 characters" value={form.password} onChange={set('password')} autoComplete={isLogin ? 'current-password' : 'new-password'} required />
          </div>
          {!isLogin && (
            <div className="bs-field">
              <label>Confirm Password</label>
              <input type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required />
            </div>
          )}

          {isLogin ? (
            <div className="bs-auth-row">
              <label className="bs-checkbox-line" style={{ margin: 0 }}>
                <input type="checkbox" checked={form.remember} onChange={set('remember')} />
                <span className="bs-cbox"><Icon name="check" size={12} /></span>
                Remember me
              </label>
              <a href="#" className="bs-link-gold" onClick={(event) => { event.preventDefault(); toast('Reset link sent'); }}>
                Forgot password?
              </a>
            </div>
          ) : (
            <>
            <label className="bs-checkbox-line" ref={termsRef} tabIndex={-1}>
              <input type="checkbox" checked={form.acceptedTerms} onChange={set('acceptedTerms')} required />
              <span className="bs-cbox"><Icon name="check" size={12} /></span>
              <span>I agree to the <a className="bs-link-gold" href="/bookshop/terms">Bookshop Terms of Service</a> and <a className="bs-link-gold" href="/bookshop/privacy">Bookshop Privacy Policy</a>.</span>
            </label>
            <TurnstileField className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
            </>
          )}

          <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" type="submit" disabled={loading}>
            {loading ? (isLogin ? 'Signing in...' : 'Creating account...') : isLogin ? 'Sign In' : 'Create Account'}
          </button>

          <div className="bs-auth-alt">
            {isLogin ? (
              <>Do not have an account? <a href="#" className="bs-link-gold" onClick={(event) => { event.preventDefault(); navigate('signup'); }}>Sign Up</a></>
            ) : (
              <>Already have an account? <a href="#" className="bs-link-gold" onClick={(event) => { event.preventDefault(); navigate('login'); }}>Sign In</a></>
            )}
          </div>
        </form>
          )}
        </div>
      </div>
    </div>
  );
};

const ContactPage = ({ navigate }) => {
  const { toast } = useCart();
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const onSubmit = async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const fd = new FormData(formEl);
    try {
      await submitMessage({
        name: fd.get('name'),
        email: fd.get('email'),
        subject: fd.get('subject') || 'Bookshop enquiry',
        message: fd.get('message'),
        service: 'Bookshop',
        turnstileToken,
      });
      formEl.reset();
      setTurnstileToken('');
      toast("Message sent. We'll reply soon.");
    } catch (err) {
      toast(err?.message || 'Could not send message.');
    }
  };

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href="#" onClick={(event) => { event.preventDefault(); navigate('home'); }}>Home</a>
        <span className="bs-sep">/</span><span className="bs-cur">Contact</span>
      </div>
      <div style={{ padding: '8px 0 4px' }}>
        <span className="bs-eyebrow" style={{ color: 'var(--bs-gold-dark)' }}>Get in touch</span>
        <h1 className="bs-h2" style={{ color: 'var(--bs-navy)', fontSize: 36, marginTop: 12 }}>We'd love to help.</h1>
      </div>
      <div className="bs-contact-layout">
        <div className="bs-form-card">
          <h3 className="bs-h3">Send us a message</h3>
          <form onSubmit={onSubmit}>
            <div className="bs-field-row">
              <div className="bs-field"><label>Name</label><input name="name" placeholder="Your name" required /></div>
              <div className="bs-field"><label>Email</label><input name="email" type="email" placeholder="you@email.com" required /></div>
            </div>
            <div className="bs-field"><label>Subject</label><input name="subject" placeholder="How can we help?" /></div>
            <div className="bs-field"><label>Message</label><textarea name="message" placeholder="Write your message..." style={{ minHeight: 130 }} required /></div>
            <TurnstileField className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
            <button className="bs-btn bs-btn-gold bs-btn-lg" type="submit"><Icon name="mail" size={17} /> Send Message</button>
          </form>
        </div>

        <div className="bs-contact-info-card">
          <h3 className="bs-h3">Visit and reach us</h3>
          <div className="bs-contact-row"><Icon name="pin" size={20} className="bs-ci" /><div><div className="bs-cr-label">Address</div><div className="bs-cr-val">Dome Pillar 2, Accra, Ghana</div></div></div>
          <div className="bs-contact-row"><Icon name="phone" size={20} className="bs-ci" /><div><div className="bs-cr-label">Call us</div><div className="bs-cr-val">+233 55 803 9190 / +233 55 452 9493</div></div></div>
          <div className="bs-contact-row"><Icon name="mail" size={20} className="bs-ci" /><div><div className="bs-cr-label">Email</div><div className="bs-cr-val">bookshop@realmindxgh.com</div></div></div>
          <a className="bs-contact-row" href="https://wa.link/q5rjtp" style={{ textDecoration: 'none' }}><Icon name="wa" size={20} className="bs-ci" /><div><div className="bs-cr-label">WhatsApp</div><div className="bs-cr-val">Chat with us instantly</div></div></a>
          <div className="bs-map-embed"><div className="bs-imgph bs-navy"><span className="bs-lab">[ map embed - Dome Pillar 2 ]</span></div></div>
          <table className="bs-hours-table" style={{ marginTop: 20 }}>
            <tbody>
              <tr><td>Monday - Friday</td><td>8:00 - 18:00</td></tr>
              <tr><td>Saturday</td><td>9:00 - 16:00</td></tr>
              <tr><td>Sunday</td><td>Closed</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const InfoPage = ({ navigate }) => (
  <div className="bs-fade-page">
    <div className="bs-info-hero">
      <div className="bs-container">
        <span className="bs-eyebrow">About</span>
        <h1 className="bs-h1">About RealMindX Bookshop.</h1>
      </div>
    </div>
    <div className="bs-container">
      <div className="bs-info-layout">
        <div>
          <div className="bs-info-section">
            <h2 className="bs-h3">Our Story</h2>
            <p>RealMindX Bookshop is the retail arm of RealMindX Education Limited - Ghana's comprehensive educational services provider. We exist to put the right learning materials into the hands of every student, parent and teacher, at prices that make sense.</p>
            <p>From curriculum titles to past questions, readers and stationery, every item we stock is chosen with one question in mind: does this help a Ghanaian learner thrive?</p>
          </div>
          <div className="bs-info-section">
            <h2 className="bs-h3">What We Sell</h2>
            <p>Textbooks for multiple curricula, BECE and WASSCE past questions, graded readers, exercise books, mathematical sets, art supplies and everyday stationery are available at both wholesale and retail prices.</p>
          </div>
          <div className="bs-info-section">
            <h2 className="bs-h3">Delivery Information</h2>
            <p>Orders are dispatched within 24 hours and delivered nationwide within 48 hours. Delivery within Greater Accra starts at GHS 15; other regions are calculated at checkout based on destination.</p>
          </div>
          <div className="bs-info-section">
            <h2 className="bs-h3">Return Policy</h2>
            <p>Unused items in their original condition may be returned within 7 days for an exchange or store credit. Damaged or incorrect items are replaced free of charge - simply reach out on WhatsApp and we'll make it right.</p>
          </div>
          <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('shop')}>Start Shopping <Icon name="arrow" size={16} /></button>
        </div>

        <aside className="bs-info-sidebar">
          <h4>Quick Contact</h4>
          <div className="bs-contact-row"><Icon name="pin" size={18} className="bs-ci" /><div><div className="bs-cr-label">Address</div><div className="bs-cr-val">Dome Pillar 2, Accra</div></div></div>
          <div className="bs-contact-row"><Icon name="phone" size={18} className="bs-ci" /><div><div className="bs-cr-label">Phone</div><div className="bs-cr-val">+233 55 803 9190</div></div></div>
          <div className="bs-contact-row"><Icon name="mail" size={18} className="bs-ci" /><div><div className="bs-cr-label">Email</div><div className="bs-cr-val">bookshop@realmindxgh.com</div></div></div>
          <h4 style={{ marginTop: 24 }}>Opening Hours</h4>
          <table className="bs-hours-table" style={{ color: 'var(--bs-text)' }}>
            <tbody>
              <tr><td>Mon - Fri</td><td style={{ color: 'var(--bs-navy)' }}>8:00 - 18:00</td></tr>
              <tr><td>Saturday</td><td style={{ color: 'var(--bs-navy)' }}>9:00 - 16:00</td></tr>
              <tr><td>Sunday</td><td style={{ color: 'var(--bs-navy)' }}>Closed</td></tr>
            </tbody>
          </table>
        </aside>
      </div>
    </div>
  </div>
);

const BOOKSHOP_PRIVACY_SECTIONS = [
  ['What We Collect', 'When you place an order, submit an enquiry, or contact RealMindX Bookshop, we collect the information you provide: your full name, email address, phone number, delivery address, and the items you order. If you pay through Paystack, payment is processed securely by Paystack and we receive only a payment reference — we never see or store your card details.'],
  ['How We Use It', 'Your information is used to: confirm and process your order; arrange delivery or notify you when your order is ready for pickup; send you an order confirmation email; contact you if there is a question about your order or stock availability; and respond to your enquiries. We do not use your bookshop data for unrelated marketing without your consent.'],
  ['Order Records', 'We keep records of bookshop orders for our operational and legal records. You may request a copy of your order history or ask us to delete your data by emailing bookshop@realmindxgh.com. Note that we may be required to retain certain transaction records for legal and accounting purposes.'],
  ['Sharing Your Information', 'We do not sell your bookshop data. We share order details with our delivery partners only to the extent needed to fulfil your delivery. We use Resend to deliver email confirmations; Resend processes your email address in accordance with their own privacy policy.'],
  ['Cookies', 'The bookshop uses session cookies to manage your cart and keep you signed in during checkout. No third-party advertising cookies are used in the bookshop.'],
  ['Your Rights', 'You have the right to access, correct, or request deletion of your bookshop data. Contact us at bookshop@realmindxgh.com to exercise these rights.'],
  ['Contact', 'RealMindX Bookshop · Dome Pillar 2, Accra, Ghana · bookshop@realmindxgh.com · +233 55 803 9190'],
];

const BOOKSHOP_TERMS_SECTIONS = [
  ['Placing an Order', 'By placing an order through the RealMindX Bookshop, you are making an offer to purchase the selected items. Your order is an enquiry/request until RealMindX confirms availability, accepts your payment, and sends an order confirmation email. We reserve the right to decline or cancel orders if items are out of stock, if there is an error in pricing, or if we suspect fraudulent activity.'],
  ['Pricing and Payment', 'All prices are displayed in Ghanaian Cedis (GH₵) and include applicable taxes. Prices are subject to change without notice. Payment is processed securely via Paystack. For orders above a certain value, or for schools and retailers, a pro-forma invoice may be issued before payment. RealMindX is not responsible for exchange rate differences for international cards.'],
  ['Delivery', 'We offer home delivery across Ghana and free pickup from our Dome Pillar 2, Accra shop. Delivery fees are calculated at checkout based on your location. Estimated delivery is within 48 hours for Greater Accra and 3–5 business days for other regions. Delivery times are estimates and not guarantees. RealMindX is not liable for delays caused by circumstances outside our control.'],
  ['Pickup Orders', 'For pickup orders, you will be notified by phone or email when your order is ready. Uncollected orders may be cancelled and refunded after 14 days. Please bring your order reference number when collecting.'],
  ['Returns and Exchanges', 'Unused items in their original condition may be returned within 7 days of delivery or pickup for an exchange or store credit. We do not offer cash refunds except where items are damaged, incorrect, or significantly not as described. To initiate a return, contact us on WhatsApp or email bookshop@realmindxgh.com within 7 days.'],
  ['Damaged or Incorrect Items', 'If you receive a damaged or incorrect item, contact us immediately (within 48 hours of receipt) and we will arrange a replacement or refund at no extra cost to you. Photos of the damaged item may be requested.'],
  ['Bulk and Wholesale Orders', 'For bulk orders (10 or more copies of the same title), a bulk discount may apply at checkout. School and institutional orders may be subject to a separate quotation process. Contact us at bookshop@realmindxgh.com or WhatsApp for custom school supply arrangements.'],
  ['Intellectual Property', 'All products sold in the RealMindX Bookshop are original, legally sourced, and authorised for sale in Ghana. Copying, scanning, or reproducing purchased books without authorisation is a violation of copyright law.'],
  ['Limitation of Liability', 'RealMindX is not liable for indirect or consequential losses arising from the purchase of products, including but not limited to exam results or academic outcomes. Our liability is limited to the value of the specific order in question.'],
  ['Governing Law', 'These Bookshop Terms are governed by the laws of the Republic of Ghana.'],
  ['Contact', 'Questions? Reach us at bookshop@realmindxgh.com, call +233 55 803 9190, or WhatsApp us.'],
];

const BookshopLegalPage = ({ type = 'privacy' }) => {
  const copy = useSiteCopy();
  const privacy = type === 'privacy';
  const title = privacy ? 'Bookshop Privacy Policy' : 'Bookshop Terms of Service';
  const managedBody = privacy ? copy.bookshop_privacy_body : copy.bookshop_terms_body;
  const defaultSections = privacy ? BOOKSHOP_PRIVACY_SECTIONS : BOOKSHOP_TERMS_SECTIONS;
  const paragraphs = managedBody ? String(managedBody).split(/\n\s*\n/).filter(Boolean) : null;

  return (
    <div className="bs-fade-page">
      <div className="bs-info-hero">
        <div className="bs-container">
          <span className="bs-eyebrow">RealMindX Bookshop — Legal</span>
          <h1 className="bs-h1">{title}</h1>
        </div>
      </div>
      <div className="bs-container">
        <div className="bs-info-layout">
          <article>
            <p style={{ fontSize:'0.78rem', color:'var(--bs-muted)', marginBottom:28 }}>
              Effective date: 2 June 2026 · RealMindX Education Limited, Dome Pillar 2, Accra, Ghana
            </p>
            {paragraphs
              ? paragraphs.map((p, i) => <p key={i} style={{ marginBottom:16 }}>{p}</p>)
              : defaultSections.map(([heading, text]) => (
                <div key={heading} style={{ marginBottom:28 }}>
                  <h2 className="bs-h3" style={{ marginBottom:8 }}>{heading}</h2>
                  <p className="bs-muted">{text}</p>
                </div>
              ))
            }
            <div style={{ display:'flex', gap:12, marginTop:40, flexWrap:'wrap' }}>
              <a href="/bookshop" className="bs-btn bs-btn-navy">← Back to Bookshop</a>
              <a href="/contact" className="bs-btn bs-btn-outline-navy">Contact Us</a>
            </div>
          </article>
          <aside className="bs-info-sidebar">
            <h4>Bookshop Legal</h4>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
              <a href="/bookshop/privacy" style={{ color:'var(--bs-navy)', fontSize:'0.88rem' }}>Bookshop Privacy Policy</a>
              <a href="/bookshop/terms" style={{ color:'var(--bs-navy)', fontSize:'0.88rem' }}>Bookshop Terms of Service</a>
              <a href="/privacy" style={{ color:'var(--bs-muted)', fontSize:'0.85rem' }}>Main Site Privacy Policy</a>
              <a href="/terms" style={{ color:'var(--bs-muted)', fontSize:'0.85rem' }}>Main Site Terms</a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export { AuthPage, ContactPage, InfoPage, BookshopLegalPage };
