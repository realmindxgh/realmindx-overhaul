import React from 'react';
import { Icon } from './shared.jsx';
import TurnstileField from '../src/lib/TurnstileField.jsx';
import { api } from '../src/lib/apiClient.js';
import { getDemoSession } from '../src/lib/demoAccounts.js';
import { bookshopPathForRoute } from './urls.js';
import { AsyncButtonContent } from '../src/lib/AsyncUI.jsx';

const ON_SUBDOMAIN = typeof window !== 'undefined' && window.location.hostname.startsWith('bookshop.');
const PREFIX = ON_SUBDOMAIN ? '' : '/bookshop';
const hrefForRoute = (route, params = {}) => `${PREFIX}${bookshopPathForRoute(route, params)}`;

const PRESEED_KEY = 'bs:request-preseed';

const readPreseed = () => {
  if (typeof window === 'undefined') return { title: '', context: undefined };
  try {
    const raw = sessionStorage.getItem(PRESEED_KEY);
    if (raw) {
      sessionStorage.removeItem(PRESEED_KEY);
      const parsed = JSON.parse(raw);
      return {
        title: typeof parsed?.title === 'string' ? parsed.title : '',
        context: parsed?.context || undefined,
      };
    }
  } catch (err) { /* ignore */ }
  return { title: '', context: undefined };
};

const emptyForm = (session, title) => ({
  requested_title: title,
  customer_name: session?.full_name || session?.name || '',
  email: session?.email || '',
  phone: session?.phone || '',
  author: '',
  publisher: '',
  level: '',
  notes: '',
});

const RequestBookPage = ({ navigate }) => {
  const session = getDemoSession();
  const initial = React.useMemo(readPreseed, []);
  const [form, setForm] = React.useState(() => emptyForm(session, initial.title));
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const submit = async event => {
    event.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Enter an email address or phone number so we can contact you.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.createBookRequest({
        ...form,
        search_query: initial.title || undefined,
        browse_context: initial.context,
        turnstile_token: turnstileToken,
      });
      setResult(response.request);
    } catch (err) {
      setError(err?.message || 'We could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setResult(null);
    setForm(emptyForm(session, ''));
    setTurnstileToken('');
    setError('');
  };

  return (
    <div className="bs-container bs-fade-page">
      <div className="bs-breadcrumb">
        <a href={hrefForRoute('home')} onClick={(event) => { event.preventDefault(); navigate('home'); }}>Home</a>
        <span className="bs-sep">/</span><span className="bs-cur">Request a Book</span>
      </div>
      <div className="bs-request-page-head">
        <span className="bs-eyebrow" style={{ color: 'var(--bs-gold-dark)' }}>Cannot find a book?</span>
        <h1 className="bs-h2" style={{ color: 'var(--bs-navy)', fontSize: 36, marginTop: 12 }}>Request it from RealMindX.</h1>
        <p className="bs-request-intro">Tell us what you need and where to reach you. We will notify you as soon as it is available.</p>
      </div>
      <div className="bs-request-page-card">
        {result ? (
          <div className="bs-request-success" role="status">
            <span className="bs-request-success-icon"><Icon name="check" size={24} /></span>
            <p>We will contact you when it becomes available. Keep this reference for your records.</p>
            <strong>{result.reference}</strong>
            <div className="bs-request-page-actions">
              <button type="button" className="bs-btn bs-btn-gold" onClick={restart}>Request another book</button>
              <button type="button" className="bs-btn bs-btn-navy" onClick={() => navigate('shop')}>Back to the shop</button>
            </div>
          </div>
        ) : (
          <form className="bs-request-form" onSubmit={submit} noValidate>
            <div className="bs-request-grid">
              <label className="wide"><span>Book title or search term *</span><input value={form.requested_title} onChange={event => update('requested_title', event.target.value)} required /></label>
              <label><span>Your name *</span><input value={form.customer_name} onChange={event => update('customer_name', event.target.value)} required /></label>
              <label><span>Email address *</span><input type="email" value={form.email} onChange={event => update('email', event.target.value)} /></label>
              <label><span>Phone number *</span><input type="tel" value={form.phone} onChange={event => update('phone', event.target.value)} /></label>
              <label><span>Author</span><input value={form.author} onChange={event => update('author', event.target.value)} /></label>
              <label><span>Publisher</span><input value={form.publisher} onChange={event => update('publisher', event.target.value)} /></label>
              <label><span>Level or class</span><input value={form.level} onChange={event => update('level', event.target.value)} /></label>
              <label className="wide"><span>Anything else?</span><textarea rows="3" value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
            </div>
            <TurnstileField className="bs-turnstile-wrap" onVerify={setTurnstileToken} />
            {error && <p className="bs-request-error" role="alert">{error}</p>}
            <button type="submit" className="bs-btn bs-btn-gold bs-btn-lg" disabled={busy} aria-busy={busy}><AsyncButtonContent pending={busy} pendingLabel="Sending book request…">Send book request</AsyncButtonContent></button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RequestBookPage;
