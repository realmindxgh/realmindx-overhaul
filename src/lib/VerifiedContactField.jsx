import React from 'react';
import { api, isApiMode } from './apiClient.js';
import { syncSessionFromApi } from './authClient.js';

const labels = {
  email: {
    title: 'Email address',
    placeholder: 'you@example.com',
    inputMode: 'email',
  },
  phone: {
    title: 'Phone number',
    placeholder: '+233 24 000 0000',
    inputMode: 'tel',
  },
};

export default function VerifiedContactField({
  field,
  value,
  verified,
  onUpdated,
  className = '',
  icon = null,
  editLabel = '',
  modal = false,
}) {
  const meta = labels[field];
  const [editing, setEditing] = React.useState(false);
  const [nextValue, setNextValue] = React.useState(value || '');
  const [challenge, setChallenge] = React.useState(null);
  const [otp, setOtp] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (!editing && !challenge) setNextValue(value || '');
  }, [challenge, editing, value]);

  const reset = () => {
    setEditing(false);
    setChallenge(null);
    setOtp('');
    setError('');
    setMessage('');
    setNextValue(value || '');
  };

  const requestCode = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!nextValue.trim()) {
      setError(`Enter the ${meta.title.toLowerCase()} you want to use.`);
      return;
    }
    setBusy(true);
    try {
      if (!isApiMode()) {
        setChallenge({ challenge_id: 'local', destination: nextValue });
        setMessage('Local preview code: 123456');
        return;
      }
      const result = await api.requestContactChange({ field, value: nextValue.trim() });
      setChallenge(result);
      setMessage(result.message || 'Verification code sent.');
    } catch (requestError) {
      setError(requestError.message || 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async event => {
    event.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Enter the 6 digit verification code.');
      return;
    }
    setBusy(true);
    try {
      if (isApiMode()) {
        await api.verifyContactChange({ challenge_id: challenge.challenge_id, otp });
      } else if (otp !== '123456') {
        throw new Error('Use 123456 for the local preview.');
      }
      const session = await syncSessionFromApi();
      onUpdated?.(session);
      setMessage(`${meta.title} updated and verified.`);
      setChallenge(null);
      setEditing(false);
      setOtp('');
    } catch (verifyError) {
      setError(verifyError.message || 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  const inlineEditor = (
    <>
      {editing && !challenge && (
        <form className="verified-contact-form" onSubmit={requestCode}>
          <label>
            New {meta.title.toLowerCase()}
            <input
              type={field === 'email' ? 'email' : 'tel'}
              inputMode={meta.inputMode}
              autoComplete={field}
              placeholder={meta.placeholder}
              value={nextValue}
              onChange={event => setNextValue(event.target.value)}
              autoFocus
            />
          </label>
          <div className="verified-contact-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? 'Sending...' : 'Send verification code'}
            </button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}

      {challenge && (
        <form className="verified-contact-form" onSubmit={verifyCode}>
          <label>
            Code sent to {challenge.destination}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={otp}
              onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
          </label>
          <div className="verified-contact-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify and update'}
            </button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}
      {message && <p className="verified-contact-feedback">{message}</p>}
    </>
  );

  return (
    <div className={`verified-contact ${className}`.trim()}>
      <div className="verified-contact-main">
        {icon ? (
          <div className="verified-contact-copy has-icon">
            <span className="verified-contact-row-icon">{icon}</span>
            <div>
              <span className="verified-contact-label">{meta.title}</span>
              <strong className="verified-contact-value">{value || 'Not set'}</strong>
            </div>
          </div>
        ) : (
          <div>
            <span className="verified-contact-label">{meta.title}</span>
            <strong className="verified-contact-value">{value || 'Not set'}</strong>
          </div>
        )}
        <div className="verified-contact-actions">
          <span className={`verified-contact-badge ${verified ? 'is-verified' : 'needs-verification'}`}>
            {verified ? 'Verified' : 'Verification needed'}
          </span>
          <button type="button" className="verified-contact-edit" onClick={() => { setEditing(true); setError(''); setMessage(''); }}>
            {editLabel || (value ? 'Change' : 'Add')}
          </button>
        </div>
      </div>

      {!modal && inlineEditor}
      {modal && (editing || challenge) && (
        <div className="bs-modal-scrim" onClick={event => { if (event.target === event.currentTarget) reset(); }}>
          <form className="bs-modal-box bs-account-contact-modal" onSubmit={challenge ? verifyCode : requestCode} role="dialog" aria-modal="true" aria-label={`Edit ${meta.title.toLowerCase()}`}>
            <div className="bs-modal-head">
              <div>
                <span className="bs-account-ref-modal-kicker">Contact details</span>
                <h2>{challenge ? `Verify ${meta.title.toLowerCase()}` : `Edit ${meta.title.toLowerCase()}`}</h2>
              </div>
              <button className="bs-modal-close" type="button" onClick={reset} aria-label="Close">
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="bs-modal-body">
              <p className="bs-account-security-intro">
                {challenge
                  ? `Enter the 6 digit code sent to ${challenge.destination}.`
                  : `We will verify the new ${meta.title.toLowerCase()} before updating your shared RealMindX account.`}
              </p>
              {challenge ? (
                <label className="bs-field">
                  <span>Verification code</span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    value={otp}
                    onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                  />
                </label>
              ) : (
                <label className="bs-field">
                  <span>New {meta.title.toLowerCase()}</span>
                  <input
                    type={field === 'email' ? 'email' : 'tel'}
                    inputMode={meta.inputMode}
                    autoComplete={field}
                    placeholder={meta.placeholder}
                    value={nextValue}
                    onChange={event => setNextValue(event.target.value)}
                    autoFocus
                  />
                </label>
              )}
              {error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}
              {message && <p className="verified-contact-feedback">{message}</p>}
            </div>
            <div className="bs-modal-foot">
              <button type="button" className="bs-btn bs-btn-outline-navy" onClick={reset}>Cancel</button>
              <button type="submit" className="bs-btn bs-btn-navy" disabled={busy}>
                {busy ? (challenge ? 'Verifying...' : 'Sending...') : (challenge ? 'Verify and update' : 'Send verification code')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
