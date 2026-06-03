/**
 * Global toast notifications — DOM-based, works anywhere without React context.
 * Usage:  import toast from './toast.js';
 *         toast.error('Something went wrong');
 *         toast.success('Saved!');
 *         toast.info('FYI...');
 */

const ICONS = { error: '⚠', success: '✓', info: 'ℹ', nudge: '💡' };

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
  const el = document.createElement('div');
  el.className = `rmx-toast rmx-toast-${type}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<span class="rmx-toast-icon">${ICONS[type] || ICONS.info}</span><span class="rmx-toast-msg">${msg}</span>`;
  container.appendChild(el);

  // Two rAF trick so the initial opacity:0 state is painted before the transition
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
  error:   (msg, dur) => showToast(msg, 'error',   dur ?? 4000),
  success: (msg, dur) => showToast(msg, 'success', dur ?? 3000),
  info:    (msg, dur) => showToast(msg, 'info',    dur ?? 3500),
  nudge:   (msg, dur) => showToast(msg, 'nudge',   dur ?? 5000),
};
export default toast;
