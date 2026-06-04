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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err?.data?.requires_verification) {
        setPendingVerificationEmail(err.data.email || form.email);
        setMessage('Enter the code we sent to your email before signing in.');
        return;
      }
      // Email already exists — switch to sign-in with helpful message
      const msg = err?.message || '';
      if (!isLogin && (err?.status === 409 || msg.toLowerCase().includes('already exists'))) {
        globalToast.info('You already have a RealMindX account. Sign in with your existing password.');
        setMessage('You already have a RealMindX account. Sign in below.');
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
        <div className="bs-auth-illo" style={{ display: bookshopHeroImage ? undefined : 'none' }}>
          <img
            src={bookshopHeroImage}
            alt="Books and stationery from the RealMindX Bookshop"
            onError={e => { e.target.closest('.bs-auth-illo').style.display = 'none'; }}
          />
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
            <form onSubmit={submit} noValidate>

          {!isLogin && (
            <div className="bs-field">
              <label>Full Name</label>
              <input placeholder="Ama Mensah" value={form.fullName} onChange={set('fullName')} />
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
            <input type="password" placeholder="Minimum 8 characters" value={form.password} onChange={set('password')} autoComplete={isLogin ? 'current-password' : 'new-password'} />
          </div>
          {!isLogin && (
            <div className="bs-field">
              <label>Confirm Password</label>
              <input type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
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
        <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:48, alignItems:'start' }} className="bs-legal-grid">
          {/* Sidebar */}
          <aside style={{ position:'sticky', top:80 }} className="bs-legal-sidebar">
            <p style={{ fontSize:'0.7rem', fontWeight:800, letterSpacing:'2px', textTransform:'uppercase', color:'var(--bs-navy)', opacity:0.5, marginBottom:12 }}>Sections</p>
            {sections.map(([heading], i) => (
              <button key={i} onClick={() => scrollTo(`bs-section-${i}`)}
                style={{
                  display:'block', width:'100%', textAlign:'left', background:'none', border:'none',
                  padding:'6px 0 6px 10px', cursor:'pointer', fontSize:'0.78rem',
                  borderLeft: active === `bs-section-${i}` ? '2px solid var(--bs-gold)' : '2px solid transparent',
                  fontWeight: active === `bs-section-${i}` ? 700 : 400,
                  color: active === `bs-section-${i}` ? 'var(--bs-navy)' : 'var(--bs-muted)',
                  transition:'all 0.2s',
                }}>
                <span style={{ opacity:0.4, marginRight:6 }}>{String(i+1).padStart(2,'0')}</span>{heading}
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

export { AuthPage, ContactPage, InfoPage, BookshopLegalPage };
