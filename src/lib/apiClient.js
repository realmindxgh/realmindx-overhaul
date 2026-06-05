// ============================================================
// API client - talks to the Flask backend when VITE_API_BASE_URL
// is set. When it is empty (default for local dev) the app
// stays on the localStorage data layer and this module is dormant.
//
// VITE_API_BASE_URL already includes the /api prefix
// (e.g. http://127.0.0.1:5000/api). Backend contract:
//   auth blueprint     -> {base}/auth/*
//   public + bookshop  -> {base}/*
// Uses flask-login session cookies (credentials: 'include')
// and flask-wtf CSRF (X-CSRFToken from {base}/auth/csrf-token).
// ============================================================

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const resolveApiBase = (base) => {
  if (!base || typeof window === 'undefined') return base;
  try {
    const apiUrl = new URL(base);
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (localHosts.has(apiUrl.hostname) && localHosts.has(window.location.hostname)) {
      return '/api';
    }
  } catch {
    return base;
  }
  return base;
};

export const API_BASE = resolveApiBase(configuredApiBase);
export const isApiMode = () => Boolean(API_BASE);

const url = (path) => `${API_BASE}${path}`;

let csrfToken = null;

async function getCsrf({ force = false } = {}) {
  if (force) csrfToken = null;
  if (csrfToken) return csrfToken;
  const res = await fetch(url('/auth/csrf-token'), { credentials: 'include' });
  if (!res.ok) throw new Error('Could not obtain CSRF token.');
  csrfToken = (await res.json()).csrf_token;
  return csrfToken;
}

const isCsrfFailure = (res, data) =>
  res.status === 400
  && (!data.error || /csrf|security token/i.test(String(data.error)));

