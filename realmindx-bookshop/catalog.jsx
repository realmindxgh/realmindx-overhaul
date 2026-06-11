import React from 'react';
import { API_BASE, isApiMode, api } from '../src/lib/apiClient.js';
import { useManagedContent, publicItems } from '../src/lib/managedContent.js';
import { BOOKS as DEMO_BOOKS, CATEGORIES as FALLBACK_CATEGORIES } from './shared.jsx';

const FALLBACK_BOOKS = DEMO_BOOKS;

// ============================================================
// Catalog adapter - two modes:
//
//   API mode   (VITE_API_BASE_URL set): fetches /api/products,
//              /api/products/categories, /api/flyers from Flask.
//
//   Local mode (default): bridges useManagedContent() exactly as
//              before, so the localStorage demo keeps working.
// ============================================================

const FALLBACK_FLYERS = [
  { id: 'f1', headline: 'Back-to-School', accent: 'Sale', subline: 'Up to 25% off selected curriculum textbooks', badge: 'SHOP THE SALE', image: null, showOverlay: false, imageFit: 'cover', imagePosition: 'center' },
  { id: 'f2', headline: 'New BECE & WASSCE', accent: 'Past Questions', subline: '2015-2024, fully solved - just arrived', badge: 'NEW STOCK', image: null, showOverlay: false, imageFit: 'cover', imagePosition: 'center' },
  { id: 'f3', headline: 'Wholesale for', accent: 'Schools', subline: 'Class sets delivered within 48 hours', badge: 'GET A QUOTE', image: null, showOverlay: false, imageFit: 'cover', imagePosition: 'center' },
];

const CatalogCtx = React.createContext({
  books: FALLBACK_BOOKS,
  categories: FALLBACK_CATEGORIES,
  flyers: FALLBACK_FLYERS,
  priceCeiling: 80,
  loading: false,
});
export const useCatalog = () => React.useContext(CatalogCtx);

// â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BADGE_LABEL = { sale: 'Sale', popular: 'Bestseller', new: 'New', top: 'Top Rated' };
const slugifyCat = (v = '') => String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
const pseudo = (seed, min, max) => {
  const s = String(seed); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return min + (Math.abs(h) % (max - min + 1));
};

const apiAssetUrl = value => {
  if (!value || !String(value).startsWith('/uploads/')) return value;
  try {
    return new URL(value, API_BASE.replace(/\/api$/, '')).toString();
  } catch {
    return value;
  }
};

// â”€â”€ API-shape mappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Products from API: { id, name, category, category_slug, price, old_price,
//   short_description, image_url, stock_status, featured, tags }
const fromApiProduct = (p) => {
  const tags = Array.isArray(p.tags) ? p.tags : [];
  const curriculumName = p.curriculum || '';
  const curriculum = curriculumName ? `curriculum-${slugifyCat(curriculumName)}` : '';
  return {
    id: String(p.id),
    title: p.name,
    cat: p.category_slug || slugifyCat(p.category || ''),
    catName: p.category || 'General',
    curriculum,
    curriculumName,
    price: Number(p.price) || 0,
    old: p.old_price ? Number(p.old_price) : undefined,
    desc: [curriculumName, p.level, p.subject].filter(Boolean).join(' - ') || p.short_description || 'Available in store',
    short: p.short_description || '',
    full: p.full_description || p.short_description || '',
    rating: Number(p.rating_average) || 0,
    reviews: Number(p.rating_count) || 0,
    stock: p.stock_status !== 'out_of_stock',
    grade: p.level || '',
    subject: p.subject || '',
    author: p.author || '',
    publisher: p.publisher || '',
    isbn: p.isbn || '',
    badge: tags.length ? (BADGE_LABEL[tags[0]] || tags[0]) : undefined,
    featured: Boolean(p.featured),
    tags,
    image: apiAssetUrl(p.image_url) || null,
    // Bulk discount — set on the category (bulk_discount_percent field, min qty = 10)
    bulkDiscountPct: Number(p.bulk_discount_percent || p.category_bulk_discount_percent) || 0,
    bulkMinQty: Number(p.bulk_min_qty) || 10,
  };
};

// Categories from API: { id, name, slug }
const fromApiCategory = (c) => ({
  id: c.slug || slugifyCat(c.name || ''),
  name: c.name,
  icon: c.type === 'curriculum' ? 'cap' : 'book',
  type: c.type || 'category',
});

// Flyers from API: { id, headline, accent, subline, badge, image_url }
const fromApiFlyer = (f) => ({
  id: String(f.id),
  headline: f.headline || '',
  accent: f.accent || '',
  subline: f.subline || '',
  badge: f.badge || '',
  showOverlay: f.show_overlay === true,
  imageFit: f.image_fit || 'cover',
  imagePosition: f.image_position || 'center',
  image: apiAssetUrl(f.image_url) || null,
});

// â”€â”€ Local-shape mappers (unchanged from before) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const mapFlyers = (flyers) => publicItems(flyers).map(f => ({
  id: String(f.id), headline: f.headline || '', accent: f.accent || '',
  subline: f.subline || '', badge: f.badge || '', image: f.image || null,
  showOverlay: f.show_overlay === true || f.showOverlay === true,
  imageFit: f.image_fit || f.imageFit || 'cover',
  imagePosition: f.image_position || f.imagePosition || 'center',
}));

