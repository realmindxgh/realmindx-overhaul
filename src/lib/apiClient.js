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

const handleUnauthorized = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('realmindx.demoSession');
    window.dispatchEvent(new Event('rmx-session-sync'));
  }
};

async function apiFetch(path, { method = 'GET', body, freshCsrf = false } = {}) {
  const useCsrf = method !== 'GET';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = { 'Content-Type': 'application/json' };
    if (useCsrf) headers['X-CSRFToken'] = await getCsrf({ force: freshCsrf || attempt > 0 });
    const res = await fetch(url(path), {
      method,
      headers,
      credentials: 'include',
      cache: method === 'GET' ? 'no-store' : 'default',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status === 401) {
      handleUnauthorized();
    }
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
  lookupInvoice: (invoiceId) => apiFetch(`/invoices/${encodeURIComponent(invoiceId)}`),
  createCartInvoice: (payload) => apiFetch('/cart-invoices', { method: 'POST', body: payload }),
  invoicePdfUrl: (invoiceId, { download = false, document = '' } = {}) => {
    const params = new URLSearchParams();
    if (download) params.set('download', '1');
    if (document) params.set('document', document);
    const qs = params.toString();
    return url(`/invoices/${encodeURIComponent(invoiceId)}/pdf${qs ? `?${qs}` : ''}`);
  },
  fetchMyOrders: (qs = '') => apiFetch(`/orders/mine${qs ? '?' + qs : ''}`),
  sendContact: (payload) => apiFetch('/contact', { method: 'POST', body: payload }),
  subscribeNewsletter: (payload) => apiFetch('/newsletter', { method: 'POST', body: payload }),
  initDonationPayment: (payload) => apiFetch('/donations/paystack/initialize', { method: 'POST', body: payload }),
  fetchProducts: (qs = '') => apiFetch(`/products${qs}`),
  fetchCategories: () => apiFetch('/products/categories'),
  fetchFlyers: () => apiFetch('/flyers'),
  fetchFocusFlyer: () => apiFetch('/flyers/focus'),
  fetchServices: () => apiFetch('/services'),
  fetchSiteCopy: () => apiFetch('/site-copy'),
  fetchSettings: () => apiFetch('/settings'),
  fetchPartners: () => apiFetch('/partners'),
  fetchPeople: () => apiFetch('/people'),
  fetchTestimonials: () => apiFetch('/testimonials'),
  fetchHomeHeroSlides: () => apiFetch('/home-hero-slides'),
  fetchDonationSlides: () => apiFetch('/donation-slides'),
  fetchNews: () => apiFetch('/news'),
  fetchGallery: () => apiFetch('/gallery'),
  fetchResources: () => apiFetch('/resources'),
  fetchDeliveryZones: () => apiFetch('/delivery-zones'),
  validatePromoCode: (code, orderTotal) => apiFetch('/promo-codes/validate', { method: 'POST', body: { code, order_total: orderTotal } }),
  bulkPriceAdjust: (type, value, direction) => apiFetch('/admin/products/bulk-price-adjust', { method: 'POST', body: { type, value, direction } }),
  bulkDeliveryAdjust: (type, value, direction) => apiFetch('/admin/delivery-zones/bulk-adjust', { method: 'POST', body: { type, value, direction } }),
  initPaystackCheckout: (payload) => apiFetch('/orders/paystack/initialize', { method: 'POST', body: payload }),
  initPaystackPayment: (orderId, callbackUrl) => apiFetch(`/orders/${orderId}/paystack/initialize`, { method: 'POST', body: { callback_url: callbackUrl } }),
  verifyPaystackPayment: (reference, { legacy = false } = {}) => apiFetch('/orders/paystack/verify', {
    method: 'POST',
    body: legacy ? { order_reference: reference } : { payment_intent_reference: reference },
  }),
  createProductReview: (productId, payload) => apiFetch(`/products/${productId}/reviews`, { method: 'POST', body: payload }),
  fetchProductReviews: (productId) => apiFetch(`/products/${productId}/reviews`),
  fetchProductReviewEligibility: (productId) => apiFetch(`/products/${productId}/review-eligibility`),
  createOrderReview: (payload) => apiFetch('/orders/reviews', { method: 'POST', body: payload }),

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
      if (res.status === 401) {
        handleUnauthorized();
      }
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
  fetchProfile: () => apiFetch('/me/profile'),
  updateAccount: (payload) => apiFetch('/me/account', { method: 'PUT', body: payload }),
  fetchCheckoutDetails: () => apiFetch('/me/checkout-details'),
  saveCheckoutDetails: (payload) => apiFetch('/me/checkout-details', { method: 'POST', body: payload }),
  updateCheckoutDetails: (detailId, payload) => apiFetch(`/me/checkout-details/${detailId}`, { method: 'PUT', body: payload }),
  deleteCheckoutDetails: (detailId) => apiFetch(`/me/checkout-details/${detailId}`, { method: 'DELETE' }),
  requestContactChange: (payload) => apiFetch('/me/contact-change/request', { method: 'POST', body: payload }),
  verifyContactChange: (payload) => apiFetch('/me/contact-change/verify', { method: 'POST', body: payload }),
  saveJobAlerts: (payload) => apiFetch('/me/job-alerts', { method: 'PUT', body: payload }),
  createJobAlert: (payload) => apiFetch('/me/job-alerts', { method: 'POST', body: payload }),
  updateJobAlert: (id, payload) => apiFetch(`/me/job-alerts/${id}`, { method: 'PUT', body: payload }),
  deleteJobAlert: (id) => apiFetch(`/me/job-alerts/${id}`, { method: 'DELETE' }),
  applyForJob: (jobId, payload = {}) => apiFetch(`/jobs/${jobId}/apply`, { method: 'POST', body: payload }),

  // admin - file upload (multipart, no JSON content-type)
  uploadFile: async (file, category = 'images', options = {}) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const csrf = await getCsrf({ force: attempt > 0 });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('visibility', options.visibility || 'public');
      const res = await fetch(url('/admin/uploads'), {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        credentials: 'include',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data.file; // { id, url, original_filename, category, visibility }
      if (res.status === 401) {
        handleUnauthorized();
      }
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
  adminAnalyticsDashboard: (params = {}) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') sp.set(key, value);
    });
    const suffix = sp.toString() ? `?${sp.toString()}` : '';
    return apiFetch(`/admin/analytics/dashboard${suffix}`);
  },
  adminAnalyticsProduct: (productId, params = {}) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') sp.set(key, value);
    });
    const suffix = sp.toString() ? `?${sp.toString()}` : '';
    return apiFetch(`/admin/analytics/products/${productId}${suffix}`);
  },
  adminAnalyticsExportUrl: (report, params = {}) => {
    const sp = new URLSearchParams({ report });
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') sp.set(key, value);
    });
    return url(`/admin/analytics/export?${sp.toString()}`);
  },
  adminClearAnalyticsLocations: () => apiFetch('/admin/analytics/location-history', { method: 'DELETE' }),
  adminProductMissingImages: () => apiFetch('/admin/products/missing-images'),
  adminUnpublishProductsMissingImages: () => apiFetch('/admin/products/missing-images/unpublish', { method: 'POST' }),
  adminList: (collection) => apiFetch(`/admin/${collection}`),
  // admin - write (collection: 'jobs'|'products'|'categories'|'news'|'gallery'|'resources')
  adminCreate: (collection, payload) => apiFetch(`/admin/${collection}`, { method: 'POST', body: payload }),
  adminUpdate: (collection, id, payload) => apiFetch(`/admin/${collection}/${id}`, { method: 'PUT', body: payload }),
  adminPatch: (collection, id, payload) => apiFetch(`/admin/${collection}/${id}`, { method: 'PATCH', body: payload }),
  adminDelete: (collection, id) => apiFetch(`/admin/${collection}/${id}`, { method: 'DELETE' }),
  adminReplyMessage: (id, message) => apiFetch(`/admin/messages/${id}/reply`, { method: 'POST', body: { message } }),
  adminSendNewsletter: (payload) => apiFetch('/admin/newsletters/send', { method: 'POST', body: payload }),
  adminExportUrl: (collection, format = 'csv') => url(`/admin/${collection}/export?format=${encodeURIComponent(format)}`),
  adminPreviewProductImport: async (catalogFile) => {
    const csrf = await getCsrf();
    const fd = new FormData();
    if (catalogFile) fd.append('catalog_file', catalogFile);
    const res = await fetch(url('/admin/products/import/preview'), {
      method: 'POST',
      headers: { 'X-CSRFToken': csrf },
      credentials: 'include',
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      handleUnauthorized();
    }
    if (!res.ok) {
      const err = new Error(data.error || `Catalogue review failed (${res.status}).`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  adminImportProducts: async ({
    catalogFile,
    imagesZip,
    columnMapping = {},
    onProgress,
  }) => {
    const csrf = await getCsrf();
    const fd = new FormData();
    if (catalogFile) fd.append('catalog_file', catalogFile);
    if (imagesZip) fd.append('images_zip', imagesZip);
    fd.append('column_mapping', JSON.stringify(columnMapping));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let latestProgress = 0;
      xhr.open('POST', url('/admin/products/import'));
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-CSRFToken', csrf);

      xhr.upload.addEventListener('loadstart', () => {
        onProgress?.({ stage: 'uploading', percent: 0, loaded: 0, total: 0 });
      });
      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable && event.total > 0) {
          latestProgress = Math.min(100, Math.round((event.loaded / event.total) * 100));
        }
        onProgress?.({
          stage: 'uploading',
          percent: latestProgress,
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : 0,
        });
      });
      xhr.upload.addEventListener('load', () => {
        latestProgress = 100;
        onProgress?.({ stage: 'processing', percent: 100 });
      });
      xhr.addEventListener('load', () => {
        let data = {};
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          data = {};
        }
        if (xhr.status === 401) {
          handleUnauthorized();
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          const statusHint = xhr.status === 413
            ? 'The files exceed the server upload limit.'
            : `Import failed (${xhr.status || 'network error'}).`;
          const err = new Error(data.error || statusHint);
          err.status = xhr.status;
          err.data = data;
          reject(err);
          return;
        }
        onProgress?.({ stage: 'complete', percent: 100 });
        resolve(data);
      });
      xhr.addEventListener('error', () => {
        const suffix = latestProgress > 0 && latestProgress < 100
          ? ` The connection stopped at ${latestProgress}%.`
          : '';
        reject(new Error(`The upload connection was interrupted.${suffix} Check your network and retry; no incomplete product changes were saved.`));
      });
      xhr.addEventListener('abort', () => {
        reject(new Error('The product import was cancelled.'));
      });
      xhr.send(fd);
    });
  },
  // admin - status shortcuts
  adminUpdateStatus: (collection, id, payload) => apiFetch(
    `/admin/${collection}/${id}/status`,
    {
      method: 'PUT',
      body: (payload && typeof payload === 'object') ? payload : { status: payload },
    },
  ),
  // admin - settings (key-based)
  adminUpsertSetting: (key, value, isPublic) => apiFetch(`/admin/settings/${key}`, { method: 'PUT', body: { value, public: isPublic } }),

  // auth
  login: (payload) => apiFetch('/auth/login', { method: 'POST', body: payload, freshCsrf: true }),
  completeTwoFactorLogin: (payload) => apiFetch('/auth/login/two-factor', { method: 'POST', body: payload }),
  signup: (payload) => apiFetch('/auth/signup', { method: 'POST', body: payload, freshCsrf: true }),
  verifyEmailOtp: (payload) => apiFetch('/auth/verify-email-otp', { method: 'POST', body: payload }),
  resendVerificationOtp: (payload) => apiFetch('/auth/resend-verification-otp', { method: 'POST', body: payload }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/auth/me'),
  changePassword: (payload) => apiFetch('/auth/change-password', { method: 'POST', body: payload }),
  fetchSecurityStatus: () => apiFetch('/auth/security-status'),
  requestTwoFactorChange: (payload) => apiFetch('/auth/two-factor/request', { method: 'POST', body: payload }),
  confirmTwoFactorChange: (payload) => apiFetch('/auth/two-factor/confirm', { method: 'POST', body: payload }),
  requestPasswordReset: (payload) => apiFetch('/auth/password-reset/request', { method: 'POST', body: payload }),
  confirmPasswordReset: (payload) => apiFetch('/auth/password-reset/confirm', { method: 'POST', body: payload }),
};
