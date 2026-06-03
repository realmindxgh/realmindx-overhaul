import React from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
let scriptPromise = null;

const loadScript = () => {
  if (!SITE_KEY || typeof window === 'undefined') return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
};

export const TurnstileField = ({ onVerify, theme = 'auto', className = '' }) => {
  const ref = React.useRef(null);
  const widgetRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!SITE_KEY) return undefined;
    loadScript().then(() => {
      if (cancelled || !window.turnstile || !ref.current || widgetRef.current) return;
      widgetRef.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme,
        callback: token => onVerify?.(token),
        'expired-callback': () => onVerify?.(''),
        'error-callback': () => onVerify?.(''),
      });
    });
    return () => {
      cancelled = true;
      if (window.turnstile && widgetRef.current) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [onVerify, theme]);

  if (!SITE_KEY) return null;
  return <div className={className} ref={ref} />;
};

export default TurnstileField;
