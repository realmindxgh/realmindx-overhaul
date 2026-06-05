export const BOOKSHOP_AUTH_RETURN_KEY = 'rmx.bookshop.authReturn';

export function setBookshopAuthReturn(route) {
  if (typeof window === 'undefined' || !route) return;
  window.sessionStorage.setItem(BOOKSHOP_AUTH_RETURN_KEY, route);
}

export function consumeBookshopAuthReturn(fallback = 'home') {
  if (typeof window === 'undefined') return fallback;
  const route = window.sessionStorage.getItem(BOOKSHOP_AUTH_RETURN_KEY) || fallback;
  window.sessionStorage.removeItem(BOOKSHOP_AUTH_RETURN_KEY);
  return route;
}
