import React, { useState } from 'react';
import { Icon } from '../assets/components.jsx';
import { Nav, Footer } from '../components/NavFooter';
import logoWhite from '../assets/logo-white.png';
import {
  confirmPasswordReset,
  resendVerificationOtp,
  requestPasswordReset,
  signIn,
  signUp,
  verifyEmailOtp,
} from '../../src/lib/authClient.js';
import { dashboardPathForRole, loginPathForRole } from '../../src/lib/sessionRoutes.js';
import { TurnstileField } from '../../src/lib/TurnstileField.jsx';
import toast from '../../src/lib/toast.js';

/* ─────────────────────────────────────────────────────────────
   ADMIN LOGIN PAGE
   ──────────────────────────────────────────────────────────── */
const InternalLoginPage = ({ role = 'admin' }) => {
  const isStaff = role === 'staff';
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { toast.error('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const session = await signIn({ email, password, role });
      window.location.href = dashboardPathForRole(session?.role || role);
    } catch (err) {
      const msg = err?.message || `Invalid ${isStaff ? 'staff' : 'admin'} credentials.`;
      setError(msg); toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const title = isStaff ? 'Staff Portal Sign In' : 'Sign In to Admin';
  const badge = isStaff ? 'Staff Access' : 'Admin Access';
  const heroTitle = isStaff ? (
    <>The Staff<br />Desk of<br /><span>RealMindX.</span></>
  ) : (
    <>The Control<br />Room of<br /><span>RealMindX.</span></>
  );
  const heroCopy = isStaff
    ? 'Staff access is limited to assigned tools, reports, and workflows. Permission scope is enforced on every action.'
    : 'Admin access is restricted to authorised RealMindX personnel only. All actions are logged and audited.';
  const accentCards = isStaff
    ? [
        { icon: 'clipboard', label: 'Assigned Reviews' },
        { icon: 'book', label: 'Bookshop Tasks' },
        { icon: 'newspaper', label: 'Content Updates' },
        { icon: 'message', label: 'Support Tickets' },
        { icon: 'chart', label: 'Analytics' },
        { icon: 'shield', label: 'Secure Access' },
      ]
    : [
        { icon: 'users', label: 'Manage Users' },
        { icon: 'briefcase', label: 'Job Board' },
        { icon: 'package', label: 'Bookshop' },
        { icon: 'newspaper', label: 'News & Posts' },
        { icon: 'image', label: 'Gallery' },
        { icon: 'settings', label: 'Site Settings' },
      ];
  const secondaryHref = isStaff ? loginPathForRole('admin') : loginPathForRole('staff');
  const secondaryLabel = isStaff ? 'Need admin access?' : 'Staff member?';
  const secondaryLink = isStaff ? 'Go to Admin Login' : 'Go to Staff Login';

  return (
    <>
      <Nav solid />
      <div className="auth-page auth-page-shell">
      <div className="auth-layout">

        {/* Brand panel */}
        <div className="auth-panel-brand">
          <div className="auth-brand-content">
            <h1 className="auth-brand-quote">
              {heroTitle}
            </h1>
            <p className="auth-brand-sub">
              {heroCopy}
            </p>

            {/* Decorative grid */}
            <div style={{
              marginTop: 48,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}>
              {accentCards.map(item => (
                <div key={item.label} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  padding: '14px 12px',
                  textAlign: 'center',
                }}>
                  <div style={{ marginBottom: 6, color: 'var(--gold)' }}>
                    <Icon name={item.icon} size={22} stroke={1.8} />
                  </div>
                  <div style={{ fontSize: '0.7rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Form panel */}
        <div className="auth-panel-form">
          <div className="auth-form-header">
            <div className="auth-badge">{badge}</div>
            <h2>{title}</h2>
            <p>{isStaff ? 'Use your assigned staff credentials to continue.' : 'Use your authorised admin credentials to continue.'}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-input"
                type="email"
                placeholder={isStaff ? 'staff@realmindxgh.com' : 'admin@realmindxgh.com'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group has-forgot">
              <label className="form-label">
                Password
              </label>
              <div className="password-field">
                <input
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} stroke={1.9} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-navy btn-lg"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Signing in...' : isStaff ? 'Sign In to Staff Portal' : 'Sign In to Admin Portal'}
            </button>
          </form>

          <div style={{ marginTop: 32, padding: '20px', background: 'var(--gray-50)', borderRadius: 10, border: '1px solid var(--gray-100)' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="shield" size={15} stroke={2} /> Security notice:
              </strong>{' '}This portal is restricted to authorised personnel. Unauthorised access attempts are recorded.
              Internal accounts may be required to change temporary passwords before continuing.
            </p>
          </div>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.82rem', color: 'var(--gray-600)' }}>
            {secondaryLabel}{' '}
            <a href={secondaryHref} style={{ color: 'var(--navy)', fontWeight: 700, textDecoration: 'underline' }}>
              {secondaryLink}
            </a>
          </p>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: '0.82rem', color: 'var(--gray-600)' }}>
            Looking for the teacher portal?{' '}
            <a href="/portal" style={{ color: 'var(--navy)', fontWeight: 700, textDecoration: 'underline' }}>
              Go to User Portal
            </a>
          </p>
        </div>
      </div>
      </div>
      <Footer />
    </>
  );
};

export const AdminLoginPage = () => <InternalLoginPage role="admin" />;

export const StaffLoginPage = () => <InternalLoginPage role="staff" />;


/* ─────────────────────────────────────────────────────────────
   USER LOGIN PAGE
   ──────────────────────────────────────────────────────────── */
export const UserLoginPage = ({ initialMode = 'login' }) => {
  const [mode, setMode]           = useState(initialMode); // 'login' | 'register' | 'forgot'
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPass, setConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [sex, setSex]             = useState('');
  const [ageRange, setAgeRange]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState('');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const firstNameRef = React.useRef(null);
  const emailRef = React.useRef(null);
  const passwordRef = React.useRef(null);
  const confirmRef = React.useRef(null);
  const termsRef = React.useRef(null);

  // Scroll to top whenever the form state changes (login/register/otp/forgot)
  React.useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [mode, pendingVerificationEmail]);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    const provider = params.get('provider');
    const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'social';
    if (oauthError === 'terms_required') {
      setMode('register');
      setError('Please accept the Terms of Service and Privacy Policy before creating a new social account.');
      setFieldErrors({ terms: 'Please accept the Terms of Service and Privacy Policy before creating a new social account.' });
      window.setTimeout(() => termsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260);
    } else if (oauthError === 'account_not_found_social') {
      setMode('register');
      setError(`No RealMindX account exists yet for that ${providerLabel} email. Create an account below, accept the terms, then continue with ${providerLabel}.`);
      window.setTimeout(() => termsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260);
    } else if (oauthError === 'provider_unavailable') {
      setError('That social sign-in provider is temporarily unavailable. Please use email and password.');
    } else if (oauthError?.endsWith('_failed')) {
      setError('Social sign-in could not be completed. Please try again or use email and password.');
    }
  }, []);

  const showFieldProblem = (field, message) => {
    const refs = {
      firstName: firstNameRef,
      email: emailRef,
      password: passwordRef,
      confirmPass: confirmRef,
      terms: termsRef,
    };
    setError(message);
    setFieldErrors({ [field]: message });
    toast.error(message);
    requestAnimationFrame(() => {
      const node = refs[field]?.current;
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof node.focus === 'function') node.focus({ preventScroll: true });
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { const m = 'Please enter your email and password.'; setError(m); toast.error(m); return; }
    setLoading(true);
    try {
      await signIn({ email, password, role: 'user' });
      window.location.href = '/portal';
    } catch (err) {
      if (err?.data?.requires_verification) {
        setPendingVerificationEmail(err.data.email || email);
        setSuccess('Enter the verification code sent to your email before signing in.');
        return;
      }
      const msg = err?.message || 'Incorrect email or password. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (!firstName.trim()) { showFieldProblem('firstName', 'Please enter your first name.'); return; }
    if (!email.trim()) { showFieldProblem('email', 'Please enter your email address.'); return; }
    if (!password) { showFieldProblem('password', 'Please enter a password.'); return; }
    if (password.length < 8) { showFieldProblem('password', 'Password must be at least 8 characters.'); return; }
    if (password !== confirmPass) { showFieldProblem('confirmPass', 'Passwords do not match.'); return; }
    if (!acceptedTerms) { showFieldProblem('terms', 'Please agree to the Terms of Service and Privacy Policy before creating an account.'); return; }
    setLoading(true);
    try {
      const result = await signUp({ email, password, firstName, lastName, sex, ageRange, acceptedTerms, turnstileToken });
      setPendingVerificationEmail(email);
      setOtp('');
      setSuccess(result?.message || 'Account created. Enter the verification code sent to your email.');
    } catch (err) {
      const msg = err?.message || 'Could not create your account. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setTurnstileToken('');
      setTurnstileKey(k => k + 1);
    }
  };

  const handleOtpVerify = async (event) => {
    event.preventDefault();
    setError('');
    if (!pendingVerificationEmail) {
      setError('Enter the email address you used to create the account.');
      return;
    }
    if (!otp || otp.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6 digit verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      await verifyEmailOtp({ email: pendingVerificationEmail, otp });
      setPendingVerificationEmail('');
      setOtp('');
      // Show success toast and auto-redirect to sign-in
      toast.success('Email verified! You can now sign in.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        setSuccess('');
        setError('');
        setMode('login');
        window.history.replaceState({}, '', '/login?verified=1');
        toast.info('Sign in with the email and password you just chose.');
      }, 1200);
    } catch (err) {
      const msg = err?.message || 'Could not verify the code.';
      setError(msg); toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingVerificationEmail) return;
    setError('');
    setLoading(true);
    try {
      const result = await resendVerificationOtp(pendingVerificationEmail);
      setSuccess(result?.message || 'A fresh verification code has been sent.');
    } catch (err) {
      setError(err?.message || 'Could not resend the verification code.');
    } finally {
      setLoading(false);
    }
  };

  const startSocialSignup = (provider) => {
    setError('');
    setFieldErrors({});
    if (!acceptedTerms) {
      showFieldProblem('terms', 'Please agree to the Terms of Service and Privacy Policy before signing up.');
      return;
    }
    window.location.href = `/api/auth/${provider}?intent=signup&accepted_terms=1&next=/portal`;
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true);
    try {
      await requestPasswordReset(email, { surface: 'main' });
      setSuccess('If an account exists for that email, you will receive a reset link shortly.');
    } catch (err) {
      setError(err?.message || 'Could not process the request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(''); setSuccess(''); setFieldErrors({}); setPendingVerificationEmail(''); setOtp(''); };

  return (
    <>
      <Nav activePage="jobs" solid />
      <div className="auth-page auth-page-shell">
      <div className="auth-layout">

        {/* Brand panel */}
        <div className="auth-panel-brand">
          <div className="auth-brand-content">
            <h1 className="auth-brand-quote">
              Your Career<br />in Education<br /><span>Starts Here.</span>
            </h1>
            <p className="auth-brand-sub">
              Create your profile once. Apply for teaching jobs across Ghana.
              Get alerts when roles match your skills. Track every application in one place.
            </p>

            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { icon: 'clipboard', text: 'Build a full teaching profile' },
                { icon: 'bell', text: 'Get alerts for matching jobs' },
                { icon: 'paperclip', text: 'Upload your CV and certificates' },
                { icon: 'chart', text: 'Track all your applications live' },
              ].map(item => (
                <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36,
                    background: 'var(--gold)',
                    borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color: 'var(--navy)',
                  }}>
                    <Icon name={item.icon} size={18} stroke={2} />
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.88rem' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Form panel */}
        <div className="auth-panel-form">

          {/* ── SIGN IN ── */}
          {pendingVerificationEmail && (
            <>
              <div className="auth-form-header">
                <h2>Verify Your Email</h2>
                <p>Enter the 6 digit code sent to {pendingVerificationEmail}.</p>
              </div>
              <form onSubmit={handleOtpVerify} noValidate>
                <div className="form-group">
                  <label className="form-label">Verification Code</label>
                  <input
                    className="form-input auth-otp-input"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoComplete="one-time-code"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </button>
              </form>
              <p className="auth-switch-copy">
                Did not receive it? <button type="button" className="text-link-button" onClick={handleResendOtp} disabled={loading}>Send a fresh code</button>
              </p>
              <p className="auth-switch-copy">
                Wrong email? <button type="button" className="text-link-button" onClick={() => switchMode('register')}>Create the account again</button>
              </p>
            </>
          )}

          {/* â”€â”€ SIGN IN â”€â”€ */}
          {mode === 'login' && !success && !pendingVerificationEmail && (
            <>
              <div className="auth-form-header">
                <h2>Welcome Back</h2>
                <p>Sign in to your teaching portal.</p>
              </div>
              {error && <p className="form-error form-error-inline" role="alert">{error}</p>}

              {/* Social login */}
              <div className="social-login-grid">
                <button className="social-login-btn google" type="button" onClick={() => { window.location.href = '/api/auth/google?intent=login&next=/portal'; }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Google</span>
                </button>

                <button className="social-login-btn facebook" type="button" onClick={() => { window.location.href = '/api/auth/facebook?intent=login&next=/portal'; }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                  <span>Facebook</span>
                </button>

              </div>

              <div className="auth-divider">or continue with email</div>

              <form onSubmit={handleLogin} noValidate>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="form-group has-forgot">
                  <label className="form-label">
                    Password
                    <button type="button" className="forgot-link" onClick={() => switchMode('forgot')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--navy)', fontWeight: 600, textDecoration: 'underline' }}>
                      Forgot password?
                    </button>
                  </label>
                  <div className="password-field">
                    <input
                      className="form-input"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      style={{ paddingRight: 44 }}
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPass(!showPass)}>
                      <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} stroke={1.9} />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
              <p className="auth-switch-copy">
                New to RealMindX? <a href="/register">Create an Account</a>
              </p>
            </>
          )}

          {/* ── REGISTER ── */}
          {mode === 'register' && !pendingVerificationEmail && (
            <>
              <div className="auth-form-header">
                <h2>Create Your Account</h2>
                <p>Join thousands of teachers building their careers with RealMindX.</p>
              </div>
              {error && <p className="form-error form-error-inline" role="alert">{error}</p>}

              <form onSubmit={handleRegister} noValidate>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">First Name *</label>
                    <input className="form-input" ref={firstNameRef} aria-invalid={Boolean(fieldErrors.firstName)} placeholder="Kwame" value={firstName} onChange={e => setFirstName(e.target.value)} />
                    {fieldErrors.firstName && <p className="form-error">{fieldErrors.firstName}</p>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input className="form-input" placeholder="Mensah" value={lastName} onChange={e => setLastName(e.target.value)} />
                  </div>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Sex</label>
                    <select className="form-input" value={sex} onChange={event => setSex(event.target.value)}>
                      <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Age Range</label>
                    <select className="form-input" value={ageRange} onChange={event => setAgeRange(event.target.value)}>
                      <option value="">Prefer not to say</option><option value="under_18">Under 18</option><option value="18_24">18-24</option><option value="25_34">25-34</option><option value="35_44">35-44</option><option value="45_54">45-54</option><option value="55_64">55-64</option><option value="65_plus">65+</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input className="form-input" ref={emailRef} aria-invalid={Boolean(fieldErrors.email)} type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                  {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <div className="password-field">
                    <input
                      className="form-input"
                      ref={passwordRef}
                      aria-invalid={Boolean(fieldErrors.password)}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="new-password"
                      style={{ paddingRight: 44 }}
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPass(!showPass)}>
                      <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} stroke={1.9} />
                    </button>
                  </div>
                  {fieldErrors.password && <p className="form-error">{fieldErrors.password}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password *</label>
                  <div className="password-field">
                    <input className="form-input" ref={confirmRef} aria-invalid={Boolean(fieldErrors.confirmPass)} type={showPass ? 'text' : 'password'} placeholder="Repeat your password"
                      value={confirmPass} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={{ paddingRight: 44 }} />
                    <button type="button" className="password-toggle" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                      <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} stroke={1.9} />
                    </button>
                  </div>
                  {fieldErrors.confirmPass && <p className="form-error">{fieldErrors.confirmPass}</p>}
                </div>

                <label className="auth-terms-check">
                  <input
                    ref={termsRef}
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={event => {
                      setAcceptedTerms(event.target.checked);
                      if (event.target.checked) setFieldErrors(prev => ({ ...prev, terms: undefined }));
                    }}
                  />
                  <span>
                    I agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.
                  </span>
                </label>
                {fieldErrors.terms && <p className="form-error form-error-inline">{fieldErrors.terms}</p>}
                <TurnstileField key={turnstileKey} className="turnstile-slot" onVerify={setTurnstileToken} />

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <div className="auth-divider">or sign up with</div>

              <div className="social-login-grid">
                <button className="social-login-btn google" type="button" onClick={() => startSocialSignup('google')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Sign up with Google</span>
                </button>
                <button className="social-login-btn facebook" type="button" onClick={() => startSocialSignup('facebook')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                  <span>Sign up with Facebook</span>
                </button>
              </div>
              <p className="auth-switch-copy">
                Already have an account? <a href="/login">Sign in on the login page</a>
              </p>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && !success && (
            <>
              <button
                onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-600)', fontSize: '0.85rem', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                Back to Sign In
              </button>

              <div className="auth-form-header">
                <h2>Reset Password</h2>
                <p>Enter your email and we will send you a reset link.</p>
              </div>

              <form onSubmit={handleForgot} noValidate>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input className="form-input" type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary btn-lg" disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
      </div>
      <Footer />
    </>
  );
};

export const PasswordResetPage = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event) => {
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
    if (password !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await confirmPasswordReset({ token, password });
      setSuccess(result?.message || 'Password updated. You can now sign in.');
      setPassword('');
      setConfirmPass('');
      toast.success('Your password has been updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav activePage="jobs" solid />
      <div className="auth-page auth-page-shell">
        <div className="auth-layout">
          <div className="auth-panel-brand">
            <div className="auth-brand-content">
              <h1 className="auth-brand-quote">
                Secure Your<br />RealMindX<br /><span>Account.</span>
              </h1>
              <p className="auth-brand-sub">
                Choose a new password for the account you use across RealMindX Education and the RealMindX Bookshop.
              </p>
            </div>
          </div>
          <div className="auth-panel-form">
            <div className="auth-form-header">
              <h2>Create a New Password</h2>
              <p>Use at least 8 characters and choose a password you do not use elsewhere.</p>
            </div>
            {success ? (
              <div className="auth-success-panel" role="status">
                <p>{success}</p>
                <a className="btn btn-primary btn-lg" href="/login" style={{ width: '100%', justifyContent: 'center' }}>
                  Continue to Sign In
                </a>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <div className="password-field">
                    <input
                      className="form-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Minimum 8 characters"
                      required
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} stroke={1.9} />
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <div className="password-field">
                    <input
                      className="form-input"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPass}
                      onChange={event => setConfirmPass(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Repeat your new password"
                      required
                      style={{ paddingRight: 44 }}
                    />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} stroke={1.9} />
                    </button>
                  </div>
                </div>
                {error && <p className="form-error form-error-inline" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Updating password...' : 'Update Password'}
                </button>
                <p className="auth-switch-copy"><a href="/login">Back to Sign In</a></p>
              </form>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default { AdminLoginPage, PasswordResetPage, UserLoginPage };
