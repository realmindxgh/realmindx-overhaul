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

  return (
    <div className={`verified-contact ${className}`.trim()}>
      <div className="verified-contact-main">
        <div>
          <span className="verified-contact-label">{meta.title}</span>
          <strong className="verified-contact-value">{value || 'Not set'}</strong>
        </div>
        <div className="verified-contact-actions">
          <span className={`verified-contact-badge ${verified ? 'is-verified' : 'needs-verification'}`}>
            {verified ? 'Verified' : 'Verification needed'}
          </span>
          <button type="button" className="verified-contact-edit" onClick={() => { setEditing(true); setError(''); setMessage(''); }}>
            {value ? 'Change' : 'Add'}
          </button>
        </div>
      </div>

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
    </div>
  );
}