async function apiFetch(path, { method = 'GET', body, freshCsrf = false } = {}) {
  const useCsrf = method !== 'GET';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = { 'Content-Type': 'application/json' };
    if (useCsrf) headers['X-CSRFToken'] = await getCsrf({ force: freshCsrf || attempt > 0 });
    const res = await fetch(url(path), {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (useCsrf && attempt === 0 && isCsrfFailure(res, data)) {
      csrfToken = null;
      continue;
    }
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  throw new Error('Request failed.');
}

export const api = {
  // public + bookshop
  createOrder: (payload) => apiFetch('/orders', { method: 'POST', body: payload }),
  trackOrders: (query) => apiFetch(`/orders/track?q=${encodeURIComponent(query)}`),
  sendContact: (payload) => apiFetch('/contact', { method: 'POST', body: payload }),
  subscribeNewsletter: (payload) => apiFetch('/newsletter', { method: 'POST', body: payload }),
  initDonationPayment: (payload) => apiFetch('/donations/paystack/initialize', { method: 'POST', body: payload }),
  fetchProducts: (qs = '') => apiFetch(`/products${qs}`),
  fetchCategories: () => apiFetch('/products/categories'),
  fetchFlyers: () => apiFetch('/flyers'),
  fetchServices: () => apiFetch('/services'),
  fetchSiteCopy: () => apiFetch('/site-copy'),
  fetchPartners: () => apiFetch('/partners'),
  fetchPeople: () => apiFetch('/people'),
  fetchHomeHeroSlides: () => apiFetch('/home-hero-slides'),
  fetchDonationSlides: () => apiFetch('/donation-slides'),
  fetchNews: () => apiFetch('/news'),
  fetchGallery: () => apiFetch('/gallery'),
  fetchResources: () => apiFetch('/resources'),
  fetchDeliveryZones: () => apiFetch('/delivery-zones'),
  validatePromoCode: (code, orderTotal) => apiFetch('/promo-codes/validate', { method: 'POST', body: { code, order_total: orderTotal } }),
  bulkPriceAdjust: (type, value, direction) => apiFetch('/admin/products/bulk-price-adjust', { method: 'POST', body: { type, value, direction } }),
  bulkDeliveryAdjust: (type, value, direction) => apiFetch('/admin/delivery-zones/bulk-adjust', { method: 'POST', body: { type, value, direction } }),
  initPaystackPayment: (orderId, callbackUrl) => apiFetch(`/orders/${orderId}/paystack/initialize`, { method: 'POST', body: { callback_url: callbackUrl } }),
  createProductReview: (productId, payload) => apiFetch(`/products/${productId}/reviews`, { method: 'POST', body: payload }),

  uploadUserFile: async (file, kind = 'document') => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const csrf = await getCsrf({ force: attempt > 0 });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(url('/me/uploads'), {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        credentials: 'include',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (attempt === 0 && isCsrfFailure(res, data)) {
        csrfToken = null;
        continue;
      }
      const err = new Error(data.error || `Upload failed (${res.status}).`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    throw new Error('Upload failed.');
  },

  updateProfile: (payload) => apiFetch('/me/profile', { method: 'PUT', body: payload }),
  saveJobAlerts: (payload) => apiFetch('/me/job-alerts', { method: 'PUT', body: payload }),

  // admin - file upload (multipart, no JSON content-type)
  uploadFile: async (file, category = 'images') => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const csrf = await getCsrf({ force: attempt > 0 });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('visibility', 'public');
      const res = await fetch(url('/admin/uploads'), {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        credentials: 'include',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data.file; // { id, url, original_filename, category, visibility }
      if (attempt === 0 && isCsrfFailure(res, data)) {
        csrfToken = null;
        continue;
      }
      const err = new Error(data.error || `Upload failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    throw new Error('Upload failed.');
  },

  // admin - read
  adminDashboard: () => apiFetch('/admin/dashboard'),
  adminList: (collection) => apiFetch(`/admin/${collection}`),
  // admin - write (collection: 'jobs'|'products'|'categories'|'news'|'gallery'|'resources')
  adminCreate: (collection, payload) => apiFetch(`/admin/${collection}`, { method: 'POST', body: payload }),
  adminExportUrl: (collection, format = 'xlsx') => `${API_BASE}/admin/${collection}/export?format=${format}`,
  adminUpdate: (collection, id, payload) => apiFetch(`/admin/${collection}/${id}`, { method: 'PUT', body: payload }),
  adminDelete: (collection, id) => apiFetch(`/admin/${collection}/${id}`, { method: 'DELETE' }),
  adminReplyMessage: (id, message) => apiFetch(`/admin/messages/${id}/reply`, { method: 'POST', body: { message } }),
  adminSendNewsletter: (payload) => apiFetch('/admin/newsletters/send', { method: 'POST', body: payload }),
  adminExportUrl: (collection, format = 'csv') => url(`/admin/${collection}/export?format=${encodeURIComponent(format)}`),
  adminImportProducts: async ({ catalogFile, imagesZip }) => {
    const csrf = await getCsrf();
    const fd = new FormData();
    if (catalogFile) fd.append('catalog_file', catalogFile);
    if (imagesZip) fd.append('images_zip', imagesZip);
    const res = await fetch(url('/admin/products/import'), {
      method: 'POST',
      headers: { 'X-CSRFToken': csrf },
      credentials: 'include',
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Import failed (${res.status}).`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  // admin - status shortcuts
  adminUpdateStatus: (collection, id, status) => apiFetch(`/admin/${collection}/${id}/status`, { method: 'PUT', body: { status } }),
  // admin - settings (key-based)
  adminUpsertSetting: (key, value, isPublic) => apiFetch(`/admin/settings/${key}`, { method: 'PUT', body: { value, public: isPublic } }),

  // auth
  login: (payload) => apiFetch('/auth/login', { method: 'POST', body: payload, freshCsrf: true }),
  signup: (payload) => apiFetch('/auth/signup', { method: 'POST', body: payload, freshCsrf: true }),
  verifyEmailOtp: (payload) => apiFetch('/auth/verify-email-otp', { method: 'POST', body: payload }),
  resendVerificationOtp: (payload) => apiFetch('/auth/resend-verification-otp', { method: 'POST', body: payload }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/auth/me'),
  requestPasswordReset: (payload) => apiFetch('/auth/password-reset/request', { method: 'POST', body: payload }),
};