const mapCategories = (cats) => {
  const list = publicItems(cats).map(c => ({
    id: c.slug || slugifyCat(c.value || c.label),
    name: c.label || c.value, icon: 'book',
  }));
  return [{ id: 'all', name: 'All Books', icon: 'grid' }, ...list];
};

const mapProducts = (products, cats) => {
  const lookup = {};
  publicItems(cats).forEach(c => {
    const slug = c.slug || slugifyCat(c.value || c.label);
    const info = { slug, name: c.label || c.value };
    if (c.value) lookup[c.value] = info;
    if (c.label) lookup[c.label] = info;
    lookup[slug] = info;
  });
  return publicItems(products).map(p => {
    const catInfo = lookup[p.category] || { slug: slugifyCat(p.category || ''), name: p.category || 'General' };
    const curriculumName = p.curriculum || '';
    const curriculum = curriculumName ? `curriculum-${slugifyCat(curriculumName)}` : '';
    const badges = Array.isArray(p.badges) ? p.badges : [];
    return {
      id: String(p.id), title: p.name,
      cat: catInfo.slug, catName: catInfo.name,
      curriculum, curriculumName,
      price: Number(p.price) || 0,
      old: p.oldPrice ? Number(p.oldPrice) : undefined,
      desc: [curriculumName, p.level, p.subject].filter(Boolean).join(' - ') || p.author || 'Available in store',
      short: p.shortDescription || p.short_description || '',
      full: p.fullDescription || p.full_description || p.description || '',
      rating: Number(p.rating_average || p.rating) || 0, reviews: Number(p.rating_count || p.reviews) || 0,
      stock: p.stock !== 'out',
      grade: p.level || '', subject: p.subject || '', author: p.author || '', publisher: p.publisher || p.author || '',
      isbn: p.isbn || '-',
      badge: badges.length ? (BADGE_LABEL[badges[0]] || badges[0]) : undefined,
      featured: badges.length > 0, image: p.image || null,
    };
  });
};

// â”€â”€ API-mode CatalogProvider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ApiCatalogProvider = ({ children }) => {
  const [books, setBooks] = React.useState([]);
  const [categories, setCategories] = React.useState([{ id: 'all', name: 'All Books', icon: 'grid' }]);
  const [flyers, setFlyers] = React.useState([]);
  const [priceCeiling, setPriceCeiling] = React.useState(80);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [prods, cats, flyerData] = await Promise.all([
          api.fetchProducts(),
          api.fetchCategories(),
          api.fetchFlyers().catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;

        const mappedBooks = (prods.items || []).map(fromApiProduct);
        const mappedCats = [
          { id: 'all', name: 'All Books', icon: 'grid' },
          ...(cats.items || []).map(fromApiCategory),
        ];
        const mappedFlyers = (flyerData.items || []).map(fromApiFlyer);

        // In API mode, show only admin-backed products. Demo catalog data is kept
        // strictly as an offline fallback when the API is unavailable altogether.
        setBooks(mappedBooks);
        setCategories(mappedCats.length ? mappedCats : [{ id: 'all', name: 'All Books', icon: 'grid' }]);
        setFlyers(mappedFlyers);

        const maxPrice = mappedBooks.reduce((m, b) => Math.max(m, b.price), 0);
        setPriceCeiling(Math.max(80, Math.ceil(maxPrice / 10) * 10));
      } catch (err) {
        console.warn('[CatalogProvider] API fetch failed, using fallback:', err.message);
        if (cancelled) return;
        setBooks(FALLBACK_BOOKS);
        setCategories(FALLBACK_CATEGORIES);
        setFlyers(FALLBACK_FLYERS);
        const fallbackMax = FALLBACK_BOOKS.reduce((m, b) => Math.max(m, b.price), 0);
        setPriceCeiling(Math.max(80, Math.ceil(fallbackMax / 10) * 10));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <CatalogCtx.Provider value={{ books, categories, flyers, priceCeiling, loading }}>
      {children}
    </CatalogCtx.Provider>
  );
};

// â”€â”€ Local-mode CatalogProvider (unchanged behaviour) â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LocalCatalogProvider = ({ children }) => {
  const content = useManagedContent();

  const value = React.useMemo(() => {
    const mappedBooks = mapProducts(content.products || [], content.categories || []);
    const mappedCats = mapCategories(content.categories || []);
    const mappedFlyers = mapFlyers(content.flyers || []);
    const books = mappedBooks.length ? mappedBooks : FALLBACK_BOOKS;
    const categories = mappedCats.length > 1 ? mappedCats : FALLBACK_CATEGORIES;
    const flyers = mappedFlyers.length ? mappedFlyers : FALLBACK_FLYERS;
    const maxPrice = books.reduce((m, b) => Math.max(m, b.price), 0);
    const priceCeiling = Math.max(80, Math.ceil(maxPrice / 10) * 10);
    return { books, categories, flyers, priceCeiling, loading: false };
  }, [content]);

  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
};

export const CatalogProvider = isApiMode() ? ApiCatalogProvider : LocalCatalogProvider;
