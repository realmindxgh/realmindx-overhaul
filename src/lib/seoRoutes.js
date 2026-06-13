export const SITE_BASE_URL = 'https://realmindxgh.com';
export const BOOKSHOP_BASE_URL = 'https://bookshop.realmindxgh.com';
export const SITE_DEFAULT_IMAGE = `${SITE_BASE_URL}/og-image.png`;
export const BOOKSHOP_DEFAULT_IMAGE = `${BOOKSHOP_BASE_URL}/og-image-bookshop.png`;

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
