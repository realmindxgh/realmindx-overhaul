import { API_BASE } from './apiClient.js';

const VISITOR_KEY = 'rmx.analytics.visitor';
const SESSION_KEY = 'rmx.analytics.session';
const SESSION_TTL_MS = 30 * 60 * 1000;
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365;
const dedupeCache = new Map();

const analyticsBase = API_BASE || '/api';

const readJson = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};

const writeJson = (key, value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const setCookie = (name, value, maxAgeSeconds) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
};

export const getAnalyticsContext = () => {
  if (typeof window === 'undefined') return { visitorKey: null, sessionKey: null };
  const now = Date.now();

  let visitor = readJson(VISITOR_KEY);
  if (!visitor?.id) {
    visitor = { id: `v_${randomId()}`, createdAt: now };
    writeJson(VISITOR_KEY, visitor);
  }

  let session = readJson(SESSION_KEY);
  if (!session?.id || !session.lastSeenAt || now - session.lastSeenAt > SESSION_TTL_MS) {
    session = { id: `s_${randomId()}`, createdAt: now, lastSeenAt: now };
  } else {
    session = { ...session, lastSeenAt: now };
  }

  writeJson(SESSION_KEY, session);
  setCookie('rmx_analytics_visitor', visitor.id, COOKIE_TTL_SECONDS);
  setCookie('rmx_analytics_session', session.id, 60 * 60 * 24);
  return { visitorKey: visitor.id, sessionKey: session.id };
};

const currentAttribution = () => {
  if (typeof window === 'undefined') return {};
  const search = new URLSearchParams(window.location.search);
  const source = search.get('utm_source');
  const medium = search.get('utm_medium');
  const campaign = search.get('utm_campaign');
  return {
    traffic_source: source || undefined,
    traffic_medium: medium || undefined,
    campaign: campaign || undefined,
    referrer: document.referrer || undefined,
  };
};

const seenRecently = (key, ttl = 1800) => {
  const now = Date.now();
  const last = dedupeCache.get(key) || 0;
  if (now - last < ttl) return true;
  dedupeCache.set(key, now);
  if (dedupeCache.size > 250) {
    for (const [entryKey, stamp] of dedupeCache.entries()) {
      if (now - stamp > ttl * 4) dedupeCache.delete(entryKey);
    }
  }
  return false;
};

const dispatchEvents = (events) => {
  if (typeof window === 'undefined' || !Array.isArray(events) || events.length === 0) return;
  const { visitorKey, sessionKey } = getAnalyticsContext();
  const enriched = events.map((event) => ({
    ...event,
    visitor_key: visitorKey,
    session_key: sessionKey,
    path: event.path || window.location.pathname,
    full_path: event.full_path || `${window.location.pathname}${window.location.search}`,
    page_title: event.page_title || document.title,
    ...currentAttribution(),
  }));

  fetch(`${analyticsBase}/analytics/events`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ events: enriched }),
  }).catch(() => {});
};

export const trackAnalyticsEvent = (event, options = {}) => {
  const key = options.dedupeKey;
  if (key && seenRecently(key, options.ttlMs)) return;
  dispatchEvents([event]);
};

export const trackAnalyticsEvents = (events, options = {}) => {
  const key = options.dedupeKey;
  if (key && seenRecently(key, options.ttlMs)) return;
  dispatchEvents(events);
};

export const trackPageView = ({ path, fullPath, pageType, productId, newsId, serviceId } = {}) => {
  const dedupeKey = `page:${fullPath || path || ''}:${pageType || ''}:${productId || newsId || serviceId || ''}`;
  trackAnalyticsEvent({
    event_type: 'page_view',
    path,
    full_path: fullPath,
    page_type: pageType,
    product_id: productId,
    news_id: newsId,
    service_id: serviceId,
  }, { dedupeKey, ttlMs: 1400 });
};

