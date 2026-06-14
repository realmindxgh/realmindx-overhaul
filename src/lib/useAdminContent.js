// ============================================================
// useAdminContent - mode-aware admin data hook.
//
// In API mode (VITE_API_BASE_URL set):
//   Fetches collections from the real Flask admin API.
//   Returns the same { content, createItem, updateItem, deleteItem,
//   togglePublish, refetch } surface so AdminPortalPage.jsx needs
//   only a one-line change per call site.
//
// In local mode (default):
//   Delegates to useManagedContent + the existing CRUD helpers,
//   keeping the localStorage demo working exactly as before.
// ============================================================

import React from 'react';
import { isApiMode, api } from './apiClient.js';
import {
  useManagedContent,
  createManagedItem,
  updateManagedItem,
  deleteManagedItem,
  publicItems,
} from './managedContent.js';

// Maps the CONFIG key used by the admin console to the API endpoint segment.
const COLLECTION_TO_ENDPOINT = {
  jobs: 'jobs',
  applications: 'applications',
  products: 'products',
  productReviews: 'product-reviews',
  categories: 'categories',
  flyers: 'flyers',
  promoCodes: 'promo-codes',
  services: 'services',
  partners: 'partners',
  people: 'people',
  testimonials: 'testimonials',
  homeHeroSlides: 'home-hero-slides',
  donationSlides: 'donation-slides',
  siteCopy: 'site-copy',
  orders: 'orders',
  orderReviews: 'order-reviews',
  news: 'news',
  gallery: 'gallery',
  resources: 'resources',
  messages: 'messages',
  newsletters: 'newsletters',
  settings: 'settings',
  users: 'users',
  admins: 'admins',
  staff: 'staff',
  auditLogs: 'audit-logs',
};

const SIMPLE_SETTINGS = new Set([
  'contact_email',
  'bookshop_email',
  'main_phone',
  'secondary_phone',
  'tertiary_phone',
  'office_address',
  'working_hours',
  'whatsapp_number',
  'facebook_url',
  'instagram_url',
  'x_url',
  'youtube_url',
  'schoolms_url',
  'donation_url',
  'map_embed',
]);

const STATUS_ENDPOINT_COLLECTIONS = new Set(['applications', 'orders']);

// Normalise a row from the API so the status field the admin table
// uses is always present (the API uses is_published/is_active booleans
// on some models, status strings on others).
function normalise(row) {
  if (row == null) return row;
  const r = { ...row };
  if (!('status' in r)) {
    if ('is_published' in r) r.status = r.is_published ? 'published' : 'draft';
    else if ('is_active' in r) r.status = r.is_active ? 'active' : 'unsubscribed';
  }
  return r;
}

function isSimpleSetting(row) {
  if (!row || row.key == null) return false;
  if (SIMPLE_SETTINGS.has(row.key)) return true;
  return row.value == null || ['string', 'number', 'boolean'].includes(typeof row.value);
}

// â”€â”€ API-mode implementation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EVENT = 'realmindx:admin-content-updated';

