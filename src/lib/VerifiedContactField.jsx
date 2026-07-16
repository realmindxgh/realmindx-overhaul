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

const WhatsAppGlyph = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M16 4.4A11.2 11.2 0 0 0 6.5 21.6L5 27l5.6-1.5A11.2 11.2 0 1 0 16 4.4Z" />
    <path d="M12.1 10.1c-.3-.7-.6-.7-.9-.7h-.8c-.3 0-.8.1-1.2.6-.4.4-1.5 1.5-1.5 3.6s1.6 4.2 1.8 4.5c.2.3 3.1 5 7.8 6.8 3.9 1.5 4.7 1.2 5.5 1.1.8-.1 2.7-1.1 3.1-2.2.4-1.1.4-2 .3-2.2-.1-.2-.4-.3-.8-.5l-2.8-1.3c-.4-.2-.7-.2-1 .2-.3.4-1.1 1.3-1.4 1.6-.3.3-.5.3-.9.1-.4-.2-1.8-.7-3.4-2.1-1.2-1.1-2.1-2.5-2.3-2.9-.2-.4 0-.6.2-.8.2-.2.4-.5.6-.7.2-.2.3-.4.4-.7.1-.3 0-.5 0-.7l-1.3-3Z" />
  </svg>
);

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
  const [channel, setChannel] = React.useState('sms');
  const [waitSeconds, setWaitSeconds] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const isWhatsAppInbound = Boolean(challenge && (
    challenge.verification_mode === 'whatsapp_inbound'
    || challenge.delivery_channel === 'whatsapp_inbound'
  ));

  React.useEffect(() => {
    if (!editing && !challenge) setNextValue(value || '');
  }, [challenge, editing, value]);

  React.useEffect(() => {
    if (waitSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setWaitSeconds(seconds => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitSeconds]);

  const reset = () => {
    setEditing(false);
    setChallenge(null);
    setOtp('');
    setWaitSeconds(0);
    setChecking(false);
    setError('');
    setMessage('');
    setNextValue(value || '');
  };

  const requestCode = async event => {
    event?.preventDefault();
    setError('');
    setMessage('');
    if (!nextValue.trim()) {
      setError(`Enter the ${meta.title.toLowerCase()} you want to use.`);
      return;
    }
    setBusy(true);
    try {
      if (!isApiMode()) {
        setChallenge(channel === 'whatsapp'
          ? {
              challenge_id: 'local',
              destination: nextValue,
              channel,
              delivery_channel: 'whatsapp_inbound',
              verification_mode: 'whatsapp_inbound',
              challenge_phrase: 'RMX VERIFY 123456',
              whatsapp_number: '+233201166122',
              whatsapp_url: 'https://wa.me/233201166122?text=RMX%20VERIFY%20123456',
            }
          : { challenge_id: 'local', destination: nextValue, channel });
        setWaitSeconds(45);
        setMessage(`Local ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} preview code: 123456`);
        return;
      }
      const result = await api.requestContactChange({ field, value: nextValue.trim(), channel });
      setChallenge(result);
      setWaitSeconds(result.next_request_in_seconds || 45);
      setMessage(result.message || 'Verification code sent.');
    } catch (requestError) {
      if (requestError.data?.retry_after_seconds) {
        setWaitSeconds(requestError.data.retry_after_seconds);
      }
      setError(requestError.message || 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  };

  const finishVerified = React.useCallback(async () => {
    const session = await syncSessionFromApi();
    onUpdated?.(session);
    setMessage(`${meta.title} updated and verified.`);
    setChallenge(null);
    setEditing(false);
    setOtp('');
    setChecking(false);
  }, [meta.title, onUpdated]);

  const checkWhatsAppStatus = React.useCallback(async ({ silent = false } = {}) => {
    if (!challenge?.challenge_id || !isApiMode()) return;
    if (!silent) {
      setChecking(true);
      setError('');
    }
    try {
      const status = await api.getContactChangeStatus(challenge.challenge_id);
      if (status?.verified) {
        await finishVerified();
        return;
      }
      if (status?.status === 'wrong_number') {
        setError(status.message || 'The challenge came from a different WhatsApp number. Use the WhatsApp account for the number you entered, or change the number.');
      } else if (status?.status === 'wrong_message') {
        setError(status.message || 'WhatsApp received a message from your number, but it did not match the challenge. Send the prepared message exactly as shown.');
      } else if (status?.status === 'expired') {
        setError(status.message || 'This WhatsApp challenge has expired. Send a fresh one.');
      } else if (!silent) {
        setMessage(status?.message || 'Still waiting for the WhatsApp message.');
      }
    } catch (statusError) {
      if (!silent) setError(statusError.message || 'Could not check the WhatsApp challenge yet.');
    } finally {
      if (!silent) setChecking(false);
    }
  }, [challenge?.challenge_id, finishVerified]);

  React.useEffect(() => {
    if (!isWhatsAppInbound || !challenge?.challenge_id || !isApiMode()) return undefined;
    const timer = window.setInterval(() => {
      checkWhatsAppStatus({ silent: true });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [challenge?.challenge_id, checkWhatsAppStatus, isWhatsAppInbound]);

  const resendCode = async () => {
    if (waitSeconds > 0 || busy) return;
    setOtp('');
    await requestCode();
  };

  const changeNumber = () => {
    setChallenge(null);
    setOtp('');
    setError('');
    setMessage('');
    setChecking(false);
    setEditing(true);
  };

  const verifyCode = async event => {
    event.preventDefault();
    setError('');
    if (isWhatsAppInbound) {
      if (!isApiMode()) {
        await finishVerified();
        return;
      }
      await checkWhatsAppStatus();
      return;
    }
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
      await finishVerified();
    } catch (verifyError) {
      setError(verifyError.message || 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  const whatsAppChallenge = isWhatsAppInbound ? (
    <div className="verified-contact-whatsapp-challenge">
      <div className="verified-contact-whatsapp-heading">
        <WhatsAppGlyph className="verified-contact-whatsapp-icon" />
        <span>WhatsApp challenge</span>
      </div>
      <p className="verified-contact-whatsapp-warning">
        If this phone has two WhatsApp accounts, select the account for the number you are verifying. Do not edit, shorten, add words, or add emojis to the prepared message.
      </p>
      <span className="verified-contact-whatsapp-label">Message to send</span>
      <strong>{challenge.challenge_phrase}</strong>
      <p>
        Send this exact message to {challenge.whatsapp_number}. It must come from the phone number you are verifying.
      </p>
      {challenge.whatsapp_url && (
        <a className="verified-contact-whatsapp-open" href={challenge.whatsapp_url} target="_blank" rel="noopener noreferrer">
          <WhatsAppGlyph className="verified-contact-whatsapp-open-icon" />
          Open WhatsApp
        </a>
      )}
    </div>
  ) : null;

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
          {field === 'phone' && (
            <fieldset className="verified-contact-channel">
              <legend>Send code by</legend>
              <label>
                <input type="radio" name="verification-channel" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} />
                <span>SMS</span>
              </label>
              <label>
                <input type="radio" name="verification-channel" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                <WhatsAppGlyph className="verified-contact-channel-icon" />
                <span>WhatsApp</span>
              </label>
            </fieldset>
          )}
          <div className="verified-contact-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? 'Sending...' : 'Send verification code'}
            </button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}

      {challenge && isWhatsAppInbound && (
        <div className="verified-contact-form">
          {whatsAppChallenge}
          <div className="verified-contact-form-actions">
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={() => checkWhatsAppStatus()} disabled={checking}>
              {checking ? 'Checking...' : "I've sent it, check status"}
            </button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={changeNumber}>Change number</button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={reset}>Cancel</button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={resendCode} disabled={busy || waitSeconds > 0}>
              {waitSeconds > 0 ? `Try again in ${waitSeconds}s` : 'Create a new challenge'}
            </button>
          </div>
        </div>
      )}

      {challenge && !isWhatsAppInbound && (
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
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={resendCode} disabled={busy || waitSeconds > 0}>
              {waitSeconds > 0 ? `Send again in ${waitSeconds}s` : `Send again by ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
            </button>
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
                {isWhatsAppInbound
                  ? `Send the challenge from ${challenge.destination} to ${challenge.whatsapp_number}.`
                  : challenge
                  ? `Enter the 6 digit code sent to ${challenge.destination}.`
                  : `We will verify the new ${meta.title.toLowerCase()} before updating your shared RealMindX account.`}
              </p>
              {isWhatsAppInbound ? (
                whatsAppChallenge
              ) : challenge ? (
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
                <>
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
                  {field === 'phone' && (
                    <fieldset className="verified-contact-channel">
                      <legend>Send code by</legend>
                      <label>
                        <input type="radio" name="verification-channel-modal" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} />
                        <span>SMS</span>
                      </label>
                      <label>
                        <input type="radio" name="verification-channel-modal" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                        <WhatsAppGlyph className="verified-contact-channel-icon" />
                        <span>WhatsApp</span>
                      </label>
                    </fieldset>
                  )}
                </>
              )}
              {error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}
              {message && <p className="verified-contact-feedback">{message}</p>}
            </div>
            <div className="bs-modal-foot">
              <button type="button" className="bs-btn bs-btn-outline-navy" onClick={reset}>Cancel</button>
              {challenge && (
                isWhatsAppInbound ? (
                  <button type="button" className="bs-btn bs-btn-outline-navy" onClick={changeNumber}>Change number</button>
                ) : null
              )}
              {challenge && (
                <button type="button" className="bs-btn bs-btn-outline-navy" onClick={resendCode} disabled={busy || waitSeconds > 0}>
                  {waitSeconds > 0 ? `Try again in ${waitSeconds}s` : isWhatsAppInbound ? 'New challenge' : `Send again by ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
                </button>
              )}
              <button type="submit" className="bs-btn bs-btn-navy" disabled={busy || checking}>
                {isWhatsAppInbound
                  ? (checking ? 'Checking...' : 'Check status')
                  : busy ? (challenge ? 'Verifying...' : 'Sending...') : (challenge ? 'Verify and update' : 'Send verification code')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
