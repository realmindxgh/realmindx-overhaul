import React from 'react';
import { Icon } from '../../realmindx-site/assets/components.jsx';

const surfaceForLocation = () => {
  const path = window.location.pathname;
  if (window.location.hostname.startsWith('bookshop.')) return { id: 'bookshop', name: 'RealMindX Bookshop' };
  if (path.startsWith('/delivery-company')) return { id: 'delivery-company', name: 'Delivery Company Portal' };
  if (path.startsWith('/delivery')) return { id: 'delivery', name: 'Rider Portal' };
  if (path.startsWith('/admin')) return { id: 'admin', name: 'RealMindX Admin' };
  if (path.startsWith('/staff')) return { id: 'staff', name: 'RealMindX Staff' };
  return null;
};

export const isInstalledApp = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const InstallAppPrompt = () => {
  const surface = React.useMemo(surfaceForLocation, []);
  const [installEvent, setInstallEvent] = React.useState(() => window.__rmxInstallPrompt || null);
  const [dismissed, setDismissed] = React.useState(true);
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;

  React.useEffect(() => {
    if (!surface || isInstalledApp()) return undefined;
    const key = `rmx.install-dismissed.${surface.id}`;
    const dismissedAt = Number(window.localStorage.getItem(key) || 0);
    setDismissed(Date.now() - dismissedAt < 14 * 24 * 60 * 60 * 1000);
    const capture = event => setInstallEvent(event.detail || window.__rmxInstallPrompt || null);
    window.addEventListener('rmx:install-ready', capture);
    return () => window.removeEventListener('rmx:install-ready', capture);
  }, [surface]);

  if (!surface || isInstalledApp() || dismissed || (!installEvent && !isIos)) return null;

  const dismiss = () => {
    window.localStorage.setItem(`rmx.install-dismissed.${surface.id}`, String(Date.now()));
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice?.outcome === 'accepted') setDismissed(true);
    window.__rmxInstallPrompt = null;
    setInstallEvent(null);
  };

  return (
    <aside className="pwa-install-prompt" aria-label={`Install ${surface.name}`}>
      <div className="pwa-install-icon"><Icon name="phone" size={22} /></div>
      <div><strong>Install {surface.name}</strong><span>{isIos && !installEvent ? 'Use Share, then Add to Home Screen.' : 'Open faster and keep this workspace handy.'}</span></div>
      {installEvent ? <button className="pwa-install-action" type="button" onClick={install}>Install</button> : null}
      <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="Dismiss install suggestion"><Icon name="x" size={17} /></button>
    </aside>
  );
};

export default InstallAppPrompt;
