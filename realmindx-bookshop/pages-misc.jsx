import React from 'react';
import { Icon, cedis } from './shared.jsx';
import { useCart } from './chrome.jsx';
import { submitMessage } from '../src/lib/managedContent.js';
import { useSiteCopy, usePublicSettings } from '../src/lib/siteContent.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { resendVerificationOtp, signIn, signOut, signUp, syncSessionFromApi, verifyEmailOtp } from '../src/lib/authClient.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import globalToast from '../src/lib/toast.js';
import { consumeBookshopAuthReturn } from './authReturn.js';
import { api, isApiMode } from '../src/lib/apiClient.js';
const bookshopHeroImage = '/bookshop-og.png';

const AuthPage = ({ navigate, mode = 'login' }) => {
  const isLogin = mode === 'login';
  const [turnstileKey, setTurnstileKey] = React.useState(0);
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
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const termsRef = React.useRef(null);
  const fullNameRef = React.useRef(null);
  const passwordRef = React.useRef(null);
  const confirmRef = React.useRef(null);
  const otpRef = React.useRef(null);
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

  const setErr = (msg, ref) => {
    setError(msg);
    if (msg) globalToast.error(msg);
    if (ref?.current) {
      requestAnimationFrame(() => {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ref.current.focus?.({ preventScroll: true });
      });
    }
  };

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
    setLoading(true);
    try {
      if (isLogin) {
        await signIn({ email: form.email, password: form.password, role: 'user', remember: form.remember });
        globalToast.success('Signed in to the bookshop.');
        navigate(consumeBookshopAuthReturn('home'));
        return;
      }
      if (!form.acceptedTerms) {
        showTermsProblem();
        return;
      }
      if (form.password.length < 8) {
        setErr('Password must be at least 8 characters.', passwordRef);
        return;
      }
      if (form.password !== form.confirmPassword) {
        setErr('Passwords do not match.', confirmRef);
        return;
      }
      const { firstName, lastName } = fullNameParts();
      if (!firstName) {
        setErr('Enter your full name.', fullNameRef);
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
      globalToast.success(result?.message || 'Account created. Enter the code sent to your email.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err?.data?.requires_verification) {
        setPendingVerificationEmail(err.data.email || form.email);
        globalToast.info('Enter the code we sent to your email before signing in.');
        return;
      }
      // Email already exists — switch to sign-in with helpful message
      const msg = err?.message || '';
      if (!isLogin && (err?.status === 409 || msg.toLowerCase().includes('already exists'))) {
        globalToast.info('You already have a RealMindX account. Sign in with your existing password.');
        navigate('login');
        return;
      }
      setErr(msg || (isLogin ? 'Could not sign in.' : 'Could not create your account.'));
    } finally {
      setLoading(false);
      // Reset Turnstile — tokens are single-use; remount forces a fresh token
      setTurnstileToken('');
      setTurnstileKey(k => k + 1);
    }
  };

  const verifyOtp = async event => {
    event.preventDefault();
    setError('');
    if (otp.replace(/\D/g, '').length !== 6) {
      setErr('Enter the 6 digit verification code from your email.', otpRef);
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmailOtp({ email: pendingVerificationEmail, otp });
      setPendingVerificationEmail('');
      setOtp('');
      globalToast.success(result?.message || 'Email verified. You can now sign in.');
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
      globalToast.success(result?.message || 'A fresh code has been sent.');
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
        <div className="bs-auth-illo" style={{ display: bookshopHeroImage ? undefined : 'none' }}>
          <img
            src={bookshopHeroImage}
            alt="RealMindX Bookshop"
            onError={e => { e.target.closest('.bs-auth-illo').style.display = 'none'; }}
          />
        </div>
        <h1 className="bs-h1">{isLogin ? 'Welcome back to the shop.' : 'Join the RealMindX Bookshop.'}</h1>
        <p>
          {isLogin
            ? 'Sign in to track orders, save books for later, and check out faster. Your RealMindX teacher or portal account works here too.'
            : 'Create an account to track orders, save favourites, and enjoy a faster checkout. Already have a RealMindX account? Use the same login.'}
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
      </div>

      <div className="bs-auth-form-wrap">
        <div className="bs-auth-form">
          <h2 className="bs-h2">{pendingVerificationEmail ? 'Verify Your Email' : isLogin ? 'Sign In' : 'Create Account'}</h2>
          <p className="bs-sub">
            {pendingVerificationEmail
              ? `Enter the 6 digit code sent to ${pendingVerificationEmail}.`
              : isLogin ? 'Enter your details to continue.' : 'It only takes a minute.'}
          </p>
          {pendingVerificationEmail ? (
            <form onSubmit={verifyOtp}>
              <div className="bs-field">
                <label>Verification Code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  ref={otpRef}
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
            <form onSubmit={submit} noValidate>

          {!isLogin && (
            <div className="bs-field">
              <label>Full Name</label>
              <input ref={fullNameRef} placeholder="Ama Mensah" value={form.fullName} onChange={set('fullName')} />
            </div>
          )}
          <div className="bs-field">
            <label>Email</label>
            <input type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          {!isLogin && (
            <div className="bs-field">
              <label>Phone Number</label>
              <input placeholder="+233 XX XXX XXXX" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </div>
          )}
          <div className="bs-field">
            <label>Password</label>
            <input ref={passwordRef} type="password" placeholder="Minimum 8 characters" value={form.password} onChange={set('password')} autoComplete={isLogin ? 'current-password' : 'new-password'} />
          </div>
          {!isLogin && (
            <div className="bs-field">
              <label>Confirm Password</label>
              <input ref={confirmRef} type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
            </div>
          )}

          {isLogin ? (
            <div className="bs-auth-row">
              <label className="bs-checkbox-line" style={{ margin: 0 }}>
                <input type="checkbox" checked={form.remember} onChange={set('remember')} />
                <span className="bs-cbox"><Icon name="check" size={12} /></span>
                Remember me
              </label>
              <a href="#" className="bs-link-gold" onClick={(event) => { event.preventDefault(); globalToast.info('Reset link sent.'); }}>
                Forgot password?
              </a>
            </div>
          ) : (
            <>
            <label className="bs-checkbox-line" ref={termsRef} tabIndex={-1}>
              <input type="checkbox" checked={form.acceptedTerms} onChange={set('acceptedTerms')} />
              <span className="bs-cbox"><Icon name="check" size={12} /></span>
              <span>I agree to the <a className="bs-link-gold" href="/bookshop/terms">Bookshop Terms of Service</a> and <a className="bs-link-gold" href="/bookshop/privacy">Bookshop Privacy Policy</a>.</span>
            </label>
            <TurnstileField key={turnstileKey} className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
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
  const settings = usePublicSettings();
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
      globalToast.success("Message sent. We'll reply soon.");
    } catch (err) {
      globalToast.error(err?.message || 'Could not send message.');
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
        <div className="bs-form-card" style={{ borderTop: '4px solid var(--bs-navy)', boxShadow: 'var(--bs-shadow-md)' }}>
          <h3 className="bs-h3" style={{ fontSize: 22, color: 'var(--bs-navy)', marginBottom: 6 }}>Send us a message</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--bs-muted)', marginBottom: 22 }}>We reply within one business day. You will receive a confirmation email with a reference number.</p>
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
          <div className="bs-contact-row"><Icon name="mail" size={20} className="bs-ci" /><div><div className="bs-cr-label">Email</div><div className="bs-cr-val">info@realmindxgh.com</div></div></div>
          <a className="bs-contact-row" href="https://wa.link/q5rjtp" style={{ textDecoration: 'none' }}><Icon name="wa" size={20} className="bs-ci" /><div><div className="bs-cr-label">WhatsApp</div><div className="bs-cr-val">Chat with us instantly</div></div></a>
          {settings.contact_map_embed ? (
            <iframe
              title="RealMindX Bookshop – Dome Pillar 2, Accra"
              src={settings.contact_map_embed}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              style={{ width: '100%', height: 260, border: 'none', borderRadius: 8, marginTop: 16, display: 'block' }}
            />
          ) : null}
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
          <div className="bs-contact-row"><Icon name="mail" size={18} className="bs-ci" /><div><div className="bs-cr-label">Email</div><div className="bs-cr-val">info@realmindxgh.com</div></div></div>
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
  ['Who We Are', 'The RealMindX Bookshop at new.realmindxgh.com/bookshop is operated by RealMindX Education Limited, an education company based in Ghana. This Privacy Policy explains how we collect, use, store, and protect your personal information when you shop with us. For questions about this policy, contact us at info@realmindxgh.com.'],
  ['Information We Collect', 'If you register an account we collect your name, email address, and password. If you sign in with Google or Facebook we receive your name and email from those providers only. When you place an order we collect your full name, delivery address, phone number, email address, order history, products purchased, quantities, prices, and delivery method. All payment processing is handled by Paystack. We do not store your card number, CVV, or mobile money PIN. We receive and store a payment reference number and confirmation of payment status from Paystack. If you purchase without registering, we collect the same delivery and contact information linked to your order. If you contact us about an order or send an enquiry, we retain that communication. We collect standard web access data including IP address, browser type, device information, and pages viewed for security monitoring. If you submit a product review, we retain your review text with your account name and the date.'],
  ['How We Use Your Information', 'We use the information we collect to process and fulfil your orders, to calculate and arrange delivery, to send you order confirmation, dispatch, and delivery notifications, to handle returns, refunds, and complaints, to manage your account and purchase history, to respond to your enquiries, to detect and prevent fraudulent orders, to send you bookshop updates and promotions if you have opted in, to comply with our legal obligations under Ghanaian law, and to improve the bookshop experience. We do not sell your personal information. We do not share your information with third-party advertisers.'],
  ['Who We Share Your Information With', 'We share your name, delivery address, and phone number with the delivery agent responsible for your order. We use Resend to send transactional emails including order confirmations and delivery notifications. We use Arkesel to send SMS notifications about your order status. We use Paystack for payment processing. Your data is stored on servers provided by Hostinger. We may disclose information if required by Ghanaian law or a valid court order. We do not share your information with any other party without your explicit consent.'],
  ['Order Data Retention', 'We retain order records including your personal and delivery details for seven years from the date of the order. This is required for financial record-keeping under Ghanaian law. After seven years, order records are permanently deleted. If you have a registered account and close it, your order history is retained for the seven-year period regardless of account closure. Guest checkout information is retained for the same seven-year period linked to the order record.'],
  ['Account Data Retention', 'If you have a registered account, your account data is retained for as long as the account is active. If you close your account, your personal account information is deleted within thirty days. Order history associated with your account is retained for the seven-year period described above.'],
  ['Marketing Communications', 'If you opt in to marketing communications during checkout or account registration, we may send you updates about new arrivals, promotions, and special offers. You may unsubscribe at any time by clicking the unsubscribe link in any marketing email or by contacting us at info@realmindxgh.com. Unsubscribing from marketing does not affect transactional emails such as order confirmations.'],
  ['Data Security', 'We protect your information using HTTPS encryption for all data in transit, HTTP-only and SameSite session cookies, hashed passwords, and Paystack\'s PCI-compliant payment infrastructure for all card and mobile money transactions. In the event of a data breach affecting your personal information, we will notify you and relevant authorities as required by applicable Ghanaian law.'],
  ['Your Rights', 'You have the right to request a copy of the personal information we hold about you, to request correction of inaccurate information, to request deletion of your personal information subject to our legal obligation to retain financial records, to withdraw consent for marketing communications at any time, and to request your data in a portable format. To exercise any of these rights, contact us at info@realmindxgh.com. We will respond within thirty days.'],
  ['Cookies', 'We use a session cookie to maintain your login state and shopping cart between pages. This cookie is essential to the operation of the bookshop. We do not use third-party tracking cookies or advertising cookies.'],
  ["Children's Privacy", 'The RealMindX Bookshop is not directed at children under the age of 13. Parents and guardians may purchase on behalf of children. If you believe a child under 13 has independently provided us with personal information, contact us at info@realmindxgh.com and we will delete it promptly.'],
  ['Changes to This Policy', 'We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. For significant changes we will notify registered customers by email.'],
  ['Contact', 'RealMindX Bookshop, RealMindX Education Limited, info@realmindxgh.com, +233 55 803 9190, Dome Pillar 2, Accra, Ghana.'],
];

const BOOKSHOP_TERMS_SECTIONS = [
  ['Agreement', 'These Terms and Conditions govern your use of the RealMindX Bookshop and any purchases you make through it. By using the bookshop or placing an order, you agree to these terms. The bookshop is operated by RealMindX Education Limited, a company registered in Ghana. References to "we", "us", "our", or "the bookshop" refer to RealMindX Education Limited operating the RealMindX Bookshop.'],
  ['Products', 'We sell educational books, textbooks, stationery, and learning materials primarily for the Ghanaian curriculum. We make every reasonable effort to ensure product information is accurate. Images of products are representative. Actual product appearance including cover editions may vary where a publisher has released an updated edition. We reserve the right to limit quantities, correct pricing errors, and withdraw any product from sale at any time without notice.'],
  ['Pricing', 'All prices are displayed in Ghana Cedis inclusive of applicable taxes. Delivery fees are additional and calculated at checkout. Prices are subject to change without notice. The price you pay is the price confirmed at the time you complete checkout.'],
  ['Orders', 'An order is placed when you complete checkout and receive an order reference number. Acceptance occurs when we confirm your order is being processed. You will receive an order confirmation email from bookshop@send.realmindxgh.com after successful payment. We reserve the right to cancel any order due to stock unavailability, pricing errors, suspected fraud, or inability to process payment. If we cancel your order after payment has been taken, you will receive a full refund. You may cancel your order before it has been dispatched by contacting us immediately at info@realmindxgh.com or +233 55 803 9190. Once an order has been dispatched it cannot be cancelled and the return policy applies.'],
  ['Payment', 'All payments are processed securely through Paystack. We accept mobile money and debit or credit cards. We do not store your card number or mobile money credentials. Payment is required in full before an order is processed. If a payment fails but your account has been debited, contact us immediately with your bank reference and we will investigate and resolve within three working days.'],
  ['Delivery', 'We deliver to addresses across Ghana. Delivery fees are calculated at checkout based on your location zone. Delivery is typically completed within 48 hours of order confirmation for Accra and selected urban areas. Free pickup is available at our location at Dome Pillar 2, Accra. When your order is ready for pickup we will notify you by SMS and email. Orders not collected within seven days of the pickup notification will be returned to stock and a refund issued. Once your order is handed to the delivery agent or collected by you, responsibility for the items passes to you.'],
  ['Returns and Refunds', 'If you receive an item that is damaged or different from what you ordered, contact us within 48 hours of delivery at info@realmindxgh.com with your order reference and photographs of the issue. We will arrange a replacement or full refund at no additional cost to you. We do not accept returns for change of mind on physical books and educational materials unless the item is sealed and unused. Return delivery costs are the responsibility of the buyer. Approved refunds are processed back to your original payment method through Paystack within five working days.'],
  ['Stock Availability', 'Products are sold subject to availability. If an item in your order becomes unavailable after you have placed the order and paid, we will contact you to offer a substitution or full refund for the unavailable item. The remainder of your order will be fulfilled as normal.'],
  ['User Accounts', 'You may purchase as a guest or with a registered account. A registered account allows you to track orders, view order history, and receive personalised updates. Your bookshop account and main site account share the same login credentials.'],
  ['Product Reviews', 'Registered users may submit product reviews. Reviews must be honest, relevant to the product, and free from offensive, defamatory, or misleading content. We reserve the right to remove reviews that violate these standards or that appear to be fraudulent. We do not remove legitimate negative reviews.'],
  ['Intellectual Property', 'All content on the bookshop website including text, images, product descriptions, logos, and design is the intellectual property of RealMindX Education Limited or its suppliers. You may not reproduce bookshop content without our prior written consent.'],
  ['Limitation of Liability', 'To the fullest extent permitted by Ghanaian law, our liability for any claim arising from a bookshop purchase is limited to the value of the specific item or items in dispute. We are not liable for indirect losses, loss of data, loss of profit, or consequential damages arising from your use of the bookshop or any purchase made through it.'],
  ['Contact', 'RealMindX Bookshop, RealMindX Education Limited, info@realmindxgh.com, +233 55 803 9190, Dome Pillar 2, Accra, Ghana. Monday to Friday 7am to 5pm, Saturday 10am to 2pm.'],
];

const BookshopLegalPage = ({ type = 'privacy' }) => {
  const privacy = type === 'privacy';
  const title = privacy ? 'Bookshop Privacy Policy' : 'Bookshop Terms and Conditions';
  const sections = privacy ? BOOKSHOP_PRIVACY_SECTIONS : BOOKSHOP_TERMS_SECTIONS;
  const [active, setActive] = React.useState('');

  React.useEffect(() => {
    window.scrollTo(0, 0);
    const handler = () => {
      let found = '';
      for (let i = 0; i < sections.length; i++) {
        const el = document.getElementById(`bs-section-${i}`);
        if (el && el.getBoundingClientRect().top <= 100) found = `bs-section-${i}`;
      }
      setActive(found || 'bs-section-0');
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [sections.length]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  };

  return (
    <div className="bs-fade-page">
      <div className="bs-info-hero">
        <div className="bs-container">
          <span className="bs-eyebrow">RealMindX Bookshop Legal</span>
          <h1 className="bs-h1">{title}</h1>
          <p className="bs-sub" style={{ marginTop:8 }}>Effective 3 June 2026 · RealMindX Education Limited, Ghana</p>
        </div>
      </div>
      <div className="bs-container" style={{ paddingTop:48, paddingBottom:80 }}>
        <div style={{ display:'grid', gridTemplateColumns:'220px minmax(0,1fr)', gap:48, alignItems:'start' }} className="bs-legal-grid">
          {/* Sidebar */}
          <aside style={{ position:'sticky', top:80 }} className="bs-legal-sidebar">
            <p style={{ fontSize:'0.7rem', fontWeight:800, letterSpacing:'2px', textTransform:'uppercase', color:'var(--bs-navy)', opacity:0.5, marginBottom:12 }}>Sections</p>
            {sections.map(([heading], i) => (
              <button key={i}
                className={active === `bs-section-${i}` ? 'active' : ''}
                onClick={() => scrollTo(`bs-section-${i}`)}>
                <span style={{ opacity:0.4, marginRight:6, fontSize:'0.72rem' }}>{String(i+1).padStart(2,'0')}</span>{heading}
              </button>
            ))}
          </aside>

          {/* Content */}
          <article>
            {sections.map(([heading, text], i) => (
              <section key={i} id={`bs-section-${i}`} style={{ marginBottom:44, scrollMarginTop:90 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:12 }}>
                  <span style={{ fontSize:'0.7rem', fontWeight:800, color:'var(--bs-gold)', letterSpacing:'1px', flexShrink:0 }}>{String(i+1).padStart(2,'0')}</span>
                  <h2 className="bs-h3" style={{ margin:0 }}>{heading}</h2>
                </div>
                <div style={{ paddingLeft:28 }}>
                  {text.split('\n').filter(Boolean).map((p, j) => <p key={j} className="bs-muted" style={{ marginBottom:10, lineHeight:1.75 }}>{p}</p>)}
                </div>
                <hr style={{ marginTop:36, border:'none', borderTop:'1px solid var(--bs-border)' }} />
              </section>
            ))}
            <div style={{ display:'flex', gap:12, marginTop:32, flexWrap:'wrap' }}>
              <a href="/bookshop" className="bs-btn bs-btn-navy">Back to Bookshop</a>
              <a href="/contact" className="bs-btn bs-btn-outline-navy">Contact Us</a>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

const STATUS_META = {
  new:        { label: 'Placed',      color: '#0ea5e9' },
  confirmed:  { label: 'Confirmed',   color: '#6366f1' },
  packed:     { label: 'Packed',      color: '#f59e0b' },
  dispatched: { label: 'Dispatched',  color: '#f97316' },
  delivered:  { label: 'Delivered',   color: '#16a34a' },
  cancelled:  { label: 'Cancelled',   color: '#dc2626' },
};

const OrderStatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status || 'Unknown', color: '#6b7b8e' };
  return (
    <span className="bs-order-badge" style={{ '--badge-color': meta.color }}>
      {meta.label}
    </span>
  );
};

// ─── Order detail modal ───────────────────────────────────────────────────────

const OrderDetailModal = ({ order, onClose }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!order) return null;
  const items = order.items || [];
  const itemCount = items.reduce((s, i) => s + (i.quantity || 1), 0);

  return (
    <div className="bs-modal-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bs-modal-box bs-order-modal" role="dialog" aria-modal="true" aria-label="Order details">
        <div className="bs-modal-head">
          <div>
            <p className="bs-eyebrow" style={{ color: 'var(--bs-gold-dark)', marginBottom: 4 }}>Order Details</p>
            <h2 className="bs-h3" style={{ margin: 0 }}>{order.order_reference}</h2>
          </div>
          <button className="bs-modal-close" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>

        <div className="bs-modal-body">
          <div className="bs-order-meta-grid">
            <div className="bs-omg-item">
              <span className="bs-omg-label">Date Placed</span>
              <span className="bs-omg-val">{fmtDate(order.created_at)}</span>
            </div>
            <div className="bs-omg-item">
              <span className="bs-omg-label">Status</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="bs-omg-item">
              <span className="bs-omg-label">Payment</span>
              <span className="bs-omg-val" style={{ textTransform: 'capitalize' }}>
                {order.payment_status || 'Pending'}{order.payment_provider ? ` · ${order.payment_provider}` : ''}
              </span>
            </div>
            <div className="bs-omg-item">
              <span className="bs-omg-label">Total</span>
              <span className="bs-omg-val bs-omg-total">{cedis(order.total_amount || 0)}</span>
            </div>
            <div className="bs-omg-item">
              <span className="bs-omg-label">Delivery</span>
              <span className="bs-omg-val" style={{ textTransform: 'capitalize' }}>
                {order.delivery_method === 'pickup' ? 'In-store pickup' : order.delivery_zone_name || 'Delivery'}
                {order.delivery_fee > 0 ? ` · ${cedis(order.delivery_fee)}` : ' · Free'}
              </span>
            </div>
            <div className="bs-omg-item">
              <span className="bs-omg-label">Items</span>
              <span className="bs-omg-val">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {order.location && (
            <div className="bs-order-delivery-addr">
              <Icon name="pin" size={14} className="bs-ci" />
              <span>{order.location}</span>
            </div>
          )}

          <div className="bs-order-items-list">
            <p className="bs-order-items-head">Items ordered</p>
            {items.map((item, i) => (
              <div key={i} className="bs-order-item-row">
                <div className="bs-oir-cover">
                  <Icon name="book" size={18} style={{ color: 'var(--bs-navy)', opacity: 0.4 }} />
                </div>
                <div className="bs-oir-info">
                  <span className="bs-oir-name">{item.product_name}</span>
                  <span className="bs-oir-qty">Qty: {item.quantity}</span>
                </div>
                <span className="bs-oir-price">{cedis((item.unit_price || 0) * (item.quantity || 1))}</span>
              </div>
            ))}
          </div>

          {(order.payment_reference || order.notes) && (
            <div className="bs-order-notes">
              {order.payment_reference && (
                <p><span className="bs-billing-label">Payment ref:</span> <code>{order.payment_reference}</code></p>
              )}
              {order.notes && <p><span className="bs-billing-label">Notes:</span> {order.notes}</p>}
            </div>
          )}
        </div>

        <div className="bs-modal-foot">
          <button className="bs-btn bs-btn-outline-navy" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ─── Mini order card (used in AccountPage recent orders) ─────────────────────

const MiniOrderCard = ({ order, onOpen }) => {
  const itemCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const meta = STATUS_META[order.status] || { label: order.status || 'Unknown', color: '#6b7b8e' };
  return (
    <div className="bs-mini-order-card" style={{ '--badge-color': meta.color }}
      onClick={() => onOpen(order)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(order); }}>
      <div className="bs-moc-top">
        <div className="bs-moc-ref">{order.order_reference}</div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="bs-moc-bottom">
        <span className="bs-moc-meta">{fmtDate(order.created_at)} · {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
        <span className="bs-moc-total">{cedis(order.total_amount || 0)}</span>
      </div>
    </div>
  );
};

// ─── Horizontal order card (used in OrdersPage) ───────────────────────────────

const OrderCard = ({ order, onOpen }) => {
  const items = order.items || [];
  const itemCount = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const preview = items.slice(0, 2).map(i => i.product_name).join(', ');
  const extra = items.length > 2 ? ` +${items.length - 2} more` : '';

  return (
    <div className="bs-order-card" onClick={() => onOpen(order)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(order); }}>
      <div className="bs-oc-stripe" style={{ background: (STATUS_META[order.status] || {}).color || '#6b7b8e' }} />
      <div className="bs-oc-body">
        <div className="bs-oc-top">
          <div>
            <div className="bs-oc-ref">{order.order_reference}</div>
            <div className="bs-oc-date">{fmtDate(order.created_at)}</div>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="bs-oc-items" title={items.map(i => i.product_name).join(', ')}>
          <Icon name="book" size={13} className="bs-ci" style={{ opacity: 0.55, flexShrink: 0 }} />
          <span>{preview}{extra}</span>
        </div>
        <div className="bs-oc-foot">
          <span className="bs-oc-count">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          <span className="bs-oc-sep">·</span>
          <span className="bs-oc-method" style={{ textTransform: 'capitalize' }}>
            {order.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}
          </span>
          <span className="bs-oc-sep">·</span>
          <span className="bs-oc-pay" style={{ textTransform: 'capitalize' }}>
            {order.payment_provider || 'Paystack'}
          </span>
          <span className="bs-oc-total">{cedis(order.total_amount || 0)}</span>
        </div>
      </div>
      <div className="bs-oc-arrow"><Icon name="chevR" size={16} /></div>
    </div>
  );
};

// ─── Account page ─────────────────────────────────────────────────────────────

const useSession = () => {
  const [session, setSession] = React.useState(() => getDemoSession());
  React.useEffect(() => {
    const refresh = () => setSession(getDemoSession());
    window.addEventListener('rmx-session-sync', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('rmx-session-sync', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  React.useEffect(() => {
    let alive = true;
    syncSessionFromApi().then(s => { if (alive) setSession(s); });
    return () => { alive = false; };
  }, []);
  return session;
};

const AccountPage = ({ navigate }) => {
  const session = useSession();
  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOrder, setModalOrder] = React.useState(null);

  React.useEffect(() => {
    if (!session?.role || !isApiMode()) { setLoading(false); return; }
    api.fetchMyOrders('per_page=4&sort=newest').then(data => {
      setOrders(data.items || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [session?.role]);

  if (!session?.role) {
    return (
      <div className="bs-container bs-fade-page" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
        <div className="bs-empty-state">
          <div className="bs-empty-icon"><Icon name="user" size={38} /></div>
          <h2 className="bs-h2">Sign in to view your account</h2>
          <p className="bs-muted">Access your order history, billing information, and account settings.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('login')}>Sign In</button>
            <button className="bs-btn bs-btn-outline-navy" onClick={() => navigate('signup')}>Create Account</button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = [session.firstName, session.lastName].filter(Boolean).join(' ') || 'Account';
  const initials = session.initials || (
    [(session.firstName || '')[0], (session.lastName || '')[0]].filter(Boolean).join('').toUpperCase() || 'ME'
  );

  return (
    <div className="bs-fade-page">
      {/* Hero — white card with logo */}
      <div className="bs-account-hero">
        <div className="bs-container">
          <div className="bs-account-hero-card">
            <div className="bs-account-hero-user">
              <div className="bs-account-avatar-lg">
                {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials}
              </div>
              <div>
                <p className="bs-eyebrow" style={{ color: 'var(--bs-gold-on-light)', marginBottom: 6 }}>Your Account</p>
                <h1 className="bs-h1" style={{ margin: 0, fontSize: 'clamp(22px,3.5vw,32px)', color: 'var(--bs-navy)' }}>{displayName}</h1>
                <p className="bs-muted" style={{ marginTop: 6 }}>{session.email}</p>
              </div>
            </div>
            {/* Logo removed from account hero — prevents blurred watermark on mobile */}
          </div>
        </div>
      </div>

      <div className="bs-container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <div className="bs-account-layout">

          {/* Sidebar nav */}
          <aside className="bs-account-sidebar">
            <div className="bs-account-nav-card">
              <p className="bs-account-nav-label">Navigation</p>
              <button className="bs-account-nav-item active">
                <Icon name="user" size={16} /> Overview
              </button>
              <button className="bs-account-nav-item" onClick={() => navigate('orders')}>
                <Icon name="truck" size={16} /> All Orders
              </button>
              <button className="bs-account-nav-item" onClick={() => navigate('track')}>
                <Icon name="search" size={16} /> Track an Order
              </button>
              <button className="bs-account-nav-item" onClick={() => navigate('shop')}>
                <Icon name="shop" size={16} /> Continue Shopping
              </button>
              <div className="bs-account-nav-divider" />
              <button className="bs-account-nav-item bs-account-nav-signout" onClick={async () => {
                await signOut();
                navigate('home');
              }}>
                <Icon name="x" size={16} /> Sign Out
              </button>
            </div>
          </aside>

          {/* Main panels: billing left, orders right */}
          <div className="bs-account-panels">

            {/* Billing & contact */}
            <section className="bs-account-section">
              <h2 className="bs-h3" style={{ marginBottom: 20 }}>
                <Icon name="user" size={17} className="bs-ci" /> Billing & Contact
              </h2>
              <div className="bs-billing-grid">
                <div className="bs-billing-item">
                  <span className="bs-billing-label">Full Name</span>
                  <span className="bs-billing-val">{displayName}</span>
                </div>
                <div className="bs-billing-item">
                  <span className="bs-billing-label">Email Address</span>
                  <span className="bs-billing-val">{session.email}</span>
                </div>
                <div className="bs-billing-item">
                  <span className="bs-billing-label">Phone</span>
                  <span className="bs-billing-val">{session.phone || <em style={{ color: 'var(--bs-muted)', fontStyle: 'italic' }}>Not set</em>}</span>
                </div>
              </div>
              <p className="bs-muted" style={{ marginTop: 14, fontSize: '0.82rem' }}>
                To update your details, contact us at <a href="mailto:info@realmindxgh.com" style={{ color: 'var(--bs-gold-on-light)' }}>info@realmindxgh.com</a>.
              </p>
            </section>

            {/* Recent orders — 2×2 grid */}
            <section className="bs-account-section">
              <div className="bs-section-head-row" style={{ marginBottom: 20 }}>
                <h2 className="bs-h3" style={{ margin: 0, fontSize: '1.1rem' }}>
                  <Icon name="truck" size={17} className="bs-ci" /> Recent Orders
                </h2>
                {orders.length > 0 && (
                  <button className="bs-see-all" onClick={() => navigate('orders')}>
                    View All <Icon name="arrow" size={13} />
                  </button>
                )}
              </div>

              {loading ? (
                <div className="bs-mini-orders-grid">
                  {[1,2,3,4].map(i => <div key={i} className="bs-skeleton bs-skeleton-order" />)}
                </div>
              ) : orders.length === 0 ? (
                <div className="bs-account-empty">
                  <Icon name="truck" size={28} />
                  <p>No orders yet. <button className="bs-link-gold" onClick={() => navigate('shop')}>Start shopping</button></p>
                </div>
              ) : (
                <div className="bs-mini-orders-grid">
                  {orders.map(order => (
                    <MiniOrderCard key={order.id} order={order} onOpen={setModalOrder} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {modalOrder && <OrderDetailModal order={modalOrder} onClose={() => setModalOrder(null)} />}
    </div>
  );
};

// ─── Orders page ──────────────────────────────────────────────────────────────

const ORDER_STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'new', label: 'Placed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];
const ORDERS_PER_PAGE = 40; // 2 cols × 20 rows; paginate after this

const OrdersPage = ({ navigate }) => {
  const session = useSession();
  const [orders, setOrders] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [sort, setSort] = React.useState('newest');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [modalOrder, setModalOrder] = React.useState(null);

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 380);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    if (!session?.role || !isApiMode()) { setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams({ page, per_page: ORDERS_PER_PAGE, sort });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    api.fetchMyOrders(params.toString()).then(data => {
      setOrders(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    }).catch(() => setOrders([])).finally(() => setLoading(false));
  }, [session?.role, page, debouncedSearch, sort, statusFilter]);

  if (!session?.role) {
    return (
      <div className="bs-container bs-fade-page" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
        <div className="bs-empty-state">
          <div className="bs-empty-icon"><Icon name="truck" size={38} /></div>
          <h2 className="bs-h2">Sign in to view your orders</h2>
          <p className="bs-muted">You need to be signed in to access your order history.</p>
          <button className="bs-btn bs-btn-gold bs-btn-lg" style={{ marginTop: 16 }} onClick={() => navigate('login')}>Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-fade-page">
      {/* Page header */}
      <div className="bs-orders-hero">
        <div className="bs-container">
          <div className="bs-breadcrumb" style={{ marginBottom: 16 }}>
            <button className="bs-link-btn" onClick={() => navigate('account')}>My Account</button>
            <span className="bs-sep">/</span>
            <span className="bs-cur">All Orders</span>
          </div>
          <div className="bs-orders-hero-row">
            <div>
              <p className="bs-eyebrow">Order History</p>
              <h1 className="bs-h2" style={{ margin: 0 }}>All Orders</h1>
            </div>
            {total > 0 && (
              <span className="bs-orders-total-badge">
                {total} order{total !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bs-container" style={{ paddingTop: 32, paddingBottom: 80 }}>

        {/* Toolbar: search, filter, sort */}
        <div className="bs-orders-toolbar">
          <div className="bs-orders-search-wrap">
            <Icon name="search" size={16} className="bs-otsearch-icn" />
            <input
              className="bs-orders-search"
              type="search"
              placeholder="Search by reference, book title or product…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search orders"
            />
          </div>
          <select
            className="bs-orders-filter-select"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Filter by status"
          >
            {ORDER_STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="bs-orders-sort-select"
            value={sort}
            onChange={e => { setSort(e.target.value); setPage(1); }}
            aria-label="Sort orders"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="bs-orders-count">
            {total === 0 ? 'No orders found' : `Showing ${Math.min((page - 1) * ORDERS_PER_PAGE + 1, total)}–${Math.min(page * ORDERS_PER_PAGE, total)} of ${total} orders`}
          </p>
        )}

        {/* Orders grid — 2 columns of horizontal cards */}
        {loading ? (
          <div className="bs-orders-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bs-skeleton bs-skeleton-order-card" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bs-empty-state" style={{ marginTop: 48 }}>
            <div className="bs-empty-icon"><Icon name="truck" size={36} /></div>
            <h2>{debouncedSearch || statusFilter ? 'No matching orders' : 'No orders yet'}</h2>
            <p className="bs-muted">
              {debouncedSearch || statusFilter
                ? 'Try adjusting your search or filters.'
                : 'Your completed orders will appear here.'}
            </p>
            <button className="bs-btn bs-btn-gold" style={{ marginTop: 16 }} onClick={() => navigate('shop')}>
              Browse the Shop
            </button>
          </div>
        ) : (
          <div className="bs-orders-grid">
            {orders.map(order => (
              <OrderCard key={order.id} order={order} onOpen={setModalOrder} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="bs-pagination" style={{ marginTop: 40 }}>
            <button className="bs-page-btn pill" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <Icon name="chevL" size={15} /> Prev
            </button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} className={`bs-page-btn${page === i + 1 ? ' active' : ''}`} onClick={() => setPage(i + 1)}>
                {i + 1}
              </button>
            ))}
            <button className="bs-page-btn pill" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
              Next <Icon name="chevR" size={15} />
            </button>
          </div>
        )}
      </div>

      {modalOrder && <OrderDetailModal order={modalOrder} onClose={() => setModalOrder(null)} />}
    </div>
  );
};

export { AuthPage, ContactPage, InfoPage, BookshopLegalPage, AccountPage, OrdersPage };
