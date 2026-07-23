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
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);

const WHATSAPP_VERIFICATION_PHRASE = 'Verify my RealMindX number';
const WHATSAPP_VERIFICATION_NUMBER = '+233257125229';
const WHATSAPP_VERIFICATION_URL = `https://wa.me/${WHATSAPP_VERIFICATION_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent(WHATSAPP_VERIFICATION_PHRASE)}`;

export default function VerifiedContactField({
  field,
  value,
  verified,
  onUpdated,
  className = '',
  icon = null,
  editLabel = '',
  modal = true,
  whatsappAllowed = false,
}) {
  const meta = labels[field];
  const canUseWhatsApp = field === 'phone' && whatsappAllowed;
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
  const [success, setSuccess] = React.useState(null);
  const isWhatsAppInbound = Boolean(challenge && (
    challenge.verification_mode === 'whatsapp_inbound'
    || challenge.delivery_channel === 'whatsapp_inbound'
  ));

  React.useEffect(() => {
    if (!canUseWhatsApp && channel === 'whatsapp') {
      setChannel('sms');
    }
  }, [canUseWhatsApp, channel]);

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
    setChannel('sms');
    setWaitSeconds(0);
    setChecking(false);
    setError('');
    setMessage('');
    setSuccess(null);
    setNextValue(value || '');
  };

  const openEditor = () => {
    setEditing(true);
    setChallenge(null);
    setOtp('');
    setChannel('sms');
    setWaitSeconds(0);
    setChecking(false);
    setError('');
    setMessage('');
    setSuccess(null);
    setNextValue(value || '');
  };

  const requestCode = async event => {
    event?.preventDefault();
    setError('');
    setMessage('');
    setSuccess(null);
    if (!nextValue.trim()) {
      setError(`Enter the ${meta.title.toLowerCase()} you want to use.`);
      return;
    }
    setBusy(true);
    const requestChannel = field === 'phone'
      ? (canUseWhatsApp ? channel : 'sms')
      : 'email';
    try {
      if (!isApiMode()) {
        setChallenge(requestChannel === 'whatsapp'
          ? {
              challenge_id: 'local',
              destination: nextValue,
              channel: requestChannel,
              delivery_channel: 'whatsapp_inbound',
              verification_mode: 'whatsapp_inbound',
              challenge_phrase: WHATSAPP_VERIFICATION_PHRASE,
              whatsapp_number: WHATSAPP_VERIFICATION_NUMBER,
              whatsapp_url: WHATSAPP_VERIFICATION_URL,
            }
          : { challenge_id: 'local', destination: nextValue, channel: requestChannel });
        setWaitSeconds(45);
        setMessage(requestChannel === 'whatsapp'
          ? 'Local WhatsApp preview: send the prefilled message without changing it.'
          : field === 'phone' ? 'Local SMS preview code: 123456' : 'Local preview code: 123456');
        return;
      }
      const result = await api.requestContactChange({ field, value: nextValue.trim(), channel: requestChannel });
      setChallenge(result);
      setWaitSeconds(result.next_request_in_seconds || 45);
      const isWhatsAppResult = result.verification_mode === 'whatsapp_inbound' || result.delivery_channel === 'whatsapp_inbound';
      setMessage(isWhatsAppResult
        ? 'Waiting for the WhatsApp verification message. We are checking automatically every few seconds.'
        : (result.message || 'Verification code sent.'));
    } catch (requestError) {
      if (requestError.data?.retry_after_seconds) {
        setWaitSeconds(requestError.data.retry_after_seconds);
      }
      setError(requestError.message || (requestChannel === 'whatsapp' ? 'Could not start WhatsApp verification.' : 'Could not send the verification code.'));
    } finally {
      setBusy(false);
    }
  };

  const finishVerified = React.useCallback(async () => {
    const session = await syncSessionFromApi();
    onUpdated?.(session);
    setChallenge(null);
    setEditing(false);
    setOtp('');
    setChecking(false);
    setError('');
    setMessage('');
    setSuccess({
      title: `${meta.title} verified`,
      body: field === 'phone'
        ? 'Your phone number has been verified and saved to your RealMindX account.'
        : 'Your email address has been verified and saved to your RealMindX account.',
    });
  }, [field, meta.title, onUpdated]);

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
      } else if (status?.status === 'expired') {
        setError(status.message || 'This WhatsApp verification has expired. Start a fresh one.');
      } else if (!silent) {
        setMessage(status?.message || 'Still waiting for the WhatsApp verification message.');
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
    }, 5000);
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
        <span className="verified-contact-whatsapp-icon-wrap">
          <WhatsAppGlyph className="verified-contact-whatsapp-icon" />
        </span>
        <div>
          <span>Verify your WhatsApp number</span>
          <p>Tap the button below, then send the prefilled WhatsApp message without changing it.</p>
        </div>
      </div>
      <div className="verified-contact-whatsapp-panel">
        <div>
          <span>Send to</span>
          <strong>{challenge.whatsapp_number}</strong>
        </div>
        <div>
          <span>Message to send</span>
          <strong>{challenge.challenge_phrase || WHATSAPP_VERIFICATION_PHRASE}</strong>
        </div>
        <div>
          <span>From</span>
          <strong>{challenge.destination}</strong>
        </div>
      </div>
      <p className="verified-contact-whatsapp-route">
        Keep this RealMindX window open after sending. The message must be sent from the phone number you are verifying.
      </p>
      <div className="verified-contact-whatsapp-note">
        <strong>Important</strong>
        <p>If this phone has two WhatsApp accounts, select the account for the number you entered. Do not edit the prepared message.</p>
      </div>
      {challenge.whatsapp_url && (
        <a className="verified-contact-whatsapp-open" href={challenge.whatsapp_url} target="_blank" rel="noopener noreferrer">
          <WhatsAppGlyph className="verified-contact-whatsapp-open-icon" />
          Open WhatsApp
        </a>
      )}
    </div>
  ) : null;

  const modalTitle = challenge
    ? `Verify ${meta.title.toLowerCase()}`
    : `${value ? 'Change' : 'Add'} ${meta.title.toLowerCase()}`;

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
              <legend>Choose verification method</legend>
              <label>
                <input type="radio" name="verification-channel" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} />
                <span>SMS</span>
              </label>
              {canUseWhatsApp && (
                <label>
                  <input type="radio" name="verification-channel" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                  <WhatsAppGlyph className="verified-contact-channel-icon" />
                  <span>WhatsApp</span>
                </label>
              )}
            </fieldset>
          )}
          <div className="verified-contact-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? 'Sending...' : channel === 'whatsapp' ? 'Verify with WhatsApp' : 'Send SMS code'}
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
              {checking ? 'Checking...' : 'Check now'}
            </button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={changeNumber}>Change number</button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={reset}>Cancel</button>
            <button type="button" className="btn btn-outline-navy btn-sm" onClick={resendCode} disabled={busy || waitSeconds > 0}>
              {waitSeconds > 0 ? `Retry in ${waitSeconds}s` : 'Start again'}
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
    <div className={`verified-contact ${className}`.trim()} data-contact-field={field}>
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
          <button type="button" className="verified-contact-edit" onClick={openEditor}>
            {editLabel || (value ? 'Change' : 'Add')}
          </button>
        </div>
      </div>

      {!modal && inlineEditor}
      {modal && success && (
        <div className="verified-contact-modal-scrim">
          <div className="verified-contact-modal-card is-success" role="dialog" aria-modal="true" aria-label={success.title}>
            <button className="verified-contact-modal-close" type="button" onClick={() => setSuccess(null)} aria-label="Close">
              <span aria-hidden="true">×</span>
            </button>
            <div className="verified-contact-success-body">
              <span className="verified-contact-success-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="verified-contact-modal-kicker">Verified</span>
              <h2>{success.title}</h2>
              <p>{success.body}</p>
              <button type="button" className="verified-contact-modal-btn is-primary" onClick={() => setSuccess(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {modal && (editing || challenge) && (
        <div className="verified-contact-modal-scrim" onClick={event => { if (event.target === event.currentTarget) reset(); }}>
          <form className={`verified-contact-modal-card ${isWhatsAppInbound ? 'has-whatsapp-challenge' : ''}`} onSubmit={challenge ? verifyCode : requestCode} role="dialog" aria-modal="true" aria-label={modalTitle}>
            <div className="verified-contact-modal-head">
              <div>
                <span className="verified-contact-modal-kicker">Contact details</span>
                <h2>{modalTitle}</h2>
              </div>
              <button className="verified-contact-modal-close" type="button" onClick={reset} aria-label="Close">
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="verified-contact-modal-body">
              <p className="verified-contact-modal-intro">
                {isWhatsAppInbound
                  ? 'Send the prefilled WhatsApp message from the phone number you entered. RealMindX checks automatically.'
                  : challenge
                  ? `Enter the 6 digit code sent to ${challenge.destination}.`
                  : `We will verify the new ${meta.title.toLowerCase()} before updating your RealMindX account.`}
              </p>
              {isWhatsAppInbound ? (
                whatsAppChallenge
              ) : challenge ? (
                <label className="verified-contact-modal-field">
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
                  <label className="verified-contact-modal-field">
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
                      <legend>Choose verification method</legend>
                      <label>
                        <input type="radio" name="verification-channel-modal" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} />
                        <span>SMS</span>
                      </label>
                      {canUseWhatsApp && (
                        <label>
                          <input type="radio" name="verification-channel-modal" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                          <WhatsAppGlyph className="verified-contact-channel-icon" />
                          <span>WhatsApp</span>
                        </label>
                      )}
                    </fieldset>
                  )}
                </>
              )}
              {error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}
              {message && <p className="verified-contact-feedback">{message}</p>}
            </div>
            <div className={`verified-contact-modal-foot ${isWhatsAppInbound ? 'is-whatsapp' : ''}`}>
              <div className="verified-contact-modal-secondary-actions">
                <button type="button" className="verified-contact-modal-btn is-outline" onClick={reset}>Cancel</button>
                {challenge && isWhatsAppInbound && (
                  <button type="button" className="verified-contact-modal-btn is-outline" onClick={changeNumber}>Change number</button>
                )}
                {challenge && waitSeconds <= 0 && (
                  <button type="button" className="verified-contact-modal-btn is-outline" onClick={resendCode} disabled={busy || waitSeconds > 0}>
                    {isWhatsAppInbound ? 'Start again' : `Send again by ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
                  </button>
                )}
                {challenge && waitSeconds > 0 && (
                  <span className="verified-contact-countdown" aria-live="polite">
                    {waitSeconds}s
                  </span>
                )}
              </div>
              <button type="submit" className="verified-contact-modal-btn is-primary" disabled={busy || checking}>
                {isWhatsAppInbound
                  ? (checking ? 'Checking...' : 'Check now')
                  : busy ? (challenge ? 'Verifying...' : 'Sending...') : (challenge ? 'Verify and update' : channel === 'whatsapp' ? 'Verify with WhatsApp' : 'Send code')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