function useApiContent() {
  const [content, setContent] = React.useState({});
  const [loading, setLoading] = React.useState({});
  const [fetched, setFetched] = React.useState({});
  const [errors, setErrors] = React.useState({});

  const fetchCollection = React.useCallback(async (collection) => {
    const endpoint = COLLECTION_TO_ENDPOINT[collection];
    if (!endpoint) return;
    setLoading(prev => ({ ...prev, [collection]: true }));
    setErrors(prev => ({ ...prev, [collection]: '' }));
    try {
      const data = await api.adminList(endpoint);
      const items = (data.items || [])
        .map(normalise)
        .filter(item => collection !== 'settings' || isSimpleSetting(item));
      setContent(prev => ({ ...prev, [collection]: items }));
      setFetched(prev => ({ ...prev, [collection]: true }));
    } catch (err) {
      console.warn(`[useAdminContent] fetch ${collection} failed:`, err.message);
      setErrors(prev => ({ ...prev, [collection]: err.message || 'Could not load this section.' }));
    } finally {
      setLoading(prev => ({ ...prev, [collection]: false }));
    }
  }, []);

  // Fetch also on content-updated events (so changes from other tabs / actions
  // propagate without a full reload).
  React.useEffect(() => {
    const handle = (e) => {
      const collection = e?.detail?.collection;
      if (collection) fetchCollection(collection);
    };
    window.addEventListener(EVENT, handle);
    return () => window.removeEventListener(EVENT, handle);
  }, [fetchCollection]);

  const notify = (collection) =>
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { collection } }));

  const createItem = React.useCallback(async (collection, payload) => {
    const endpoint = COLLECTION_TO_ENDPOINT[collection];
    if (!endpoint) return;
    if (collection === 'settings') {
      await api.adminUpsertSetting(payload.key, payload.value, payload.public);
      notify(collection);
      await fetchCollection(collection);
      return;
    }
    await api.adminCreate(endpoint, payload);
    notify(collection);
    await fetchCollection(collection);
  }, [fetchCollection]);

  const updateItem = React.useCallback(async (collection, id, payload) => {
    const endpoint = COLLECTION_TO_ENDPOINT[collection];
    if (!endpoint) return;
    // Settings use PUT /admin/settings/{key} - id is the key string
    if (collection === 'settings') {
      await api.adminUpsertSetting(id, payload.value, payload.public);
    } else if (STATUS_ENDPOINT_COLLECTIONS.has(collection) && payload && typeof payload === 'object' && 'status' in payload) {
      await api.adminUpdateStatus(endpoint, id, payload);
    } else {
      await api.adminUpdate(endpoint, id, payload);
    }
    notify(collection);
    await fetchCollection(collection);
  }, [fetchCollection]);

  const deleteItem = React.useCallback(async (collection, id) => {
    const endpoint = COLLECTION_TO_ENDPOINT[collection];
    if (!endpoint) return;
    await api.adminDelete(endpoint, id);
    notify(collection);
    await fetchCollection(collection);
  }, [fetchCollection]);

  const togglePublish = React.useCallback(async (collection, row) => {
    const endpoint = COLLECTION_TO_ENDPOINT[collection];
    if (!endpoint) return;
    const isLive = row.status === 'published' || row.status === 'active' || row.is_published === true || row.is_active === true;
    const nextStatus = isLive ? 'draft' : 'published';
    // The API uses different patterns; try status endpoint first, fall back to PUT
    try {
      await api.adminUpdate(endpoint, row.id, { status: nextStatus, is_published: nextStatus === 'published', is_active: nextStatus === 'published' });
    } catch {
      // some endpoints accept a status-only PUT
    }
    notify(collection);
    await fetchCollection(collection);
  }, [fetchCollection]);

  return { content, loading, fetched, errors, fetchCollection, createItem, updateItem, deleteItem, togglePublish };
}

// â”€â”€ Local-mode implementation (thin wrapper around existing helpers) â”€â”€â”€â”€â”€â”€â”€â”€â”€

function useLocalContent() {
  const content = useManagedContent();

  const createItem = React.useCallback((collection, payload) => {
    createManagedItem(collection, payload);
  }, []);

  const updateItem = React.useCallback((collection, id, payload) => {
    updateManagedItem(collection, id, payload);
  }, []);

  const deleteItem = React.useCallback((collection, id) => {
    deleteManagedItem(collection, id);
  }, []);

  const togglePublish = React.useCallback((collection, row) => {
    const nextStatus = row.status === 'published' ? 'draft' : 'published';
    updateManagedItem(collection, row.id, { status: nextStatus });
  }, []);

  const fetchCollection = React.useCallback(() => {}, []); // no-op in local mode
  const loading = {};
  const fetched = {};
  const errors = {};

  return { content, loading, fetched, errors, fetchCollection, createItem, updateItem, deleteItem, togglePublish };
}

// â”€â”€ Public hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const useAdminContent = isApiMode() ? useApiContent : useLocalContent;
export { publicItems };
