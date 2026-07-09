import React from 'react';
import { Icon, LoadingState, cedis } from './shared.jsx';
import { useCart } from './chrome.jsx';
import { submitMessage } from '../src/lib/managedContent.js';
import { canUseLocalFallback, usePublicSettings, useSiteCopyState } from '../src/lib/siteContent.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import {
  completeTwoFactorLogin,
  confirmPasswordReset,
  requestPasswordReset,
  resendVerificationOtp,
  signIn,
  signOut,
  signUp,
  syncSessionFromApi,
  verifyEmailOtp,
} from '../src/lib/authClient.js';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import globalToast from '../src/lib/toast.js';
import { consumeBookshopAuthReturn } from './authReturn.js';
import { API_BASE, api, isApiMode } from '../src/lib/apiClient.js';
import { normalizeOrderStatus, orderStatusLabel } from '../src/lib/orderStatus.js';
import VerifiedContactField from '../src/lib/VerifiedContactField.jsx';
import { bookshopPathForRoute } from './urls.js';
const bookshopHeroImage = '/bookshop-og.png';

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;

const GoogleLogo = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09A6.9 6.9 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11.9 11.9 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const FacebookLogo = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
  </svg>
);

const BookshopPasswordField = React.forwardRef(({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  minLength,
}, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <label className="bs-field">
      <span>{label}</span>
      <div className="bs-password-field">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          className="bs-password-toggle"
          onClick={() => setVisible(current => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
    </label>
  );
});
BookshopPasswordField.displayName = 'BookshopPasswordField';

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
  const [pendingTwoFactorEmail, setPendingTwoFactorEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [forgotMode, setForgotMode] = React.useState(false);
  const [resetRequested, setResetRequested] = React.useState(false);
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

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    const provider = params.get('provider');
    const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'social';
    if (oauthError === 'terms_required') {
      setErr('Please accept the Bookshop Terms of Service and Bookshop Privacy Policy before creating a new social account.');
      window.setTimeout(() => termsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260);
    } else if (oauthError === 'account_not_found_social') {
      setErr(`No RealMindX account exists yet for that ${providerLabel} email. Create an account below, accept the terms, then continue with ${providerLabel}.`);
      window.setTimeout(() => termsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260);
    } else if (oauthError === 'provider_unavailable') {
      setErr('That social sign-in provider is temporarily unavailable. Please use email and password.');
    } else if (oauthError?.endsWith('_failed')) {
      setErr('Social sign-in could not be completed. Please try again or use email and password.');
    }
  }, []);

  const startSocialAuth = provider => {
    setError('');
    if (!isLogin && !form.acceptedTerms) {
      showTermsProblem();
      return;
    }
    const query = new URLSearchParams({
      surface: 'bookshop',
      intent: isLogin ? 'login' : 'signup',
      next: '/account',
    });
    if (!isLogin) query.set('accepted_terms', '1');
    window.location.href = `${API_BASE || '/api'}/auth/${provider}?${query.toString()}`;
  };

  const requestReset = async event => {
    event.preventDefault();
    setError('');
    if (!form.email.trim()) {
      setErr('Enter the email address connected to your RealMindX account.');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(form.email, { surface: 'bookshop' });
      setResetRequested(true);
    } catch (err) {
      setErr(err?.message || 'Could not send a reset link.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signIn({ email: form.email, password: form.password, role: 'user', remember: form.remember });
        globalToast.success('Signed in to the bookshop.');
        navigate(consumeBookshopAuthReturn('account'));
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
      if (err?.code === 'requires_two_factor' || err?.data?.requires_two_factor) {
        setPendingTwoFactorEmail(err.data?.email || form.email);
        setOtp('');
        globalToast.info(err.data?.message || 'Enter the security code sent to your email.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
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

  const verifyTwoFactor = async event => {
    event.preventDefault();
    setError('');
    if (otp.replace(/\D/g, '').length !== 6) {
      setErr('Enter the 6 digit security code from your email.', otpRef);
      return;
    }
    setLoading(true);
    try {
      await completeTwoFactorLogin({ otp, role: 'user' });
      setPendingTwoFactorEmail('');
      setOtp('');
      globalToast.success('Signed in securely to the bookshop.');
      navigate(consumeBookshopAuthReturn('account'));
    } catch (err) {
      setErr(err?.message || 'Could not verify that security code.', otpRef);
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
          <h2 className="bs-h2">{pendingTwoFactorEmail ? 'Security Check' : pendingVerificationEmail ? 'Verify Your Email' : forgotMode ? 'Reset Password' : isLogin ? 'Sign In' : 'Create Account'}</h2>
          <p className="bs-sub">
            {pendingTwoFactorEmail
              ? `Enter the 6 digit security code sent to ${pendingTwoFactorEmail}.`
              : pendingVerificationEmail
              ? `Enter the 6 digit code sent to ${pendingVerificationEmail}.`
              : forgotMode
                ? 'Enter your account email and we will send you a secure reset link.'
                : isLogin ? 'Enter your details to continue.' : 'It only takes a minute.'}
          </p>
          {pendingTwoFactorEmail ? (
            <form onSubmit={verifyTwoFactor}>
              <div className="bs-field">
                <label>Security Code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  ref={otpRef}
                  value={otp}
                  onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                />
              </div>
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" type="submit" disabled={loading}>
                {loading ? 'Checking...' : 'Complete Sign In'}
              </button>
              <div className="bs-auth-alt">
                Code expired? <button type="button" className="bs-link-button" onClick={() => { setPendingTwoFactorEmail(''); setOtp(''); }} disabled={loading}>Sign in again</button>
              </div>
            </form>
          ) : pendingVerificationEmail ? (
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
          ) : forgotMode ? (
            resetRequested ? (
              <div className="bs-auth-reset-success" role="status">
                <span><Icon name="mail" size={24} /></span>
                <h3>Check your email</h3>
                <p>If an account exists for <strong>{form.email}</strong>, a reset link has been sent. The link expires in one hour.</p>
                <button type="button" className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" onClick={() => { setForgotMode(false); setResetRequested(false); }}>
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={requestReset} noValidate>
                <div className="bs-field">
                  <label>Email</label>
                  <input type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} autoComplete="email" required />
                </div>
                {error && <p className="bs-auth-error" role="alert">{error}</p>}
                <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" type="submit" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <div className="bs-auth-alt">
                  <button type="button" className="bs-link-button bs-link-gold" onClick={() => setForgotMode(false)}>Back to Sign In</button>
                </div>
              </form>
            )
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
          <BookshopPasswordField
            ref={passwordRef}
            label="Password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={set('password')}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && (
            <BookshopPasswordField
              ref={confirmRef}
              label="Confirm Password"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              autoComplete="new-password"
            />
          )}

          {isLogin ? (
            <div className="bs-auth-row">
              <label className="bs-checkbox-line" style={{ margin: 0 }}>
                <input type="checkbox" checked={form.remember} onChange={set('remember')} />
                <span className="bs-cbox"><Icon name="check" size={12} /></span>
                Remember me
              </label>
              <a href={hrefForRoute('login')} className="bs-link-gold" onClick={(event) => { event.preventDefault(); setError(''); setResetRequested(false); setForgotMode(true); }}>
                Forgot password?
              </a>
            </div>
          ) : (
            <>
            <label className="bs-checkbox-line" ref={termsRef} tabIndex={-1}>
              <input type="checkbox" checked={form.acceptedTerms} onChange={set('acceptedTerms')} />
              <span className="bs-cbox"><Icon name="check" size={12} /></span>
              <span>I agree to the <a className="bs-link-gold" href={hrefForRoute('terms')}>Bookshop Terms of Service</a> and <a className="bs-link-gold" href={hrefForRoute('privacy')}>Bookshop Privacy Policy</a>.</span>
            </label>
            <TurnstileField key={turnstileKey} className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
            </>
          )}

          {error && <p className="bs-auth-error" role="alert">{error}</p>}

          <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" type="submit" disabled={loading}>
            {loading ? (isLogin ? 'Signing in...' : 'Creating account...') : isLogin ? 'Sign In' : 'Create Account'}
          </button>

          <div className="bs-auth-alt">
            {isLogin ? (
              <>Do not have an account? <a href={hrefForRoute('signup')} className="bs-link-gold" onClick={(event) => { event.preventDefault(); navigate('signup'); }}>Sign Up</a></>
            ) : (
              <>Already have an account? <a href={hrefForRoute('login')} className="bs-link-gold" onClick={(event) => { event.preventDefault(); navigate('login'); }}>Sign In</a></>
            )}
          </div>
          <div className="bs-auth-divider"><span>{isLogin ? 'or sign in with' : 'or sign up with'}</span></div>
          <div className="bs-auth-social-grid">
            <button type="button" className="bs-auth-social-btn" onClick={() => startSocialAuth('google')}>
              <GoogleLogo /> <span>Google</span>
            </button>
            <button type="button" className="bs-auth-social-btn" onClick={() => startSocialAuth('facebook')}>
              <FacebookLogo /> <span>Facebook</span>
            </button>
          </div>
        </form>
          )}
        </div>
      </div>
    </div>
  );
};

const BookshopResetPasswordPage = ({ navigate }) => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This password reset link is invalid or incomplete.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset({ token, password });
      setSuccess(true);
      globalToast.success('Your password has been updated.');
    } catch (err) {
      setError(err?.message || 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bs-auth bs-fade-page">
      <div className="bs-auth-brand">
        <span className="bs-eyebrow">RealMindX Bookshop</span>
        <div className="bs-auth-illo"><img src={bookshopHeroImage} alt="RealMindX Bookshop" /></div>
        <h1 className="bs-h1">Secure your account.</h1>
        <p>Your new password will work for both RealMindX Education and the RealMindX Bookshop.</p>
      </div>
      <div className="bs-auth-form-wrap">
        <div className="bs-auth-form">
          <h2 className="bs-h2">{success ? 'Password Updated' : 'Create a New Password'}</h2>
          <p className="bs-sub">{success ? 'You can now sign in with your new password.' : 'Use at least 8 characters and choose a password you do not use elsewhere.'}</p>
          {success ? (
            <button type="button" className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" onClick={() => navigate('login')}>Continue to Sign In</button>
          ) : (
            <form onSubmit={submit} noValidate>
              <BookshopPasswordField label="New Password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" placeholder="Minimum 8 characters" required />
              <BookshopPasswordField label="Confirm New Password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Repeat your new password" required />
              {error && <p className="bs-auth-error" role="alert">{error}</p>}
              <button className="bs-btn bs-btn-gold bs-btn-lg bs-btn-block" type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
              <div className="bs-auth-alt"><button type="button" className="bs-link-button bs-link-gold" onClick={() => navigate('login')}>Back to Sign In</button></div>
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
        <a href={hrefForRoute('home')} onClick={(event) => { event.preventDefault(); navigate('home'); }}>Home</a>
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
          <div className="bs-table-scroll">
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
    </div>
  );
};

const BOOKSHOP_ABOUT_STORY_FALLBACK = "RealMindX Bookshop is the retail arm of RealMindX Education Limited - Ghana's comprehensive educational services provider. We exist to put the right learning materials into the hands of every student, parent and teacher, at prices that make sense.\n\nFrom curriculum titles to past questions, readers and stationery, every item we stock is chosen with one question in mind: does this help a Ghanaian learner thrive?";
const BOOKSHOP_INVENTORY_FALLBACK = 'Textbooks for multiple curricula, BECE and WASSCE past questions, graded readers, exercise books, mathematical sets, art supplies and everyday stationery are available at both wholesale and retail prices.';
const BOOKSHOP_DELIVERY_FALLBACK = 'Orders are dispatched as quickly as stock and payment allow. Delivery fees are calculated at checkout based on the selected location, and free pickup is available at our Dome Pillar 2 shop.';
const BOOKSHOP_RETURNS_FALLBACK = "Unused items in their original condition may be returned within 7 days for an exchange or store credit. Damaged or incorrect items are replaced free of charge - simply reach out on WhatsApp and we'll make it right.";

const CopyParagraphs = ({ value }) => String(value || '')
  .split(/\n\s*\n/)
  .filter(Boolean)
  .map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>);

const InfoPage = ({ navigate }) => {
  const settings = usePublicSettings();
  const { copy: siteCopy, loading: copyLoading } = useSiteCopyState({ waitForApi: true });
  const allowLocalFallback = canUseLocalFallback();
  const copyValue = (key, fallback, empty = 'This information is currently unavailable.') =>
    siteCopy[key] || (allowLocalFallback ? fallback : empty);

  if (copyLoading) {
    return (
      <div className="bs-container bs-fade-page">
        <LoadingState title="Loading bookshop information" body="Getting the latest delivery, return, and shop details." />
      </div>
    );
  }

  return (
    <div className="bs-fade-page">
      <div className="bs-info-hero">
        <div className="bs-container">
          <span className="bs-eyebrow">About</span>
          <h1 className="bs-h1">{siteCopy.bookshop_about_title || 'About RealMindX Bookshop.'}</h1>
        </div>
      </div>
      <div className="bs-container">
        <div className="bs-info-layout">
          <div>
            <div className="bs-info-section">
              <h2 className="bs-h3">Our Story</h2>
              <CopyParagraphs value={copyValue('bookshop_about_story', BOOKSHOP_ABOUT_STORY_FALLBACK)} />
            </div>
            <div className="bs-info-section">
              <h2 className="bs-h3">What We Sell</h2>
              <CopyParagraphs value={copyValue('bookshop_about_inventory', BOOKSHOP_INVENTORY_FALLBACK)} />
            </div>
            <div className="bs-info-section">
              <h2 className="bs-h3">Delivery Information</h2>
              <CopyParagraphs value={copyValue('bookshop_pdp_delivery_info', BOOKSHOP_DELIVERY_FALLBACK)} />
            </div>
            <div className="bs-info-section">
              <h2 className="bs-h3">Return Policy</h2>
              <CopyParagraphs value={copyValue('bookshop_pdp_return_policy', BOOKSHOP_RETURNS_FALLBACK)} />
            </div>
            <button className="bs-btn bs-btn-gold bs-btn-lg" onClick={() => navigate('shop')}>Start Shopping <Icon name="arrow" size={16} /></button>
          </div>

          <aside className="bs-info-sidebar">
            <h4>Quick Contact</h4>
            <div className="bs-contact-row"><Icon name="pin" size={18} className="bs-ci" /><div><div className="bs-cr-label">Address</div><div className="bs-cr-val">{settings.contact_address}</div></div></div>
            <div className="bs-contact-row"><Icon name="phone" size={18} className="bs-ci" /><div><div className="bs-cr-label">Phone</div><div className="bs-cr-val">{settings.contact_phone_1}</div></div></div>
            <div className="bs-contact-row"><Icon name="mail" size={18} className="bs-ci" /><div><div className="bs-cr-label">Email</div><div className="bs-cr-val">{settings.contact_email}</div></div></div>
            <h4 style={{ marginTop: 24 }}>Opening Hours</h4>
            <div className="bs-table-scroll">
              <table className="bs-hours-table" style={{ color: 'var(--bs-text)' }}>
                <tbody>
                  <tr><td colSpan="2">{settings.working_hours_weekday}</td></tr>
                  <tr><td colSpan="2">{settings.working_hours_saturday}</td></tr>
                </tbody>
              </table>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const BOOKSHOP_PRIVACY_SECTIONS = [
  ['Who We Are', 'The RealMindX Bookshop at new.realmindxgh.com/bookshop is operated by RealMindX Education Limited, an education company based in Ghana. This Privacy Policy explains how we collect, use, store, and protect your personal information when you shop with us. For questions about this policy, contact us at info@realmindxgh.com.'],
  ['Information We Collect', 'If you register an account we collect your name, email address, and password. If you sign in with Google or Facebook we receive your name and email from those providers only. When you place an order we collect your full name, delivery address, phone number, email address, order history, products purchased, quantities, prices, delivery method, and selected payment method. Online payment processing is handled by Paystack. We do not store your card number, CVV, or mobile money PIN. For online payments, we receive and store a payment reference number and confirmation of payment status from Paystack. If you purchase without registering, we collect the same delivery and contact information linked to your order. If you contact us about an order or send an enquiry, we retain that communication. We collect standard web access data including IP address, browser type, device information, and pages viewed for security monitoring. If you submit a product review, we retain your review text with your account name and the date.'],
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
  ['Contact', 'RealMindX Bookshop\nRealMindX Education Limited\ninfo@realmindxgh.com\n+233 55 803 9190\nDome Pillar 2, Accra, Ghana.'],
];

const BOOKSHOP_TERMS_SECTIONS = [
  ['Agreement', 'These Terms and Conditions govern your use of the RealMindX Bookshop and any purchases you make through it. By using the bookshop or placing an order, you agree to these terms. The bookshop is operated by RealMindX Education Limited, a company registered in Ghana. References to "we", "us", "our", or "the bookshop" refer to RealMindX Education Limited operating the RealMindX Bookshop.'],
  ['Products', 'We sell educational books, textbooks, stationery, and learning materials primarily for the Ghanaian curriculum. We make every reasonable effort to ensure product information is accurate. Images of products are representative. Actual product appearance including cover editions may vary where a publisher has released an updated edition. We reserve the right to limit quantities, correct pricing errors, and withdraw any product from sale at any time without notice.'],
  ['Pricing', 'All prices are displayed in Ghana Cedis inclusive of applicable taxes. Delivery fees are additional and calculated at checkout. Prices are subject to change without notice. The price you pay is the price confirmed at the time you complete checkout.'],
  ['Orders', 'An order is placed when you complete checkout and receive an order reference number. Acceptance occurs when we confirm your order is being processed. You will receive an order confirmation email from bookshop@send.realmindxgh.com after successful payment. We reserve the right to cancel any order due to stock unavailability, pricing errors, suspected fraud, or inability to process payment. If we cancel your order after payment has been taken, you will receive a full refund. You may cancel your order before it has been dispatched by contacting us immediately at info@realmindxgh.com or +233 55 803 9190. Once an order has been dispatched it cannot be cancelled and the return policy applies.'],
  ['Payment', 'You may pay online through Paystack or choose payment on delivery where that option is available. Online payments accept mobile money and debit or credit cards. We do not store your card number or mobile money credentials. Payment-on-delivery orders are registered as unpaid until payment is collected. If an online payment fails but your account has been debited, contact us immediately with your bank reference and we will investigate and resolve within three working days.'],
  ['Delivery', 'We deliver to addresses across Ghana. Delivery fees are calculated at checkout based on your location zone. Orders are dispatched as quickly as stock and payment allow, and free pickup is available at our location at Dome Pillar 2, Accra. When your order is ready for pickup we will notify you by SMS and email. Orders not collected within seven days of the pickup notification will be returned to stock and a refund issued. Once your order is handed to the delivery agent or collected by you, responsibility for the items passes to you.'],
  ['Returns and Refunds', 'If you receive an item that is damaged or different from what you ordered, contact us within 48 hours of delivery at info@realmindxgh.com with your order reference and photographs of the issue. We will arrange a replacement or full refund at no additional cost to you. We do not accept returns for change of mind on physical books and educational materials unless the item is sealed and unused. Return delivery costs are the responsibility of the buyer. Approved refunds are processed back to your original payment method through Paystack within five working days.'],
  ['Stock Availability', 'Products are sold subject to availability. If an item in your order becomes unavailable after you have placed the order and paid, we will contact you to offer a substitution or full refund for the unavailable item. The remainder of your order will be fulfilled as normal.'],
  ['User Accounts', 'You may purchase as a guest or with a registered account. A registered account allows you to track orders, view order history, and receive personalised updates. Your bookshop account and main site account share the same login credentials.'],
  ['Product Reviews', 'Registered users may submit product reviews. Reviews must be honest, relevant to the product, and free from offensive, defamatory, or misleading content. We reserve the right to remove reviews that violate these standards or that appear to be fraudulent. We do not remove legitimate negative reviews.'],
  ['Intellectual Property', 'All content on the bookshop website including text, images, product descriptions, logos, and design is the intellectual property of RealMindX Education Limited or its suppliers. You may not reproduce bookshop content without our prior written consent.'],
  ['Limitation of Liability', 'To the fullest extent permitted by Ghanaian law, our liability for any claim arising from a bookshop purchase is limited to the value of the specific item or items in dispute. We are not liable for indirect losses, loss of data, loss of profit, or consequential damages arising from your use of the bookshop or any purchase made through it.'],
  ['Contact', 'RealMindX Bookshop\nRealMindX Education Limited\ninfo@realmindxgh.com\n+233 55 803 9190\nDome Pillar 2, Accra, Ghana.\nMonday to Friday: 7am to 5pm\nSaturday: 10am to 2pm'],
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
              <a href={hrefForRoute('home')} className="bs-btn bs-btn-navy">Back to Bookshop</a>
              <a href={hrefForRoute('contact')} className="bs-btn bs-btn-outline-navy">Contact Us</a>
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
  shipped:    { label: 'Shipped',     color: '#f97316' },
  complete:   { label: 'Delivered',   color: '#16a34a' },
  cancelled:  { label: 'Cancelled',   color: '#dc2626' },
};

const OrderStatusBadge = ({ status }) => {
  const normalized = normalizeOrderStatus(status);
  const meta = STATUS_META[normalized] || { label: orderStatusLabel(normalized || 'unknown'), color: '#6b7b8e' };
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
          <button className="bs-modal-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
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
  const items = order.items || [];
  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const normalizedStatus = normalizeOrderStatus(order.status);
  const meta = STATUS_META[normalizedStatus] || { label: orderStatusLabel(normalizedStatus || 'unknown'), color: '#6b7b8e' };
  const itemPreview = items.slice(0, 2).map(item => item.product_name).filter(Boolean).join(', ');
  const extraItems = items.length > 2 ? ` +${items.length - 2} more` : '';
  return (
    <button
      type="button"
      className="bs-mini-order-card"
      style={{ '--badge-color': meta.color }}
      onClick={() => onOpen(order)}
      aria-label={`View order ${order.order_reference}`}
    >
      <div className="bs-moc-main">
        <span className="bs-moc-label">Order</span>
        <span className="bs-moc-ref">{order.order_reference}</span>
        <span className="bs-moc-meta">{fmtDate(order.created_at)} · {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
        {itemPreview && <span className="bs-moc-items">{itemPreview}{extraItems}</span>}
      </div>
      <div className="bs-moc-summary">
        <OrderStatusBadge status={order.status} />
        <span className="bs-moc-total">{cedis(order.total_amount || 0)}</span>
        <span className="bs-moc-view">Details <Icon name="chevR" size={13} /></span>
      </div>
    </button>
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
      <div className="bs-oc-stripe" style={{ background: (STATUS_META[normalizeOrderStatus(order.status)] || {}).color || '#6b7b8e' }} />
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
            {order.payment_method === 'cash_on_delivery' ? 'Pay on delivery' : order.payment_provider || 'Paystack'}
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

const AccountSidebar = ({
  navigate,
  active = 'overview',
  onSavedDetails,
  onSecurity,
}) => (
  <aside className="bs-account-ref-sidebar">
    <nav aria-label="My account">
      <p>My Account</p>
      <button className={active === 'overview' ? 'active' : ''} type="button" onClick={() => navigate('account')}>
        <Icon name="home" size={16} /> Overview
      </button>
      <button className={active === 'orders' ? 'active' : ''} type="button" onClick={() => navigate('orders')}>
        <Icon name="truck" size={16} /> Orders
      </button>
      <button className={active === 'track' ? 'active' : ''} type="button" onClick={() => navigate('track')}>
        <Icon name="search" size={16} /> Track Order
      </button>
      <button type="button" onClick={() => (onSavedDetails ? onSavedDetails() : navigate('account'))}>
        <Icon name="pin" size={16} /> Saved Details
      </button>
      <button type="button" onClick={() => (onSecurity ? onSecurity() : navigate('account'))}>
        <Icon name="shield" size={16} /> Security
      </button>
      <div className="bs-account-ref-nav-divider" />
      <button className="signout" type="button" onClick={async () => {
        await signOut();
        navigate('home');
      }}>
        <Icon name="logout" size={16} /> Sign Out
      </button>
    </nav>
  </aside>
);

const LegacyAccountPage = ({ navigate }) => {
  const session = useSession();
  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOrder, setModalOrder] = React.useState(null);
  const [editingName, setEditingName] = React.useState(false);
  const [nameForm, setNameForm] = React.useState({ firstName: '', lastName: '' });
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState('');

  React.useEffect(() => {
    if (!session?.role || !isApiMode()) { setLoading(false); return; }
    api.fetchMyOrders('per_page=4&sort=newest').then(data => {
      setOrders(data.items || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [session?.role]);

  React.useEffect(() => {
    setNameForm({
      firstName: session?.firstName || '',
      lastName: session?.lastName || '',
    });
  }, [session?.firstName, session?.lastName]);

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
  const refreshAccount = async () => {
    await syncSessionFromApi();
  };
  const saveName = async event => {
    event.preventDefault();
    setNameError('');
    if (!nameForm.firstName.trim()) {
      setNameError('First name is required.');
      return;
    }
    setNameSaving(true);
    try {
      if (isApiMode()) {
        await api.updateAccount({
          first_name: nameForm.firstName.trim(),
          last_name: nameForm.lastName.trim(),
        });
      }
      await refreshAccount();
      setEditingName(false);
      globalToast.success('Account name updated.');
    } catch (error) {
      setNameError(error.message || 'Could not update your name.');
    } finally {
      setNameSaving(false);
    }
  };

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
                <p className="bs-account-kicker">RealMindX account</p>
                <h1 className="bs-h1 bs-account-title">{displayName}</h1>
                <div className="bs-account-hero-meta">
                  <span><Icon name="mail" size={14} /> {session.email}</span>
                  <span className={session.emailVerified ? 'is-verified' : ''}>
                    <Icon name={session.emailVerified ? 'check' : 'shield'} size={14} />
                    {session.emailVerified ? 'Email verified' : 'Verification needed'}
                  </span>
                </div>
              </div>
            </div>
            <button className="bs-account-hero-action" type="button" onClick={() => navigate('shop')}>
              Continue shopping <Icon name="arrow" size={15} />
            </button>
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
                <Icon name="logout" size={16} /> Sign Out
              </button>
            </div>
          </aside>

          {/* Main panels: billing left, orders right */}
          <div className="bs-account-panels">

            {/* Billing & contact */}
            <section className="bs-account-section bs-profile-control-card">
              <div className="bs-profile-card-heading">
                <div>
                  <p className="bs-account-section-kicker">Personal details</p>
                  <h2 className="bs-h3">Profile & security</h2>
                </div>
                <span className="bs-profile-security-mark"><Icon name="shield" size={18} /> Protected</span>
              </div>

              <div className="bs-profile-name-block">
                <div className="bs-profile-field-head">
                  <div>
                    <span className="bs-billing-label">Full name</span>
                    {!editingName && <strong className="bs-billing-val">{displayName}</strong>}
                  </div>
                  {!editingName && (
                    <button type="button" className="bs-profile-text-action" onClick={() => setEditingName(true)}>Edit</button>
                  )}
                </div>
                {editingName && (
                  <form className="bs-profile-name-form" onSubmit={saveName}>
                    <div className="bs-field-row">
                      <label className="bs-field">
                        <span>First name</span>
                        <input value={nameForm.firstName} onChange={event => setNameForm(prev => ({ ...prev, firstName: event.target.value }))} autoFocus />
                      </label>
                      <label className="bs-field">
                        <span>Last name</span>
                        <input value={nameForm.lastName} onChange={event => setNameForm(prev => ({ ...prev, lastName: event.target.value }))} />
                      </label>
                    </div>
                    {nameError && <p className="verified-contact-feedback is-error">{nameError}</p>}
                    <div className="bs-profile-form-actions">
                      <button className="bs-btn bs-btn-navy" type="submit" disabled={nameSaving}>{nameSaving ? 'Saving...' : 'Save name'}</button>
                      <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => setEditingName(false)}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>

              <VerifiedContactField field="email" value={session.email} verified={session.emailVerified} onUpdated={refreshAccount} />
              <VerifiedContactField field="phone" value={session.phone} verified={session.phoneVerified} onUpdated={refreshAccount} />

              <div className="bs-profile-security-note">
                <Icon name="lock" size={16} />
                Email and phone changes are applied only after the code sent to the new contact is verified.
              </div>
            </section>

            {/* Recent orders */}
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

const ExperimentalAccountPage = ({ navigate }) => {
  const session = useSession();
  const [orders, setOrders] = React.useState([]);
  const [orderCount, setOrderCount] = React.useState(0);
  const [checkoutDetails, setCheckoutDetails] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOrder, setModalOrder] = React.useState(null);
  const [editingName, setEditingName] = React.useState(false);
  const [nameForm, setNameForm] = React.useState({ firstName: '', lastName: '' });
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState('');
  const [deletingDetailId, setDeletingDetailId] = React.useState('');

  React.useEffect(() => {
    setNameForm({
      firstName: session?.firstName || '',
      lastName: session?.lastName || '',
    });
  }, [session?.firstName, session?.lastName]);

  React.useEffect(() => {
    if (!session?.role || !isApiMode()) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    Promise.allSettled([
      api.fetchMyOrders('per_page=4&sort=newest'),
      api.fetchCheckoutDetails(),
    ]).then(([ordersResult, detailsResult]) => {
      if (!alive) return;
      if (ordersResult.status === 'fulfilled') {
        setOrders(ordersResult.value?.items || []);
        setOrderCount(Number(ordersResult.value?.total || ordersResult.value?.items?.length || 0));
      }
      if (detailsResult.status === 'fulfilled') {
        setCheckoutDetails(detailsResult.value?.items || []);
      }
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [session?.role]);

  if (!session?.role) {
    return (
      <div className="bs-container bs-fade-page" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
        <div className="bs-empty-state">
          <div className="bs-empty-icon"><Icon name="user" size={38} /></div>
          <h2 className="bs-h2">Sign in to view your account</h2>
          <p className="bs-muted">Access your order history, checkout details, and account settings.</p>
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
  const profileReady = Boolean(session.emailVerified && session.phone && checkoutDetails.length);
  const refreshAccount = async () => {
    await syncSessionFromApi();
  };
  const saveName = async event => {
    event.preventDefault();
    setNameError('');
    if (!nameForm.firstName.trim()) {
      setNameError('First name is required.');
      return;
    }
    setNameSaving(true);
    try {
      if (isApiMode()) {
        await api.updateAccount({
          first_name: nameForm.firstName.trim(),
          last_name: nameForm.lastName.trim(),
        });
      }
      await refreshAccount();
      setEditingName(false);
      globalToast.success('Account name updated.');
    } catch (error) {
      setNameError(error.message || 'Could not update your name.');
    } finally {
      setNameSaving(false);
    }
  };
  const deleteCheckoutDetail = async detail => {
    if (!detail?.can_delete || !isApiMode()) return;
    setDeletingDetailId(String(detail.id));
    try {
      await api.deleteCheckoutDetails(detail.id);
      setCheckoutDetails(prev => prev.filter(item => String(item.id) !== String(detail.id)));
      globalToast.success('Saved checkout details removed.');
    } catch (error) {
      globalToast.error(error.message || 'Could not remove those checkout details.');
    } finally {
      setDeletingDetailId('');
    }
  };

  return (
    <div className="bs-fade-page bs-account-v2-page">
      <section className="bs-account-v2-hero">
        <div className="bs-container">
          <div className="bs-account-v2-hero-card">
            <div className="bs-account-v2-identity">
              <div className="bs-account-v2-avatar">
                {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials}
              </div>
              <div className="bs-account-v2-identity-copy">
                <span className="bs-account-v2-eyebrow">RealMindX Bookshop account</span>
                <h1>{displayName}</h1>
                <div className="bs-account-v2-meta">
                  <span><Icon name="mail" size={14} /> {session.email}</span>
                  <span className={session.emailVerified ? 'is-verified' : 'needs-attention'}>
                    <Icon name={session.emailVerified ? 'check' : 'shield'} size={14} />
                    {session.emailVerified ? 'Email verified' : 'Verification needed'}
                  </span>
                </div>
              </div>
            </div>
            <div className="bs-account-v2-hero-side">
              <div className="bs-account-v2-stats" aria-label="Account summary">
                <div><strong>{orderCount}</strong><span>Orders</span></div>
                <div><strong>{checkoutDetails.length}</strong><span>Checkout sets</span></div>
                <div><strong>{profileReady ? 'Ready' : 'Review'}</strong><span>Profile</span></div>
              </div>
              <button className="bs-account-v2-shop-btn" type="button" onClick={() => navigate('shop')}>
                Continue shopping <Icon name="arrow" size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="bs-container bs-account-v2-container">
        <div className="bs-account-v2-layout">
          <aside className="bs-account-v2-sidebar">
            <nav className="bs-account-v2-nav" aria-label="Account navigation">
              <p>My account</p>
              <button className="active"><Icon name="user" size={16} /> Overview</button>
              <button onClick={() => navigate('orders')}><Icon name="truck" size={16} /> All Orders</button>
              <button onClick={() => navigate('track')}><Icon name="search" size={16} /> Track an Order</button>
              <button onClick={() => navigate('checkout')}><Icon name="pin" size={16} /> Checkout Details</button>
              <button onClick={() => navigate('shop')}><Icon name="shop" size={16} /> Continue Shopping</button>
              <div className="bs-account-v2-nav-divider" />
              <button className="is-signout" onClick={async () => {
                await signOut();
                navigate('home');
              }}>
                <Icon name="logout" size={16} /> Sign Out
              </button>
            </nav>
            <div className="bs-account-v2-help">
              <span><Icon name="shield" size={18} /></span>
              <strong>Your details stay protected</strong>
              <p>Contact changes require verification before they take effect.</p>
            </div>
          </aside>

          <main className="bs-account-v2-main">
            <div className="bs-account-v2-top-grid">
              <section className="bs-account-v2-card bs-account-v2-profile">
                <div className="bs-account-v2-card-head">
                  <div>
                    <span className="bs-account-v2-card-kicker">Personal details</span>
                    <h2>Profile & contact</h2>
                  </div>
                  <span className="bs-account-v2-status"><Icon name="shield" size={15} /> Protected</span>
                </div>

                <div className="bs-account-v2-name-block">
                  <div className="bs-profile-field-head">
                    <div>
                      <span className="bs-billing-label">Full name</span>
                      {!editingName && <strong className="bs-billing-val">{displayName}</strong>}
                    </div>
                    {!editingName && (
                      <button type="button" className="bs-account-v2-text-btn" onClick={() => setEditingName(true)}>Edit</button>
                    )}
                  </div>
                  {editingName && (
                    <form className="bs-profile-name-form" onSubmit={saveName}>
                      <div className="bs-field-row">
                        <label className="bs-field">
                          <span>First name</span>
                          <input value={nameForm.firstName} onChange={event => setNameForm(prev => ({ ...prev, firstName: event.target.value }))} autoFocus />
                        </label>
                        <label className="bs-field">
                          <span>Last name</span>
                          <input value={nameForm.lastName} onChange={event => setNameForm(prev => ({ ...prev, lastName: event.target.value }))} />
                        </label>
                      </div>
                      {nameError && <p className="verified-contact-feedback is-error">{nameError}</p>}
                      <div className="bs-profile-form-actions">
                        <button className="bs-btn bs-btn-navy" type="submit" disabled={nameSaving}>{nameSaving ? 'Saving...' : 'Save name'}</button>
                        <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => setEditingName(false)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>

                <VerifiedContactField field="email" value={session.email} verified={session.emailVerified} onUpdated={refreshAccount} />
                <VerifiedContactField field="phone" value={session.phone} verified={session.phoneVerified} onUpdated={refreshAccount} />
              </section>

              <section className="bs-account-v2-card bs-account-v2-security">
                <div className="bs-account-v2-card-head">
                  <div>
                    <span className="bs-account-v2-card-kicker">Account health</span>
                    <h2>Security overview</h2>
                  </div>
                </div>
                <div className="bs-account-v2-security-score">
                  <div className={profileReady ? 'is-ready' : ''}>
                    <Icon name={profileReady ? 'check' : 'shield'} size={22} />
                  </div>
                  <span>
                    <strong>{profileReady ? 'Your account is ready' : 'One quick review recommended'}</strong>
                    <small>{profileReady ? 'Your details are ready for a faster checkout.' : 'Add reusable checkout details to complete your account.'}</small>
                  </span>
                </div>
                <ul className="bs-account-v2-checklist">
                  <li className={session.emailVerified ? 'is-complete' : ''}><Icon name={session.emailVerified ? 'check' : 'clock'} size={15} /> Email verification</li>
                  <li className={session.phone ? 'is-complete' : ''}><Icon name={session.phone ? 'check' : 'clock'} size={15} /> Phone number added</li>
                  <li className={checkoutDetails.length ? 'is-complete' : ''}><Icon name={checkoutDetails.length ? 'check' : 'clock'} size={15} /> Reusable checkout details</li>
                </ul>
                <div className="bs-account-v2-security-note">
                  <Icon name="lock" size={16} />
                  Email and phone updates are activated only after verification.
                </div>
              </section>
            </div>

            <section className="bs-account-v2-card bs-account-v2-details">
              <div className="bs-account-v2-card-head bs-account-v2-card-head-action">
                <div>
                  <span className="bs-account-v2-card-kicker">Faster checkout</span>
                  <h2>Saved checkout details</h2>
                  <p>Reuse contact information and delivery locations from previous purchases.</p>
                </div>
                <button className="bs-account-v2-add-btn" type="button" onClick={() => navigate('checkout')}>
                  <Icon name="plus" size={16} /> Add at checkout
                </button>
              </div>

              {loading ? (
                <div className="bs-account-v2-details-grid">
                  {[1, 2].map(item => <div className="bs-skeleton bs-account-v2-detail-skeleton" key={item} />)}
                </div>
              ) : checkoutDetails.length === 0 ? (
                <div className="bs-account-v2-empty">
                  <span><Icon name="pin" size={24} /></span>
                  <div><strong>No checkout details saved yet</strong><p>Complete a delivery checkout and your details will be available here next time.</p></div>
                  <button type="button" onClick={() => navigate('shop')}>Start shopping</button>
                </div>
              ) : (
                <div className="bs-account-v2-details-grid">
                  {checkoutDetails.slice(0, 4).map(detail => {
                    const place = [detail.city || detail.delivery_zone_name, detail.region].filter(Boolean).join(', ');
                    const removing = deletingDetailId === String(detail.id);
                    return (
                      <article className="bs-account-v2-detail-card" key={`${detail.source}-${detail.id}`}>
                        <div className="bs-account-v2-detail-top">
                          <span className="bs-account-v2-detail-icon"><Icon name="pin" size={18} /></span>
                          <div>
                            <strong>{detail.label || 'Delivery details'}</strong>
                            <span>{detail.source === 'saved' ? 'Saved details' : 'From order history'}</span>
                          </div>
                          {detail.is_default && <em>Default</em>}
                        </div>
                        <div className="bs-account-v2-detail-body">
                          <strong>{detail.customer_name}</strong>
                          <span><Icon name="phone" size={13} /> {detail.phone}</span>
                          <span><Icon name="mail" size={13} /> {detail.email}</span>
                          <span><Icon name="pin" size={13} /> {place || 'Delivery area not specified'}</span>
                          <small>{detail.address || 'Exact landmark will be confirmed by phone.'}</small>
                        </div>
                        <div className="bs-account-v2-detail-actions">
                          <button type="button" onClick={() => navigate('checkout')}>Use at checkout</button>
                          {detail.can_delete && (
                            <button
                              type="button"
                              className="is-delete"
                              aria-label={`Delete ${detail.label || 'saved checkout details'}`}
                              disabled={removing}
                              onClick={() => deleteCheckoutDetail(detail)}
                            >
                              <Icon name="trash" size={15} /> {removing ? 'Removing...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {checkoutDetails.length > 4 && (
                <p className="bs-account-v2-more-details">Plus {checkoutDetails.length - 4} more available from the checkout selector.</p>
              )}
            </section>

            <section className="bs-account-v2-card bs-account-v2-orders">
              <div className="bs-account-v2-card-head bs-account-v2-card-head-action">
                <div>
                  <span className="bs-account-v2-card-kicker">Purchase history</span>
                  <h2>Recent orders</h2>
                </div>
                {orders.length > 0 && (
                  <button className="bs-account-v2-view-all" onClick={() => navigate('orders')}>
                    View all <Icon name="arrow" size={13} />
                  </button>
                )}
              </div>
              {loading ? (
                <div className="bs-mini-orders-grid">
                  {[1,2,3,4].map(i => <div key={i} className="bs-skeleton bs-skeleton-order" />)}
                </div>
              ) : orders.length === 0 ? (
                <div className="bs-account-v2-empty">
                  <span><Icon name="truck" size={24} /></span>
                  <div><strong>No orders yet</strong><p>Your recent purchases and delivery progress will appear here.</p></div>
                  <button type="button" onClick={() => navigate('shop')}>Start shopping</button>
                </div>
              ) : (
                <div className="bs-mini-orders-grid bs-account-v2-order-grid">
                  {orders.map(order => (
                    <MiniOrderCard key={order.id} order={order} onOpen={setModalOrder} />
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

      {modalOrder && <OrderDetailModal order={modalOrder} onClose={() => setModalOrder(null)} />}
    </div>
  );
};

const AccountPage = ({ navigate }) => {
  const session = useSession();
  const [orders, setOrders] = React.useState([]);
  const [checkoutDetails, setCheckoutDetails] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOrder, setModalOrder] = React.useState(null);
  const [editingName, setEditingName] = React.useState(false);
  const [nameForm, setNameForm] = React.useState({ firstName: '', lastName: '' });
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState('');
  const [deletingDetailId, setDeletingDetailId] = React.useState('');
  const [editingDetail, setEditingDetail] = React.useState(null);
  const [detailForm, setDetailForm] = React.useState({});
  const [detailSaving, setDetailSaving] = React.useState(false);
  const [detailError, setDetailError] = React.useState('');
  const [securityModal, setSecurityModal] = React.useState('');
  const [passwordForm, setPasswordForm] = React.useState({ current: '', next: '', confirm: '' });
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState('');
  const [twoFactorState, setTwoFactorState] = React.useState({
    enabled: Boolean(session?.twoFactorEnabled),
    step: 'password',
    currentPassword: '',
    otp: '',
    saving: false,
    error: '',
  });

  React.useEffect(() => {
    setNameForm({
      firstName: session?.firstName || '',
      lastName: session?.lastName || '',
    });
  }, [session?.firstName, session?.lastName]);

  React.useEffect(() => {
    setTwoFactorState(prev => ({ ...prev, enabled: Boolean(session?.twoFactorEnabled) }));
  }, [session?.twoFactorEnabled]);

  React.useEffect(() => {
    if (!session?.role || !isApiMode()) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    Promise.allSettled([
      api.fetchMyOrders('per_page=4&sort=newest'),
      api.fetchCheckoutDetails(),
    ]).then(([ordersResult, detailsResult]) => {
      if (!alive) return;
      if (ordersResult.status === 'fulfilled') setOrders(ordersResult.value?.items || []);
      if (detailsResult.status === 'fulfilled') setCheckoutDetails(detailsResult.value?.items || []);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [session?.role]);

  if (!session?.role) {
    return (
      <div className="bs-container bs-fade-page" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
        <div className="bs-empty-state">
          <div className="bs-empty-icon"><Icon name="user" size={38} /></div>
          <h2 className="bs-h2">Sign in to view your account</h2>
          <p className="bs-muted">Access your order history, saved checkout details, and account security.</p>
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
  const refreshAccount = async () => {
    await syncSessionFromApi();
  };
  const scrollToAccountSection = id => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openSecurityModal = async type => {
    setSecurityModal(type);
    if (type === 'password') {
      setPasswordForm({ current: '', next: '', confirm: '' });
      setPasswordError('');
      return;
    }
    setTwoFactorState(prev => ({
      ...prev,
      step: 'password',
      currentPassword: '',
      otp: '',
      error: '',
    }));
    if (!isApiMode()) return;
    try {
      const result = await api.fetchSecurityStatus();
      setTwoFactorState(prev => ({ ...prev, enabled: Boolean(result.two_factor_enabled) }));
    } catch (error) {
      setTwoFactorState(prev => ({ ...prev, error: error.message || 'Could not load account security settings.' }));
    }
  };
  const savePassword = async event => {
    event.preventDefault();
    setPasswordError('');
    if (passwordForm.next.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await api.changePassword({
        current_password: passwordForm.current,
        new_password: passwordForm.next,
      });
      setSecurityModal('');
      setPasswordForm({ current: '', next: '', confirm: '' });
      globalToast.success('Password updated successfully.');
    } catch (error) {
      setPasswordError(error.message || 'Could not update your password.');
    } finally {
      setPasswordSaving(false);
    }
  };
  const requestTwoFactorChange = async event => {
    event.preventDefault();
    const action = twoFactorState.enabled ? 'disable' : 'enable';
    setTwoFactorState(prev => ({ ...prev, saving: true, error: '' }));
    try {
      const result = await api.requestTwoFactorChange({
        action,
        current_password: twoFactorState.currentPassword,
      });
      setTwoFactorState(prev => ({ ...prev, step: 'code', saving: false, error: '' }));
      globalToast.success(result.message || 'A security code has been sent to your email.');
    } catch (error) {
      setTwoFactorState(prev => ({ ...prev, saving: false, error: error.message || 'Could not start that security change.' }));
    }
  };
  const confirmTwoFactorChange = async event => {
    event.preventDefault();
    if (twoFactorState.otp.replace(/\D/g, '').length !== 6) {
      setTwoFactorState(prev => ({ ...prev, error: 'Enter the 6 digit security code from your email.' }));
      return;
    }
    setTwoFactorState(prev => ({ ...prev, saving: true, error: '' }));
    try {
      const result = await api.confirmTwoFactorChange({ otp: twoFactorState.otp });
      await refreshAccount();
      setTwoFactorState(prev => ({
        ...prev,
        enabled: Boolean(result.two_factor_enabled),
        step: 'password',
        currentPassword: '',
        otp: '',
        saving: false,
      }));
      setSecurityModal('');
      globalToast.success(result.message || 'Two-factor authentication updated.');
    } catch (error) {
      setTwoFactorState(prev => ({ ...prev, saving: false, error: error.message || 'Could not verify that security code.' }));
    }
  };
  const saveName = async event => {
    event.preventDefault();
    setNameError('');
    if (!nameForm.firstName.trim()) {
      setNameError('First name is required.');
      return;
    }
    setNameSaving(true);
    try {
      if (isApiMode()) {
        await api.updateAccount({
          first_name: nameForm.firstName.trim(),
          last_name: nameForm.lastName.trim(),
        });
      }
      await refreshAccount();
      setEditingName(false);
      globalToast.success('Account name updated.');
    } catch (error) {
      setNameError(error.message || 'Could not update your name.');
    } finally {
      setNameSaving(false);
    }
  };
  const deleteCheckoutDetail = async detail => {
    if (!detail?.can_delete || !isApiMode()) return;
    setDeletingDetailId(String(detail.id));
    try {
      await api.deleteCheckoutDetails(detail.id);
      setCheckoutDetails(prev => prev.filter(item => String(item.id) !== String(detail.id)));
      globalToast.success('Saved checkout details removed.');
    } catch (error) {
      globalToast.error(error.message || 'Could not remove those checkout details.');
    } finally {
      setDeletingDetailId('');
    }
  };
  const beginDetailEdit = detail => {
    setEditingDetail(detail);
    setDetailError('');
    setDetailForm({
      label: detail.label || '',
      customer_name: detail.customer_name || '',
      email: detail.email || '',
      phone: detail.phone || '',
      delivery_zone_id: detail.delivery_zone_id || null,
      delivery_zone_name: detail.delivery_zone_name || '',
      address: detail.address || '',
      city: detail.city || detail.delivery_zone_name || '',
      region: detail.region || '',
      is_default: Boolean(detail.is_default),
    });
  };
  const beginDetailCreate = () => {
    setEditingDetail({ id: null, isNew: true, can_delete: true });
    setDetailError('');
    setDetailForm({
      label: '',
      customer_name: [session?.firstName, session?.lastName].filter(Boolean).join(' '),
      email: session?.email || '',
      phone: session?.phone || '',
      delivery_zone_id: null,
      delivery_zone_name: '',
      address: '',
      city: '',
      region: '',
      is_default: checkoutDetails.every(detail => detail.source !== 'saved'),
    });
  };
  const saveDetail = async event => {
    event.preventDefault();
    if (!editingDetail?.can_delete) return;
    setDetailSaving(true);
    setDetailError('');
    try {
      const result = editingDetail.isNew
        ? await api.saveCheckoutDetails(detailForm)
        : await api.updateCheckoutDetails(editingDetail.id, detailForm);
      setCheckoutDetails(prev => (
        editingDetail.isNew
          ? [result.detail, ...prev]
          : prev.map(item => (
            String(item.id) === String(editingDetail.id) ? result.detail : item
          ))
      ));
      setEditingDetail(null);
      globalToast.success(editingDetail.isNew ? 'Checkout details saved.' : 'Checkout details updated.');
    } catch (error) {
      setDetailError(error.message || 'Could not save those checkout details.');
    } finally {
      setDetailSaving(false);
    }
  };
  const setDetailField = key => event => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setDetailForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bs-fade-page bs-account-ref-page">
      <div className="bs-container bs-account-ref-shell">
        <AccountSidebar
          navigate={navigate}
          active="overview"
          onSavedDetails={() => scrollToAccountSection('saved-checkout-details')}
          onSecurity={() => scrollToAccountSection('account-security')}
        />

        <main className="bs-account-ref-main">
          <section className="bs-account-ref-hero">
            <div className="bs-account-ref-identity">
              <div className="bs-account-ref-avatar">
                {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials}
              </div>
              <div>
                <span>My Account</span>
                <h1>{displayName}</h1>
                <div className="bs-account-ref-meta">
                  <span><Icon name="mail" size={13} /> {session.email}</span>
                  <span className={session.emailVerified ? 'verified' : ''}><Icon name={session.emailVerified ? 'check' : 'clock'} size={13} /> {session.emailVerified ? 'Email verified' : 'Email verification needed'}</span>
                  {session.phone && <span><Icon name="phone" size={13} /> {session.phone}</span>}
                  <span className={session.phoneVerified ? 'verified' : ''}><Icon name={session.phoneVerified ? 'check' : 'clock'} size={13} /> {session.phoneVerified ? 'Phone verified' : 'Phone verification needed'}</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => navigate('shop')}>
              <Icon name="bag" size={17} /> Continue Shopping <Icon name="arrow" size={15} />
            </button>
          </section>

          <div className="bs-account-ref-columns">
            <div className="bs-account-ref-left">
              <section className="bs-account-ref-panel bs-account-ref-profile">
                <h2>Profile &amp; Security</h2>
                <h3>Personal Details</h3>
                <div className="bs-account-ref-profile-row">
                  <span className="row-icon"><Icon name="user" size={15} /></span>
                  <span className="row-label">Full Name</span>
                  <strong>{displayName}</strong>
                  <span />
                  <button type="button" onClick={() => setEditingName(value => !value)}>Edit</button>
                </div>
                <VerifiedContactField
                  field="email"
                  value={session.email}
                  verified={session.emailVerified}
                  onUpdated={refreshAccount}
                  className="bs-account-ref-contact"
                  icon={<Icon name="mail" size={15} />}
                  editLabel="Edit"
                  modal
                />
                <VerifiedContactField
                  field="phone"
                  value={session.phone}
                  verified={session.phoneVerified}
                  onUpdated={refreshAccount}
                  className="bs-account-ref-contact"
                  icon={<Icon name="phone" size={15} />}
                  editLabel="Edit"
                  modal
                />
              </section>

              <section id="saved-checkout-details" className="bs-account-ref-panel bs-account-ref-saved">
                <div className="bs-account-ref-panel-title">
                  <h2>Saved Checkout Details</h2>
                  <button type="button" onClick={beginDetailCreate}><Icon name="plus" size={15} /> Add new details</button>
                </div>
                {loading ? (
                  <div className="bs-skeleton bs-account-ref-skeleton" />
                ) : checkoutDetails.length === 0 ? (
                  <div className="bs-account-ref-saved-empty">
                    <Icon name="pin" size={24} />
                    <strong>No saved details yet</strong>
                    <span>Add delivery details during checkout and they will appear here.</span>
                  </div>
                ) : (
                  <div className="bs-account-ref-detail-list">
                    {checkoutDetails.slice(0, 5).map(detail => {
                      const removing = deletingDetailId === String(detail.id);
                      return (
                        <article key={`${detail.source}-${detail.id}`} className="bs-account-ref-detail-row">
                          <div className="bs-account-ref-detail-home"><Icon name="home" size={18} /></div>
                          <div className="bs-account-ref-detail-name">
                            {detail.is_default && <em>Default</em>}
                            <strong>{detail.customer_name}</strong>
                            <span>{detail.address || 'Exact landmark confirmed by phone'}</span>
                            <small>Landmark</small>
                          </div>
                          <div><strong>{detail.phone}</strong><span>Phone</span></div>
                          <div><strong>{detail.email}</strong><span>Email</span></div>
                          <div><strong>{detail.city || detail.delivery_zone_name || '—'}</strong><span>Town/Area</span></div>
                          <div><strong>{detail.region || '—'}</strong><span>Region</span></div>
                          <div className="bs-account-ref-detail-actions">
                            {detail.can_delete ? (
                              <>
                                <button type="button" onClick={() => beginDetailEdit(detail)}><Icon name="pencil" size={14} /> Edit</button>
                                <button type="button" className="delete" disabled={removing} onClick={() => deleteCheckoutDetail(detail)}><Icon name="trash" size={14} /> {removing ? 'Removing' : 'Delete'}</button>
                              </>
                            ) : (
                              <button type="button" onClick={() => navigate('checkout')}>Use again</button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="bs-account-ref-right">
              <section id="account-security" className="bs-account-ref-panel bs-account-ref-security">
                <h2>Security</h2>
                <button type="button" onClick={() => openSecurityModal('password')}><span><Icon name="lock" size={16} /> Change Password</span><Icon name="chevR" size={15} /></button>
                <button type="button" onClick={() => openSecurityModal('two-factor')}>
                  <span><Icon name="shield" size={16} /> Two-Factor Authentication</span>
                  <span className={`bs-account-ref-security-status ${twoFactorState.enabled ? 'enabled' : ''}`}>
                    {twoFactorState.enabled ? 'On' : 'Off'}
                  </span>
                  <Icon name="chevR" size={15} />
                </button>
              </section>

              <section className="bs-account-ref-panel bs-account-ref-orders">
                <div className="bs-account-ref-panel-title">
                  <h2>Recent Orders</h2>
                  {orders.length > 0 && <button type="button" className="view-all" onClick={() => navigate('orders')}>View all</button>}
                </div>
                {loading ? (
                  <div className="bs-skeleton bs-account-ref-order-skeleton" />
                ) : orders.length === 0 ? (
                  <div className="bs-account-ref-orders-empty">
                    <span><Icon name="bag" size={30} /></span>
                    <strong>No orders yet</strong>
                    <button type="button" onClick={() => navigate('shop')}>Start shopping</button>
                  </div>
                ) : (
                  <div className="bs-mini-orders-grid">
                    {orders.map(order => <MiniOrderCard key={order.id} order={order} onOpen={setModalOrder} />)}
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>

      {editingName && (
        <div className="bs-modal-scrim" onClick={event => { if (event.target === event.currentTarget) setEditingName(false); }}>
          <form className="bs-modal-box bs-account-security-modal" onSubmit={saveName} role="dialog" aria-modal="true" aria-label="Edit full name">
            <div className="bs-modal-head">
              <div><span className="bs-account-ref-modal-kicker">Personal details</span><h2>Edit full name</h2></div>
              <button className="bs-modal-close" type="button" onClick={() => setEditingName(false)} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <div className="bs-modal-body">
              <p className="bs-account-security-intro">This name is used across your RealMindX account and on your Bookshop orders.</p>
              <div className="bs-field-row">
                <label className="bs-field"><span>First name</span><input value={nameForm.firstName} onChange={event => setNameForm(prev => ({ ...prev, firstName: event.target.value }))} autoFocus required /></label>
                <label className="bs-field"><span>Last name</span><input value={nameForm.lastName} onChange={event => setNameForm(prev => ({ ...prev, lastName: event.target.value }))} /></label>
              </div>
              {nameError && <p className="verified-contact-feedback is-error">{nameError}</p>}
            </div>
            <div className="bs-modal-foot">
              <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => setEditingName(false)}>Cancel</button>
              <button className="bs-btn bs-btn-navy" type="submit" disabled={nameSaving}>{nameSaving ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      )}

      {securityModal === 'password' && (
        <div className="bs-modal-scrim" onClick={event => { if (event.target === event.currentTarget) setSecurityModal(''); }}>
          <form className="bs-modal-box bs-account-security-modal" onSubmit={savePassword} role="dialog" aria-modal="true" aria-label="Change password">
            <div className="bs-modal-head">
              <div><span className="bs-account-ref-modal-kicker">Account security</span><h2>Change your password</h2></div>
              <button className="bs-modal-close" type="button" onClick={() => setSecurityModal('')} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <div className="bs-modal-body">
              <p className="bs-account-security-intro">This changes the password for your shared RealMindX account, including the Bookshop and any other RealMindX service you use.</p>
              <BookshopPasswordField label="Current password" autoComplete="current-password" value={passwordForm.current} onChange={event => setPasswordForm(prev => ({ ...prev, current: event.target.value }))} required />
              <BookshopPasswordField label="New password" autoComplete="new-password" minLength={8} value={passwordForm.next} onChange={event => setPasswordForm(prev => ({ ...prev, next: event.target.value }))} required />
              <BookshopPasswordField label="Confirm new password" autoComplete="new-password" minLength={8} value={passwordForm.confirm} onChange={event => setPasswordForm(prev => ({ ...prev, confirm: event.target.value }))} required />
              {passwordError && <p className="verified-contact-feedback is-error">{passwordError}</p>}
            </div>
            <div className="bs-modal-foot">
              <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => setSecurityModal('')}>Cancel</button>
              <button className="bs-btn bs-btn-navy" type="submit" disabled={passwordSaving}>{passwordSaving ? 'Updating...' : 'Update password'}</button>
            </div>
          </form>
        </div>
      )}

      {securityModal === 'two-factor' && (
        <div className="bs-modal-scrim" onClick={event => { if (event.target === event.currentTarget) setSecurityModal(''); }}>
          <form
            className="bs-modal-box bs-account-security-modal"
            onSubmit={twoFactorState.step === 'code' ? confirmTwoFactorChange : requestTwoFactorChange}
            role="dialog"
            aria-modal="true"
            aria-label="Two-factor authentication"
          >
            <div className="bs-modal-head">
              <div><span className="bs-account-ref-modal-kicker">Account security</span><h2>Two-factor authentication</h2></div>
              <button className="bs-modal-close" type="button" onClick={() => setSecurityModal('')} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <div className="bs-modal-body">
              <div className={`bs-account-two-factor-state ${twoFactorState.enabled ? 'enabled' : ''}`}>
                <span><Icon name={twoFactorState.enabled ? 'check' : 'shield'} size={20} /></span>
                <div>
                  <strong>Email two-factor authentication is {twoFactorState.enabled ? 'on' : 'off'}</strong>
                  <p>{twoFactorState.enabled ? 'A security code is required after your password whenever you sign in.' : 'Add a security code sent to your verified email whenever you sign in.'}</p>
                </div>
              </div>
              {twoFactorState.step === 'code' ? (
                <>
                  <p className="bs-account-security-intro">Enter the 6 digit code sent to <strong>{session.email}</strong> to {twoFactorState.enabled ? 'disable' : 'enable'} two-factor authentication.</p>
                  <label className="bs-field"><span>Security code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorState.otp} onChange={event => setTwoFactorState(prev => ({ ...prev, otp: event.target.value.replace(/\D/g, '').slice(0, 6) }))} required /></label>
                </>
              ) : (
                <>
                  <p className="bs-account-security-intro">Confirm with your current password. We will then email a short-lived security code to <strong>{session.email}</strong>.</p>
                  <BookshopPasswordField label="Current password" autoComplete="current-password" value={twoFactorState.currentPassword} onChange={event => setTwoFactorState(prev => ({ ...prev, currentPassword: event.target.value }))} required />
                </>
              )}
              {twoFactorState.error && <p className="verified-contact-feedback is-error">{twoFactorState.error}</p>}
            </div>
            <div className="bs-modal-foot">
              <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => setSecurityModal('')}>Cancel</button>
              <button className={`bs-btn ${twoFactorState.enabled ? 'bs-account-security-danger' : 'bs-btn-navy'}`} type="submit" disabled={twoFactorState.saving}>
                {twoFactorState.saving ? 'Please wait...' : twoFactorState.step === 'code' ? 'Confirm security code' : twoFactorState.enabled ? 'Disable 2FA' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingDetail && (
        <div className="bs-modal-scrim" onClick={event => { if (event.target === event.currentTarget) setEditingDetail(null); }}>
          <form className="bs-modal-box bs-account-detail-edit-modal" onSubmit={saveDetail} role="dialog" aria-modal="true" aria-label={editingDetail.isNew ? 'Add saved checkout details' : 'Edit saved checkout details'}>
            <div className="bs-modal-head">
              <div><span className="bs-account-ref-modal-kicker">Saved details</span><h2>{editingDetail.isNew ? 'Add checkout details' : 'Edit checkout details'}</h2></div>
              <button className="bs-modal-close" type="button" onClick={() => setEditingDetail(null)} aria-label="Close"><Icon name="close" size={19} /></button>
            </div>
            <div className="bs-modal-body">
              <div className="bs-field-row">
                <label className="bs-field"><span>Label</span><input value={detailForm.label || ''} onChange={setDetailField('label')} /></label>
                <label className="bs-field"><span>Full name</span><input value={detailForm.customer_name || ''} onChange={setDetailField('customer_name')} required /></label>
              </div>
              <div className="bs-field-row">
                <label className="bs-field"><span>Phone</span><input value={detailForm.phone || ''} onChange={setDetailField('phone')} required /></label>
                <label className="bs-field"><span>Email</span><input type="email" value={detailForm.email || ''} onChange={setDetailField('email')} required /></label>
              </div>
              <div className="bs-field-row">
                <label className="bs-field"><span>Town / Area</span><input value={detailForm.city || ''} onChange={setDetailField('city')} /></label>
                <label className="bs-field"><span>Region</span><input value={detailForm.region || ''} onChange={setDetailField('region')} /></label>
              </div>
              <label className="bs-field"><span>Landmark or delivery directions</span><textarea value={detailForm.address || ''} onChange={setDetailField('address')} /></label>
              <label className="bs-account-ref-default-check"><input type="checkbox" checked={Boolean(detailForm.is_default)} onChange={setDetailField('is_default')} /> Make these my default checkout details</label>
              {detailError && <p className="verified-contact-feedback is-error">{detailError}</p>}
            </div>
            <div className="bs-modal-foot">
              <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => setEditingDetail(null)}>Cancel</button>
              <button className="bs-btn bs-btn-navy" type="submit" disabled={detailSaving}>{detailSaving ? 'Saving...' : editingDetail.isNew ? 'Save details' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      )}
      {modalOrder && <OrderDetailModal order={modalOrder} onClose={() => setModalOrder(null)} />}
    </div>
  );
};

const ORDER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'Placed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'complete', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];
const ORDERS_PER_PAGE = 40; // 2 cols × 20 rows; paginate after this

const LegacyOrdersPage = ({ navigate }) => {
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

const ORDER_REVIEW_SCORES = Array.from({ length: 10 }, (_, index) => index + 1);

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

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 380);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    if (!session?.role || !isApiMode()) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ page, per_page: ORDERS_PER_PAGE, sort });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    api.fetchMyOrders(params.toString()).then(data => {
      if (!alive) return;
      setOrders(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    }).catch(() => {
      if (alive) setOrders([]);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
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

  const hasFilters = Boolean(debouncedSearch || statusFilter);
  const resultSummary = total === 0
    ? 'No orders found'
    : `Showing ${Math.min((page - 1) * ORDERS_PER_PAGE + 1, total)}–${Math.min(page * ORDERS_PER_PAGE, total)} of ${total} orders`;

  return (
    <div className="bs-fade-page bs-account-ref-page bs-account-orders-page">
      <div className="bs-container bs-account-ref-shell">
        <AccountSidebar navigate={navigate} active="orders" />

        <main className="bs-account-ref-main">
          <section className="bs-account-orders-hero">
            <div className="bs-account-orders-hero-copy">
              <span className="bs-account-orders-icon"><Icon name="truck" size={25} /></span>
              <div>
                <span>My Account</span>
                <h1>Orders</h1>
                <p>Review purchases, check payment details, and follow each delivery from one place.</p>
              </div>
            </div>
            <div className="bs-account-orders-hero-actions">
              <span>{total} order{total !== 1 ? 's' : ''}</span>
              <div className="bs-account-orders-hero-buttons">
                <button className="secondary" type="button" onClick={() => navigate('account')}>
                  <Icon name="chevL" size={15} /> Back to My Account
                </button>
                <button className="primary" type="button" onClick={() => navigate('shop')}>
                  <Icon name="bag" size={16} /> Continue Shopping <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>
          </section>

          <section className="bs-account-ref-panel bs-account-orders-panel">
            <div className="bs-account-orders-panel-head">
              <div>
                <h2>Order history</h2>
                <p>Search by order reference or by the books included in an order.</p>
              </div>
              {!loading && <span className="bs-account-orders-result">{resultSummary}</span>}
            </div>

            <div className="bs-orders-toolbar bs-account-orders-toolbar">
              <div className="bs-orders-search-wrap">
                <Icon name="search" size={17} className="bs-otsearch-icn" />
                <input
                  className="bs-orders-search"
                  type="search"
                  placeholder="Search reference, title, or product"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  aria-label="Search orders"
                />
              </div>
              <div className="bs-account-orders-selects">
                <label>
                  <span>Status</span>
                  <select
                    className="bs-orders-filter-select"
                    value={statusFilter}
                    onChange={event => { setStatusFilter(event.target.value); setPage(1); }}
                    aria-label="Filter by status"
                  >
                    {ORDER_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Sort</span>
                  <select
                    className="bs-orders-sort-select"
                    value={sort}
                    onChange={event => { setSort(event.target.value); setPage(1); }}
                    aria-label="Sort orders"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="bs-account-orders-content">
              {loading ? (
                <div className="bs-orders-grid">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="bs-skeleton bs-skeleton-order-card" />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="bs-account-orders-empty">
                  <span><Icon name={hasFilters ? 'search' : 'bag'} size={32} /></span>
                  <h2>{hasFilters ? 'No matching orders' : 'No orders yet'}</h2>
                  <p>
                    {hasFilters
                      ? 'Try another reference, title, or order status.'
                      : 'When you place an order, its payment and delivery progress will appear here.'}
                  </p>
                  {hasFilters ? (
                    <button type="button" className="bs-btn bs-btn-outline-navy" onClick={() => {
                      setSearch('');
                      setStatusFilter('');
                      setSort('newest');
                      setPage(1);
                    }}>
                      Clear filters
                    </button>
                  ) : (
                    <button type="button" className="bs-btn bs-btn-gold" onClick={() => navigate('shop')}>
                      Browse the Bookshop
                    </button>
                  )}
                </div>
              ) : (
                <div className="bs-orders-grid">
                  {orders.map(order => (
                    <OrderCard key={order.id} order={order} onOpen={setModalOrder} />
                  ))}
                </div>
              )}

              {pages > 1 && (
                <div className="bs-pagination bs-account-orders-pagination">
                  <button className="bs-page-btn pill" disabled={page === 1} onClick={() => setPage(current => current - 1)}>
                    <Icon name="chevL" size={15} /> Prev
                  </button>
                  {Array.from({ length: pages }).map((_, index) => (
                    <button key={index} className={`bs-page-btn${page === index + 1 ? ' active' : ''}`} onClick={() => setPage(index + 1)}>
                      {index + 1}
                    </button>
                  ))}
                  <button className="bs-page-btn pill" disabled={page === pages} onClick={() => setPage(current => current + 1)}>
                    Next <Icon name="chevR" size={15} />
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {modalOrder && <OrderDetailModal order={modalOrder} onClose={() => setModalOrder(null)} />}
    </div>
  );
};

const OrderReviewPage = ({ navigate }) => {
  const session = useSession();
  const initialSearch = React.useMemo(() => (
    typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  ), []);
  const initialScore = Number(initialSearch.get('score'));
  const [form, setForm] = React.useState({
    orderReference: initialSearch.get('ref') || '',
    email: session?.email || '',
    score: Number.isFinite(initialScore) && initialScore >= 1 && initialScore <= 10 ? initialScore : '',
    comment: '',
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    setForm((prev) => ({
      ...prev,
      email: prev.email || session?.email || '',
    }));
  }, [session?.email]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.orderReference.trim()) {
      setError('Enter your order reference.');
      return;
    }
    if (!form.email.trim()) {
      setError('Enter the email used for the order.');
      return;
    }
    if (form.score === '' || Number(form.score) < 1 || Number(form.score) > 10) {
      setError('Choose a recommendation score from 1 to 10.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (!isApiMode()) {
        throw new Error('Live order reviews are available on the connected RealMindX backend.');
      }
      await api.createOrderReview({
        order_reference: form.orderReference.trim(),
        email: form.email.trim(),
        score: Number(form.score),
        comment: form.comment.trim(),
        source: 'email',
      });
      setSuccess(true);
      globalToast.success('Thank you for your feedback.');
    } catch (err) {
      setError(err.message || 'Could not submit your feedback right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bs-container bs-fade-page" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="bs-empty-state">
          <div className="bs-empty-icon"><Icon name="check" size={36} /></div>
          <h1 className="bs-h2">Thanks for rating your order.</h1>
          <p className="bs-muted">Your RealMindX Bookshop feedback has been received and will help us improve delivery, support, and fulfilment.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button className="bs-btn bs-btn-navy" onClick={() => navigate('track')}>Track another order</button>
            <button className="bs-btn bs-btn-outline-navy" onClick={() => navigate('shop')}>Continue shopping</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-fade-page">
      <div className="bs-info-hero">
        <div className="bs-container">
          <span className="bs-eyebrow">Order feedback</span>
          <h1 className="bs-h1">Rate your RealMindX Bookshop order.</h1>
          <p className="bs-sub" style={{ maxWidth: 720, marginTop: 14 }}>
            Tell us how likely you are to recommend RealMindX Bookshop to others. We use this feedback to improve fulfilment, delivery, and customer care.
          </p>
        </div>
      </div>

      <div className="bs-container" style={{ paddingTop: 40, paddingBottom: 72 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 28, background: '#fff', border: '1px solid var(--bs-border)', borderRadius: 'var(--bs-radius-md)', boxShadow: 'var(--bs-shadow-sm)' }}>
          <form onSubmit={submit} className="bs-review-form" style={{ borderTop: 'none', paddingTop: 0, maxWidth: '100%' }}>
            <div className="bs-field-row">
              <label className="bs-field">
                <span>Order reference</span>
                <input value={form.orderReference} onChange={(event) => setField('orderReference', event.target.value.toUpperCase())} placeholder="RMX-XXXXXXX" />
              </label>
              <label className="bs-field">
                <span>Order email</span>
                <input type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="you@example.com" />
              </label>
            </div>

            <div className="bs-field" style={{ marginTop: 18 }}>
              <label>Your recommendation score</label>
              <div className="bs-order-review-scale">
                {ORDER_REVIEW_SCORES.map((score) => {
                  const active = Number(form.score) === score;
                  return (
                    <button
                      key={score}
                      type="button"
                      className={`bs-btn ${active ? 'bs-btn-navy' : 'bs-btn-outline-navy'}`}
                      onClick={() => setField('score', score)}
                      style={{ minWidth: 0 }}
                    >
                      {score}
                    </button>
                  );
                })}
              </div>
              <div className="bs-review-form-hint">1 = Not likely at all. 10 = Extremely likely.</div>
            </div>

            <label className="bs-field" style={{ marginTop: 18 }}>
              <span>Anything we should know? <span className="bs-optional">(optional)</span></span>
              <textarea rows={5} value={form.comment} onChange={(event) => setField('comment', event.target.value)} placeholder="Tell us what went well or what needs work." />
            </label>

            {error ? <p className="verified-contact-feedback is-error" style={{ marginTop: 14 }}>{error}</p> : null}

            <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="bs-btn bs-btn-navy" type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit feedback'}
              </button>
              <button className="bs-btn bs-btn-outline-navy" type="button" onClick={() => navigate('track')}>
                Track your order
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export { AuthPage, BookshopResetPasswordPage, ContactPage, InfoPage, BookshopLegalPage, AccountPage, OrdersPage, OrderReviewPage };
