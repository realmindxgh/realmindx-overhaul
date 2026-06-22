export const SITE_BASE_URL = 'https://realmindxgh.com';
export const BOOKSHOP_BASE_URL = 'https://bookshop.realmindxgh.com';
export const SITE_DEFAULT_IMAGE = `${SITE_BASE_URL}/static/assets/social/realmindx-education-og-1200x630.png?v=20260622`;
export const BOOKSHOP_DEFAULT_IMAGE = `${BOOKSHOP_BASE_URL}/static/assets/social/realmindx-bookshop-og-1200x630.png?v=20260622`;
export const BOOKSHOP_FAVICON = '/static/assets/favicons/bookshop-favicon-32.png?v=20260621';
export const BOOKSHOP_APPLE_TOUCH_ICON = '/static/assets/favicons/bookshop-apple-touch-icon.png?v=20260621';
const BOOK_OG_TEMPLATE_VERSION = '2026-06-22-1';

export const bookOpenGraphImage = (product) => {
  const id = String(product?.id || '').trim();
  if (!/^\d+$/.test(id)) return BOOKSHOP_DEFAULT_IMAGE;
  const version = String(product?.updatedAt || product?.updated_at || '').trim();
  const cacheVersion = version ? `${BOOK_OG_TEMPLATE_VERSION}-${version}` : BOOK_OG_TEMPLATE_VERSION;
  const query = `?v=${encodeURIComponent(cacheVersion)}`;
  return `${BOOKSHOP_BASE_URL}/api/og/books/${id}.png${query}`;
};

export const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

export const servicePath = (serviceId) => `/services/${slugify(serviceId)}`;

export const newsPath = (item) => {
  const slug = slugify(item?.slug || item?.title || item?.id || 'news');
  return `/news/${slug}`;
};
