import { BOOKSHOP_BASE_URL, slugify } from '../src/lib/seoRoutes.js';

export const canonicalBookshopBase = BOOKSHOP_BASE_URL;

const cleanId = (value) => slugify(String(value || '').replace(/^0+/, '') || value || '');

export const productPathSegment = (book) => {
  if (!book) return '';
  if (book.slug) return slugify(book.slug);
  const titleSlug = slugify(book.title || book.name || '');
  const id = cleanId(book.id);
  if (!titleSlug) return id;
  return id ? `${titleSlug}-${id}` : titleSlug;
};

export const productHref = (book) => `/products/${productPathSegment(book)}`;

export const taxonomyBasePath = (taxonomy) => {
  switch (taxonomy) {
    case 'category':
      return '/categories';
    case 'subject':
      return '/subjects';
    case 'level':
      return '/levels';
    case 'curriculum':
      return '/curriculum';
    case 'publisher':
      return '/publishers';
    default:
      return '/products';
  }
};

export const taxonomyHref = (taxonomy, value = '') => {
  const basePath = taxonomyBasePath(taxonomy);
  const rawValue = String(value || '').trim();
  const segment = rawValue ? slugify(rawValue) : '';
  return segment ? `${basePath}/${segment}` : basePath;
};

export const categoryHref = (category) => taxonomyHref('category', category);

export const productMatchesSegment = (book, segment) => {
  if (!book || !segment) return false;
  const candidate = slugify(segment);
  return [
    slugify(book.slug || ''),
    productPathSegment(book),
    slugify(book.id),
  ].filter(Boolean).includes(candidate);
};

export const bookshopPathForRoute = (route, params = {}) => {
  switch (route) {
    case 'home':
      return '/';
    case 'shop':
      if (params.taxonomy && params.value && params.q) return `/products?${encodeURIComponent(params.taxonomy)}=${encodeURIComponent(params.value)}&q=${encodeURIComponent(params.q)}`;
      if (params.taxonomy && params.value) return taxonomyHref(params.taxonomy, params.value);
      if (params.taxonomy) return taxonomyHref(params.taxonomy);
      if (params.cat && params.q) return `/products?category=${encodeURIComponent(params.cat)}&q=${encodeURIComponent(params.q)}`;
      if (params.q) return `/products?q=${encodeURIComponent(params.q)}`;
      if (params.cat && params.cat !== 'all') return categoryHref(params.cat);
      return '/products';
    case 'product':
      return params.slug ? `/products/${params.slug}` : '/products';
    case 'cart':
      return '/cart';
    case 'wishlist':
      return '/wishlist';
    case 'checkout':
      return '/checkout';
    case 'track':
      return '/track';
    case 'invoice':
      return '/invoice';
    case 'documents':
      return '/documents';
    case 'login':
      return '/login';
    case 'signup':
      return '/signup';
    case 'reset-password':
      return '/reset-password';
    case 'contact':
      return '/contact';
    case 'about':
      return '/about';
    case 'privacy':
      return '/privacy';
    case 'terms':
      return '/terms';
    case 'account':
      return '/account';
    case 'orders':
      return '/orders';
    case 'review':
      return '/review';
    default:
      return '/';
  }
};