export const trackProductView = ({ productId, path, fullPath, pageType = 'product' } = {}) => {
  const dedupeKey = `product-view:${productId}:${fullPath || path || ''}`;
  trackAnalyticsEvent({
    event_type: 'product_view',
    path,
    full_path: fullPath,
    page_type: pageType,
    product_id: productId,
  }, { dedupeKey, ttlMs: 1400 });
};

export const trackSearch = ({ term, resultsCount = 0, scope = 'bookshop', pageType = 'bookshop', path, productImpressions = [] } = {}) => {
  const searchTerm = String(term || '').trim();
  if (!searchTerm) return;
  const events = [{
    event_type: 'search',
    search_term: searchTerm,
    search_scope: scope,
    page_type: pageType,
    path,
    results_count: Number(resultsCount) || 0,
    had_results: Number(resultsCount) > 0,
  }];
  productImpressions.slice(0, 12).forEach((item, index) => {
    if (!item?.productId) return;
    events.push({
      event_type: 'search_impression',
      search_term: searchTerm,
      search_scope: scope,
      page_type: pageType,
      path,
      product_id: item.productId,
      results_count: Number(resultsCount) || 0,
      had_results: Number(resultsCount) > 0,
      details: {
        position: item.position ?? index + 1,
        product_available: item.available !== false,
      },
    });
  });
  trackAnalyticsEvents(events, {
    dedupeKey: `search:${scope}:${path || ''}:${searchTerm.toLowerCase()}:${resultsCount}`,
    ttlMs: 1200,
  });
};

export const trackSearchClick = ({ term, productId, scope = 'bookshop', path, source = 'results', position } = {}) => {
  const searchTerm = String(term || '').trim();
  if (!searchTerm || !productId) return;
  trackAnalyticsEvent({
    event_type: 'search_click',
    search_term: searchTerm,
    search_scope: scope,
    path,
    page_type: scope === 'bookshop' ? 'bookshop' : 'website',
    product_id: productId,
    details: {
      source,
      position,
    },
  }, {
    dedupeKey: `search-click:${scope}:${searchTerm.toLowerCase()}:${productId}:${source}:${position || ''}`,
    ttlMs: 800,
  });
};

export const trackCartAction = (action, { productId, quantity = 1, path = '/bookshop/cart' } = {}) => {
  if (!productId) return;
  trackAnalyticsEvent({
    event_type: action === 'remove' ? 'cart_remove' : 'cart_add',
    product_id: productId,
    quantity: Math.max(1, Number(quantity) || 1),
    path,
    page_type: 'bookshop',
  });
};

export const trackWishlistAction = (action, { productId, path = '/bookshop/wishlist' } = {}) => {
  if (!productId) return;
  trackAnalyticsEvent({
    event_type: action === 'remove' ? 'wishlist_remove' : 'wishlist_add',
    product_id: productId,
    path,
    page_type: 'bookshop',
  });
};

export const trackServiceEnquiryClick = ({ serviceId, path, href, label, source = 'service_page' } = {}) => {
  if (!serviceId) return;
  trackAnalyticsEvent({
    event_type: 'service_enquiry_click',
    service_id: serviceId,
    path,
    page_type: 'service',
    details: {
      href,
      label,
      source,
    },
  }, {
    dedupeKey: `service-enquiry:${serviceId}:${source}:${href || label || ''}`,
    ttlMs: 900,
  });
};

export const trackNewsServiceClick = ({ newsId, serviceId, path, href, label, source = 'news_article' } = {}) => {
  if (!newsId || !serviceId) return;
  trackAnalyticsEvent({
    event_type: 'news_service_click',
    news_id: newsId,
    service_id: serviceId,
    path,
    page_type: 'news_article',
    details: {
      href,
      label,
      source,
    },
  }, {
    dedupeKey: `news-service:${newsId}:${serviceId}:${source}:${href || label || ''}`,
    ttlMs: 900,
  });
};
