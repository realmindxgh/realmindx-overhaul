import React from 'react';
import { api, isApiMode } from './apiClient.js';
import { syncSessionFromApi } from './authClient.js';
import { AsyncButtonContent } from './AsyncUI.jsx';

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

const PhoneGlyph = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7.1 3.4 9.8 7.8 7.9 9.7c1.2 2.6 3.4 4.8 6 6l1.9-1.9 4.5 2.7v2.8c0 1-.8 1.8-1.8 1.8C9.9 21.1 2.9 14.1 2.9 5.5c0-1 .8-1.8 1.8-1.8h2.4Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.7 3.8c2.8.7 4.9 2.8 5.6 5.6M14.7 7.3c1.2.4 2.2 1.3 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const SmsGlyph = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 4.5h16v11H10l-5 4v-4H4V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <circle cx="8.5" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="10" r="1" fill="currentColor" /><circle cx="15.5" cy="10" r="1" fill="currentColor" />
  </svg>
);

const VerificationMiniGlyph = ({ type }) => {
  if (type === 'message') return <SmsGlyph />;
  if (type === 'lock') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8.5 10V7.2a3.5 3.5 0 0 1 7 0V10M12 14v2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  if (type === 'bolt') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 2-7 11h5L10.5 22l7-12h-5l1-8Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /></svg>;
  if (type === 'refresh') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M18.2 9A7 7 0 0 0 6.4 6.4L4 9m16 6-2.4 2.6A7 7 0 0 1 5.8 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4 9h16M8 7h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
};

