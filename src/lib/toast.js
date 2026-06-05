/**
 * Global toast notifications. DOM-based, works anywhere without React context.
 */

const ICONS = {
  success: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.1 3.1L17.5 8"/></svg>',
  error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v6"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 11v6"/><path d="M12 7h.01"/></svg>',
  nudge: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M9 16h6"/></svg>',
};

function ensureContainer() {
  let c = document.getElementById('rmx-toast-root');
  if (!c) {
    c = document.createElement('div');
    c.id = 'rmx-toast-root';
    c.setAttribute('aria-live', 'polite');
    c.setAttribute('aria-atomic', 'false');
    document.body.appendChild(c);
  }
  return c;
}

export function showToast(msg, type = 'info', duration = 3500) {
  if (typeof document === 'undefined') return () => {};
  const container = ensureContainer();
  const safeType = ICONS[type] ? type : 'info';
  const el = document.createElement('div');
  el.className = `rmx-toast rmx-toast-${safeType}`;
  el.setAttribute('role', 'alert');

  const icon = document.createElement('span');
  icon.className = 'rmx-toast-icon';
  icon.innerHTML = ICONS[safeType];

  const text = document.createElement('span');
  text.className = 'rmx-toast-msg';
  text.textContent = String(msg || '');

  el.append(icon, text);
  container.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('rmx-toast-in')));

  const dismiss = () => {
    el.classList.remove('rmx-toast-in');
    el.classList.add('rmx-toast-out');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
  };
  const tid = setTimeout(dismiss, duration);
  el.addEventListener('click', () => { clearTimeout(tid); dismiss(); });
  return dismiss;
}

const toast = {
  error: (msg, dur) => showToast(msg, 'error', dur ?? 4000),
  success: (msg, dur) => showToast(msg, 'success', dur ?? 3000),
  info: (msg, dur) => showToast(msg, 'info', dur ?? 3500),
  nudge: (msg, dur) => showToast(msg, 'nudge', dur ?? 5000),
};

export default toast;