const VerificationArtwork = ({ whatsapp = false }) => (
  <svg className="phone-verification-artwork" viewBox="0 0 180 140" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={whatsapp ? 'waShield' : 'blueShield'} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor={whatsapp ? '#47df84' : '#78a7ff'} />
        <stop offset="1" stopColor={whatsapp ? '#05a94d' : '#0a5ee7'} />
      </linearGradient>
    </defs>
    <ellipse cx="88" cy="72" rx="65" ry="29" fill="none" stroke="#a9c3ff" strokeWidth="1.5" transform="rotate(-12 88 72)" />
    <circle cx="32" cy="35" r="4" fill={whatsapp ? '#1ab85c' : '#6799f6'} />
    <circle cx="144" cy="28" r="3" fill={whatsapp ? '#1ab85c' : '#6799f6'} />
    <path d="M88 24 128 42v36c0 27-17 43-40 51-23-8-40-24-40-51V42l40-18Z" fill={`url(#${whatsapp ? 'waShield' : 'blueShield'})`} stroke="#fff" strokeWidth="7" />
    {whatsapp ? <g transform="translate(66 47) scale(1.8)" fill="#fff"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.17 6.44 6.6 2.01 12.05 2.01c2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.89-9.88 9.89"/></g> : <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"><rect x="70" y="63" width="36" height="33" rx="5" fill="rgba(255,255,255,.16)"/><path d="M78 63V52a10 10 0 0 1 20 0v11"/><path d="M88 76v9"/></g>}
    <circle cx="124" cy="98" r="21" fill={whatsapp ? '#10af52' : '#1768e7'} stroke="#fff" strokeWidth="5" />
    <path d="m115 98 7 7 13-15" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const VerificationAside = ({ changing = false, whatsapp = false }) => (
  <aside className={`phone-verification-aside ${whatsapp ? 'is-whatsapp' : ''}`}>
    <VerificationArtwork whatsapp={whatsapp} />
    <h3>{whatsapp ? "We've got your back" : 'Secure verification'}</h3>
    <p>{whatsapp ? 'RealMindX verifies your number automatically and securely.' : 'We protect your account every step of the way.'}</p>
    <div className="phone-verification-aside-list">
      {(whatsapp ? [
        ['refresh', 'Automatic checking', 'We check for your message every few seconds.'],
        ['lock', 'Secure & private', 'Your number is encrypted and safe with RealMindX.'],
        ['window', 'Keep this window open', 'Do not close or refresh your browser while we verify.'],
      ] : [
        ['message', '', 'We send a one-time code to verify your number.'],
        ['lock', '', changing ? 'Your old number stays unchanged until confirmed.' : 'Your number will be added after it is confirmed.'],
        ['bolt', '', 'WhatsApp may be faster in most cases.'],
      ]).map(([icon, title, copy]) => <div key={copy}><span aria-hidden="true"><VerificationMiniGlyph type={icon} /></span><p>{title && <strong>{title}</strong>}{copy}</p></div>)}
    </div>
  </aside>
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
  const statusCheckInFlightRef = React.useRef(false);
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
    if (!challenge?.challenge_id || !isApiMode() || statusCheckInFlightRef.current) return;
    statusCheckInFlightRef.current = true;
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
      statusCheckInFlightRef.current = false;
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
      <ol className="verified-contact-whatsapp-steps">
        <li><span>1</span><p><strong>Open WhatsApp</strong>Tap the button below to open WhatsApp.</p></li>
        <li><span>2</span><p><strong>Send the prepared message</strong>Send the message exactly as shown. Do not edit it.</p></li>
        <li><span>3</span><p><strong>Come back here</strong>Return to this page and wait while we check automatically, or press Check now.</p></li>
      </ol>
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
      <p className="verified-contact-whatsapp-waiting"><span />Waiting for the WhatsApp verification message. We are checking automatically every few seconds.</p>
    </div>
  ) : null;

  const modalTitle = challenge
    ? `Verify ${meta.title.toLowerCase()}`
    : `${value ? 'Change' : 'Add'} ${meta.title.toLowerCase()}`;
  const isPhoneFlow = field === 'phone';
  const isChangingPhone = isPhoneFlow && Boolean(value);
  const phoneNationalDigits = isPhoneFlow
    ? nextValue.replace(/^\s*\+?233\s*/, '').replace(/\D/g, '').slice(0, 9)
    : '';
  const phoneNationalValue = isPhoneFlow
    ? (phoneNationalDigits.match(/.{1,3}/g) || []).join(' ')
    : nextValue;
  const updateNationalPhone = event => {
    const national = event.target.value.replace(/\D/g, '').replace(/^0/, '').slice(0, 9);
    setNextValue(national ? `+233${national}` : '');
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
              <AsyncButtonContent pending={busy} pendingLabel="Sending verification">{channel === 'whatsapp' ? 'Verify with WhatsApp' : 'Send SMS code'}</AsyncButtonContent>
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
              <AsyncButtonContent pending={checking} pendingLabel="Checking status">Check now</AsyncButtonContent>
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
              <AsyncButtonContent pending={busy} pendingLabel="Verifying contact">Verify and update</AsyncButtonContent>
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
      {modal && isPhoneFlow && editing && !challenge && (
        <div className="verified-contact-modal-scrim phone-verification-scrim" onClick={event => { if (event.target === event.currentTarget) reset(); }}>
          <form className="phone-verification-modal" onSubmit={requestCode} role="dialog" aria-modal="true" aria-labelledby="phone-verification-title">
            <button className="verified-contact-modal-close phone-verification-close" type="button" onClick={reset} aria-label="Close"><span aria-hidden="true">×</span></button>
            <main className="phone-verification-main">
              <header className="phone-verification-head">
                <span className="phone-verification-phone-icon" aria-hidden="true"><PhoneGlyph /></span>
                <div><span className="verified-contact-modal-kicker">Contact details</span><h2 id="phone-verification-title">{isChangingPhone ? 'Change phone number' : 'Verify your phone number'}</h2><p>{isChangingPhone ? "We'll verify your new phone number before updating your RealMindX account." : "We'll verify your phone number before adding it to your RealMindX account."}</p></div>
                <span className="phone-verification-step">Step 1 of 2</span>
              </header>
              <label className="phone-verification-number-field"><span>{isChangingPhone ? 'New phone number' : 'Phone number'}</span><div><span className="phone-country-prefix"><span className="ghana-flag" aria-label="Ghana"><i /></span> +233 <em>⌄</em></span><input type="tel" inputMode="tel" autoComplete="tel" maxLength={11} placeholder="554 529 493" value={phoneNationalValue} onChange={updateNationalPhone} autoFocus /></div><small>Enter the {isChangingPhone ? 'new ' : ''}phone number you want to {isChangingPhone ? 'use' : 'verify'}.</small></label>
              <fieldset className="phone-verification-channels"><legend>Choose verification method</legend><div>
                <label className={channel === 'sms' ? 'is-selected' : ''}><input type="radio" name="verification-channel-reference" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} /><span className="phone-channel-check">✓</span><SmsGlyph className="phone-channel-icon is-sms" /><strong>SMS</strong><small>Receive a 6-digit code<br />via text message.</small></label>
                {canUseWhatsApp && <label className={channel === 'whatsapp' ? 'is-selected' : ''}><input type="radio" name="verification-channel-reference" value="whatsapp" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} /><span className="phone-channel-check">✓</span><WhatsAppGlyph className="phone-channel-icon is-whatsapp" /><strong>WhatsApp</strong><small>Receive a 6-digit code<br />on WhatsApp.</small></label>}
              </div></fieldset>
              {error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}
              {message && <p className="verified-contact-feedback">{message}</p>}
              <footer className="phone-verification-actions"><button type="button" className="verified-contact-modal-btn is-outline" onClick={reset}>Cancel</button><button type="submit" className="verified-contact-modal-btn is-primary" disabled={busy}><AsyncButtonContent pending={busy} pendingLabel="Sending code"><VerificationMiniGlyph type="lock" /> Send code</AsyncButtonContent></button></footer>
              <p className="phone-verification-footnote"><VerificationMiniGlyph type="lock" /> {isChangingPhone ? 'Your current number will remain active until you verify the new one.' : 'Your phone number will be added to your account after verification.'}</p>
            </main>
            <VerificationAside changing={isChangingPhone} />
          </form>
        </div>
      )}
      {modal && isPhoneFlow && isWhatsAppInbound && (
        <div className="verified-contact-modal-scrim phone-verification-scrim" onClick={event => { if (event.target === event.currentTarget) reset(); }}>
          <form className="phone-verification-modal is-whatsapp-step" onSubmit={verifyCode} role="dialog" aria-modal="true" aria-labelledby="whatsapp-verification-title">
            <button className="verified-contact-modal-close phone-verification-close" type="button" onClick={reset} aria-label="Close"><span aria-hidden="true">×</span></button>
            <header className="whatsapp-verification-head"><div><span className="verified-contact-modal-kicker">Contact details</span><h2 id="whatsapp-verification-title">Verify phone number</h2><p>We'll help you verify your number with WhatsApp. Just follow the steps below. RealMindX will check automatically after you send the message.</p></div><span className="phone-verification-step">Step 2 of 2</span></header>
            <div className="whatsapp-verification-grid"><div>{whatsAppChallenge}{error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}</div><VerificationAside whatsapp /></div>
            <footer className="whatsapp-verification-actions"><div><button type="button" className="verified-contact-modal-btn is-outline" onClick={reset}>Cancel</button><button type="button" className="verified-contact-modal-btn is-outline" onClick={changeNumber}>Change number</button>{waitSeconds > 0 && <span className="verified-contact-countdown">{waitSeconds}s</span>}</div><button type="submit" className="verified-contact-modal-btn is-primary" disabled={checking}><AsyncButtonContent pending={checking} pendingLabel="Checking status">Check now</AsyncButtonContent></button></footer>
          </form>
        </div>
      )}
      {modal && isPhoneFlow && challenge && !isWhatsAppInbound && (
        <div className="verified-contact-modal-scrim phone-verification-scrim" onClick={event => { if (event.target === event.currentTarget) reset(); }}>
          <form className="phone-verification-modal is-sms-step" onSubmit={verifyCode} role="dialog" aria-modal="true" aria-labelledby="sms-verification-title">
            <button className="verified-contact-modal-close phone-verification-close" type="button" onClick={reset} aria-label="Close"><span aria-hidden="true">×</span></button>
            <main className="phone-verification-main">
              <header className="phone-verification-head">
                <span className="phone-verification-phone-icon is-sms" aria-hidden="true"><SmsGlyph /></span>
                <div><span className="verified-contact-modal-kicker">Contact details</span><h2 id="sms-verification-title">Verify phone number</h2><p>Enter the 6-digit code we sent by SMS to <strong>{challenge.destination}</strong>.</p></div>
                <span className="phone-verification-step">Step 2 of 2</span>
              </header>
              <section className="sms-verification-card">
                <span className="sms-verification-card-icon" aria-hidden="true"><SmsGlyph /></span>
                <h3>Check your messages</h3>
                <p>The code expires shortly, so enter it below as soon as it arrives.</p>
                <label className="sms-verification-code-field"><span>6-digit verification code</span><input inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus /></label>
                {error && <p className="verified-contact-feedback is-error" role="alert">{error}</p>}
                {message && <p className="verified-contact-feedback">{message}</p>}
                <button className="sms-verification-resend" type="button" onClick={resendCode} disabled={busy || waitSeconds > 0}>{waitSeconds > 0 ? `Send another code in ${waitSeconds}s` : 'Send another code'}</button>
              </section>
              <footer className="phone-verification-actions sms-verification-actions"><div><button type="button" className="verified-contact-modal-btn is-outline" onClick={reset}>Cancel</button><button type="button" className="verified-contact-modal-btn is-outline" onClick={changeNumber}>Change number</button></div><button type="submit" className="verified-contact-modal-btn is-primary" disabled={busy}><AsyncButtonContent pending={busy} pendingLabel="Verifying number">Verify number</AsyncButtonContent></button></footer>
              <p className="phone-verification-footnote"><VerificationMiniGlyph type="lock" /> Your phone number changes only after this code is confirmed.</p>
            </main>
            <VerificationAside changing={isChangingPhone} />
          </form>
        </div>
      )}
      {modal && (editing || challenge) && !(isPhoneFlow && (editing || challenge)) && (
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
                  <span className="verified-contact-countdown" aria-label={`Retry available in ${waitSeconds} seconds`}>
                    {waitSeconds}s
                  </span>
                )}
              </div>
              <button type="submit" className="verified-contact-modal-btn is-primary" disabled={busy || checking}>
                <AsyncButtonContent
                  pending={busy || checking}
                  pendingLabel={isWhatsAppInbound ? 'Checking status' : challenge ? 'Verifying contact' : 'Sending code'}
                >
                  {isWhatsAppInbound ? 'Check now' : challenge ? 'Verify and update' : channel === 'whatsapp' ? 'Verify with WhatsApp' : 'Send code'}
                </AsyncButtonContent>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
